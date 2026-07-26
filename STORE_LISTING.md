# Chrome Web Store 上架指南

本文件是提交到 Chrome 网上应用店（Chrome Web Store）所需的文案与步骤。扩展本身已完成商店化改造（`manifest.json` 已移除 `key`、补齐图标、收窄 `host_permissions`、声明 `minimum_chrome_version`）。

> ⚠️ **提交动作需人工完成**：Chrome Web Store 要求开发者账号（一次性 $5 注册费）、人工上传 ZIP 并经过审核，无法由脚本全自动代替。本仓库已准备好所有材料，你只需按下面步骤操作。

---

## 1. 生成上传包
```bash
bash pack.sh
# 输出: dist/chrome-cookie-agent-extension-1.0.0.zip
```
该 ZIP 仅包含 `extension/` 目录（manifest + JS/HTML/图标），不含任何私钥或原生消息清单，可直接上传。

## 2. 创建开发者账号并上传
1. 访问 <https://chrome.google.com/webstore/devconsole/>，用 Google 账号登录并支付一次性 $5 开发者注册费。
2. 点击「新建项目」，上传上一步生成的 ZIP。
3. 填写下方「上架文案」。

## 3. 上架文案（可直接复制）

**名称**：Cookie Agent Bridge

**摘要（≤ 132 字符）**：
> 把你自己 Chrome 里的 cookie 通过本机回环接口提供给本地 AI Agent，全程仅在本机处理，不外传任何数据。

**详细描述**：
```
Cookie Agent Bridge 是一个面向开发者/自动化的开源工具，让你本机的 AI Agent（Python、curl 或任意语言）读取你自己的 Chrome 登录态（cookie），从而以你的身份调用需要登录的接口。

工作原理（全程本地，无远程服务器）：
  1. 你在机器上运行一个本地桥接服务 host.js（仅监听 127.0.0.1）；
  2. 扩展通过常驻的 Offscreen 文档与该服务建立 SSE 长连接；
  3. 当本地 Agent 调用 http://127.0.0.1:9898/cookies?url=… 时，扩展用 chrome.cookies API 读取对应域名的 cookie 并原路返回。

特点：
  • 仅绑定 127.0.0.1 回环地址，外部网络无法访问；
  • 可选 AGENT_TOKEN 鉴权，防止本机其他进程随意读取你的登录态；
  • 不收集任何遥测、不传输任何数据到远程服务器、没有账号；
  • 弹窗（popup）可手动按 URL 取 cookie 并一键复制，也便于排查；
  • 完全开源，代码可审计：github.com/metaRobin/chrome-cookie-agent。

权限说明：
  • cookies：核心功能，用于读取你请求的域名下的 cookie；
  • host permission（https://*/*、http://*/*）：用于对任意你指定的域名读取 cookie；
  • offscreen / alarms：用于维持常驻连接，避免 Service Worker 被回收导致桥接断开。
以上权限仅在「你主动请求取某个域名的 cookie」时使用，扩展不会自行读取。

隐私：cookie 只通过本机回环返回给发起请求的本地进程，绝不上传到任何远程服务器。详见仓库 PRIVACY.md。
```

**类别**：Developer Tools（开发者工具）
**语言**：中文（简体）/ English
**隐私政策**：填写本仓库 `PRIVACY.md` 的原文，或填写其原始链接
<https://raw.githubusercontent.com/metaRobin/chrome-cookie-agent/main/PRIVACY.md>

**截图（至少 1 张，建议 1280×800 或 640×400）**：
- 图 1：扩展弹窗（popup）界面，展示「按 URL 取 cookie」与复制按钮；
- 图 2（可选）：架构示意图——Agent → 本地桥接服务 → 扩展 → Chrome cookie。
> 截图需你本机自行截取（弹窗界面可直接在 `chrome://extensions` 加载后点击图标获得）。

## 4. 提交审核
填写完毕后点击「提交审核」。Chrome 对访问全部 cookie 的扩展会做额外审查，通常会关注：
- **单一目的（Single Purpose）**：本扩展目的明确——仅把你的 cookie 暴露给本机 Agent，已在描述中说明；
- **权限最小化**：已将 `<all_urls>` 收窄为 `https://*/*` + `http://*/*`，且说明了每项权限的用途；
- **数据安全**：强调纯本地、零外传、开源可审计。

审核周期通常数小时到数天。若被要求补充材料，按邮件说明回复即可。

## 5. （可选）CI 自动发布
如需用 Chrome Web Store Publish API 自动发布，需要：
1. 在 Google Cloud 创建 OAuth 客户端，拿到 `client_id` / `client_secret`；
2. 在开发者后台生成刷新令牌（Refresh Token）；
3. 用 `chrome-webstore-upload` 等工具，以上传 ZIP + 刷新令牌完成发布。
本仓库未内置该流程（需你自备凭据），可参考官方文档 <https://developer.chrome.com/docs/webstore/using-api>。
