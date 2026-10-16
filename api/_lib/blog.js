// Render sẵn (server-side) bài viết & danh sách blog để Google, Facebook, Zalo
// đọc được tiêu đề, mô tả, ảnh và nội dung mà không cần chạy JavaScript.
const fs = require('fs');
const path = require('path');

const DOMAIN = 'https://daktri.vn';
const DEFAULT_IMAGE = 'https://daktri.vn/assets/images/brand/daktri-logo.png';
const DEFAULT_DESC = 'Kiến thức nông nghiệp tử tế từ HTX Daktri Khe Sanh — cà phê Liberica, đất khỏe, canh tác hữu cơ.';

const templateCache = {};
function readTemplate(name) {
  if (!templateCache[name]) {
    templateCache[name] = fs.readFileSync(path.join(process.cwd(), 'templates', name), 'utf8');
  }
  return templateCache[name];
}


function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseContent(raw) {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch (e) { return raw; }
  }
  return raw;
}

function absUrl(u) {
  if (!u) return '';
  return u.startsWith('/') ? DOMAIN + u : u;
}

function toDate(raw) {
  if (!raw) return null;
  const iso = String(raw).includes('T') ? String(raw) : String(raw).replace(' ', 'T') + '+07:00';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(raw, sep = '/') {
  const d = toDate(raw);
  if (!d) return '';
  const vn = new Date(d.getTime() + 7 * 3600 * 1000); // giờ Việt Nam
  const dd = String(vn.getUTCDate()).padStart(2, '0');
  const mm = String(vn.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}${sep}${mm}${sep}${vn.getUTCFullYear()}`;
}

function clip(text, n = 160) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= n) return t;
  return t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
}

// Giống hệt renderBlock() phía trình duyệt để nội dung hiển thị không đổi
function renderBlock(block) {
  const content = parseContent(block.content);
  switch (block.type) {
    case 'heading': {
      const text = (content && (content.value || content.text)) || (typeof content === 'string' ? content : '');
      return text ? `<div class="section"><h2 class="section__heading">${esc(text)}</h2></div>` : '';
    }
    case 'text': {
      const text = (content && (content.value || content.text || content.content)) || (typeof content === 'string' ? content : '');
      return text ? `<div class="section"><p>${esc(text)}</p></div>` : '';
    }
    case 'pullquote': {
      const text = (content && (content.quote || content.value)) || (typeof content === 'string' ? content : '');
      return text ? `<blockquote class="pullquote"><p>${esc(text)}</p></blockquote>` : '';
    }
    case 'list': {
      const items = Array.isArray(content) ? content : (content && Array.isArray(content.items) ? content.items : []);
      if (!items.length) return '';
      return `<div class="section"><ul>${items.map(i => `<li>${esc(typeof i === 'string' ? i : JSON.stringify(i))}</li>`).join('')}</ul></div>`;
    }
    case 'image': {
      const url = absUrl(content && content.url);
      if (!url) return '';
      const caption = (content && content.caption) || '';
      return `<figure class="block-image"><img src="${esc(url)}" alt="${esc(caption)}" loading="lazy">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`;
    }
    default:
      return '';
  }
}

function sortedBlocks(data) {
  return Array.isArray(data.blocks)
    ? data.blocks.slice().sort((a, b) => (a.position || 0) - (b.position || 0))
    : [];
}

function firstText(blocks) {
  for (const b of blocks) {
    if (b.type !== 'text') continue;
    const c = parseContent(b.content);
    const t = (c && (c.value || c.text || c.content)) || (typeof c === 'string' ? c : '');
    if (t) return t;
  }
  return '';
}

function firstImage(blocks) {
  for (const b of blocks) {
    if (b.type !== 'image') continue;
    const c = parseContent(b.content);
    if (c && c.url) return absUrl(c.url);
  }
  return '';
}

function between(html, tag, value) {
  const re = new RegExp(`<!--SSR:${tag}-->[\\s\\S]*?<!--/SSR:${tag}-->`);
  return html.replace(re, value);
}

function jsonForScript(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function renderPost(data) {
  const slug = data.slug;
  const url = `${DOMAIN}/blog/${encodeURIComponent(slug)}`;
  const blocks = sortedBlocks(data);
  const desc = clip(data.excerpt || data.tagline || firstText(blocks) || DEFAULT_DESC);
  const image = absUrl(data.cover_image) || firstImage(blocks) || DEFAULT_IMAGE;
  const published = toDate(data.created_at);
  const modified = toDate(data.updated_at) || published;
  const tagline = data.excerpt || data.tagline || 'Giữ đất · Giữ giống · Giữ cho mai sau';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: data.title,
    description: desc,
    image: [image],
    mainEntityOfPage: url,
    url,
    inLanguage: 'vi-VN',
    author: { '@type': data.author ? 'Person' : 'Organization', name: data.author || 'HTX Daktri Khe Sanh' },
    publisher: {
      '@type': 'Organization',
      name: 'HTX Daktri Khe Sanh',
      logo: { '@type': 'ImageObject', url: DEFAULT_IMAGE },
    },
  };
  if (published) ld.datePublished = published.toISOString();
  if (modified) ld.dateModified = modified.toISOString();

  const head = `
  <title>${esc(data.title)} | Daktri Khe Sanh</title>
  <meta name="description" content="${esc(desc)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${esc(url)}" />
  <meta property="og:type" content="article" />
  <meta property="og:locale" content="vi_VN" />
  <meta property="og:title" content="${esc(data.title)}" />
  <meta property="og:description" content="${esc(desc)}" />
  <meta property="og:url" content="${esc(url)}" />
  <meta property="og:image" content="${esc(image)}" />
  ${published ? `<meta property="article:published_time" content="${published.toISOString()}" />` : ''}
  ${modified ? `<meta property="article:modified_time" content="${modified.toISOString()}" />` : ''}
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">${jsonForScript(ld)}</script>
  <script>window.__BLOG_DATA__ = ${jsonForScript(data)};</script>
  `;

  const tags = []
    .concat(Array.isArray(data.tags) ? data.tags : (typeof data.tags === 'string' && data.tags ? data.tags.split(',') : []))
    .concat(data.category ? [data.category] : [])
    .map(t => String(t).trim())
    .filter(Boolean)
    .map(t => `<span class="post-meta__tag">${esc(t)}</span>`)
    .join('\n          ');

  let html = readTemplate('blog-detail.html');
  html = between(html, 'HEAD', head);
  html = between(html, 'TITLE', esc(data.title));
  html = html.replace('<!--SSR:TAGLINE-->', esc(tagline));
  html = between(html, 'SLUG', esc('/blog/' + slug));
  html = html.replace('<!--SSR:DATE-->', esc(fmtDate(data.created_at)));
  html = html.replace('<!--SSR:AUTHOR-->', data.author ? esc('Tác giả: ' + data.author) : '');
  html = between(html, 'TAGS', tags);
  html = between(
    html,
    'BODY',
    `<div id="blog-loading" class="blog-loading" style="display:none;"></div>
          <div id="blog-blocks" data-ssr="1">${blocks.map(renderBlock).join('')}</div>`
  );
  html = html.replace('<body data-blog-id="">', `<body data-blog-id="${esc(data.id || '')}" data-blog-slug="${esc(slug)}">`);
  if (data.cover_image) {
    html = html.replace(
      '<header class="hero" id="hero" style="min-height:0;">',
      `<header class="hero hero--has-image" id="hero" style="min-height:0;background-image:url('${esc(absUrl(data.cover_image))}')">`
    );
  }
  return html;
}

// Trang lỗi/404: vẫn giữ giao diện, để trình duyệt tự tải lại; báo Google không index
function renderPostFallback(slug, { notFound }) {
  const head = `
  <title>${notFound ? 'Không tìm thấy bài viết' : 'Bài viết'} | Daktri Khe Sanh</title>
  <meta name="description" content="${esc(DEFAULT_DESC)}" />
  <meta name="robots" content="noindex, follow" />
  ${slug ? `<link rel="canonical" href="${esc(`${DOMAIN}/blog/${encodeURIComponent(slug)}`)}" />` : ''}
  `;
  return between(readTemplate('blog-detail.html'), 'HEAD', head);
}

function renderList(result) {
  const blogs = (result && result.data) || [];
  const items = blogs
    .filter(b => b.slug && b.title)
    .map(b => `
      <a href="/blog/${encodeURIComponent(b.slug)}" class="post">
        <div class="post-date">${esc(fmtDate(b.created_at || b.updated_at, ' · '))}</div>
        <h3 class="post-title">${esc(b.title)}</h3>
        <p class="post-desc">${esc(b.excerpt || '')}</p>
      </a>`)
    .join('');

  const p = (result && result.pagination) || {};
  const pagination = p.total_pages > 1
    ? `<div class="pagination" style="margin-top: 30px; text-align: center;">
      <span style="margin: 0 15px; font-weight: 500;">Trang ${esc(p.current_page || 1)} / ${esc(p.total_pages)}</span>
      <button onclick="loadBlogs(${Number(p.current_page || 1) + 1})" class="page-btn">Sau →</button>
    </div>`
    : '';

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Blog Nông nghiệp tử tế — HTX Daktri Khe Sanh',
    url: `${DOMAIN}/blog`,
    inLanguage: 'vi-VN',
    publisher: { '@type': 'Organization', name: 'HTX Daktri Khe Sanh' },
    blogPost: blogs.filter(b => b.slug && b.title).map(b => ({
      '@type': 'BlogPosting',
      headline: b.title,
      url: `${DOMAIN}/blog/${encodeURIComponent(b.slug)}`,
      ...(toDate(b.created_at) ? { datePublished: toDate(b.created_at).toISOString() } : {}),
    })),
  };

  let html = readTemplate('blog-index.html');
  if (items) {
    html = html.replace('<ul class="post-list" id="post-list"><!--SSR:LIST-->', `<ul class="post-list" id="post-list" data-ssr="1">${items}`);
    html = html.replace('<!--SSR:PAGINATION-->', pagination);
  }
  html = html.replace('</head>', `  <script type="application/ld+json">${jsonForScript(ld)}</script>\n</head>`);
  return html;
}


// ===================== KHO DỰ PHÒNG (khi API libericakhesanh.net lỗi) =====================
// Bài viết & danh sách lưu sẵn trong repo (data/blog-archive) để web không bao giờ trống.
let archiveIndex = null;
function readArchiveIndex() {
  if (!archiveIndex) {
    try {
      archiveIndex = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'blog-archive', 'index.json'), 'utf8'));
    } catch (e) {
      archiveIndex = [];
    }
  }
  return archiveIndex;
}

const ARCHIVE_BAR = `
<div style="position:sticky;top:0;z-index:1000;background:#1a2e1e;color:#faf7f0;font:500 14px/1.4 system-ui,sans-serif;padding:10px 16px;display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap">
  <a href="/" style="color:#faf7f0;text-decoration:none;display:flex;align-items:center;gap:8px"><img src="/assets/images/brand/daktri-logo.png" alt="Logo HTX Daktri Khe Sanh" width="28" height="28" style="border-radius:50%;background:#fff">Daktri Khe Sanh</a>
  <span style="display:flex;gap:16px;flex-wrap:wrap"><a href="/blog" style="color:#f5a623;text-decoration:none">← Tất cả bài viết</a><a href="/#products" style="color:#faf7f0;text-decoration:none">Sản phẩm</a><a href="tel:0941336669" style="color:#faf7f0;text-decoration:none">📞 0941 336 669</a></span>
</div>`;

function renderArchivedPost(slug, override) {
  const base = readArchiveIndex().find(p => p.slug === slug);
  const meta = base && override
    ? { ...base, title: override.title || base.title, excerpt: override.excerpt || base.excerpt, image: override.cover_image || base.image }
    : base;
  if (!meta) return null;
  let html;
  try {
    html = fs.readFileSync(path.join(process.cwd(), 'data', 'blog-archive', `${slug}.html`), 'utf8');
  } catch (e) {
    return null;
  }
  const url = `${DOMAIN}/blog/${encodeURIComponent(slug)}`;
  const image = meta.image ? (meta.image.startsWith('/') ? DOMAIN + meta.image : meta.image) : DOMAIN + '/assets/images/og-daktri.jpg';
  const published = toDate(meta.created_at);
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: meta.title,
    description: meta.excerpt,
    image: [image],
    url,
    mainEntityOfPage: url,
    inLanguage: 'vi-VN',
    author: { '@type': 'Organization', name: 'HTX Daktri Khe Sanh' },
    publisher: { '@type': 'Organization', name: 'HTX Daktri Khe Sanh', logo: { '@type': 'ImageObject', url: DEFAULT_IMAGE } },
    ...(published ? { datePublished: published.toISOString() } : {}),
  };
  const cover = override && override.cover_image;
  const coverInBody = cover && html.includes(cover);
  // bỏ thẻ SEO cũ để không bị trùng, rồi chèn bộ chuẩn
  html = html
    .replace(/<link rel="canonical"[^>]*>\s*/gi, '')
    .replace(/<meta (?:property|name)="(?:og:[a-z:_]+|twitter:[a-z:_]+|robots|description)"[^>]*>\s*/gi, '')
    .replace(/<link rel="icon"[^>]*>\s*/gi, '');
  const head = `
  <meta name="description" content="${esc(meta.excerpt)}" />
  <meta name="robots" content="index, follow, max-image-preview:large" />
  <link rel="canonical" href="${esc(url)}" />
  <link rel="icon" href="/assets/images/brand/daktri-logo.png" type="image/png" />
  <meta property="og:type" content="article" />
  <meta property="og:locale" content="vi_VN" />
  <meta property="og:site_name" content="HTX Daktri Khe Sanh" />
  <meta property="og:title" content="${esc(meta.title)}" />
  <meta property="og:description" content="${esc(meta.excerpt)}" />
  <meta property="og:url" content="${esc(url)}" />
  <meta property="og:image" content="${esc(image)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <script type="application/ld+json">${jsonForScript(ld)}</script>
</head>`;
  html = html.replace(/<\/head>/i, head);
  html = html.replace(/<body([^>]*)>/i, `<body$1>${ARCHIVE_BAR}`);
  // ảnh bìa đặt trong admin -> hiện ngay dưới tiêu đề (nếu bài gốc chưa có ảnh này)
  if (cover && !coverInBody && /<div class="article__body">/.test(html)) {
    html = html.replace(/<div class="article__body">/,
      `<div class="article__body"><figure style="margin:24px 0 8px"><img src="${esc(cover)}" alt="${esc(meta.title)}" width="1200" height="630" style="width:100%;height:auto;border-radius:12px;display:block" fetchpriority="high"></figure>`);
  }
  return html;
}

function archivedListResult() {
  const data = readArchiveIndex()
    .slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return { data, pagination: { current_page: 1, total_pages: 1 } };
}

module.exports = { DOMAIN, readTemplate, renderPost, renderPostFallback, renderList, toDate, renderArchivedPost, archivedListResult, readArchiveIndex };
