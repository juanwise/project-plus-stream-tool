// Quick check used by CI (and handy locally): starts the server, sends a state and makes sure everything is served.
const os = require('os');
const path = require('path');
const fs = require('fs');
const { startServer, defaultState } = require('../server');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppst-'));
  const { server, port } = await startServer({ port: 0, dataDir: dir });
  const base = `http://127.0.0.1:${server.address().port}`;
  const fail = (m) => { console.error('FAIL:', m); process.exit(1); };
  const get = async (p) => { const r = await fetch(base + p); if (!r.ok) fail(`${p} -> ${r.status}`); return r; };

  for (const p of ['/panel/', '/panel/panel.js', '/panel/panel.css', '/overlays/vs.html', '/overlays/scoreboard.html', '/overlays/top8.html',
    '/overlays/next.html', '/overlays/common.js', '/overlays/theme.css', '/assets/fonts/Inter-Black.otf', '/characters', '/art/mario/1', '/icon/mario/1']) await get(p);

  const chars = await (await get('/characters')).json();
  if (chars.length < 40) fail('fewer than 40 fighters');
  for (const c of chars) for (let n = 1; n <= c.costumes; n++) await get(`/art/${c.code}/${n}`);

  const s = defaultState(); s.players[0].name = 'test'; s.players[0].score = 2; s.bestOf = 5;
  const posted = await (await fetch(base + '/state', { method: 'POST', body: JSON.stringify(s) })).json();
  if (posted.players[0].score !== 2 || posted.bestOf !== 5) fail('state was not stored');
  const back = await (await get('/state')).json();
  if (back.players[0].name !== 'test') fail('state was not returned');
  console.log(`OK: ${chars.length} fighters, ${chars.reduce((a, c) => a + c.costumes, 0)} costume images served`);
  server.close(); process.exit(0);
})().catch((e) => fail(e.message));
