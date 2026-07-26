# Chrome Cookie Agent Bridge

让本地 AI Agent（Python / curl / 任意语言）通过 **HTTP** 读取你自己 Chrome 中的 cookie，从而以你的登录态调用需要鉴权的接口。

```
Agent  ──HTTP──▶  host.js 常驻服务 (Node, 127.0.0.1:9898)  ──SSE/HTTP──▶  Chrome 扩展(Offscreen)  ──chrome.cookies API──▶  真实 Cookie
```

- 扩展用 `chrome.cookies` API 读取 cookie（含 HttpOnly / Secure）。
- **不依赖 Native Messaging**：`host.js` 作为独立常驻 localhost 服务运行，扩展里的 **Offscreen Document** 通过 SSE 长连接接收取 cookie 命令、用 `chrome.cookies.getAll` 读取后回传。Offscreen 不受 MV3 Service Worker 30s 空闲回收限制，连接长期稳定。
- Agent 用最普通的 HTTP 调用即可，无需任何特殊通道。
- **仅监听 `127.0.0.1`（回环）**，外部网络无法访问；可选 `AGENT_TOKEN` 鉴权。
- 完全开源、零遥测、不传输任何数据到远程服务器。详见 [PRIVACY.md](./PRIVACY.md)。

---

## 1. 目录结构

```
chrome-cookie-agent/
├── install.sh               # macOS / Linux 注册 host.js 为登录启动常驻服务
├── install.ps1              # Windows 注册 host.js 为计划任务
├── pack.sh                  # 打包 extension/ 为 Chrome Web Store 上传用 zip
├── agent_example.py         # Agent 调用示例（标准库，含 503 自动重试兜底）
├── PRIVACY.md               # 隐私政策（上架商店必填）
├── STORE_LISTING.md         # Chrome Web Store 上架文案与步骤
├── tools/
│   └── gen_icons.py         # （可选）重新生成扩展图标，需 Pillow
├── extension/               # 要「加载已解压」的扩展目录（也是商店上传内容）
│   ├── manifest.json        # 商店化：无 key、含图标、host_permissions 收窄
│   ├── background.js        # 创建/看护 offscreen document，执行 cookie 读取
│   ├── offscreen.js         # 常驻层：SSE 客户端 + 命令转发 + 结果回传
│   ├── offscreen.html       # offscreen document 容器
│   ├── popup.html / popup.js# 手动测试 UI（按 URL 取 cookie 并复制）
│   └── icons/               # icon16/48/128.png
└── native-host/
    └── host.js              # 独立常驻 HTTP/SSE 桥接服务（纯 Node，无依赖）
```

> 注：本方案已移除早期版本的 Native Messaging 与 RSA 私钥，`build.py` 不再需要。`manifest.json` 不含 `key`，便于直接上架（商店会分配正式扩展 ID）。

---

## 2. 安装

### 2.1 启动桥接服务（host.js）
```bash
bash install.sh                 # macOS 写 LaunchAgent；Linux 写 systemd 用户服务
# 可选环境变量：PORT（默认 9898）、AGENT_TOKEN（鉴权令牌）
PORT=9898 AGENT_TOKEN=xxxx bash install.sh
```
或手动前台启动：
```bash
node native-host/host.js &      # 或 PORT=9911 node native-host/host.js
```
Windows 用 PowerShell：`.\install.ps1`。

### 2.2 加载扩展
1. 打开 `chrome://extensions`，开启「开发者模式」。
2. 点击「加载已解压的扩展程序」，选择本项目的 `extension/` 目录。
3. 确认桥接在线：`curl http://127.0.0.1:9898/health` 应返回 `"extensionConnected":true`。
4. 取 cookie：`curl 'http://127.0.0.1:9898/cookies?url=https://example.com'`。
   连接常驻在 Offscreen Document 中，长时间不调用也不会断连。

---

## 3. Agent 调用

```bash
# 按 URL 取（最常用）
curl 'http://127.0.0.1:9898/cookies?url=https://example.com'

# 按域名取
curl 'http://127.0.0.1:9898/cookies?domain=example.com'

# 取全部域名
curl 'http://127.0.0.1:9898/cookies'

# 健康检查
curl 'http://127.0.0.1:9898/health'
```

返回 JSON：
```json
{
  "url": "https://example.com",
  "domain": null,
  "count": 3,
  "cookieHeader": "session=abc; csrftoken=xyz; locale=zh",
  "cookies": [ { "name": "session", "value": "abc", "domain": ".example.com", "httpOnly": true, "secure": true }, ... ]
}
```

直接把 `cookieHeader` 塞进请求头即可：
```python
import requests
requests.get("https://example.com/api", headers={"Cookie": cookie_header})
```
开启鉴权（可选）：启动前设置 `AGENT_TOKEN=xxxx`，调用时带 `?token=xxxx`，否则返回 403。
端口可改：环境变量 `PORT=9911` 或 `node native-host/host.js --port 9911`。

参考 [`agent_example.py`](./agent_example.py) 的完整 Python 封装（含 503 自动重试）。

---

## 4. 安全说明

- HTTP 服务**只绑定 `127.0.0.1`**，仅本机进程可访问；不要改成 `0.0.0.0`。
- 建议生产环境设置 `AGENT_TOKEN`，避免本机其它进程随意读取你的登录态。
- 扩展拥有 `https://*/*` + `http://*/*` 的 cookie 读取权限，仅安装你信任的来源；卸载扩展后桥接即失效。
- `host.js` 是独立常驻服务（建议经 `install.sh` 注册为登录启动）。停止它即可关闭桥接；它只监听 127.0.0.1，不对外暴露。
- 扩展**不向任何远程服务器发送数据**，不写 cookie 到磁盘，无遥测。详见 [PRIVACY.md](./PRIVACY.md)。

---

## 5. 发布到 Chrome Web Store

上架所需材料与步骤已整理在 [**STORE_LISTING.md**](./STORE_LISTING.md)，并提供了打包脚本：

```bash
bash pack.sh
# 生成 dist/chrome-cookie-agent-extension-<version>.zip，直接上传到开发者后台
```

`manifest.json` 已针对商店分发处理：移除 `key`、补齐图标、将 `host_permissions` 由 `<all_urls>` 收窄为 `https://*/*` + `http://*/*`、声明 `minimum_chrome_version=109`。

---

## 6. 开发

- 重新生成图标（可选）：`pip install pillow && python tools/gen_icons.py`
- 本地调试：修改扩展文件后，在 `chrome://extensions` 点「刷新」重新加载即可；host.js 由 LaunchAgent 自动保活，亦可用 `bash install.sh start` 前台运行。
- 服务日志：`/tmp/chrome-cookie-host.log`

---

## 7. 许可

[MIT](./LICENSE) © 2026 Robin
