const { apiGet, renderPost, renderPostFallback } = require('../_lib/blog');

function extractDetail(resp) {
  if (resp && typeof resp === 'object' && resp.data && typeof resp.data === 'object' && !Array.isArray(resp.data)) {
    return resp.data;
  }
  return resp;
}

module.exports = async (req, res) => {
  const slug = String((req.query && req.query.slug) || '').replace(/\.html?$/, '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    res.statusCode = 404;
    return res.end(renderPostFallback(slug, { notFound: true }));
  }

  try {
    const { ok, json } = await apiGet(`table=blogs&action=detail&slug=${encodeURIComponent(slug)}`);
    const data = ok ? extractDetail(json) : null;

    if (!data || typeof data !== 'object' || !data.title) {
      res.statusCode = 404;
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      return res.end(renderPostFallback(slug, { notFound: true }));
    }

    if (!data.slug) data.slug = slug;
    res.statusCode = 200;
    // CDN giữ 5 phút, bài mới sửa trong admin hiện ra sau tối đa ~5 phút
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return res.end(renderPost(data));
  } catch (err) {
    console.error('blog ssr error', slug, err && err.message, err && err.cause && (err.cause.code || err.cause.message));
    // API lỗi tạm thời: trả template để trình duyệt tự tải nội dung, không cache
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'no-store');
    return res.end(renderPostFallback(slug, { notFound: false }));
  }
};
