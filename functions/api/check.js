import * as cheerio from 'cheerio';

const FETCH_TIMEOUT_MS = 10000;
const FAVICON_TIMEOUT_MS = 5000;
const USER_AGENT = 'Mozilla/5.0 (compatible; WebSiteCheckerBot/1.0)';

// SEO上の目安となる文字数の範囲(一般的に言われている基準)
const TITLE_MIN = 30;
const TITLE_MAX = 60;
const DESCRIPTION_MIN = 70;
const DESCRIPTION_MAX = 160;

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

function checkHeadings($) {
  const outline = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    let text = $(el).text().trim().replace(/\s+/g, ' ');
    if (!text) {
      const imgAlt = $(el).find('img').first().attr('alt')?.trim();
      if (imgAlt) {
        text = `(alt: ${imgAlt})`;
      }
    }
    outline.push({
      level: Number(el.tagName.slice(1)),
      text,
    });
  });

  const h1Count = outline.filter((h) => h.level === 1).length;
  const issues = [];

  if (h1Count === 0) {
    issues.push('h1が見つかりません');
  } else if (h1Count > 1) {
    issues.push(`h1が${h1Count}個あります(通常は1個が推奨)`);
  }

  let prevLevel = 0;
  for (const h of outline) {
    if (prevLevel !== 0 && h.level > prevLevel + 1) {
      issues.push(`見出しの階層が飛んでいます(h${prevLevel} → h${h.level})`);
    }
    prevLevel = h.level;
  }

  let status;
  if (h1Count === 0) {
    status = 'missing';
  } else if (issues.length > 0) {
    status = 'warn';
  } else {
    status = 'ok';
  }

  return { outline, h1Count, issues, status };
}

function checkImages($) {
  const images = $('img');
  const total = images.length;
  const missingAltSamples = [];
  let missingAltCount = 0;

  images.each((index, el) => {
    const alt = $(el).attr('alt');
    if (alt === undefined || alt.trim() === '') {
      missingAltCount += 1;
      if (missingAltSamples.length < 5) {
        missingAltSamples.push({
          index: index + 1,
          src: $(el).attr('src') || '(srcなし)',
        });
      }
    }
  });

  const status = missingAltCount === 0 ? 'ok' : 'warn';

  return { total, missingAltCount, missingAltSamples, status };
}

function getImageExtension(src) {
  if (!src || src.startsWith('data:')) return 'other';
  const path = src.split('?')[0].split('#')[0];
  const match = path.match(/\.([a-zA-Z0-9]+)$/);
  return match ? match[1].toLowerCase() : 'other';
}

function checkImageFormats($) {
  const images = $('img');
  const total = images.length;
  const counts = { jpg: 0, png: 0, webp: 0, avif: 0, gif: 0, svg: 0, other: 0 };
  const legacySamples = [];

  images.each((index, el) => {
    const src = $(el).attr('src') || '';
    const ext = getImageExtension(src);
    const key = ext === 'jpeg' ? 'jpg' : ext;

    if (key in counts) {
      counts[key] += 1;
    } else {
      counts.other += 1;
    }

    if ((key === 'jpg' || key === 'png') && legacySamples.length < 5) {
      legacySamples.push({ index: index + 1, src });
    }
  });

  const legacyCount = counts.jpg + counts.png;
  const status = legacyCount > 0 ? 'warn' : 'ok';

  return { total, counts, legacyCount, legacySamples, status };
}

function checkLazyLoading($) {
  const images = $('img');
  const total = images.length;
  const checkedCount = Math.max(total - 1, 0);
  const missingLazySamples = [];
  let missingLazyCount = 0;

  images.each((index, el) => {
    if (index === 0) return;

    const loading = ($(el).attr('loading') || '').trim().toLowerCase();
    if (loading !== 'lazy') {
      missingLazyCount += 1;
      if (missingLazySamples.length < 5) {
        missingLazySamples.push({
          index: index + 1,
          src: $(el).attr('src') || '(srcなし)',
        });
      }
    }
  });

  const status = missingLazyCount > 0 ? 'warn' : 'ok';

  return { total, checkedCount, missingLazyCount, missingLazySamples, status };
}

function extractJsonLdTypes(parsed) {
  const nodes = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.['@graph'])
      ? parsed['@graph']
      : [parsed];

  return nodes.flatMap((node) => {
    const type = node?.['@type'];
    if (!type) return [];
    return Array.isArray(type) ? type : [type];
  });
}

function checkJsonLd($) {
  const scripts = $('script[type="application/ld+json"]');
  const count = scripts.length;

  if (count === 0) {
    return { exists: false, count: 0, items: [], issues: ['JSON-LDが見つかりません'], status: 'missing' };
  }

  const items = [];
  const issues = [];

  scripts.each((index, el) => {
    const raw = ($(el).html() || '').trim();
    let valid = true;
    let types = [];

    try {
      const parsed = JSON.parse(raw);
      types = extractJsonLdTypes(parsed);
      if (types.length === 0) {
        issues.push(`${index + 1}番目のJSON-LDに @type が見つかりません`);
      }
    } catch {
      valid = false;
      issues.push(`${index + 1}番目のJSON-LDはJSON形式が正しくありません`);
    }

    items.push({ index: index + 1, valid, types });
  });

  const status = issues.length === 0 ? 'ok' : 'warn';

  return { exists: true, count, items, issues, status };
}

async function urlExists(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FAVICON_TIMEOUT_MS);
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT },
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
    }
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkFavicon($, targetUrl) {
  const href = $('link[rel~="icon"]').first().attr('href')?.trim();
  const source = href ? 'link' : 'default';

  let faviconUrl;
  try {
    faviconUrl = new URL(href || '/favicon.ico', targetUrl).toString();
  } catch {
    return { exists: false, url: null, source: null, status: 'missing' };
  }

  if (faviconUrl.startsWith('data:')) {
    const hasContent = faviconUrl.split(',')[1]?.length > 0;
    return {
      exists: hasContent,
      url: hasContent ? faviconUrl : null,
      source,
      status: hasContent ? 'ok' : 'missing',
    };
  }

  const exists = await urlExists(faviconUrl);
  return {
    exists,
    url: exists ? faviconUrl : null,
    source,
    status: exists ? 'ok' : 'missing',
  };
}

async function checkOgp($, targetUrl) {
  const getMeta = (property) => $(`meta[property="${property}"]`).first().attr('content')?.trim() || '';

  const title = getMeta('og:title');
  const description = getMeta('og:description');
  const image = getMeta('og:image');
  const url = getMeta('og:url');
  const type = getMeta('og:type');
  const siteName = getMeta('og:site_name');

  const issues = [];
  if (!title) issues.push('og:titleが設定されていません');
  if (!description) issues.push('og:descriptionが設定されていません');
  if (!image) issues.push('og:imageが設定されていません');

  let imageUrl = null;
  let imageAccessible = false;
  if (image) {
    try {
      imageUrl = new URL(image, targetUrl).toString();
      imageAccessible = await urlExists(imageUrl);
      if (!imageAccessible) issues.push('og:imageの画像を取得できません');
    } catch {
      imageUrl = null;
      issues.push('og:imageのURL形式が正しくありません');
    }
  }

  const exists = Boolean(title || description || image || url || type || siteName);
  const hasCore = Boolean(title && description && image);

  let status;
  if (!exists) {
    status = 'missing';
  } else if (hasCore && imageAccessible) {
    status = 'ok';
  } else {
    status = 'warn';
  }

  return {
    exists,
    title,
    description,
    image,
    imageUrl,
    imageAccessible,
    url,
    type,
    siteName,
    issues,
    status,
  };
}

function checkMetaRobots($) {
  const content = $('meta[name="robots"]').first().attr('content')?.trim() || '';
  const exists = content.length > 0;
  const directives = content
    ? content.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
    : [];

  const hasNoindex = directives.includes('noindex') || directives.includes('none');
  const hasNofollow = directives.includes('nofollow') || directives.includes('none');

  const issues = [];
  let status;
  if (hasNoindex) {
    issues.push('noindexが指定されているため、検索エンジンにインデックスされません');
    status = 'noindex';
  } else if (hasNofollow) {
    issues.push('nofollowが指定されているため、このページのリンクが評価されません');
    status = 'warn';
  } else {
    status = 'ok';
  }

  return { exists, content, directives, hasNoindex, hasNofollow, issues, status };
}

async function checkTwitterCard($, targetUrl, ogp) {
  const getMeta = (name) => $(`meta[name="${name}"]`).first().attr('content')?.trim() || '';

  const card = getMeta('twitter:card');
  let title = getMeta('twitter:title');
  let description = getMeta('twitter:description');
  let image = getMeta('twitter:image') || getMeta('twitter:image:src');
  const site = getMeta('twitter:site');

  const usesOgpFallback = { title: false, description: false, image: false };
  if (!title && ogp.title) { title = ogp.title; usesOgpFallback.title = true; }
  if (!description && ogp.description) { description = ogp.description; usesOgpFallback.description = true; }
  if (!image && ogp.image) { image = ogp.image; usesOgpFallback.image = true; }

  const issues = [];
  if (!card) issues.push('twitter:cardが設定されていません');
  if (!title) issues.push('twitter:title(またはog:title)が設定されていません');
  if (!description) issues.push('twitter:description(またはog:description)が設定されていません');
  if (!image) issues.push('twitter:image(またはog:image)が設定されていません');

  let imageUrl = null;
  let imageAccessible = false;
  if (image) {
    try {
      imageUrl = new URL(image, targetUrl).toString();
      imageAccessible = await urlExists(imageUrl);
      if (!imageAccessible) issues.push('twitter:imageの画像を取得できません');
    } catch {
      imageUrl = null;
      issues.push('twitter:imageのURL形式が正しくありません');
    }
  }

  const exists = Boolean(card || title || description || image || site);
  const hasCore = Boolean(card && title && description && image);

  let status;
  if (!exists) {
    status = 'missing';
  } else if (hasCore && imageAccessible) {
    status = 'ok';
  } else {
    status = 'warn';
  }

  return {
    exists,
    card,
    title,
    description,
    image,
    imageUrl,
    imageAccessible,
    site,
    usesOgpFallback,
    issues,
    status,
  };
}

async function checkCanonical($, targetUrl) {
  const links = $('link[rel="canonical"]');
  const count = links.length;

  if (count === 0) {
    return {
      exists: false,
      content: '',
      url: null,
      matchesCurrentUrl: false,
      count: 0,
      issues: ['canonical URLが設定されていません'],
      status: 'missing',
    };
  }

  const issues = [];
  if (count > 1) {
    issues.push(`canonicalタグが${count}個あります(通常は1個にすべきです)`);
  }

  const href = links.first().attr('href')?.trim() || '';
  if (!href) {
    issues.push('canonicalタグにhrefが指定されていません');
    return { exists: true, content: href, url: null, matchesCurrentUrl: false, count, issues, status: 'warn' };
  }

  let canonicalUrl;
  try {
    canonicalUrl = new URL(href, targetUrl).toString();
  } catch {
    issues.push('canonical URLの形式が正しくありません');
    return { exists: true, content: href, url: null, matchesCurrentUrl: false, count, issues, status: 'warn' };
  }

  const matchesCurrentUrl = canonicalUrl === targetUrl;

  if (!matchesCurrentUrl) {
    issues.push('現在のURLとは異なるページを正規URLとして指定しています');
    const accessible = await urlExists(canonicalUrl);
    if (!accessible) {
      issues.push('指定された正規URLにアクセスできません');
    }
  }

  const status = issues.length === 0 ? 'ok' : 'warn';

  return { exists: true, content: href, url: canonicalUrl, matchesCurrentUrl, count, issues, status };
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
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

export async function onRequestPost({ request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'リクエストの形式が正しくありません' }, 400);
  }

  const inputUrl = (body && body.url || '').trim();
  if (!inputUrl) {
    return jsonResponse({ error: 'URLを入力してください' }, 400);
  }

  let targetUrl;
  try {
    targetUrl = normalizeUrl(inputUrl);
  } catch (err) {
    return jsonResponse({ error: err.message }, 400);
  }

  try {
    const html = await fetchHtml(targetUrl);
    const $ = cheerio.load(html);

    const title = $('title').first().text().trim();
    const description = $('meta[name="description"]').attr('content')?.trim() || '';
    const ogp = await checkOgp($, targetUrl);

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
      headings: checkHeadings($),
      images: checkImages($),
      imageFormats: checkImageFormats($),
      lazyLoading: checkLazyLoading($),
      favicon: await checkFavicon($, targetUrl),
      ogp,
      twitterCard: await checkTwitterCard($, targetUrl, ogp),
      canonical: await checkCanonical($, targetUrl),
      jsonLd: checkJsonLd($),
      robots: checkMetaRobots($),
    };

    return jsonResponse(result, 200);
  } catch (err) {
    return jsonResponse({ error: err.message || 'チェック中にエラーが発生しました' }, 502);
  }
}

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
