# 注册 host.js 为 Windows 登录启动的常驻服务（不再依赖 Native Messaging）
# 用法: 在 PowerShell 中执行  .\install.ps1
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$NH = Join-Path $ScriptDir "native-host"
$HostJs = Join-Path $NH "host.js"

if (-not (Test-Path $HostJs)) {
  Write-Error "未找到 $HostJs"
  exit 1
}

$NodeBin = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $NodeBin) {
  Write-Error "未找到 node，请先安装 Node.js 并加入 PATH。"
  exit 1
}

$Port = if ($env:PORT) { $env:PORT } else { "9898" }

# 注册为登录启动的计划任务（最高权限运行，崩溃重启）
$TaskName = "ChromeCookieAgentBridge"
$Action = New-ScheduledTaskAction -Execute $NodeBin -Argument $HostJs -WorkingDirectory $NH
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -RestartCount 10 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 3650)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

# 设置环境变量（PORT / AGENT_TOKEN）
$envOpts = @("PORT=$Port")
if ($env:AGENT_TOKEN) { $envOpts += "AGENT_TOKEN=$env:AGENT_TOKEN" }

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Force | Out-Null

# 立即启动一次
Start-ScheduledTask -TaskName $TaskName

Write-Host "✅ 已注册为 Windows 计划任务（$TaskName），并立即启动。"
Write-Host "   日志: 任务计划程序 -> 查看运行结果；或 stdout 见任务配置。"
Write-Host ""
Write-Host "下一步:"
Write-Host "  1) 打开 chrome://extensions，开启「开发者模式」"
Write-Host "  2) 点击「加载已解压的扩展程序」，选择本项目的 extension\ 目录"
Write-Host "  3) Agent 调用: Invoke-RestMethod 'http://127.0.0.1:$Port/cookies?url=https://example.com'"
