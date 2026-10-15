// Trang chủ: render sẵn danh sách sản phẩm để Google đọc được tên, giá, mô tả
const { apiGet, readTemplate } = require('./_lib/blog');

const SITE_BASE = 'https://libericakhesanh.net';

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Giống formatProductName() phía trình duyệt
function formatName(name) {
  const n = esc(name || '');
  const m = n.match(/(Liberica)/i);
  if (m) {
    const before = n.substring(0, m.index + m[0].length);
    const after = n.substring(m.index + m[0].length);
    if (after.trim()) return `${before}<em>${after}</em>`;
  }
  return n;
}

function formatWeight(weight) {
  const w = Number(weight);
  if (!weight || isNaN(w) || w <= 0) return '';
  return w >= 1000
    ? ` <span class="product-weight">/ ${(w / 1000).toLocaleString('vi-VN')}kg</span>`
    : ` <span class="product-weight">/ ${w}g</span>`;
}

function img(u) {
  if (!u) return '';
  return (u.startsWith('/') ? SITE_BASE : '') + u;
}

function card(p) {
  const price = Number(p.price);
  return `
    <article class="product-card">
      <div class="product-image">
        ${p.image_url ? `<img src="${esc(img(p.image_url))}" alt="${esc(p.name)}" loading="lazy" decoding="async"/>` : '<div class="no-image">Không có ảnh</div>'}
        ${p.category ? `<span class="product-tag signature">${esc(p.category)}</span>` : ''}
      </div>
      <div class="product-body">
        <h3 class="product-name">${formatName(p.name)}</h3>
        <p class="product-desc">${esc(p.description || 'Sản phẩm chất lượng cao từ Liberica Khe Sanh')}</p>
        ${p.tags ? `<div class="product-notes">${String(p.tags).split(',').slice(0, 3).map(t => `<span class="note-pill">${esc(t.trim())}</span>`).join('')}</div>` : ''}
        <div class="product-footer">
          <div class="product-price">
            ${isNaN(price) ? '' : price.toLocaleString('vi-VN')}<small>đ</small>
            ${formatWeight(p.weight)}
          </div>
          <a href="#order" class="product-buy">Đặt mua</a>
        </div>
      </div>
    </article>`;
}

function productLd(products) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Sản phẩm HTX Daktri Khe Sanh',
    itemListElement: products.map((p, i) => {
      const item = {
        '@type': 'Product',
        name: p.name,
        description: p.description || undefined,
        image: p.image_url ? img(p.image_url) : undefined,
        brand: { '@type': 'Brand', name: 'Daktri' },
        url: 'https://daktri.vn/#products',
      };
      const price = Number(p.price);
      if (!isNaN(price) && price > 0) {
        item.offers = {
          '@type': 'Offer',
          price: String(price),
          priceCurrency: 'VND',
          availability: 'https://schema.org/InStock',
          url: 'https://daktri.vn/#order',
          seller: { '@id': 'https://daktri.vn/#org' },
        };
      }
      return { '@type': 'ListItem', position: i + 1, item };
    }),
  };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  let html = readTemplate('home.html');
  try {
    const { ok, json } = await apiGet('table=products&action=list&limit=12');
    const products = ok && json && json.status === 'success' && Array.isArray(json.data) ? json.data : null;
    if (!products) throw new Error('no products');

    if (products.length) {
      html = html
        .replace('<div class="product-grid" id="product-grid">', '<div class="product-grid" id="product-grid" data-ssr="1">')
        .replace(/<!--SSR:PRODUCTS-->[\s\S]*?<!--\/SSR:PRODUCTS-->/, products.map(card).join(''))
        .replace('</head>', `  <script type="application/ld+json">${JSON.stringify(productLd(products)).replace(/</g, '\\u003c')}</script>\n</head>`);
    }
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  } catch (err) {
    console.error('home ssr error', err && err.message);
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'public, s-maxage=30');
  }
  res.end(html);
};
