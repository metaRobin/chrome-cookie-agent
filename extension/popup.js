document.addEventListener('DOMContentLoaded', () => {
  const statusEl = document.getElementById('status');
  const idEl = document.getElementById('extid');
  const urlEl = document.getElementById('url');
  const outEl = document.getElementById('out');
  const fetchBtn = document.getElementById('fetch');
  const copyBtn = document.getElementById('copy');

  idEl.textContent = chrome.runtime.id;
  statusEl.textContent = '已加载';

  fetchBtn.addEventListener('click', async () => {
    const url = urlEl.value.trim();
    if (!url) {
      outEl.value = '请输入 URL';
      return;
    }
    try {
      const cookies = await chrome.cookies.getAll({ url });
      const header = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
      const detail = cookies
        .map((c) => `${c.name} = ${c.value}\n  domain=${c.domain} path=${c.path} httpOnly=${c.httpOnly} secure=${c.secure}`)
        .join('\n');
      outEl.value = `共 ${cookies.length} 个 cookie\n\nCookie 头:\n${header}\n\n明细:\n${detail}`;
    } catch (e) {
      outEl.value = '获取失败: ' + e.message;
    }
  });

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(outEl.value).then(() => {
      const t = copyBtn.textContent;
      copyBtn.textContent = '已复制';
      setTimeout(() => (copyBtn.textContent = t), 1200);
    });
  });
});
