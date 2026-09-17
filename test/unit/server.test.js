import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../../scripts/serve.mjs';

test('preview serves built modules and keeps repository files inaccessible', async t => {
  const server = await startServer({ port: 0 });
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /Gargantua/);
  assert.equal((await fetch(`${base}/main.js`)).status, 200);
  assert.equal((await fetch(`${base}/library/index.js`)).status, 200);
  for (const pathname of ['/.git/config', '/package.json', '/%2e%2e/package.json', '/rendering/shaders/black-hole.frag']) assert.equal((await fetch(base + pathname)).status, 404);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
});
