const { apiGet, readTemplate, renderList } = require('./_lib/blog');

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
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'no-store');
    return res.end(readTemplate('blog-index.html'));
  }
};
