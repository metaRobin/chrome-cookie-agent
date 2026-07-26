/*
 * Offscreen Document —— 仅负责「常驻 SSE 连接」+ 在 host 与 Service Worker 之间转发
 * ---------------------------------------------------------------
 * 教训：offscreen 上下文里 chrome.cookies.getAll 的回调不可靠（不触发），因此
 * cookie 实际读取改回 Service Worker（SW 中 chrome.cookies.getAll 标准可靠）。
 * 本文件的职责：
 *   1) 常驻 EventSource 连 host /stream（持久，不受 SW 30s 回收影响）
 *   2) 收到 GET_COOKIES 命令 -> chrome.runtime.sendMessage 转发给 SW
 *   3) 收到 SW 回传的 COOKIES_RESULT -> POST /result 给 host
 */
const PORT = 9898; // 须与 host.js 的 PORT 一致（默认 9898）
const BASE = `http://127.0.0.1:${PORT}`;

function diag(msg, rid) {
  const q = '?msg=' + encodeURIComponent(msg) + (rid ? '&rid=' + encodeURIComponent(rid) : '');
  fetch(`${BASE}/diag${q}`).catch(() => {});
}

function postResult(requestId, cookies) {
  const payload = JSON.stringify({ cookies: cookies || [] });
  fetch(`${BASE}/result?requestId=${encodeURIComponent(requestId)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
  }).then(() => diag('post_ok', requestId))
    .catch((e) => {
      // POST 失败时降级为 GET（数据塞进查询参数），避免 POST/PNA/CSP 拦截导致回传失败
      diag('post_failed:' + (e && e.message), requestId);
      const gq = '?requestId=' + encodeURIComponent(requestId) + '&cookies=' + encodeURIComponent(payload);
      fetch(`${BASE}/result${gq}`).catch(() => diag('get_fallback_failed', requestId));
    });
}

const pending = new Map(); // requestId -> true（等待 SW 回传）

// SW -> offscreen：收到 cookie 结果
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === 'COOKIES_RESULT' && pending.has(msg.requestId)) {
    pending.delete(msg.requestId);
    diag('sw_result:' + (msg.cookies || []).length, msg.requestId);
    postResult(msg.requestId, msg.cookies || []);
  }
});

const es = new EventSource(`${BASE}/stream`);
es.onopen = () => { diag('sse_open'); };
es.addEventListener('cmd', (ev) => {
  let m;
  try { m = JSON.parse(ev.data); } catch (e) { return; }
  if (m.type !== 'GET_COOKIES') return;
  diag('cmd_received', m.requestId);
  const opts = m.opts || {};
  if (opts.url) {
    try { const u = new URL(opts.url); opts.url = u.origin + u.pathname; } catch (e) {}
  }
  pending.set(m.requestId, true);
  // 转发给 SW 取 cookie（SW 中 chrome.cookies.getAll 可靠），sendMessage 会唤醒被挂起的 SW
  chrome.runtime.sendMessage({ type: 'GET_COOKIES', requestId: m.requestId, opts })
    .catch((e) => {
      diag('sw_send_failed:' + (e && e.message), m.requestId);
      pending.delete(m.requestId);
    });
});
es.onerror = () => { /* EventSource 自动重连 */ };
console.log('offscreen bridge (relay mode) started, connecting to', BASE);
