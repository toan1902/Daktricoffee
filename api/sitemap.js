// Sitemap tự động: luôn có đủ bài mới đăng từ admin, không cần sửa tay
const { DOMAIN, apiGet, toDate } = require('./_lib/blog');

const STATIC_PAGES = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/blog', changefreq: 'daily', priority: '0.8' },
  { loc: '/about', changefreq: 'monthly', priority: '0.6' },
  { loc: '/tuyen-ngon', changefreq: 'monthly', priority: '0.6' },
  { loc: '/qr/liberica', changefreq: 'yearly', priority: '0.4' },
];

const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = async (req, res) => {
  let blogs = [];
  let ok = false;
  try {
    const r = await apiGet('table=blogs&action=list&page=1&limit=1000');
    ok = r.ok;
    blogs = (r.ok && r.json && r.json.data) || [];
  } catch (err) {
    console.error('sitemap api error', err && err.message);
  }

  const urls = STATIC_PAGES.map(p => `  <url>
    <loc>${DOMAIN}${p.loc === '/' ? '/' : p.loc}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`);

  blogs.forEach(b => {
    if (!b.slug) return;
    const d = toDate(b.updated_at) || toDate(b.created_at);
    urls.push(`  <url>
    <loc>${xmlEsc(`${DOMAIN}/blog/${encodeURIComponent(b.slug)}`)}</loc>${d ? `
    <lastmod>${d.toISOString()}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`);
  });

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', ok ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'no-store');
  res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`);
};
