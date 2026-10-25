// Imports the top 8 of a Start.gg event: names, team tags, countries and (when Start.gg has them) characters.
// Needs a Start.gg API token (https://start.gg/admin/profile/developer). The API is called from this program,
// the token never reaches the overlays.
const API = 'https://api.start.gg/gql/alpha';

// "https://www.start.gg/tournament/foo/event/bar/standings" -> "tournament/foo/event/bar"
function parseSlug(link) {
  const m = String(link || '').match(/(?:start|smash)\.gg\/((?:tournament|league)\/[^/?#\s]+\/event\/[^/?#\s]+)/i);
  return m ? m[1].toLowerCase() : null;
}

const normalize = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

// country name -> ISO code, built from the names Node itself knows plus a few spellings Start.gg users type
function countryTable() {
  const table = {};
  try {
    const names = new Intl.DisplayNames(['en'], { type: 'region' });
    for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      let name; try { name = names.of(code); } catch (e) { continue; }
      if (name && name !== code && !/unknown/i.test(name)) table[normalize(name)] = code.toLowerCase();
    }
  } catch (e) { /* no ICU: only the aliases below */ }
  Object.assign(table, { usa: 'us', unitedstatesofamerica: 'us', unitedstates: 'us', uk: 'gb', unitedkingdom: 'gb', england: 'gb', scotland: 'gb', wales: 'gb',
    czechrepublic: 'cz', czechia: 'cz', turkey: 'tr', turkiye: 'tr', southkorea: 'kr', korea: 'kr', republicofkorea: 'kr', russia: 'ru', vietnam: 'vn',
    uae: 'ae', netherlands: 'nl', holland: 'nl', ivorycoast: 'ci', bolivia: 'bo', venezuela: 've', taiwan: 'tw', hongkong: 'hk', macau: 'mo' });
  return table;
}
const COUNTRIES = countryTable();
function countryCode(value) {
  if (!value) return '';
  const v = String(value).trim();
  if (/^[a-z]{2}$/i.test(v)) return v.toLowerCase();
  return COUNTRIES[normalize(v)] || '';
}

const CHARACTER_ALIASES = { gameandwatch: 'mr_game_and_watch', gamewatch: 'mr_game_and_watch', mrgamewatch: 'mr_game_and_watch', mrgameandwatch: 'mr_game_and_watch', gamewatch: 'mr_game_and_watch', mrgamewatch: 'mr_game_and_watch', gnw: 'mr_game_and_watch', dedede: 'king_dedede', kingdedede: 'king_dedede',
  dk: 'donkey_kong', rob: 'rob', zss: 'zero_suit_samus', zerosuitsamus: 'zero_suit_samus', icies: 'ice_climbers', iceclimbers: 'ice_climbers', popo: 'ice_climbers',
  cf: 'captain_falcon', captainfalcon: 'captain_falcon', mk: 'meta_knight', metaknight: 'meta_knight', toonlink: 'toon_link', tl: 'toon_link', olimar: 'olimar', pikmin: 'olimar' };
function characterCode(name, fighters) {
  const n = normalize(name);
  if (!n) return '';
  if (CHARACTER_ALIASES[n]) return CHARACTER_ALIASES[n];
  const f = (fighters || []).find((x) => normalize(x.name) === n || normalize(x.code) === n);
  return f ? f.code : '';
}

async function gql(query, variables, token, fetchImpl) {
  const res = await (fetchImpl || fetch)(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401 || res.status === 403) throw new Error('Start.gg rejected the API token. Check that it is correct and not expired.');
  if (res.status === 429) throw new Error('Start.gg says too many requests. Wait a minute and try again.');
  if (!res.ok) throw new Error(`Start.gg answered with an error (${res.status}).`);
  const json = await res.json();
  if (json.errors && json.errors.length) { const e = new Error(json.errors[0].message || 'Start.gg error'); e.graphql = true; throw e; }
  return json.data;
}

const STANDINGS = `query Top8($slug: String!) {
  event(slug: $slug) { name tournament { name }
    standings(query: { page: 1, perPage: 8 }) { nodes { placement entrant { id name participants { gamerTag prefix user { location { country } } } } } } } }`;

const SELECTIONS = `query Games($slug: String!, $page: Int!) {
  event(slug: $slug) { sets(page: $page, perPage: 50, sortType: RECENT) { nodes { games { selections { entrant { id } character { name } } } } } } }`;

// Most played character per entrant, from the games of the event's sets. Returns { entrantId: characterName }.
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
  for (const [id, byChar] of Object.entries(counts)) out[id] = Object.entries(byChar).sort((a, b) => b[1] - a[1])[0][0];
  return out;
}

async function importTop8(link, token, fighters, fetchImpl) {
  const slug = parseSlug(link);
  if (!slug) throw new Error('That does not look like a Start.gg event link. It should look like https://www.start.gg/tournament/.../event/...');
  if (!token) throw new Error('Add your Start.gg API token first.');
  const data = await gql(STANDINGS, { slug }, token, fetchImpl);
  const ev = data && data.event;
  if (!ev) throw new Error('Start.gg could not find that event.');
  const nodes = ((ev.standings || {}).nodes || []).filter((n) => n && n.entrant)
    .sort((a, b) => (a.placement || 99) - (b.placement || 99));
  if (!nodes.length) throw new Error('This event has no standings yet.');

  const notes = [];
  let mains = {};
  try {
    mains = await mainCharacters(slug, nodes.map((n) => String(n.entrant.id)), token, fetchImpl);
    if (!Object.keys(mains).length) notes.push('Start.gg has no character information for this event, so the characters are left empty.');
  } catch (e) {
    notes.push('Could not read characters from Start.gg (' + e.message + '). Pick them by hand.');
  }

  const entries = nodes.slice(0, 8).map((n) => {
    const p = (n.entrant.participants || [])[0] || {};
    const loc = (p.user && p.user.location) || {};
    const chName = mains[n.entrant.id] || mains[String(n.entrant.id)] || '';
    const character = characterCode(chName, fighters);
    if (chName && !character) notes.push(`"${chName}" is not one of the tool's fighters (${p.gamerTag || n.entrant.name}).`);
    return {
      placement: n.placement,
      name: p.gamerTag || n.entrant.name || '',
      team: p.prefix || '',
      country: countryCode(loc.country),
      character,
      alt: 1,
    };
  });
  return { entries, tournament: (ev.tournament && ev.tournament.name) || '', eventName: ev.name || '', notes };
}

module.exports = { parseSlug, countryCode, characterCode, importTop8, normalize };
