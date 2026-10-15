// Sitemap tự động: luôn có đủ bài mới đăng từ admin, không cần sửa tay
const { DOMAIN, toDate, readArchiveIndex } = require('./_lib/blog');
const store = require('./_lib/store');

const STATIC_PAGES = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/blog', changefreq: 'daily', priority: '0.8' },
  { loc: '/about', changefreq: 'monthly', priority: '0.6' },
  { loc: '/thu-vien', changefreq: 'monthly', priority: '0.6' },
  { loc: '/tuyen-ngon', changefreq: 'monthly', priority: '0.6' },
  { loc: '/qr/liberica', changefreq: 'yearly', priority: '0.4' },
];

const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

module.exports = async (req, res) => {
  const fromStore = await store.publicBlogs();
  let blogs = (fromStore || []).slice();
  const ok = true;

  // gộp bài lưu sẵn (khi API lỗi vẫn đủ bài trong sitemap)
  const seen = new Set(blogs.map(b => b.slug));
  if (!fromStore) readArchiveIndex().forEach(b => { if (!seen.has(b.slug)) blogs.push(b); });

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
  res.setHeader('Cache-Control', ok ? 'public, s-maxage=3600, stale-while-revalidate=86400' : 'public, s-maxage=300');
  res.end(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`);
};
