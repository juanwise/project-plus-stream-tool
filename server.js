// Local server for the Project Plus stream tool.
// Serves the control panel and the OBS overlays, keeps the match state and pushes changes to the overlays.
//   GET  /state           current state (JSON)
//   POST /state           replace the state (JSON)
//   GET  /events          server-sent events: a "state" event on every change
//   GET  /art/<f>/<n>     fighter art:  <data>/custom-art/<f>/<n>.(png|webp|jpg), else the bundled one
//   GET  /icon/<f>/<n>    selector icon (same lookup, <data>/custom-icons)
//   GET  /characters      fighter list
//   GET  /flag/<cc>       country flag png: bundled assets/flags, else cached in <data>/flags, else downloaded once from flagcdn
//   GET/POST /settings    Start.gg API token (kept in <data>/settings.json, never sent to the overlays)
//   POST /import/startgg  {link} -> top 8 of a Start.gg event
//   POST /import/bracket  {link} -> reads the bracket of a Start.gg event into the state (the bracket overlay)
//   GET/POST/DELETE /logo the logo shown on every overlay (POST: the image file as the request body)
const http = require('http');
const fs = require('fs');
const https = require('https');
const startgg = require('./startgg');
const path = require('path');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.otf': 'font/otf', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.svg': 'image/svg+xml',
};

const emptyPlayer = () => ({ name: '', team: '', character: '', alt: 1, score: 0 });
const emptyEntry = () => ({ name: '', team: '', country: '', character: '', alt: 1 });

function defaultState() {
  return {
    tournament: '',
    round: '',
    bestOf: 3,
    grandFinals: { on: false, reset: false },
    mirrorPlayer2: true,
    players: [emptyPlayer(), emptyPlayer()],
    top8: Array.from({ length: 8 }, emptyEntry),
    bracketDepth: 8,
    themes: {},
    logo: 0,
    bracket: null,
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
  delete s.next;   // the old "up next" overlay no longer exists
  s.bestOf = Number(s.bestOf) === 5 ? 5 : 3;
  s.bracketDepth = Number(s.bracketDepth) === 4 ? 4 : 8;
  s.themes = Object.assign({}, s.themes && typeof s.themes === 'object' ? s.themes : {});
  for (const k of Object.keys(s.themes)) if (!/^[a-z]{2,12}$/.test(String(s.themes[k]))) delete s.themes[k];
  s.logo = Number(s.logo) > 0 ? Number(s.logo) : 0;
  if (!s.bracket || typeof s.bracket !== 'object') s.bracket = null;
  s.players.forEach((p) => { p.score = Math.max(0, parseInt(p.score, 10) || 0); p.alt = Math.max(1, parseInt(p.alt, 10) || 1); });
  s.top8.forEach((p) => { p.country = /^[a-z]{2}$/i.test(p.country || '') ? p.country.toLowerCase() : ''; p.alt = Math.max(1, parseInt(p.alt, 10) || 1); });
  return s;
}

function startServer({ port = 3939, dataDir = path.join(process.cwd(), 'stream-tool-data'), fetchImpl } = {}) {
  const root = __dirname;
  const stateFile = path.join(dataDir, 'state.json');
  fs.mkdirSync(dataDir, { recursive: true });
  for (const d of ['custom-art', 'custom-icons', 'flags']) fs.mkdirSync(path.join(dataDir, d), { recursive: true });

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

  // ---- settings (Start.gg token) ----
  const settingsFile = path.join(dataDir, 'settings.json');
  const readSettings = () => { try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch (e) { return {}; } };
  const fighters = () => { try { return JSON.parse(fs.readFileSync(path.join(root, 'assets', 'characters.json'), 'utf8')); } catch (e) { return []; } };
  const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' }); res.end(JSON.stringify(obj)); };
  const readBody = (req, cb) => {
    let body = '';
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => { try { cb(JSON.parse(body || '{}')); } catch (e) { cb(null); } });
  };

  // ---- flags: bundled, then cached, then downloaded once ----
  const flagWaiting = new Map();
  function downloadFlag(cc) {
    if (!flagWaiting.has(cc)) {
      const file = path.join(dataDir, 'flags', cc + '.png');
      const p = new Promise((resolve) => {
        const req = https.get(`https://flagcdn.com/w160/${cc}.png`, { timeout: 8000 }, (r) => {
          if (r.statusCode !== 200) { r.resume(); return resolve(null); }
          const chunks = []; r.on('data', (c) => chunks.push(c));
          r.on('end', () => { const buf = Buffer.concat(chunks); try { fs.writeFileSync(file, buf); } catch (e) { /* cache is optional */ } resolve(file); });
        });
        req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); });
      }).finally(() => flagWaiting.delete(cc));
      flagWaiting.set(cc, p);
    }
    return flagWaiting.get(cc);
  }
  async function flagFile(cc) {
    for (const f of [path.join(root, 'assets', 'flags', cc + '.png'), path.join(dataDir, 'flags', cc + '.png')]) if (fs.existsSync(f)) return f;
    return downloadFlag(cc);
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
        try { const keep = { bracket: state.bracket, logo: state.logo }; state = Object.assign(normalize(JSON.parse(body)), keep); } catch (e) { res.writeHead(400); return res.end('bad json'); }   // bracket and logo are changed only by their own buttons
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
    let fm;
    if ((fm = p.match(/^\/flag\/([a-z]{2})$/))) {
      flagFile(fm[1]).then((f) => (f ? sendFile(res, f, true) : (res.writeHead(404), res.end('no flag'))));
      return;
    }
    if (p === '/settings' && req.method === 'GET') return json(res, 200, { startggToken: !!readSettings().startggToken });
    if (p === '/settings' && req.method === 'POST') {
      return readBody(req, (b) => {
        if (!b) return json(res, 400, { error: 'bad json' });
        const s = readSettings();
        if (typeof b.startggToken === 'string') s.startggToken = b.startggToken.trim();
        try { fs.writeFileSync(settingsFile, JSON.stringify(s, null, 2)); } catch (e) { return json(res, 500, { error: 'could not save the settings' }); }
        json(res, 200, { startggToken: !!s.startggToken });
      });
    }
    if (p === '/import/startgg' && req.method === 'POST') {
      return readBody(req, async (b) => {
        if (!b) return json(res, 400, { error: 'bad json' });
        try {
          const result = await startgg.importTop8(b.link, readSettings().startggToken, fighters(), fetchImpl);
          result.entries.forEach((e) => { if (e.country) flagFile(e.country); });   // warm the flag cache
          json(res, 200, result);
        } catch (e) { json(res, 400, { error: e.message }); }
      });
    }
    if (p === '/import/bracket' && req.method === 'POST') {
      return readBody(req, async (b) => {
        if (!b) return json(res, 400, { error: 'bad json' });
        try {
          state.bracket = await startgg.importBracket(b.link, readSettings().startggToken, fetchImpl);
          save(); broadcast(); json(res, 200, { bracket: state.bracket });
        } catch (e) { json(res, 400, { error: e.message }); }
      });
    }
    if (p === '/logo' && req.method === 'GET') {
      const f = ['.png', '.jpg', '.webp', '.gif', '.svg'].map((e) => path.join(dataDir, 'logo' + e)).find((x) => fs.existsSync(x));
      return f ? sendFile(res, f, false) : (res.writeHead(404), res.end('no logo'));
    }
    if (p === '/logo' && req.method === 'DELETE') {
      for (const e of ['.png', '.jpg', '.webp', '.gif', '.svg']) { try { fs.unlinkSync(path.join(dataDir, 'logo' + e)); } catch (x) { /* none */ } }
      state.logo = 0; save(); broadcast(); return json(res, 200, { logo: 0 });
    }
    if (p === '/logo' && req.method === 'POST') {
      const ext = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg' }[String(req.headers['content-type'] || '').split(';')[0]];
      if (!ext) return json(res, 400, { error: 'The logo must be a PNG, JPG, WebP, GIF or SVG image.' });
      const chunks = []; let size = 0, tooBig = false;
      req.on('data', (c) => { size += c.length; if (size > 8e6) tooBig = true; else chunks.push(c); });
      req.on('end', () => {
        if (tooBig || !size) return json(res, 400, { error: tooBig ? 'The logo is bigger than 8 MB.' : 'Empty file.' });
        for (const e of ['.png', '.jpg', '.webp', '.gif', '.svg']) { try { fs.unlinkSync(path.join(dataDir, 'logo' + e)); } catch (x) { /* none */ } }
        try { fs.writeFileSync(path.join(dataDir, 'logo' + ext), Buffer.concat(chunks)); } catch (x) { return json(res, 500, { error: 'Could not save the logo.' }); }
        state.logo = Date.now(); save(); broadcast(); json(res, 200, { logo: state.logo });
      });
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
