const fs = require('fs');
const path = require('path');

const DOMAIN = 'https://daktri.vn';
const API = 'https://libericakhesanh.net/api/index.php?table=blogs&action=list&page=1&limit=1000';

// ❗ Các folder cần bỏ qua
const IGNORE_FOLDERS = ['node_modules', '.git', 'assets'];

// ❗ Các file không muốn index
const IGNORE_FILES = ['admin'];

// 👉 Scan toàn bộ file .html
function scanHTMLFiles(dir, baseUrl = '') {
    let urls = [];

    const files = fs.readdirSync(dir);

    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (IGNORE_FOLDERS.includes(file)) return;

            urls = urls.concat(
                scanHTMLFiles(fullPath, baseUrl + '/' + file)
            );
        } else if (file.endsWith('.html')) {
            if (IGNORE_FILES.some(f => fullPath.includes(f))) return;

            let url = baseUrl + '/' + file;

            // clean URL
            url = url.replace(/index\.html$/, '');
            url = url.replace(/\.html$/, '');

            urls.push(url);
        }
    });

    return urls;
}

async function generateSitemap() {
    try {
        const now = new Date().toISOString();

        // 🔥 1. Scan HTML
        let staticUrls = scanHTMLFiles('./');

        // format XML
        let urls = '';

        staticUrls.forEach(u => {
            const fullUrl = `${DOMAIN}${u === '' ? '/' : u}`;

            urls += `
  <url>
    <loc>${fullUrl}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${u === '' ? '1.0' : '0.6'}</priority>
  </url>`;
        });

        // 🔥 2. Fetch blog API
        const res = await fetch(API);
        const result = await res.json();

        const blogs = result.data || [];

        blogs.forEach(blog => {
            if (!blog.slug) return;

            const lastmod = blog.updated_at || blog.created_at || now;

            urls += `
  <url>
    <loc>${DOMAIN}/blog/${encodeURIComponent(blog.slug)}</loc>
    <lastmod>${new Date(lastmod).toISOString()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
        });

        // 🔥 3. Generate sitemap
        const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

        fs.writeFileSync('./sitemap.xml', sitemap.trim());

        console.log('✅ PRO Sitemap generated!');
        console.log(`📄 Total URLs: ${staticUrls.length + blogs.length}`);
    } catch (err) {
        console.error('❌ Error:', err);
    }
}

generateSitemap();