// API quản trị nội dung của daktri.vn — thay cho libericakhesanh.net/api/index.php
// Giữ nguyên cách gọi cũ: /api/cms?table=products|blogs|blog_blocks&action=list|detail|create|update|delete
// và /api/cms?action=upload&type=products|blogs (POST, field "image")
import store from './_lib/store.js';

const TABLES = {
  products: ['name', 'slug', 'description', 'price', 'weight', 'image_url', 'category', 'process_type', 'tags'],
  blogs: ['title', 'slug', 'excerpt', 'cover_image', 'author', 'status'],
  blog_blocks: ['blog_id', 'type', 'position', 'content'],
  // Lô hàng để truy xuất nguồn gốc (trang /truy-xuat, mã QR trên bao bì)
  lots: ['code', 'product_name', 'origin', 'farmer', 'harvest_date', 'process', 'drying', 'roast_date', 'roaster', 'roast_profile', 'lab_result', 'lab_url', 'note', 'status'],
};
const ORDER_STATUS = new Set(['new', 'confirmed', 'shipping', 'done', 'cancelled']);
const NUMERIC = new Set(['price', 'weight', 'blog_id', 'position']);
const BLOCK_TYPES = new Set(['heading', 'text', 'list', 'image', 'pullquote']);
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

function json(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders },
  });
}
const fail = (status, msg) => json(status, { status: 'error', msg, message: msg });

function authed(request) {
  const h = request.headers.get('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  return store.verifyToken(token);
}

function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}

function paginate(items, url) {
  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit')) || 12));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.min(totalPages, Math.max(1, Number(url.searchParams.get('page')) || 1));
  const data = items.slice((page - 1) * limit, page * limit);
  return {
    status: 'success',
    data,
    total,
    total_pages: totalPages,
    page,
    limit,
    pagination: { current_page: page, total_pages: totalPages, total, limit },
  };
}

const byNewest = (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')) || (b.id || 0) - (a.id || 0);

export async function GET(request) {
  const url = new URL(request.url);
  const table = url.searchParams.get('table');
  const action = url.searchParams.get('action') || 'list';
  const isAdmin = !!authed(request);

  if (table === 'orders') {
    if (!isAdmin) return fail(401, 'Cần đăng nhập để xem đơn hàng.');
    if (!store.blobEnabled()) return fail(503, 'Chưa kết nối kho dữ liệu daktri.vn (Vercel Blob).');
    const { rows } = await store.listOrders(300);
    let items = rows;
    const st = url.searchParams.get('status');
    if (st) items = items.filter(o => o.status === st);
    const q = (url.searchParams.get('search') || '').trim().toLowerCase();
    if (q) items = items.filter(o => `${o.name} ${o.phone} ${o.code}`.toLowerCase().includes(q));
    return json(200, paginate(items, url));
  }
  if (!TABLES[table]) return fail(400, 'Bảng dữ liệu không hợp lệ.');
  if (!store.blobEnabled()) return fail(503, 'Chưa kết nối kho dữ liệu daktri.vn (Vercel Blob).');

  const { db } = await store.readDb({ fresh: isAdmin });

  if (table === 'lots') {
    let items = (db.lots || []).slice().sort(byNewest);
    if (!isAdmin) items = items.filter(l => l.status !== 'draft');
    const q = (url.searchParams.get('search') || '').trim().toLowerCase();
    if (q) items = items.filter(l => `${l.code} ${l.product_name} ${l.origin} ${l.farmer}`.toLowerCase().includes(q));
    if (action === 'detail') {
      const code = (url.searchParams.get('code') || '').toUpperCase();
      const l = items.find(x => String(x.code).toUpperCase() === code);
      return l ? json(200, { status: 'success', data: l }) : fail(404, 'Không tìm thấy lô hàng.');
    }
    return json(200, paginate(items, url));
  }
  const search = (url.searchParams.get('search') || '').trim().toLowerCase();

  if (table === 'products') {
    let items = (db.products || []).slice().sort(byNewest);
    if (search) items = items.filter(p => `${p.name} ${p.description} ${p.tags}`.toLowerCase().includes(search));
    if (action === 'detail') {
      const id = url.searchParams.get('id');
      const slug = url.searchParams.get('slug');
      const p = items.find(x => (id && String(x.id) === id) || (slug && x.slug === slug));
      return p ? json(200, { status: 'success', data: p }) : fail(404, 'Không tìm thấy sản phẩm.');
    }
    return json(200, paginate(items, url), isAdmin ? {} : { 'Cache-Control': 'public, s-maxage=60' });
  }

  if (table === 'blogs') {
    let items = (db.blogs || []).slice().sort(byNewest);
    if (!isAdmin) items = items.filter(b => b.status !== 'draft');
    if (search) items = items.filter(b => `${b.title} ${b.excerpt}`.toLowerCase().includes(search));
    if (action === 'detail') {
      const id = url.searchParams.get('id');
      const slug = url.searchParams.get('slug');
      const b = items.find(x => (id && String(x.id) === id) || (slug && x.slug === slug));
      return b ? json(200, { status: 'success', data: { ...b, blocks: store.blocksOf(db, b.id) } }) : fail(404, 'Không tìm thấy bài viết.');
    }
    return json(200, paginate(items, url), isAdmin ? {} : { 'Cache-Control': 'public, s-maxage=60' });
  }

  // blog_blocks
  const blogId = Number(url.searchParams.get('blog_id'));
  const blog = (db.blogs || []).find(b => b.id === blogId);
  if (!blog || (!isAdmin && blog.status === 'draft')) return json(200, { status: 'success', data: [] });
  return json(200, { status: 'success', data: store.blocksOf(db, blogId) });
}

async function handleUpload(request, url) {
  const form = await request.formData();
  const file = form.get('image');
  if (!file || typeof file === 'string') return fail(400, 'Không có file ảnh.');
  const ext = IMAGE_TYPES[file.type];
  if (!ext) return fail(400, 'Chỉ nhận ảnh JPG, PNG, WebP, GIF, AVIF.');
  if (file.size > 4 * 1024 * 1024) return fail(413, 'Ảnh quá lớn (tối đa 4 MB). Hãy giảm kích thước ảnh rồi tải lại.');
  const type = url.searchParams.get('type') === 'products' ? 'products' : 'blogs';
  const base = slugify(String(file.name || 'anh').replace(/\.[a-z0-9]+$/i, '')) || 'anh';
  const pathname = `media/${type}/${Date.now()}-${base}.${ext}`;
  await store.putMedia(pathname, Buffer.from(await file.arrayBuffer()), file.type);
  return json(200, { status: 'success', url: '/' + pathname });
}

function pick(table, form) {
  const out = {};
  for (const f of TABLES[table]) {
    if (!form.has(f)) continue;
    let v = form.get(f);
    v = typeof v === 'string' ? v : '';
    out[f] = NUMERIC.has(f) ? (v === '' ? 0 : Number(v)) : v;
  }
  return out;
}

export async function POST(request) {
  const url = new URL(request.url);
  const table = url.searchParams.get('table');
  const action = url.searchParams.get('action');

  if (!authed(request)) return fail(401, 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  if (!store.blobEnabled()) return fail(503, 'Chưa kết nối kho dữ liệu daktri.vn (Vercel Blob).');

  try {
    if (action === 'upload') return await handleUpload(request, url);

    if (table === 'orders') {
      const form = await request.formData();
      const id = String(form.get('id') || '');
      if (!/^orders\/[\w.-]+\.json$/.test(id)) return fail(400, 'Mã đơn không hợp lệ.');
      if (action === 'delete') {
        await store.deleteBlob(id);
        return json(200, { status: 'success', msg: 'Đã xoá đơn', id });
      }
      if (action === 'update') {
        const order = await store.getJson(id);
        if (!order) return fail(404, 'Không tìm thấy đơn.');
        const status = String(form.get('status') || order.status);
        if (!ORDER_STATUS.has(status)) return fail(400, 'Trạng thái không hợp lệ.');
        order.status = status;
        if (form.has('admin_note')) order.admin_note = String(form.get('admin_note') || '').slice(0, 1000);
        order.updated_at = store.nowStr();
        await store.putJson(id, order, { overwrite: true });
        return json(200, { status: 'success', msg: 'Đã cập nhật đơn', id, data: { ...order, id } });
      }
      return fail(400, 'Thao tác không hợp lệ.');
    }

    if (!TABLES[table]) return fail(400, 'Bảng dữ liệu không hợp lệ.');

    const form = await request.formData();
    const id = Number(form.get('id'));
    const fields = pick(table, form);

    const result = await store.mutateDb(db => {
      db[table] = db[table] || [];
      db.seq = db.seq || {};
      const list = db[table];
      const t = store.nowStr();

      if (table === 'products' && 'name' in fields && !String(fields.name).trim()) throw new Error('Tên sản phẩm không được để trống.');
      if (table === 'blogs') {
        if ('title' in fields && !String(fields.title).trim()) throw new Error('Tiêu đề không được để trống.');
        if ('slug' in fields) fields.slug = slugify(fields.slug || fields.title);
        if ('status' in fields) fields.status = fields.status === 'published' ? 'published' : 'draft';
      }
      if (table === 'products' && 'slug' in fields) fields.slug = slugify(fields.slug || fields.name);
      if (table === 'lots') {
        if ('code' in fields) fields.code = String(fields.code || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);
        if (action === 'create' && !fields.code) throw new Error('Mã lô không được để trống (ví dụ: LIB-2526-01).');
        if (fields.code && list.some(l => l.code === fields.code && l.id !== id)) throw new Error('Mã lô đã tồn tại.');
        if ('status' in fields) fields.status = fields.status === 'draft' ? 'draft' : 'published';
      }
      if (table === 'blog_blocks' && 'type' in fields && !BLOCK_TYPES.has(fields.type)) throw new Error('Loại khối không hợp lệ.');

      // sửa khối của bài cũ -> trang công khai chuyển sang hiển thị theo khối
      if (table === 'blog_blocks') {
        const target = action === 'create' ? fields.blog_id : (list.find(x => x.id === id) || {}).blog_id;
        const blog = (db.blogs || []).find(b => b.id === target);
        if (blog && blog.layout === 'legacy') blog.layout = 'blocks';
      }

      if (action === 'create') {
        if (table === 'blogs') {
          if (!fields.slug) fields.slug = slugify(fields.title);
          if (list.some(b => b.slug === fields.slug)) throw new Error('Đường dẫn (slug) đã tồn tại, hãy đổi slug khác.');
        }
        if (table === 'blog_blocks' && !db.blogs.some(b => b.id === fields.blog_id)) throw new Error('Không tìm thấy bài viết của khối này.');
        const newId = (db.seq[table] = Math.max(db.seq[table] || 0, ...list.map(x => x.id || 0)) + 1);
        const row = { id: newId, ...fields, created_at: t, updated_at: t };
        list.push(row);
        return { status: 'success', msg: 'Đã tạo', id: newId, data: row };
      }

      const idx = list.findIndex(x => x.id === id);
      if (idx < 0) throw new Error('Không tìm thấy bản ghi cần sửa.');

      if (action === 'update') {
        if (table === 'blogs' && fields.slug && list.some(b => b.slug === fields.slug && b.id !== id)) {
          throw new Error('Đường dẫn (slug) đã tồn tại, hãy đổi slug khác.');
        }
        list[idx] = { ...list[idx], ...fields, id, updated_at: t };
        return { status: 'success', msg: 'Đã cập nhật', id, data: list[idx] };
      }
      if (action === 'delete') {
        list.splice(idx, 1);
        if (table === 'blogs') db.blog_blocks = (db.blog_blocks || []).filter(b => b.blog_id !== id);
        return { status: 'success', msg: 'Đã xoá', id };
      }
      throw new Error('Thao tác không hợp lệ.');
    });
    return json(200, result);
  } catch (err) {
    console.error('cms error', table, action, err && err.message);
    return fail(400, (err && err.message) || 'Có lỗi khi lưu dữ liệu.');
  }
}
