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
  if (!res || res.statusCode !== 200 || !res.stream) return { db: seedDb(), etag: null, seeded: true };
  const db = JSON.parse(await streamToString(res.stream));
  return { db, etag: res.blob && res.blob.etag };
}

async function saveDb(db, etag) {
  const opts = {
    access: 'private',
    contentType: 'application/json; charset=utf-8',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  };
  if (etag) opts.ifMatch = etag;
  return blob().put(DB_PATH, JSON.stringify(db), opts);
}

// Sửa DB an toàn: đọc mới nhất -> sửa -> ghi có kiểm tra ETag (thử lại nếu bị ghi đè đồng thời)
async function mutateDb(fn) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { db, etag } = await readDb({ fresh: true });
    if (!db) throw new Error('Chưa kết nối kho dữ liệu (Vercel Blob).');
    const result = await fn(db);
    try {
      await saveDb(db, etag);
      return result;
    } catch (e) {
      if (e && /precondition/i.test(e.name + e.message) && attempt < 2) continue;
      throw e;
    }
  }
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

async function publicBlogs() {
  try {
    const { db } = await readDb();
    if (db) return (db.blogs || []).filter(b => b.status !== 'draft');
  } catch (e) {
    console.error('store blogs error', e && e.message);
  }
  return [];
}

async function publicBlogBySlug(slug) {
  try {
    const { db } = await readDb();
    if (!db) return null;
    const b = (db.blogs || []).find(x => x.slug === slug && x.status !== 'draft');
    if (!b) return null;
    return { ...b, blocks: blocksOf(db, b.id) };
  } catch (e) {
    console.error('store blog error', e && e.message);
    return null;
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

module.exports = {
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
