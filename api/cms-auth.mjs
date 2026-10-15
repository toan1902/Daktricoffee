// Đăng nhập admin daktri.vn — tài khoản đặt trong biến môi trường ADMIN_USERNAME / ADMIN_PASSWORD
import store from './_lib/store.js';

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

// chống dò mật khẩu: chậm lại mỗi lần đăng nhập
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function POST(request) {
  if (!store.authConfigured()) {
    return json(503, { status: 'error', msg: 'Chưa cài tài khoản quản trị (ADMIN_USERNAME / ADMIN_PASSWORD) trên Vercel.' });
  }
  let body = {};
  try { body = await request.json(); } catch (e) { /* bỏ qua */ }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  await sleep(600);
  if (!store.checkLogin(username, password)) {
    return json(401, { status: 'error', msg: 'Sai tên đăng nhập hoặc mật khẩu.' });
  }
  return json(200, {
    status: 'success',
    msg: 'Đăng nhập thành công',
    token: store.issueToken(username),
    admin: { username, full_name: 'Quản trị viên Daktri' },
  });
}
