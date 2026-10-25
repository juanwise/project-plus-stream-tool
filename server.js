// Local server for the Project Plus stream tool.
// Serves the control panel and the OBS overlays, keeps the match state and pushes changes to the overlays.
//   GET  /state           current state (JSON)
//   POST /state           replace the state (JSON)
//   GET  /events          server-sent events: a "state" event on every change
//   GET  /art/<f>/<n>     fighter art:  <data>/custom-art/<f>/<n>.(png|webp|jpg), else the bundled one
//   GET  /icon/<f>/<n>    selector icon (same lookup, <data>/custom-icons)
//   GET  /characters      fighter list
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
};

const emptyPlayer = () => ({ name: '', team: '', character: '', alt: 1, score: 0 });
const emptyEntry = () => ({ name: '', team: '', character: '', alt: 1 });

function defaultState() {
  return {
    tournament: '',
    round: '',
    bestOf: 3,
    grandFinals: { on: false, reset: false },
    mirrorPlayer2: true,
    players: [emptyPlayer(), emptyPlayer()],
    top8: Array.from({ length: 8 }, emptyEntry),
    next: { round: '', p1: emptyEntry(), p2: emptyEntry() },
  };
}

// Keeps whatever the panel sends but makes sure every field the overlays read exists.
function normalize(input) {
  const base = defaultState();
  const s = Object.assign(base, input && typeof input === 'object' ? input : {});
  s.bestOf = Number(s.bestOf) === 5 ? 5 : 3;
  s.grandFinals = Object.assign({ on: false, reset: false }, s.grandFinals);
  s.players = [0, 1].map((i) => Object.assign(emptyPlayer(), (s.players || [])[i]));
  s.top8 = Array.from({ length: 8 }, (_, i) => Object.assign(emptyEntry(), (s.top8 || [])[i]));
  s.next = Object.assign({ round: '' }, s.next);
  s.next.p1 = Object.assign(emptyEntry(), s.next.p1);
  s.next.p2 = Object.assign(emptyEntry(), s.next.p2);
  s.players.forEach((p) => { p.score = Math.max(0, parseInt(p.score, 10) || 0); p.alt = Math.max(1, parseInt(p.alt, 10) || 1); });
  [...s.top8, s.next.p1, s.next.p2].forEach((p) => { p.alt = Math.max(1, parseInt(p.alt, 10) || 1); });
  return s;
}

function startServer({ port = 3939, dataDir = path.join(process.cwd(), 'stream-tool-data') } = {}) {
  const root = __dirname;
  const stateFile = path.join(dataDir, 'state.json');
  fs.mkdirSync(dataDir, { recursive: true });
  for (const d of ['custom-art', 'custom-icons']) fs.mkdirSync(path.join(dataDir, d), { recursive: true });

  let state = defaultState();
  try { state = normalize(JSON.parse(fs.readFileSync(stateFile, 'utf8'))); } catch (e) { /* first run */ }
  const clients = new Set();

  const save = () => {
    try { fs.writeFileSync(stateFile, JSON.stringify(state, null, 2)); } catch (e) { console.error('could not save state', e.message); }
  };
  const broadcast = () => {
    const data = `event: state\ndata: ${JSON.stringify(state)}\n\n`;
    for (const res of clients) res.write(data);
  };

  function sendFile(res, file, cache) {
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': cache ? 'public, max-age=60' : 'no-cache', 'Access-Control-Allow-Origin': '*' });
      res.end(buf);
    });
  }

  // Looks for <folder>/<fighter>/<n>.<ext> in the custom folder first, then in the bundled assets.
  function sendArt(res, kind, fighter, n) {
    if (!/^[a-z0-9_]+$/.test(fighter) || !/^\d+$/.test(n)) { res.writeHead(400); return res.end('bad request'); }
    const custom = path.join(dataDir, kind === 'art' ? 'custom-art' : 'custom-icons', fighter);
    const bundled = path.join(root, 'assets', kind === 'art' ? 'characters' : 'icons', fighter);
    for (const dir of [custom, bundled]) {
      for (const ext of ['.png', '.webp', '.jpg']) {
        const file = path.join(dir, n + ext);
        if (fs.existsSync(file)) return sendFile(res, file, false);
      }
    }
    res.writeHead(404); res.end('not found');
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const p = decodeURIComponent(url.pathname);

    if (p === '/state' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify(state));
    }
    if (p === '/state' && req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
      req.on('end', () => {
        try { state = normalize(JSON.parse(body)); } catch (e) { res.writeHead(400); return res.end('bad json'); }
        save(); broadcast();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state));
      });
      return;
    }
    if (p === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      res.write(`retry: 1000\nevent: state\ndata: ${JSON.stringify(state)}\n\n`);
      clients.add(res);
      const ping = setInterval(() => res.write(': ping\n\n'), 15000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); });
      return;
    }
    if (p === '/characters') return sendFile(res, path.join(root, 'assets', 'characters.json'), false);
    let m;
    if ((m = p.match(/^\/(art|icon)\/([^/]+)\/(\d+)$/))) return sendArt(res, m[1], m[2], m[3]);
    if (p === '/') { res.writeHead(302, { Location: '/panel/' }); return res.end(); }

    // static files: only the folders that are meant to be public
    const rel = p.endsWith('/') ? p + 'index.html' : p;
    if (!/^\/(panel|overlays|assets)\//.test(rel) || rel.includes('..')) { res.writeHead(404); return res.end('not found'); }
    sendFile(res, path.join(root, rel), false);
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, port, dataDir }));
  });
}

module.exports = { startServer, defaultState, normalize };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3939;
  startServer({ port, dataDir: process.env.PPST_DATA || undefined })
    .then(({ dataDir }) => console.log(`Project Plus stream tool: http://localhost:${port}/  (data in ${dataDir})`))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
