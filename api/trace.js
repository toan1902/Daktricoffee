// Trang truy xuất nguồn gốc: /truy-xuat, /truy-xuat/<MÃ-LÔ>, /qr/liberica (mã QR trên bao bì)
// Dữ liệu lô hàng nhập trong admin (mục "Lô hàng"). Khung trang dùng lại phần đầu/cuối của about.html.
const fs = require('fs');
const path = require('path');
const store = require('./_lib/store');

let shell = null;
function readShell() {
  if (!shell) {
    const html = fs.readFileSync(path.join(process.cwd(), 'about.html'), 'utf8');
    const a = html.indexOf('<main class="about-main">');
    const b = html.indexOf('</main>', a) + '</main>'.length;
    shell = { head: html.slice(0, a), foot: html.slice(b) };
  }
  return shell;
}

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fmt(d) {
  if (!d) return '';
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
}

function lotCard(l, highlight) {
  const rows = [
    ['Sản phẩm', l.product_name],
    ['Vườn / vùng trồng', l.origin],
    ['Hộ trồng', l.farmer],
    ['Ngày thu hái', fmt(l.harvest_date)],
    ['Phương pháp sơ chế', l.process],
    ['Phơi / sấy', l.drying],
    ['Ngày rang', fmt(l.roast_date)],
    ['Nơi rang', l.roaster],
    ['Hồ sơ rang', l.roast_profile],
    ['Kiểm nghiệm', l.lab_result],
  ].filter(r => r[1]);
  return `
    <article class="tx-lot${highlight ? ' tx-lot--hl' : ''}" id="lo-${esc(l.code)}">
      <header><span class="tx-code">${esc(l.code)}</span>${highlight ? '<span class="tx-badge">Lô của gói bạn đang cầm</span>' : ''}</header>
      <table>${rows.map(r => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join('')}</table>
      ${l.lab_url ? `<p class="tx-link"><a href="${esc(l.lab_url)}" target="_blank" rel="noopener">Xem phiếu kiểm nghiệm →</a></p>` : ''}
      ${l.note ? `<p class="tx-note">${esc(l.note)}</p>` : ''}
    </article>`;
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const code = String(q.code || q.lo || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 40);

  let lots = [];
  try {
    const { db } = await store.readDb();
    if (db) lots = (db.lots || []).filter(l => l.status !== 'draft')
      .sort((a, b) => String(b.roast_date || b.created_at || '').localeCompare(String(a.roast_date || a.created_at || '')));
  } catch (e) {
    console.error('trace read error', e && e.message);
  }
  const found = code ? lots.find(l => String(l.code).toUpperCase() === code) : null;
  const others = lots.filter(l => l !== found);

  const title = found ? `Truy xuất lô ${found.code} | Daktri Khe Sanh` : 'Truy xuất nguồn gốc | Daktri Khe Sanh';
  let { head, foot } = readShell();
  head = head
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/<meta name="description"\s+content="[^"]*"\s*\/?>/, '<meta name="description" content="Truy xuất nguồn gốc cà phê Liberica Khe Sanh của HTX Daktri: vườn trồng, ngày hái, sơ chế, ngày rang, kiểm nghiệm." />')
    .replace(/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="https://daktri.vn/truy-xuat${found ? '/' + esc(found.code) : ''}" />`)
    .replace(/https:\/\/daktri\.vn\/about"/g, `https://daktri.vn/truy-xuat"`)
    .replace('</head>', `<style>
  .tx-main{max-width:820px;margin:0 auto;padding:7.5rem 16px 4rem}
  .tx-eyebrow{font-family:'JetBrains Mono',monospace;font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:#2e6b3f;margin:0 0 .6rem}
  .tx-title{font-family:'Fraunces',Georgia,serif;font-size:clamp(2rem,5vw,3rem);line-height:1.1;margin:0 0 .8rem;color:#1a2e1e}
  .tx-lead{color:#555;line-height:1.75;margin:0 0 1.5rem}
  .tx-search{display:flex;gap:8px;margin:0 0 2rem;flex-wrap:wrap}
  .tx-search input{flex:1;min-width:200px;padding:12px 14px;border:1px solid #d9d2c3;border-radius:10px;font-size:1rem;text-transform:uppercase}
  .tx-search button{padding:12px 20px;border:0;border-radius:10px;background:#2e6b3f;color:#fff;font-weight:600;cursor:pointer}
  .tx-lot{background:#fff;border:1px solid #e6e0d4;border-radius:14px;padding:16px 18px;margin:0 0 14px}
  .tx-lot--hl{border:2px solid #c9a84c;box-shadow:0 8px 28px rgba(201,168,76,.18)}
  .tx-lot header{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
  .tx-code{font-family:'JetBrains Mono',monospace;font-weight:600;color:#1a2e1e;background:#faf7f0;border:1px solid #e6e0d4;padding:3px 10px;border-radius:8px}
  .tx-badge{font-size:.78rem;background:#c9a84c;color:#1a2e1e;padding:3px 10px;border-radius:999px;font-weight:600}
  .tx-lot table{width:100%;border-collapse:collapse;font-size:.95rem}
  .tx-lot th,.tx-lot td{text-align:left;padding:7px 4px;border-bottom:1px solid #f0ebe0;vertical-align:top}
  .tx-lot th{width:42%;color:#777;font-weight:500}
  .tx-link a{color:#2e6b3f;font-weight:600}
  .tx-note{color:#666;font-size:.9rem;margin:.6rem 0 0}
  .tx-h2{font-family:'Fraunces',Georgia,serif;font-size:1.4rem;margin:2.2rem 0 .8rem;color:#1a2e1e}
  .tx-empty{background:#fff;border:1px dashed #d9d2c3;border-radius:14px;padding:18px;color:#666;line-height:1.7}
  .tx-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
  .tx-facts div{background:#fff;border:1px solid #e6e0d4;border-radius:12px;padding:12px 14px}
  .tx-facts span{display:block;font-size:.78rem;color:#777}.tx-facts strong{font-size:1.05rem;color:#1a2e1e}
  .tx-alert{background:#fff7e6;border:1px solid #f2d39b;border-radius:12px;padding:12px 14px;margin:0 0 1.2rem;color:#7a5a12}
</style>
</head>`);

  const body = `
  <main class="tx-main">
    <p class="tx-eyebrow">Truy xuất nguồn gốc · HTX Daktri Khe Sanh</p>
    <h1 class="tx-title">Gói cà phê này đến từ đâu?</h1>
    <p class="tx-lead">Mỗi lô cà phê của HTX được ghi lại từ vườn trồng, ngày hái, cách sơ chế đến ngày rang và kết quả kiểm nghiệm. Nhập <strong>mã lô</strong> in trên bao bì để xem chi tiết.</p>
    <form class="tx-search" action="/truy-xuat" method="get">
      <input name="lo" placeholder="Mã lô, ví dụ LIB-2526-01" value="${esc(code)}" aria-label="Mã lô">
      <button type="submit">Tra cứu</button>
    </form>
    ${code && !found ? `<p class="tx-alert">Chưa tìm thấy lô <strong>${esc(code)}</strong>. Vui lòng kiểm tra lại mã trên bao bì, hoặc gọi <a href="tel:0941336669">0941 336 669</a> để HTX hỗ trợ.</p>` : ''}
    ${found ? lotCard(found, true) : ''}
    <h2 class="tx-h2">${found ? 'Các lô khác' : 'Các lô đã công bố'}</h2>
    ${others.length ? others.map(l => lotCard(l, false)).join('') : `<div class="tx-empty">HTX đang cập nhật thông tin các lô của vụ mới. Nếu bạn cần thông tin về gói cà phê đang dùng, hãy nhắn Zalo <a href="https://zalo.me/0941336669">0941 336 669</a> kèm ảnh bao bì.</div>`}
    <h2 class="tx-h2">Vùng nguyên liệu</h2>
    <div class="tx-facts">
      <div><span>Địa điểm</span><strong>Tân Lập, Hướng Hoá, Quảng Trị</strong></div>
      <div><span>Cao độ</span><strong>600–800 m</strong></div>
      <div><span>Loại đất</span><strong>Bazan đỏ</strong></div>
      <div><span>Mùa thu hoạch</span><strong>Tháng 3 – Tháng 4</strong></div>
    </div>
    <p class="tx-lead" style="margin-top:1.2rem">Xem thêm <a href="/about">câu chuyện HTX</a> và <a href="/thu-vien">ảnh thực địa vườn Liberica</a>.</p>
  </main>`;

  res.statusCode = code && !found ? 404 : 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=86400');
  res.end(head + body + foot);
};
