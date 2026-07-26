/*
 * 扩展后台 Service Worker
 * ---------------------------------------------------------------
 * 职责：
 *   1) 启动/看护 Offscreen Document（offscreen 负责常驻 SSE 连接，不受 30s 回收影响）
 *   2) 实际执行 chrome.cookies.getAll（SW 中该 API 标准可靠）
 *      offscreen 通过 chrome.runtime.sendMessage 把 GET_COOKIES 转发过来，
 *      本 SW 取完 cookie 再 sendMessage 回传给 offscreen，由 offscreen POST 给 host。
 */
const OFFSCREEN_URL = 'offscreen.html';
let creating = null; // 防止并发 createDocument 产生多个 offscreen 文档

async function ensureOffscreen() {
  try {
    if (typeof chrome.offscreen === 'undefined') {
      console.error('offscreen API 不可用（Chrome 版本过低）');
      return;
    }
    if (creating) { await creating; return; }
    const has = await chrome.offscreen.hasDocument();
    if (!has) {
      creating = chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: ['BLOBS'],
        justification: '保持原生 cookie 桥接连接常驻，避免 Service Worker 空闲回收导致断连。',
      }).catch((e) => { console.error('createDocument failed', e); });
      await creating;
      creating = null;
      console.log('offscreen document created/rechecked');
    }
  } catch (e) {
    console.error('ensureOffscreen failed', e);
  }
}

chrome.runtime.onInstalled.addListener(ensureOffscreen);
chrome.runtime.onStartup.addListener(ensureOffscreen);

// 定时看护：周期性确认 offscreen 存在（缺失则重建）
chrome.alarms.create('ensure-offscreen', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'ensure-offscreen') ensureOffscreen();
});

// offscreen 转发来的取 cookie 请求：在 SW 中执行 chrome.cookies.getAll（可靠）
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== 'GET_COOKIES') return;
  const opts = msg.opts || {};
  chrome.cookies.getAll(opts, (cookies) => {
    chrome.runtime.sendMessage({
      type: 'COOKIES_RESULT',
      requestId: msg.requestId,
      cookies: cookies || [],
    }).catch(() => {});
  });
});

ensureOffscreen();
