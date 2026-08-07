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
  warn: { text: '要確認', className: 'warn' },
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

function setStatusBadge(prefix, statusKey) {
  const statusEl = document.getElementById(`${prefix}-status`);
  const status = STATUS_LABEL[statusKey] || STATUS_LABEL.missing;
  statusEl.textContent = status.text;
  statusEl.className = `status-badge ${status.className}`;
}

function renderHeadings(data) {
  setStatusBadge('headings', data.status);

  const contentEl = document.getElementById('headings-content');
  const metaEl = document.getElementById('headings-meta');

  if (data.outline.length === 0) {
    contentEl.textContent = '(見出しタグが見つかりません)';
  } else {
    contentEl.textContent = data.outline
      .map((h) => `${'  '.repeat(h.level - 1)}<h${h.level}>${h.text || '(テキストなし)'}</h${h.level}>`)
      .join('\n');
  }

  const counts = [1, 2, 3, 4, 5, 6]
    .map((level) => ({ level, count: data.outline.filter((h) => h.level === level).length }))
    .filter((c) => c.count > 0)
    .map((c) => `h${c.level}: ${c.count}個`)
    .join(' / ');

  metaEl.textContent = [counts, ...data.issues].filter(Boolean).join('\n');
}

function renderImages(data) {
  setStatusBadge('images', data.status);

  const contentEl = document.getElementById('images-content');
  const metaEl = document.getElementById('images-meta');

  if (data.total === 0) {
    contentEl.textContent = '(画像が見つかりません)';
  } else {
    contentEl.textContent = `alt属性が設定されていない画像タグ: ${data.missingAltCount}件(全${data.total}枚中)`;
  }

  metaEl.textContent = data.missingAltSamples.length > 0
    ? 'alt未設定の画像(先頭5件):\n' + data.missingAltSamples
        .map((img) => `${img.index}枚目: ${img.src}`)
        .join('\n')
    : '';
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
    renderHeadings(data.headings);
    renderImages(data.images);

    result.hidden = false;
  } catch (err) {
    errorMessage.textContent = err.message;
    errorMessage.hidden = false;
  } finally {
    loading.hidden = true;
    checkButton.disabled = false;
  }
});
