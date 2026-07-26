#!/usr/bin/env bash
# 打包扩展为 Chrome Web Store 上传用的 zip（仅 extension/ 目录内容，不含私钥/原生消息清单）
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXT="$SCRIPT_DIR/extension"
DIST="$SCRIPT_DIR/dist"
mkdir -p "$DIST"

VERSION="$(grep -o '"version"[^,]*' "$EXT/manifest.json" | grep -o '[0-9][0-9.]*')"
OUT="$DIST/chrome-cookie-agent-extension-$VERSION.zip"
rm -f "$OUT"

( cd "$EXT" && zip -r "$OUT" . -x '.DS_Store' -x '__MACOSX/*' >/dev/null )

echo "✅ 已生成商店上传包: $OUT"
echo "   在 Chrome 开发者后台 (https://chrome.google.com/webstore/devconsole/) 上传此 zip 即可。"
echo "   注意：manifest 已不含 key，商店会为你的扩展分配正式 ID。"
