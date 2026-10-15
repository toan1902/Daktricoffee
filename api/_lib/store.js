// Kho dữ liệu riêng của daktri.vn (Vercel Blob, chế độ private).
// Toàn bộ sản phẩm, bài viết, khối nội dung nằm trong một file JSON: cms/db.json
// Ảnh tải lên nằm ở media/... và được phục vụ qua /media/...
// Nếu chưa kết nối Blob store, web vẫn chạy bằng dữ liệu lưu sẵn trong repo (data/).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DB_PATH = 'cms/db.json';

function blobEnabled() {
  return !!(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
}

let blobMod = null;
function blob() {
  if (!blobMod) blobMod = require('@vercel/blob');
  return blobMod;
}

function nowStr() {
  // "YYYY-MM-DD HH:mm:ss" giờ Việt Nam, giống định dạng API cũ
  const d = new Date(Date.now() + 7 * 3600 * 1000);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function seedDb() {
  let products = [];
  try {
    products = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'products.json'), 'utf8'));
  } catch (e) { /* bỏ qua */ }
  const t = nowStr();
  return {
    version: 1,
    seq: { products: products.length, blogs: 0, blog_blocks: 0 },
    products: products.map((p, i) => ({ id: i + 1, slug: '', process_type: '', created_at: t, updated_at: t, ...p })),
    blogs: [],
    blog_blocks: [],
  };
}

// Đưa các bài lưu sẵn (data/blog-archive) vào kho một lần, để admin thấy và sửa được.
// Bài nhập vào có layout 'legacy': trang công khai vẫn hiện giao diện gốc cho tới khi
// bạn sửa nội dung khối trong admin (khi đó chuyển sang layout 'blocks').
function importLegacy(db) {
  if (db.legacy_imported) return db;
  let index = [];
  try {
    index = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'blog-archive', 'index.json'), 'utf8'));
  } catch (e) {
    return db;
  }
  db.blogs = db.blogs || [];
  db.blog_blocks = db.blog_blocks || [];
  db.seq = db.seq || {};
  const sorted = index.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  for (const it of sorted) {
    if (db.blogs.some(b => b.slug === it.slug)) continue;
    let blocks = [];
    try {
      blocks = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'blog-archive', `${it.slug}.blocks.json`), 'utf8'));
    } catch (e) { /* bài không có khối */ }
    const id = (db.seq.blogs = Math.max(db.seq.blogs || 0, ...db.blogs.map(b => b.id || 0)) + 1);
    db.blogs.push({
      id,
      title: it.title,
      slug: it.slug,
      excerpt: it.excerpt || '',
      cover_image: it.image || '',
      author: 'HTX Daktri Khe Sanh',
      status: 'published',
      layout: 'legacy',
      created_at: it.created_at,
      updated_at: it.created_at,
    });
    blocks.forEach((b, i) => {
      const bid = (db.seq.blog_blocks = Math.max(db.seq.blog_blocks || 0, ...db.blog_blocks.map(x => x.id || 0)) + 1);
      db.blog_blocks.push({
        id: bid,
        blog_id: id,
        type: b.type,
        position: i + 1,
        content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content),
        created_at: it.created_at,
        updated_at: it.created_at,
      });
    });
  }
  db.legacy_imported = true;
  return db;
}

async function streamToString(stream) {
  const chunks = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks).toString('utf8');
}

// Đọc DB. fresh=true: luôn đọc bản mới nhất (dùng cho admin & ghi).
// Trả về { db, etag } — db = null nếu chưa kết nối Blob.
async function readDb({ fresh = false } = {}) {
  if (!blobEnabled()) return { db: null, etag: null };
  const res = await blob().get(DB_PATH, { access: 'private', useCache: !fresh });
  if (!res || res.statusCode !== 200 || !res.stream) return { db: importLegacy(seedDb()), etag: null, seeded: true };
  const db = importLegacy(JSON.parse(await streamToString(res.stream)));
  return { db, etag: res.blob && res.blob.etag };
}

async function saveDb(db) {
  const body = JSON.stringify(db);
  // Ghi đè bản chính (một người quản trị nên không cần khoá ETag — khoá ETag gây lỗi "Precondition failed")
  await blob().put(DB_PATH, body, {
    access: 'private',
    contentType: 'application/json; charset=utf-8',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
  // Bản sao lưu theo ngày (giờ VN) — lỡ sửa nhầm vẫn khôi phục được
  const day = nowStr().slice(0, 10);
  try {
    await blob().put(`cms/backup/db-${day}.json`, body, {
      access: 'private',
      contentType: 'application/json; charset=utf-8',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
    });
  } catch (e) {
    console.error('backup error', e && e.message);
  }
}

// Sửa DB: đọc bản mới nhất -> sửa -> ghi
async function mutateDb(fn) {
  const { db } = await readDb({ fresh: true });
  if (!db) throw new Error('Chưa kết nối kho dữ liệu (Vercel Blob).');
  const result = await fn(db);
  await saveDb(db);
  return result;
}

async function putMedia(pathname, buffer, contentType) {
  return blob().put(pathname, buffer, {
    access: 'private',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: false,
    cacheControlMaxAge: 31536000,
  });
}

async function getMedia(pathname) {
  return blob().get(pathname, { access: 'private' });
}

// ---------- Truy vấn cho trang công khai ----------
async function publicProducts() {
  try {
    const { db } = await readDb();
    if (db && Array.isArray(db.products)) return db.products;
  } catch (e) {
    console.error('store products error', e && e.message);
  }
  return null; // để nơi gọi dùng data/products.json
}

function blocksOf(db, blogId) {
  return (db.blog_blocks || [])
    .filter(b => Number(b.blog_id) === Number(blogId))
    .sort((a, b) => (a.position || 0) - (b.position || 0));
}

// Trả về null nếu chưa có kho (nơi gọi dùng bản lưu sẵn), ngược lại là danh sách bài đã xuất bản
async function publicBlogs() {
  try {
    const { db } = await readDb();
    if (db) return (db.blogs || []).filter(b => b.status !== 'draft');
  } catch (e) {
    console.error('store blogs error', e && e.message);
  }
  return null;
}

// Trả về: undefined = chưa có kho (dùng bản lưu sẵn); null = kho không có/ẩn bài này; object = bài
async function publicBlogBySlug(slug) {
  try {
    const { db } = await readDb();
    if (!db) return undefined;
    const b = (db.blogs || []).find(x => x.slug === slug && x.status !== 'draft');
    if (!b) return null;
    return { ...b, blocks: blocksOf(db, b.id) };
  } catch (e) {
    console.error('store blog error', e && e.message);
    return undefined;
  }
}

// ---------- Đăng nhập admin ----------
// Tài khoản lấy từ biến môi trường ADMIN_USERNAME / ADMIN_PASSWORD trên Vercel.
function authConfigured() {
  return !!(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD);
}

function hmac(data) {
  const key = 'daktri-admin:' + (process.env.ADMIN_PASSWORD || '') + ':' + (process.env.ADMIN_USERNAME || '');
  return crypto.createHmac('sha256', key).update(data).digest('base64url');
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function checkLogin(username, password) {
  if (!authConfigured()) return false;
  return safeEqual(username, process.env.ADMIN_USERNAME) && safeEqual(password, process.env.ADMIN_PASSWORD);
}

function issueToken(username, days = 7) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + days * 864e5 })).toString('base64url');
  return payload + '.' + hmac(payload);
}

function verifyToken(token) {
  if (!authConfigured() || !token) return null;
  const [payload, sig] = String(token).split('.');
  if (!payload || !sig || !safeEqual(sig, hmac(payload))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch (e) {
    return null;
  }
}

// ---------- Đơn hàng: mỗi đơn là một file riêng orders/<thời gian>-<mã>.json ----------
async function putJson(pathname, obj, { overwrite = false } = {}) {
  return blob().put(pathname, JSON.stringify(obj), {
    access: 'private',
    contentType: 'application/json; charset=utf-8',
    addRandomSuffix: false,
    allowOverwrite: overwrite,
    cacheControlMaxAge: 60,
  });
}

async function getJson(pathname, { fresh = true } = {}) {
  const res = await blob().get(pathname, { access: 'private', useCache: !fresh });
  if (!res || res.statusCode !== 200 || !res.stream) return null;
  return JSON.parse(await streamToString(res.stream));
}

async function listOrders(limit = 200) {
  const out = [];
  let cursor;
  do {
    const r = await blob().list({ prefix: 'orders/', limit: 1000, cursor });
    out.push(...r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor && out.length < 5000);
  out.sort((a, b) => String(b.pathname).localeCompare(String(a.pathname)));
  const picked = out.slice(0, limit);
  const rows = await Promise.all(picked.map(async b => {
    try {
      const o = await getJson(b.pathname);
      return o ? { ...o, id: b.pathname } : null;
    } catch (e) {
      return null;
    }
  }));
  return { rows: rows.filter(Boolean), total: out.length };
}

async function deleteBlob(pathname) {
  return blob().del(pathname);
}

module.exports = {
  putJson,
  getJson,
  listOrders,
  deleteBlob,
  DB_PATH,
  blobEnabled,
  nowStr,
  readDb,
  mutateDb,
  putMedia,
  getMedia,
  blocksOf,
  publicProducts,
  publicBlogs,
  publicBlogBySlug,
  authConfigured,
  checkLogin,
  issueToken,
  verifyToken,
};
