// /blog — danh sách bài: bài đăng qua admin daktri.vn + bài lưu sẵn trong repo
const { renderList, readArchiveIndex } = require('./_lib/blog');
const store = require('./_lib/store');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  const cms = await store.publicBlogs();
  const seen = new Set(cms.map(b => b.slug));
  const all = cms
    .concat(readArchiveIndex().filter(b => !seen.has(b.slug)))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  res.statusCode = 200;
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=86400');
  return res.end(renderList({ data: all, pagination: { current_page: 1, total_pages: 1 } }));
};
