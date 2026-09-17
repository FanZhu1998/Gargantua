import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const rendererRoot = path.resolve(fileURLToPath(new URL('../dist/renderer/', import.meta.url)));
const libraryRoot = path.resolve(fileURLToPath(new URL('../dist/library/', import.meta.url)));
const types = new Map([['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.css', 'text/css; charset=utf-8']]);

export async function startServer({ port = Number(process.env.PORT || 4173) } = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
  const server = createServer(async (request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, { Allow: 'GET, HEAD' }).end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400).end('Bad request'); return; }
    if (pathname === '/') pathname = '/index.html';
    const libraryRequest = pathname.startsWith('/library/');
    const root = libraryRequest ? libraryRoot : rendererRoot;
    const relativePath = libraryRequest ? pathname.slice('/library'.length) : pathname;
    const candidate = path.resolve(root, `.${relativePath}`);
    const type = types.get(path.extname(candidate));
    if (!candidate.startsWith(root + path.sep) || !type) { response.writeHead(404).end('Not found'); return; }
    try {
      const body = await readFile(candidate);
      response.writeHead(200, { 'Content-Type': type, 'Content-Length': body.byteLength, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      response.end(request.method === 'HEAD' ? undefined : body);
    } catch { response.writeHead(404).end('Not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  console.log(`Gargantua preview: http://127.0.0.1:${server.address().port}`);
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer().catch(error => { console.error(error.message); process.exitCode = 1; });
}
