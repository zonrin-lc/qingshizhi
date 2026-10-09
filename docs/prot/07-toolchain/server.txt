/* 极简静态文件服务器：npm run dev -- --port 7100 --host 127.0.0.1
 * v2.0.7 起补 gzip 与分级缓存：脚本/样式/JSON 可压缩（首屏 ~630KB 数据文件压到约 1/5），
 * 资产与字体走长缓存；开发期用 --no-cache 保留「改完刷新即生效」的旧行为。 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  const short = name === 'port' ? '-p' : name === 'host' ? '-h' : null;
  if (short) { const j = process.argv.indexOf(short); if (j >= 0 && process.argv[j + 1]) return process.argv[j + 1]; }
  return def;
}
const port = parseInt(arg('port', process.env.PORT || '7100'), 10);
const host = arg('host', '127.0.0.1');
const root = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' };

/* 可压缩类型：文本类（脚本/样式/HTML/JSON/SVG）。png/jpg/woff2 本身已压缩，再压是浪费 */
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg']);
/* 资产/字体走长缓存：内容文件名不带 hash，故用 mtime 拼 ETag 做协商缓存——
 * 改图/换字体后 ETag 变化，浏览器自动重下；没改就 304 零字节。 */
function cacheControl(file, noCache) {
  if (noCache) return 'no-store';
  const ext = path.extname(file).toLowerCase();
  if (ext === '.html') return 'no-cache';                 // 入口页每次校验
  if (COMPRESSIBLE.has(ext)) return 'no-cache';
  return 'public, max-age=604800';                        // 资产/字体：一周 + ETag 协商
}

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(root, p));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  const noCache = process.argv.indexOf('--no-cache') >= 0;
  fs.stat(file, (errS, st) => {
    if (errS || !st.isFile()) { res.writeHead(404); res.end('not found'); return; }
    const etag = 'W/"' + st.size.toString(16) + '-' + st.mtimeMs.toString(16) + '"';
    if (req.headers['if-none-match'] === etag) {          // 协商缓存命中：零字节
      res.writeHead(304, { 'ETag': etag, 'Cache-Control': cacheControl(file, noCache) });
      res.end(); return;
    }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      const ext = path.extname(file).toLowerCase();
      const headers = {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': cacheControl(file, noCache),
        'ETag': etag
      };
      const accepts = String(req.headers['accept-encoding'] || '');
      const wantGzip = COMPRESSIBLE.has(ext) && /\bgzip\b/.test(accepts);
      if (wantGzip && data.length > 1024) {
        const gz = zlib.gzipSync(data, { level: 6 });
        headers['Content-Encoding'] = 'gzip';
        headers['Vary'] = 'Accept-Encoding';
        headers['Content-Length'] = gz.length;
        res.writeHead(200, headers); res.end(gz);
      } else {
        headers['Content-Length'] = data.length;
        res.writeHead(200, headers); res.end(data);
      }
    });
  });
}).listen(port, host, () => console.log(`青史志原型 dev server → http://${host}:${port}/`));
