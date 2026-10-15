// Phục vụ ảnh đã tải lên qua admin: /media/<đường dẫn>  ->  Blob private media/<đường dẫn>
import store from './_lib/store.js';

export async function GET(request) {
  const url = new URL(request.url);
  const p = (url.searchParams.get('p') || '').replace(/^\/+/, '');
  if (!/^[a-z0-9/_.-]+$/i.test(p) || p.includes('..')) return new Response('Not found', { status: 404 });
  if (!store.blobEnabled()) return new Response('Not found', { status: 404 });
  const res = await store.getMedia('media/' + p);
  if (!res || res.statusCode !== 200) return new Response('Not found', { status: 404 });
  return new Response(res.stream, {
    headers: {
      'Content-Type': res.blob.contentType || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
