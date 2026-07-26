#!/usr/bin/env bash
# 安装 Cookie Agent Bridge（host.js 作为常驻 localhost 服务，不再依赖 Native Messaging）
# 用法: bash install.sh            # 注册为登录启动的常驻服务
#       bash install.sh start      # 仅本次启动（前台依赖的会话内）
#   可选环境变量: PORT（默认 9898）、AGENT_TOKEN（鉴权令牌，留空则不鉴权）
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_JS="$SCRIPT_DIR/native-host/host.js"
PORT="${PORT:-9898}"

if [ ! -f "$HOST_JS" ]; then
  echo "未找到 $HOST_JS" >&2
  exit 1
fi

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "未找到 node，请先安装 Node.js 并加入 PATH。" >&2
  exit 1
fi
chmod +x "$HOST_JS"

echo "使用 node: $NODE_BIN"
echo "host.js : $HOST_JS"
echo "端口   : $PORT"

# ---- 旧版 Native Messaging manifest 已不再需要，提示清理 ----
OLD_NH="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.agent.chrome.cookies.json"
if [ -f "$OLD_NH" ]; then
  echo
  echo "⚠️  检测到旧版 native host manifest（现已不再需要）："
  echo "    $OLD_NH"
  echo "    如需清理可手动删除：rm \"$OLD_NH\""
fi

if [ "${1:-install}" = "start" ]; then
  echo
  echo "▶ 前台启动 host.js（Ctrl+C 停止）。生产建议用 'bash install.sh' 注册为常驻服务。"
  PORT="$PORT" AGENT_TOKEN="${AGENT_TOKEN:-}" exec "$NODE_BIN" "$HOST_JS"
  exit 0
fi

# ---- 注册为登录启动的常驻服务 ----
if [[ "$OSTYPE" == "darwin"* ]]; then
  LABEL="com.agent.chrome.cookies"
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
  /usr/libexec/PlistBuddy -c "Delete :Label" "$PLIST" 2>/dev/null || true
  cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$HOST_JS</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>$PORT</string>
    <key>AGENT_TOKEN</key>
    <string>${AGENT_TOKEN:-}</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/chrome-cookie-host.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/chrome-cookie-host.log</string>
</dict>
</plist>
EOF
  launchctl unload "$PLIST" 2>/dev/null || true
  launchctl load "$PLIST"
  echo
  echo "✅ 已注册为 macOS 登录启动服务（label=$LABEL）"
  echo "   日志: /tmp/chrome-cookie-host.log"
  echo "   管理: launchctl unload/load \"$PLIST\""
elif [[ "$OSTYPE" == "linux"* ]]; then
  SERVICE="chrome-cookie-agent.service"
  UNIT="$HOME/.config/systemd/user/$SERVICE"
  mkdir -p "$(dirname "$UNIT")"
  cat > "$UNIT" <<EOF
[Unit]
Description=Cookie Agent Bridge (standalone host)
[Service]
ExecStart=$NODE_BIN $HOST_JS
Environment=PORT=$PORT
Environment=AGENT_TOKEN=${AGENT_TOKEN:-}
Restart=always
[Install]
WantedBy=default.target
EOF
  systemctl --user daemon-reload
  systemctl --user enable --now "$SERVICE"
  echo
  echo "✅ 已注册为 systemd 用户服务（$SERVICE）"
else
  echo "未识别的系统（$OSTYPE），请手动运行: PORT=$PORT $NODE_BIN $HOST_JS &"
  exit 0
fi

echo
echo "下一步:"
echo "  1) 打开 chrome://extensions，开启「开发者模式」"
echo "  2) 点击「加载已解压的扩展程序」，选择本项目的 extension/ 目录（含 offscreen.js）"
echo "  3) Agent 调用: curl 'http://127.0.0.1:$PORT/cookies?url=https://example.com'"
echo "     健康检查:   curl 'http://127.0.0.1:$PORT/health'"
