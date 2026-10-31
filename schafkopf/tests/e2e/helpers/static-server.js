'use strict';
/*
 * Kleiner Test-Server für den Ordner schafkopf/ – simuliert ein schlechtes Netz:
 * Kartenbilder lassen sich verzögern, dauerhaft ausfallen lassen (404) oder so ausfallen lassen,
 * dass erst ein Wiederholungsversuch (Parameter ?retry=) gelingt (kurzer Netzaussetzer).
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain' };

function startServer(root, options = {}) {
  const cfg = { delayMs: 0, fail: [], failUntilRetry: [], ...options };
  const hits = [];
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(root, url.endsWith('/') ? url + 'index.html' : url);
    hits.push(req.url);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('404'); }
    const send = () => {
      if (cfg.fail.some((f) => url.endsWith(f))) { res.writeHead(404); return res.end('fehlt'); }
      if (cfg.failUntilRetry.some((f) => url.endsWith(f)) && !/[?&]retry=/.test(req.url)) { res.writeHead(503); return res.end('kurz weg'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    };
    if (url.endsWith('.svg') && cfg.delayMs) setTimeout(send, cfg.delayMs); else send();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}/index.html`,
    hits,
    config: cfg,
    close: () => new Promise((r) => server.close(r))
  })));
}

module.exports = { startServer };
