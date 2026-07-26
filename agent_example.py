#!/usr/bin/env python3
"""
Agent 调用示例：从本地 Chrome 获取指定站点的 cookie。
依赖： requests（或标准库 urllib）。此处用标准库，无需安装。
"""
import json
import time
import urllib.parse
import urllib.request
import urllib.error

BRIDGE = "http://127.0.0.1:9898"
TOKEN = ""  # 若 host.js 设置了 AGENT_TOKEN，填到这里

# 自动重试：扩展偶发未连上（503 / 连接拒绝 / 空响应）时，退避后重试
RETRY_ATTEMPTS = 3
RETRY_BASE_DELAY = 0.8  # 秒，每次重试翻倍


def get_cookies(url=None, domain=None, token=TOKEN, attempts=RETRY_ATTEMPTS):
    params = {}
    if url:
        params["url"] = url
    if domain:
        params["domain"] = domain
    if token:
        params["token"] = token
    q = "?" + urllib.parse.urlencode(params) if params else ""
    req = urllib.request.Request(BRIDGE + "/cookies" + q)

    last_err = None
    for i in range(max(1, attempts)):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read().decode("utf-8")
            if not body.strip():
                raise urllib.error.HTTPError(req.full_url, 502, "empty reply", None, None)
            data = json.loads(body)
            # 扩展未连上（503）时，服务端会带 error 字段，视为可重试
            if isinstance(data, dict) and data.get("error"):
                raise urllib.error.HTTPError(req.full_url, 503, data.get("error"), None, None)
            return data
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}: {e.reason}"
            # 仅对 503（未连上）/ 502（空响应）重试；其它错误（如 400）直接抛出
            if e.code not in (502, 503):
                raise
        except (urllib.error.URLError, ConnectionError) as e:
            # 服务未启动 / 端口无监听（连接被拒），也退避重试
            last_err = f"连接失败: {e.reason}"
        if i < attempts - 1:
            time.sleep(RETRY_BASE_DELAY * (2 ** i))
    raise RuntimeError(f"获取 cookie 失败（重试 {attempts} 次仍不可用）: {last_err}")


def get_cookie_header(url, token=TOKEN, attempts=RETRY_ATTEMPTS):
    """直接返回可塞进请求头的 Cookie 字符串。"""
    data = get_cookies(url=url, token=token, attempts=attempts)
    return data.get("cookieHeader", "")


if __name__ == "__main__":
    # 示例：抓取 example.com 的 cookie，并打印成请求头
    target = "https://example.com"
    result = get_cookies(url=target)
    print(f"url={target}  count={result['count']}")
    print("Cookie 头:")
    print(result["cookieHeader"])

    # 把 cookie 用于你自己的 HTTP 请求
    # import requests
    # requests.get("https://example.com/api", headers={"Cookie": get_cookie_header(target)})
