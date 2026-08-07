const form = document.getElementById('check-form');
const urlInput = document.getElementById('url-input');
const checkButton = document.getElementById('check-button');
const errorMessage = document.getElementById('error-message');
const loading = document.getElementById('loading');
const result = document.getElementById('result');
const resultUrl = document.getElementById('result-url');

const STATUS_LABEL = {
  ok: { text: 'OK', className: 'ok' },
  too_short: { text: '短すぎる', className: 'warn' },
  too_long: { text: '長すぎる', className: 'warn' },
  missing: { text: '未設定', className: 'ng' },
};

function renderCheck(prefix, data) {
  const statusEl = document.getElementById(`${prefix}-status`);
  const contentEl = document.getElementById(`${prefix}-content`);
  const metaEl = document.getElementById(`${prefix}-meta`);

  const status = STATUS_LABEL[data.status] || STATUS_LABEL.missing;
  statusEl.textContent = status.text;
  statusEl.className = `status-badge ${status.className}`;

  contentEl.textContent = data.exists ? data.content : '(設定されていません)';

  metaEl.textContent =
    `文字数: ${data.length}文字 / 目安: ${data.recommended.min}〜${data.recommended.max}文字`;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const url = urlInput.value.trim();
  if (!url) return;

  errorMessage.hidden = true;
  result.hidden = true;
  loading.hidden = false;
  checkButton.disabled = true;

  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'チェックに失敗しました');
    }

    resultUrl.href = data.url;
    resultUrl.textContent = data.url;

    renderCheck('title', data.title);
    renderCheck('description', data.description);

    result.hidden = false;
  } catch (err) {
    errorMessage.textContent = err.message;
    errorMessage.hidden = false;
  } finally {
    loading.hidden = true;
    checkButton.disabled = false;
  }
});
