// Offline check of the bracket import: a fake Start.gg with a 16 player double elimination bracket.
// Usage: node tools/mockBracket.js [port]   (starts a server with the mock bracket loaded, for looking at the overlay)
const os = require('os'), path = require('path'), fs = require('fs');
const { startServer } = require('../server');
let id = 1;
const names = ['Aeon', 'Bruno', 'Cami', 'Dario', 'Eli', 'Fran', 'Gus', 'Hana', 'Ivo', 'Juli', 'Kai', 'Lea', 'Mateo', 'Nina', 'Oscar', 'Paula'];
const slot = (n, score, win) => ({ entrant: n == null ? null : { id: 100 + n, name: names[n % 16] + ' long', participants: [{ gamerTag: names[n % 16] + (n === 3 ? 'WithAVeryLongName' : ''), prefix: n % 3 ? 'TAG' : null }] }, standing: n == null ? null : { placement: win ? 1 : 2, stats: { score: { value: score } } } });
const set = (round, text, a, b, sa, sb) => ({ id: id++, identifier: String.fromCharCode(64 + ((id - 1) % 26) + 1), round, fullRoundText: text, winnerId: a == null || b == null || sa == null ? null : (sa > sb ? 100 + a : 100 + b), slots: [slot(a, sa, sa > sb), slot(b, sb, sb > sa)] });
const nodes = [];
const rounds = [[1, 'Winners Round 1', 8], [2, 'Winners Quarter-Final', 4], [3, 'Winners Semi-Final', 2], [4, 'Winners Final', 1],
  [-1, 'Losers Round 1', 4], [-2, 'Losers Round 2', 4], [-3, 'Losers Round 3', 2], [-4, 'Losers Quarter-Final', 2], [-5, 'Losers Semi-Final', 1], [-6, 'Losers Final', 1]];
for (const [r, t, n] of rounds) for (let i = 0; i < n; i++) {
  const played = Math.abs(r) <= 3 || (r === 4) || r === -4;
  nodes.push(set(r, t, (i * 2) % 16, (i * 2 + 1) % 16, played ? 2 : null, played ? i % 2 : null));
}
nodes.push(set(5, 'Grand Final', 0, 5, null, null), set(6, 'Grand Final Reset', null, null, null, null));
const fake = async (url, opts) => {
  const { query, variables } = JSON.parse(opts.body);
  const data = query.includes('phases') ? { event: { name: 'Singles', tournament: { name: 'Mock Major' }, phases: [{ id: 1, name: 'Pools', phaseOrder: 1, bracketType: 'ROUND_ROBIN' }, { id: 2, name: 'Top Cut', phaseOrder: 2, bracketType: 'DOUBLE_ELIMINATION' }] } }
    : { phase: { sets: { pageInfo: { totalPages: 2 }, nodes: variables.page === 1 ? nodes.slice(0, 20) : nodes.slice(20) } } };
  return { status: 200, ok: true, json: async () => ({ data }) };
};
module.exports = { fake };
if (require.main === module) (async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ppbr-'));
  const { server } = await startServer({ port: Number(process.argv[2]) || 0, dataDir: dir, fetchImpl: fake });
  const base = `http://127.0.0.1:${server.address().port}`;
  await fetch(base + '/settings', { method: 'POST', body: JSON.stringify({ startggToken: 'tok' }) });
  const r = await (await fetch(base + '/import/bracket', { method: 'POST', body: JSON.stringify({ link: 'https://www.start.gg/tournament/x/event/y' }) })).json();
  if (!r.bracket) { console.error('FAIL', r); process.exit(1); }
  const b = r.bracket;
  console.log('rounds kept: winners', b.winners.map((x) => x.sets.length), 'losers', b.losers.map((x) => x.sets.length), 'gf', b.gf.length, '-', b.phase);
  if (process.argv[2]) console.log('listening ' + base); else { server.close(); process.exit(0); }
})();
