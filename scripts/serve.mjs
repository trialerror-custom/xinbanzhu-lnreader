import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const port = Number(process.env.PORT || 8080);
const root = path.resolve('dist');
http
  .createServer((request, response) => {
    const pathname = decodeURIComponent(
      new URL(request.url, 'http://localhost').pathname,
    );
    const file = path.resolve(
      root,
      '.' + (pathname === '/' ? '/index.html' : pathname),
    );
    if (!file.startsWith(root + path.sep)) {
      response.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    const types = {
      '.json': 'application/json',
      '.js': 'application/javascript',
      '.png': 'image/png',
      '.html': 'text/html; charset=utf-8',
    };
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(file).pipe(response);
  })
  .listen(port, '0.0.0.0', () =>
    console.log(
      'Serving dist on port ' +
        port +
        '. Phone and PC must be on the same network; manifest must use your PC LAN address.',
    ),
  );
