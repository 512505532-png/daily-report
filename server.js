const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  html: 'text/html;charset=utf-8',
  json: 'application/json;charset=utf-8',
  css: 'text/css',
  js: 'text/javascript',
  svg: 'image/svg+xml',
  png: 'image/png',
  ico: 'image/x-icon'
};

const PORT = 8765;
const ROOT = __dirname;

http.createServer((req, res) => {
  let url = req.url.split('?')[0];
  if (url === '/') url = '/index.html';
  const fp = path.join(ROOT, decodeURIComponent(url));

  fs.readFile(fp, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found: ' + url);
      return;
    }
    const ext = path.extname(fp).slice(1);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log('Server running at http://localhost:' + PORT);
});
