// /blog/:slug — bài viết render sẵn từ kho dữ liệu riêng của daktri.vn
const { renderPost, renderPostFallback, renderArchivedPost } = require('../_lib/blog');
const store = require('../_lib/store');

module.exports = async (req, res) => {
  const slug = String((req.query && req.query.slug) || '').replace(/\.html?$/, '');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!slug || !/^[a-z0-9-]+$/i.test(slug)) {
    res.statusCode = 404;
    return res.end(renderPostFallback(slug, { notFound: true }));
  }

  // 1) Bài trong kho daktri.vn
  const post = await store.publicBlogBySlug(slug);
  if (post && post.layout === 'legacy') {
    const archived = renderArchivedPost(slug, post);
    if (archived) {
      res.statusCode = 200;
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=86400');
      return res.end(archived);
    }
  }
  if (post && post.title) {
    try {
      const html = renderPost(post);
      res.statusCode = 200;
      res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=86400');
      return res.end(html);
    } catch (err) {
      console.error('render post error', slug, err && err.message);
    }
  }

  // 2) Chưa có kho (post === undefined): dùng bài lưu sẵn trong repo
  const archived = post === undefined ? renderArchivedPost(slug) : null;
  if (archived) {
    res.statusCode = 200;
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return res.end(archived);
  }

  res.statusCode = 404;
  res.setHeader('Cache-Control', 'public, s-maxage=60');
  return res.end(renderPostFallback(slug, { notFound: true }));
};
