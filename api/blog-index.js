const { apiGet, renderList, archivedListResult } = require('./_lib/blog');

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    const { ok, json } = await apiGet('table=blogs&action=list&page=1&limit=12');
    if (!ok) throw new Error('api not ok');
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return res.end(renderList(json));
  } catch (err) {
    console.error('blog index ssr error', err && err.message);
    // API lỗi: hiện danh sách bài lưu sẵn trong repo
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=86400');
    return res.end(renderList(archivedListResult()));
  }
};
