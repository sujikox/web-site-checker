const path = require('path');
const express = require('express');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;
const FETCH_TIMEOUT_MS = 10000;

// SEO上の目安となる文字数の範囲(一般的に言われている基準)
const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESCRIPTION_MIN = 70;
const DESCRIPTION_MAX = 160;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function normalizeUrl(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('URLの形式が正しくありません');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('http または https のURLを入力してください');
  }
  return url.toString();
}

function evaluateLength(length, min, max) {
  if (length === 0) return 'missing';
  if (length < min) return 'too_short';
  if (length > max) return 'too_long';
  return 'ok';
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WebSiteCheckerBot/1.0)',
      },
    });
    if (!res.ok) {
      throw new Error(`ページの取得に失敗しました (HTTP ${res.status})`);
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      throw new Error('HTMLページではないようです');
    }
    return await res.text();
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('タイムアウトしました。時間をおいて再度お試しください');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

app.post('/api/check', async (req, res) => {
  const inputUrl = (req.body && req.body.url || '').trim();

  if (!inputUrl) {
    return res.status(400).json({ error: 'URLを入力してください' });
  }

  let targetUrl;
  try {
    targetUrl = normalizeUrl(inputUrl);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  try {
    const html = await fetchHtml(targetUrl);
    const $ = cheerio.load(html);

    const title = $('title').first().text().trim();
    const description = $('meta[name="description"]').attr('content')?.trim() || '';

    const result = {
      url: targetUrl,
      title: {
        exists: title.length > 0,
        content: title,
        length: title.length,
        status: evaluateLength(title.length, TITLE_MIN, TITLE_MAX),
        recommended: { min: TITLE_MIN, max: TITLE_MAX },
      },
      description: {
        exists: description.length > 0,
        content: description,
        length: description.length,
        status: evaluateLength(description.length, DESCRIPTION_MIN, DESCRIPTION_MAX),
        recommended: { min: DESCRIPTION_MIN, max: DESCRIPTION_MAX },
      },
    };

    res.json(result);
  } catch (err) {
    res.status(502).json({ error: err.message || 'チェック中にエラーが発生しました' });
  }
});

app.listen(PORT, () => {
  console.log(`Web Site Checker running at http://localhost:${PORT}`);
});
