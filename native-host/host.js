#!/usr/bin/env node
'use strict';
/*
 * 独立 Cookie 桥接服务（纯 Node，无依赖）
 * ---------------------------------------------------------------
 * 不再依赖 Native Messaging / Service Worker（两者在 MV3 下会断连）。
 * 改为：本进程作为常驻 localhost 服务，扩展里的 Offscreen Document 通过
 * HTTP/SSE 与本站通信，由 offscreen 调用 chrome.cookies API 读取真实 cookie。
 *
 * 端点：
 *   GET  /cookies?url=&domain=&token=    Agent 取 cookie（转发给 offscreen）
 *   GET  /health                         健康检查（含 extensionConnected）
 *   GET  /stream                         SSE：向 offscreen 推送 GET_COOKIES 命令
 *   POST /result?requestId=              offscreen 回传 cookie 结果
 *
 * 仅监听 127.0.0.1；可选 AGENT_TOKEN 鉴权；含 CORS 与 Private Network Access 头。
 */
const http = require('http');
const { URL } = require('url');
const fs = require('fs');

const PORT = parseInt(
  process.env.PORT || (process.argv.includes('--port') ? process.argv[process.argv.indexOf('--port') + 1] : '9898'),
  10
);
const REQUIRED_TOKEN = process.env.AGENT_TOKEN || '';
const LOG_FILE = process.env.LOG_FILE || '/tmp/chrome-cookie-host.log';

function log(...args) {
  const line =
    '[' + new Date().toISOString() + '] ' +
    args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' ');
  try { process.stderr.write(line + '\n'); } catch (e) {}
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch (e) {}
}

// ---------------- 状态 ----------------
const sseClients = new Set();    // 所有已连接的 offscreen（支持多实例/重连竞态）
let sseLastSeen = 0;
const pending = new Map();       // requestId -> { resolve, timer, opts }

// 兜底：任何 stray 异常都记录，不让进程退出
process.on('uncaughtException', (e) => log('uncaughtException', e && e.message));
process.on('unhandledRejection', (e) => log('unhandledRejection', String(e)));

// ---------------- 工具 ----------------
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Chrome 扩展页面向 localhost 发请求需 Private Network Access 许可
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function broadcastCmd(msg) {
  if (sseClients.size === 0) return false;
  let ok = false;
  for (const res of sseClients) {
    try { res.write(`event: cmd\ndata: ${JSON.stringify(msg)}\n\n`); ok = true; }
    catch (e) { log('sse write error', e.message); sseClients.delete(res); }
  }
  return ok;
}

// ---------------- 路由 ----------------
const server = http.createServer((req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  let u;
  try { u = new URL(req.url, `http://${req.headers.host || 'localhost'}`); } catch (e) { sendJson(res, 400, { error: 'bad url' }); return; }

  if (u.pathname === '/health') {
    sendJson(res, 200, { ok: true, ts: Date.now(), extensionConnected: sseClients.size > 0, sseClients: sseClients.size });
    return;
  }

  if (u.pathname === '/stream') { handleStream(req, res); return; }

  if (u.pathname === '/result') { handleResult(req, res, u); return; }

  if (u.pathname === '/diag') {
    log('DIAG from extension', { msg: u.searchParams.get('msg') || '', rid: u.searchParams.get('rid') || '' });
    sendJson(res, 200, { ok: true });
    return;
  }

  if (u.pathname === '/cookies') { handleCookies(req, res, u); return; }

  sendJson(res, 200, {
    service: 'chrome-cookie-agent',
    endpoints: { cookies: '/cookies?url=<url>&domain=<domain>&token=<token>', health: '/health', stream: '/stream (SSE, for extension)' },
  });
});

// SSE：offscreen 长连接，用于把取 cookie 命令推过去
function handleStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Private-Network': 'true',
  });
  res.write(': connected\n\n');
  sseClients.add(res);
  sseLastSeen = Date.now();
  log('SSE client connected (offscreen); total=' + sseClients.size);
  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); sseLastSeen = Date.now(); } catch (e) { sseClients.delete(res); }
  }, 15000);
  ping.unref?.();
  req.on('close', () => {
    clearInterval(ping);
    if (sseClients.delete(res)) log('SSE client disconnected; total=' + sseClients.size);
  });
}

// offscreen 回传 cookie 结果
function handleResult(req, res, u) {
  const requestId = u.searchParams.get('requestId');
  if (!requestId || !pending.has(requestId)) { sendJson(res, 404, { error: 'unknown requestId' }); return; }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let cookies = [];
    try {
      // 支持 POST body（{cookies:[...]}）与 GET 查询（?cookies=<urlencoded json>）
      if (body) cookies = (JSON.parse(body).cookies) || [];
      else cookies = JSON.parse(decodeURIComponent(u.searchParams.get('cookies') || '[]'));
    } catch (e) {}
    const p = pending.get(requestId);
    pending.delete(requestId);
    clearTimeout(p.timer);
    p.resolve(cookies);
    log('GET_COOKIES resolved via /result', { requestId, count: (cookies || []).length });
    sendJson(res, 200, { ok: true });
  });
}

// Agent 取 cookie：转发给 offscreen，等待结果
function handleCookies(req, res, u) {
  const token = u.searchParams.get('token') || '';
  if (REQUIRED_TOKEN && token !== REQUIRED_TOKEN) {
    sendJson(res, 403, { error: 'invalid or missing token' });
    return;
  }
  const url = u.searchParams.get('url');
  const domain = u.searchParams.get('domain');
  if (!url && !domain) { sendJson(res, 400, { error: 'provide url= or domain=' }); return; }

  if (sseClients.size === 0) {
    sendJson(res, 503, { error: 'extension not connected' });
    return;
  }

  const requestId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  const opts = {};
  if (url) opts.url = url;
  if (domain) opts.domain = domain;

  const timer = setTimeout(() => {
    if (pending.has(requestId)) {
      pending.delete(requestId);
      sendJson(res, 504, { error: 'timeout waiting for extension (10s)' });
    }
  }, 10000);

  pending.set(requestId, {
    timer,
    resolve: (cookies) => {
      const cookieHeader = (cookies || []).map((c) => `${c.name}=${c.value}`).join('; ');
      sendJson(res, 200, { url: url || null, domain: domain || null, count: cookies.length, cookieHeader, cookies });
    },
  });

  log('GET_COOKIES broadcast to ' + sseClients.size + ' client(s)', { requestId, url: url || null, domain: domain || null });
  if (!broadcastCmd({ type: 'GET_COOKIES', requestId, opts })) {
    clearTimeout(timer);
    pending.delete(requestId);
    sendJson(res, 503, { error: 'extension not connected' });
  }
}

server.on('clientError', (e, socket) => { log('clientError', e.message); try { socket.destroy(); } catch (x) {} });
server.on('error', (e) => {
  log('server error', e.code || e.message);
  if (e.code === 'EADDRINUSE') {
    log(`端口 ${PORT} 已被占用。请结束占用该端口的 node 进程后重试（如 pkill -f "host.js"）。`);
  }
});
server.listen(PORT, '127.0.0.1', () => {
  log(`cookie bridge listening on http://127.0.0.1:${PORT}  (host.js standalone, no native messaging)`);
});
