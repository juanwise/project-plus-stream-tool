// Start.gg helpers for Project Plus Stream Tool.
const API = 'https://api.start.gg/gql/alpha';
function parseSlug(link) {
  const m = String(link || '').match(/(?:start|smash)\.gg\/((?:tournament|league)\/[^/?#\s]+\/event\/[^/?#\s]+)/i);
  return m ? m[1].toLowerCase() : null;
}
const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
function countryTable() {
  const table = {};
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b); let name;
      try { name = names.of(code); } catch (_) { continue; }
      if (name && name !== code && !/unknown/i.test(name)) table[normalize(name)] = code.toLowerCase();
    }
  } catch (_) {}
  Object.assign(table, { usa:'us', unitedstatesofamerica:'us', unitedstates:'us', uk:'gb', unitedkingdom:'gb', england:'gb', scotland:'gb', wales:'gb', czechrepublic:'cz', czechia:'cz', turkey:'tr', turkiye:'tr', southkorea:'kr', korea:'kr', republicofkorea:'kr', russia:'ru', vietnam:'vn', uae:'ae', netherlands:'nl', holland:'nl', ivorycoast:'ci', bolivia:'bo', venezuela:'ve', taiwan:'tw', hongkong:'hk', macau:'mo' });
  return table;
}
const COUNTRIES = countryTable();
function countryCode(value) {
  if (!value) return '';
  const v = String(value).trim();
  if (/^[a-z]{2}$/i.test(v)) return v.toLowerCase();
  return COUNTRIES[normalize(v)] || '';
}
const CHARACTER_ALIASES = { gameandwatch:'mr_game_and_watch', gamewatch:'mr_game_and_watch', mrgamewatch:'mr_game_and_watch', mrgameandwatch:'mr_game_and_watch', gnw:'mr_game_and_watch', dedede:'king_dedede', kingdedede:'king_dedede', dk:'donkey_kong', rob:'rob', zss:'zero_suit_samus', zerosuitsamus:'zero_suit_samus', icies:'ice_climbers', iceclimbers:'ice_climbers', popo:'ice_climbers', cf:'captain_falcon', captainfalcon:'captain_falcon', mk:'meta_knight', metaknight:'meta_knight', toonlink:'toon_link', tl:'toon_link', olimar:'olimar', pikmin:'olimar' };
function characterCode(name, fighters) {
  const n = normalize(name); if (!n) return '';
  if (CHARACTER_ALIASES[n]) return CHARACTER_ALIASES[n];
  const f = (fighters || []).find((x) => normalize(x.name) === n || normalize(x.code) === n);
  return f ? f.code : '';
}
async function gql(query, variables, token, fetchImpl) {
  const res = await (fetchImpl || fetch)(API, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${token}` }, body:JSON.stringify({ query, variables }) });
  if (res.status === 401 || res.status === 403) throw new Error('Start.gg rejected the API token. Check that it is correct and not expired.');
  if (res.status === 429) throw new Error('Start.gg says too many requests. Wait a minute and try again.');
  if (!res.ok) throw new Error(`Start.gg answered with an error (${res.status}).`);
  const json = await res.json();
  if (json.errors && json.errors.length) { const e = new Error(json.errors[0].message || 'Start.gg error'); e.graphql = true; throw e; }
  return json.data;
}
const STANDINGS = `query Top8($slug: String!) { event(slug: $slug) { name tournament { name } standings(query: { page: 1, perPage: 8 }) { nodes { placement entrant { id name participants { gamerTag prefix user { location { country } } } } } } } }`;
const SELECTIONS = `query Games($slug: String!, $page: Int!) { event(slug: $slug) { sets(page: $page, perPage: 50, sortType: RECENT) { nodes { games { selections { entrant { id } character { name } } } } } } }`;
async function mainCharacters(slug, entrantIds, token, fetchImpl) {
  const counts = {};
  for (let page = 1; page <= 6; page++) {
    const data = await gql(SELECTIONS, { slug, page }, token, fetchImpl);
    const nodes = (((data || {}).event || {}).sets || {}).nodes || [];
    if (!nodes.length) break;
    for (const set of nodes) for (const g of set.games || []) for (const sel of g.selections || []) {
      const id = sel && sel.entrant && sel.entrant.id, ch = sel && sel.character && sel.character.name;
      if (id == null || !ch || !entrantIds.includes(String(id))) continue;
      counts[id] = counts[id] || {}; counts[id][ch] = (counts[id][ch] || 0) + 1;
    }
    if (nodes.length < 50) break;
  }
  const out = {};
  for (const [id, byChar] of Object.entries(counts)) out[id] = Object.entries(byChar).sort((a,b) => b[1]-a[1])[0][0];
  return out;
}
async function importTop8(link, token, fighters, fetchImpl) {
  const slug = parseSlug(link);
  if (!slug) throw new Error('That does not look like a Start.gg event link. It should look like https://www.start.gg/tournament/.../event/...');
  if (!token) throw new Error('Add your Start.gg API token first.');
  const data = await gql(STANDINGS, { slug }, token, fetchImpl); const ev = data && data.event;
  if (!ev) throw new Error('Start.gg could not find that event.');
  const nodes = ((ev.standings || {}).nodes || []).filter(n => n && n.entrant).sort((a,b) => (a.placement || 99) - (b.placement || 99));
  if (!nodes.length) throw new Error('This event has no standings yet.');
  const notes = []; let mains = {};
  try { mains = await mainCharacters(slug, nodes.map(n => String(n.entrant.id)), token, fetchImpl); if (!Object.keys(mains).length) notes.push('Start.gg has no character information for this event, so the characters are left empty.'); }
  catch (e) { notes.push('Could not read characters from Start.gg (' + e.message + '). Pick them by hand.'); }
  const entries = nodes.slice(0,8).map(n => {
    const p = (n.entrant.participants || [])[0] || {}, loc = (p.user && p.user.location) || {};
    const chName = mains[n.entrant.id] || mains[String(n.entrant.id)] || '', character = characterCode(chName, fighters);
    if (chName && !character) notes.push(`"${chName}" is not one of the tool's fighters (${p.gamerTag || n.entrant.name}).`);
    return { placement:n.placement, name:p.gamerTag || n.entrant.name || '', team:p.prefix || '', country:countryCode(loc.country), character, alt:1 };
  });
  return { entries, tournament:(ev.tournament && ev.tournament.name) || '', eventName:ev.name || '', notes };
}
const PHASES = `query Phases($slug: String!) { event(slug: $slug) { id name tournament { name } phases { id name phaseOrder bracketType } } }`;
const PHASE_SETS = `query PhaseSets($id: ID!, $page: Int!) { phase(id: $id) { id name event { id name tournament { name } } sets(page: $page, perPage: 20, sortType: STANDARD) { pageInfo { totalPages } nodes { id identifier round fullRoundText winnerId slots { entrant { id name participants { gamerTag prefix } } standing { placement stats { score { value } } } } } } } }`;
const GROUP_SETS = `query GroupSets($id: ID!, $page: Int!) { phaseGroup(id: $id) { id displayIdentifier phase { id name event { id name tournament { name } } } sets(page: $page, perPage: 20, sortType: STANDARD) { pageInfo { totalPages } nodes { id identifier round fullRoundText winnerId slots { entrant { id name participants { gamerTag prefix } } standing { placement stats { score { value } } } } } } } }`;
function slotOf(slot, winnerId) {
  const e = slot && slot.entrant;
  if (!e) return { name:'', team:'', score:null, winner:false };
  const p = (e.participants || [])[0] || {}, v = slot.standing && slot.standing.stats && slot.standing.stats.score ? slot.standing.stats.score.value : null;
  return { name:p.gamerTag || e.name || '', team:p.prefix || '', score:v == null ? null : v, winner:winnerId != null && String(winnerId) === String(e.id) };
}
function buildBracket(nodes) {
  const sets = (nodes || []).filter(n => n && Array.isArray(n.slots) && n.slots.length >= 2).map(n => {
    const text = String(n.fullRoundText || n.roundText || '').trim();
    const round = Number.isFinite(Number(n.round)) ? Number(n.round) : null;
    return { id:String(n.id == null ? '' : n.id), ident:n.identifier || '', round, text, a:slotOf(n.slots[0], n.winnerId), b:slotOf(n.slots[1], n.winnerId) };
  });
  const isGF = x => /grand\s*final/i.test(x.text);
  const gf = sets.filter(isGF).sort((x,y) => (x.round || 0) - (y.round || 0));
  const rest = sets.filter(x => !isGF(x));
  const isLosers = x => (x.round != null && x.round < 0) || /losers|lower\s*bracket/i.test(x.text);
  function group(list, reverse) {
    const by = new Map();
    for (const x of list) {
      // Round numbers are the stable grouping key. Fall back to the round label if an API
      // response omits the numeric round so we never silently drop valid matches.
      const key = x.round == null ? 'label:' + (x.text || 'Round') : 'round:' + x.round;
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(x);
    }
    const cols = [...by.entries()].map(([key, ss]) => ({ round:ss[0].round, text:ss[0].text || (key.startsWith('round:') ? `Round ${key.slice(6)}` : 'Round'), sets:ss }));
    cols.sort((a,b) => {
      if (a.round != null && b.round != null) return reverse ? b.round - a.round : a.round - b.round;
      return a.text.localeCompare(b.text, undefined, { numeric:true });
    });
    return cols;
  }
  const winners = group(rest.filter(x => !isLosers(x)), false);
  const losers = group(rest.filter(isLosers), true);
  return { winners, losers, gf };
}
function parseBracketIds(link) {
  const m = String(link || '').match(/\/brackets\/(\d+)(?:\/(\d+))?(?:[/?#]|$)/i);
  return m ? { phaseId:m[1], phaseGroupId:m[2] || null } : { phaseId:null, phaseGroupId:null };
}
async function fetchPages(query, id, token, fetchImpl, rootKey) {
  const nodes = []; let pages = 1;
  for (let page = 1; page <= pages && page <= 50; page++) {
    const d = await gql(query, { id, page }, token, fetchImpl);
    const root = d && d[rootKey];
    if (!root) throw new Error(`Start.gg could not find ${rootKey === 'phaseGroup' ? 'that bracket group' : 'that bracket phase'} (ID ${id}). Check the URL and API token.`);
    const conn = root.sets || {};
    pages = Number((conn.pageInfo || {}).totalPages) || 1;
    nodes.push(...(conn.nodes || []));
  }
  return nodes;
}
async function importBracket(link, token, fetchImpl) {
  const slug = parseSlug(link);
  if (!slug) throw new Error('That does not look like a Start.gg event link. Paste the complete bracket URL or an event URL.');
  if (!token) throw new Error('Add your Start.gg API token first (Top 8 tab).');
  const ids = parseBracketIds(link);
  let nodes = [], phase = '', eventName = '', tournament = '';
  if (ids.phaseGroupId) {
    // Bracket URLs are /event/.../brackets/<phaseId>/<phaseGroupId>.
    // Query the exact group from the link; selecting the first elimination phase was the
    // reason Full Bracket and Top 8 could import the wrong data.
    nodes = await fetchPages(GROUP_SETS, ids.phaseGroupId, token, fetchImpl, 'phaseGroup');
    const meta = (await gql(PHASES, { slug }, token, fetchImpl) || {}).event;
    if (meta) {
      const ph = (meta.phases || []).find(p => String(p.id) === String(ids.phaseId));
      phase = (ph && ph.name) || '';
      eventName = meta.name || '';
      tournament = (meta.tournament && meta.tournament.name) || '';
    }
  } else {
    const ev = (await gql(PHASES, { slug }, token, fetchImpl) || {}).event;
    if (!ev) throw new Error('Start.gg could not find that event.');
    eventName = ev.name || ''; tournament = (ev.tournament && ev.tournament.name) || '';
    const elim = (ev.phases || []).filter(p => /ELIMINATION/.test(p.bracketType || '')).sort((a,b) => (b.phaseOrder || 0)-(a.phaseOrder || 0));
    if (!elim.length) throw new Error('This event has no bracket phase yet. Paste a specific bracket URL if the event has multiple phases.');
    const selected = elim.find(p => p.bracketType === 'DOUBLE_ELIMINATION') || elim[0]; phase = selected.name || '';
    nodes = await fetchPages(PHASE_SETS, selected.id, token, fetchImpl, 'phase');
  }
  if (!nodes.length) throw new Error('Start.gg returned zero matches for this bracket. Make sure the URL points to a bracket with sets, not just a phase overview.');
  const b = buildBracket(nodes);
  if (!(b.winners.length || b.losers.length || b.gf.length)) throw new Error(`Start.gg returned ${nodes.length} sets, but none could be grouped into rounds. Try refreshing the bracket or checking its phase.`);
  return Object.assign(b, { link:String(link).trim(), tournament, event:eventName, phase, phaseGroupId:ids.phaseGroupId, importedSets:nodes.length, updated:new Date().toISOString() });
}
module.exports = { parseSlug, parseBracketIds, countryCode, characterCode, importTop8, importBracket, buildBracket, normalize };
