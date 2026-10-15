// Nhận đơn đặt hàng từ form trên daktri.vn — mỗi đơn lưu thành một file riêng trong kho
import crypto from 'node:crypto';
import store from './_lib/store.js';

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

const clean = (v, n) => String(v || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);

export async function POST(request) {
  if (!store.blobEnabled()) return json(503, { status: 'error', msg: 'Hệ thống đặt hàng tạm thời gián đoạn. Vui lòng gọi 0941 336 669.' });

  let body = {};
  try {
    const ct = request.headers.get('content-type') || '';
    body = ct.includes('application/json') ? await request.json() : Object.fromEntries(await request.formData());
  } catch (e) {
    return json(400, { status: 'error', msg: 'Dữ liệu không hợp lệ.' });
  }

  // bẫy bot: ô ẩn "website" phải để trống
  if (body.website) return json(200, { status: 'success', code: 'DK' });

  const name = clean(body.name, 80);
  const phone = clean(body.phone, 20).replace(/[^\d+]/g, '');
  const address = clean(body.address, 300);
  const note = clean(body.note, 800);
  if (name.length < 2) return json(400, { status: 'error', msg: 'Vui lòng nhập họ tên.' });
  if (!/^(\+?84|0)\d{8,10}$/.test(phone)) return json(400, { status: 'error', msg: 'Số điện thoại chưa đúng.' });

  let items = [];
  try {
    items = (Array.isArray(body.items) ? body.items : JSON.parse(body.items || '[]'))
      .map(i => ({ name: clean(i.name, 120), qty: Math.max(1, Math.min(999, parseInt(i.qty, 10) || 1)), price: Math.max(0, Number(i.price) || 0) }))
      .filter(i => i.name)
      .slice(0, 20);
  } catch (e) {
    items = [];
  }
  if (!items.length) return json(400, { status: 'error', msg: 'Vui lòng chọn ít nhất một sản phẩm.' });

  // Giá lấy lại từ kho sản phẩm (không tin giá gửi lên từ trình duyệt)
  try {
    const products = (await store.publicProducts()) || [];
    items = items.map(i => {
      const p = products.find(x => x.name === i.name);
      return { ...i, price: p ? Number(p.price) || 0 : 0, weight: p ? Number(p.weight) || 0 : 0 };
    });
  } catch (e) { /* bỏ qua, giữ giá 0 */ }

  const t = store.nowStr();
  const code = 'DK' + t.slice(2, 10).replace(/-/g, '') + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
  const order = {
    code,
    name,
    phone,
    address,
    note,
    items,
    total: items.reduce((s, i) => s + i.qty * i.price, 0),
    status: 'new',
    source: clean(body.source, 40) || 'web',
    created_at: t,
    updated_at: t,
  };
  const pathname = `orders/${t.replace(/[-: ]/g, '')}-${code}.json`;
  try {
    await store.putJson(pathname, order);
  } catch (e) {
    console.error('order save error', e && e.message);
    return json(500, { status: 'error', msg: 'Chưa gửi được đơn. Vui lòng gọi 0941 336 669 hoặc nhắn Zalo.' });
  }
  return json(200, { status: 'success', code, total: order.total, msg: 'Đã nhận đơn. HTX sẽ gọi lại xác nhận trong ngày.' });
}
