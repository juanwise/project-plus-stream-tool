// Offline check of the Start.gg import: a fake Start.gg answers, the real server code does the rest.
const os = require('os'), path = require('path'), fs = require('fs');
const { startServer } = require('../server');
const names = ['Mario', 'Fox', 'Mr. Game & Watch', 'Captain Falcon', 'Sonic', 'Pikachu', 'Weirdo', null];
const fake = async (url, opts) => {
  const q = JSON.parse(opts.body).query;
  if (opts.headers.Authorization !== 'Bearer tok') return { status: 401, ok: false, json: async () => ({}) };
  if (q.includes('standings')) return { status: 200, ok: true, json: async () => ({ data: { event: { name: 'Singles', tournament: { name: 'Mock Major' },
    standings: { nodes: names.map((n, i) => ({ placement: i + 1, entrant: { id: 100 + i, name: 'P' + i, participants: [{ gamerTag: 'Player' + (i + 1), prefix: i % 2 ? 'TAG' : null,
      user: { location: { country: ['United States', 'Colombia', 'Türkiye', 'MX', null, 'Japan', 'Czechia', 'Brazil'][i] } } }] } })) } } } }) };
  return { status: 200, ok: true, json: async () => ({ data: { event: { sets: { nodes: [{ games: names.map((n, i) => n && ({ selections: [{ entrant: { id: 100 + i }, character: { name: n } }] })).filter(Boolean).map((g) => g) }] } } } }) };
};
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppmock-'));
  const { server } = await startServer({ port: 0, dataDir: dir, fetchImpl: fake });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, b) => fetch(base + p, { method: 'POST', body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  console.log('no token:', (await post('/import/startgg', { link: 'https://www.start.gg/tournament/a/event/b' })).body.error);
  console.log('bad link:', (await post('/import/startgg', { link: 'nope' })).body.error);
  await post('/settings', { startggToken: 'bad' });
  console.log('bad token:', (await post('/import/startgg', { link: 'https://www.start.gg/tournament/a/event/b/standings' })).body.error);
  await post('/settings', { startggToken: 'tok' });
  const r = await post('/import/startgg', { link: 'https://www.start.gg/tournament/a/event/b/standings' });
  console.log(r.status, r.body.tournament, r.body.notes); console.table(r.body.entries);
  console.log('settings leak?', JSON.stringify(await (await fetch(base + '/settings')).json()), JSON.stringify(await (await fetch(base + '/state')).json()).includes('tok'));
  server.close(); process.exit(0);
})();
