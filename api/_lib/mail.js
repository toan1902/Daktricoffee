// Gửi email báo đơn hàng mới qua Gmail (SMTP + Mật khẩu ứng dụng).
// Biến môi trường trên Vercel:
//   MAIL_USER          = địa chỉ Gmail dùng để gửi (vd htxdaktri@gmail.com)
//   MAIL_APP_PASSWORD  = Mật khẩu ứng dụng 16 ký tự của Gmail đó
//   MAIL_TO            = (tuỳ chọn) nơi nhận, nhiều địa chỉ cách nhau dấu phẩy; mặc định = MAIL_USER
// Chưa cấu hình thì bỏ qua, đơn hàng vẫn lưu bình thường.

function mailEnabled() {
  return !!(process.env.MAIL_USER && process.env.MAIL_APP_PASSWORD);
}

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = n => Number(n || 0).toLocaleString('vi-VN') + 'đ';

function orderEmail(o) {
  const rows = (o.items || []).map(i =>
    `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(i.name)}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${i.qty}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${i.price ? money(i.price * i.qty) : '—'}</td></tr>`).join('');
  const zalo = String(o.phone || '').replace(/^\+?84/, '0');
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#2c2418">
  <h2 style="color:#2e6b3f;margin:0 0 4px">Đơn hàng mới ${esc(o.code)}</h2>
  <p style="color:#8a7960;margin:0 0 16px">${esc(o.created_at)} · từ daktri.vn</p>
  <p style="margin:0 0 4px"><b>${esc(o.name)}</b></p>
  <p style="margin:0 0 4px">📞 <a href="tel:${esc(o.phone)}">${esc(o.phone)}</a> · <a href="https://zalo.me/${esc(zalo)}">Nhắn Zalo</a></p>
  ${o.address ? `<p style="margin:0 0 4px">📍 ${esc(o.address)}</p>` : ''}
  ${o.note ? `<p style="margin:8px 0;background:#faf6ee;padding:8px 10px;border-radius:6px">💬 ${esc(o.note)}</p>` : ''}
  <table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:14px">
    <tr style="background:#faf6ee"><th style="padding:6px 8px;text-align:left">Sản phẩm</th><th style="padding:6px 8px">SL</th><th style="padding:6px 8px;text-align:right">Thành tiền</th></tr>
    ${rows}
    <tr><td colspan="2" style="padding:8px;text-align:right"><b>Tạm tính</b></td><td style="padding:8px;text-align:right"><b>${money(o.total)}</b></td></tr>
  </table>
  <p><a href="https://daktri.vn/admin" style="display:inline-block;background:#2e6b3f;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Mở trang quản trị</a></p>
</div>`;
  const text = [
    `Đơn hàng mới ${o.code} — ${o.created_at}`,
    `Khách: ${o.name} — ${o.phone}`,
    o.address ? `Địa chỉ: ${o.address}` : '',
    o.note ? `Ghi chú: ${o.note}` : '',
    '',
    ...(o.items || []).map(i => `- ${i.name} x ${i.qty}${i.price ? ' = ' + money(i.price * i.qty) : ''}`),
    `Tạm tính: ${money(o.total)}`,
    '',
    'Quản trị: https://daktri.vn/admin',
  ].filter(l => l !== null).join('\n');
  return { html, text };
}

async function sendOrderEmail(order) {
  if (!mailEnabled()) return { skipped: true };
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.MAIL_USER, pass: String(process.env.MAIL_APP_PASSWORD).replace(/\s+/g, '') },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
  const { html, text } = orderEmail(order);
  const total = order.total ? ' — ' + money(order.total) : '';
  return transporter.sendMail({
    from: `"Đơn hàng daktri.vn" <${process.env.MAIL_USER}>`,
    to: process.env.MAIL_TO || process.env.MAIL_USER,
    subject: `🛒 Đơn mới ${order.code}: ${order.name} (${order.phone})${total}`,
    text,
    html,
  });
}

module.exports = { mailEnabled, sendOrderEmail, orderEmail };
