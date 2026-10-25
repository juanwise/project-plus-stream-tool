// Control panel: edits a draft of the match state; "Update" sends it to the overlays. Scores and a few
// switches are sent right away.
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const ROUNDS = ['Pools', 'Winners Round 1', 'Winners Round 2', 'Winners Quarters', 'Winners Semis', 'Winners Finals',
    'Losers Round 1', 'Losers Round 2', 'Losers Round 3', 'Losers Quarters', 'Losers Semis', 'Losers Finals', 'Grand Finals', 'Top 8', 'Friendlies'];

  const COUNTRIES = (() => {
    try {
      const dn = new Intl.DisplayNames(['en'], { type: 'region' }), out = [];
      for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
        const c = String.fromCharCode(a, b); let n; try { n = dn.of(c); } catch (e) { continue; }
        if (n && n !== c) out.push([c.toLowerCase(), n]);
      }
      return out.sort((x, y) => x[1].localeCompare(y[1]));
    } catch (e) { return []; }
  })();

  const OVERLAYS = [['VS screen', 'vs'], ['Scoreboard', 'scoreboard'], ['Top 8', 'top8'], ['Bracket', 'bracket'], ['Waiting for next game', 'waiting']];
  let chars = [], live = null, draft = null;

  const get = (o, path) => path.split('.').reduce((v, k) => (v == null ? v : v[k]), o);
  function set(o, path, val) {
    const keys = path.split('.'); const last = keys.pop();
    keys.reduce((v, k) => v[k], o)[last] = val;
  }
  const charOf = (code) => chars.find((c) => c.code === code);

  // ---------- sending ----------
  async function send(state) {
    try {
      const r = await fetch('/state', { method: 'POST', body: JSON.stringify(state) });
      live = await r.json();
      draft.bracket = live.bracket; draft.logo = live.logo;
      status(true);
    } catch (e) { status(false); }
    refreshDirty();
  }
  function status(ok) { const s = $('#status'); s.textContent = ok ? 'connected' : 'offline'; s.className = 'status' + (ok ? '' : ' off'); }
  const isDirty = () => JSON.stringify(draft) !== JSON.stringify(live);
  function refreshDirty() {
    const d = isDirty();
    $('#dirty').hidden = !d; $('#update').classList.toggle('pending', d);
  }
  // Change something in both the draft and the live state, and send it now.
  function applyNow(fn) {
    const next = clone(live); fn(next); fn(draft); send(next); syncControls();
  }

  // ---------- building the form ----------
  function charSelect(path) {
    return `<select data-path="${path}.character"><option value="">- character -</option>${chars.map((c) => `<option value="${c.code}">${c.name}</option>`).join('')}</select>`;
  }
  function costumePicker(path, withPreview) {
    return `<div class="costumes" data-costumes="${path}"></div>`;
  }
  function playerCard(i) {
    const p = `players.${i}`;
    return `<h4>Player ${i + 1}${i === 0 ? ' <span style="color:var(--muted);text-transform:none;letter-spacing:0">(winners side in Grand Finals)</span>' : ''}</h4>
      <div class="row2"><label>Team<input type="text" data-path="${p}.team" placeholder="Tag"></label>
        <label>Name<input type="text" data-path="${p}.name" placeholder="Player name"></label></div>
      <div class="charrow"><div><label>Character${charSelect(p)}</label>${costumePicker(p)}</div>
        <div class="preview" data-preview="${p}"><img alt=""></div></div>
      <div class="scorebox"><button data-score="${i}" data-d="-1">−</button><div class="num" data-scorenum="${i}">0</div><button class="plus" data-score="${i}" data-d="1">+</button></div>`;
  }
  function entryRow(path, place) {
    return `<div class="entry">${place ? `<div class="place">${place}</div>` : ''}
      <input type="text" data-path="${path}.team" placeholder="Tag">
      <input type="text" data-path="${path}.name" placeholder="Player name">
      <select data-path="${path}.country" class="country"><option value="">- country -</option>${COUNTRIES.map(([c, n]) => `<option value="${c}">${n}</option>`).join('')}</select>
      ${charSelect(path)}
      <select data-path="${path}.alt" data-altfor="${path}"></select>
      <img class="ic" data-icon="${path}" alt="">
    </div>`;
  }
  function build() {
    $('#rounds').innerHTML = ROUNDS.map((r) => `<option value="${r}">`).join('');
    $('#player0').innerHTML = playerCard(0);
    $('#player1').innerHTML = playerCard(1);
    $('#top8rows').innerHTML = draft.top8.map((_, i) => entryRow(`top8.${i}`, i + 1)).join('');
    $('#urls').innerHTML = OVERLAYS.map(([n, f]) =>
      `<div class="urlrow"><div class="url"><b>${n}</b><code>${location.origin}/overlays/${f}.html</code><button data-copy="${location.origin}/overlays/${f}.html">Copy</button><button data-open="/overlays/${f}.html">Open</button></div>
      <div class="swatches"><small>Theme</small>${(window.PP_THEMES || []).map((t) => `<button class="sw" data-theme="${t.id}" data-overlay="${f}" title="${t.name}" style="background:linear-gradient(135deg,${t.vars.bright} 0 50%,${t.vars.lime} 50% 100%)"></button>`).join('')}</div></div>`).join('');
    const dd = new URLSearchParams(location.search).get('dataDir');
    if (dd) $('#artDir').textContent = dd.replace(/[\\/]+$/, '') + '/custom-art/<fighter>/<costume number>.png';
  }

  // ---------- keeping the controls in step with the draft ----------
  function fillAlt(sel, code) {
    const n = (charOf(code) || { costumes: 1 }).costumes;
    if (sel.options.length !== n) sel.innerHTML = Array.from({ length: n }, (_, k) => `<option value="${k + 1}">${k + 1}</option>`).join('');
  }
  function syncControls() {
    $$('[data-path]').forEach((el) => {
      const path = el.dataset.path;
      if (el.dataset.altfor) fillAlt(el, get(draft, el.dataset.altfor + '.character'));
      const v = String(get(draft, path) == null ? '' : get(draft, path));
      if (el !== document.activeElement && el.value !== v) el.value = v;
    });
    $$('[data-icon]').forEach((img) => {
      const e = get(draft, img.dataset.icon);
      img.style.visibility = e.character ? 'visible' : 'hidden';
      if (e.character) img.src = `/icon/${e.character}/${e.alt}`;
    });
    [0, 1].forEach((i) => {
      const p = draft.players[i];
      $(`[data-scorenum="${i}"]`).textContent = p.score;
      const box = $(`[data-costumes="players.${i}"]`), c = charOf(p.character);
      const key = p.character + ':' + (c ? c.costumes : 0);
      if (box.dataset.key !== key) {
        box.dataset.key = key;
        box.innerHTML = c ? Array.from({ length: c.costumes }, (_, k) => `<button data-pick="${i}" data-n="${k + 1}" title="Costume ${k + 1}"><img src="/icon/${p.character}/${k + 1}" alt="${k + 1}" onerror="this.replaceWith(document.createTextNode('${k + 1}'))"></button>`).join('') : '';
      }
      $$('button', box).forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === p.alt));
      const img = $(`[data-preview="players.${i}"] img`);
      img.style.visibility = p.character ? 'visible' : 'hidden';
      if (p.character) { const src = `/art/${p.character}/${p.alt}`; if (img.getAttribute('src') !== src) img.src = src; }
    });
    $$('#bestOf button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === draft.bestOf));
    $('#gfOn').checked = draft.grandFinals.on;
    $('#gfReset').disabled = !draft.grandFinals.on;
    $('#gfReset').classList.toggle('on', draft.grandFinals.on && draft.grandFinals.reset);
    $('#gfReset').textContent = draft.grandFinals.reset ? 'Undo bracket reset' : 'Bracket reset';
    $('#gfHint').hidden = !draft.grandFinals.on;
    $('#mirror').checked = !!draft.mirrorPlayer2;
    $$('.sw').forEach((b) => b.classList.toggle('on', ((draft.themes || {})[b.dataset.overlay] || 'green') === b.dataset.theme));
    $$('#brDepth button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === draft.bracketDepth));
    const lp = $('#logoPrev'); lp.hidden = !live.logo; if (live.logo) { const src = '/logo?v=' + live.logo; if (lp.getAttribute('src') !== src) lp.src = src; }
    if (document.activeElement !== $('#brLink') && !$('#brLink').value && live.bracket) $('#brLink').value = live.bracket.link || '';
    refreshDirty();
  }

  // ---------- events ----------
  document.addEventListener('input', (e) => {
    const el = e.target; if (!el.dataset || !el.dataset.path) return;
    const path = el.dataset.path;
    if (path.endsWith('.alt')) set(draft, path, Number(el.value));
    else set(draft, path, el.value);
    if (path.endsWith('.character')) set(draft, path.replace(/character$/, 'alt'), 1);
    syncControls();
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.tab) {
      $$('.tab').forEach((b) => b.classList.toggle('active', b === t));
      $$('.tabpane').forEach((p) => p.classList.toggle('active', p.id === 'tab-' + t.dataset.tab));
    } else if (t.dataset.score != null) {
      const i = Number(t.dataset.score), d = Number(t.dataset.d);
      applyNow((s) => { s.players[i].score = Math.max(0, s.players[i].score + d); });
    } else if (t.dataset.pick != null) {
      set(draft, `players.${t.dataset.pick}.alt`, Number(t.dataset.n)); syncControls();
    } else if (t.closest('#bestOf')) {
      applyNow((s) => { s.bestOf = Number(t.dataset.v); });
    } else if (t.closest('#brDepth')) {
      applyNow((s) => { s.bracketDepth = Number(t.dataset.v); });
    } else if (t.dataset.theme) {
      applyNow((s) => { s.themes = s.themes || {}; s.themes[t.dataset.overlay] = t.dataset.theme; });
    } else if (t.dataset.copy) {
      (navigator.clipboard ? navigator.clipboard.writeText(t.dataset.copy) : Promise.reject()).then(() => { t.textContent = 'Copied'; setTimeout(() => (t.textContent = 'Copy'), 1200); }).catch(() => {});
    } else if (t.dataset.open) {
      window.open(t.dataset.open, '_blank');
    }
  });
  $('#gfOn').addEventListener('change', (e) => applyNow((s) => { s.grandFinals.on = e.target.checked; if (!e.target.checked) s.grandFinals.reset = false; }));
  $('#gfReset').addEventListener('click', () => applyNow((s) => {
    const turnOn = !s.grandFinals.reset;
    s.grandFinals.reset = turnOn;
    if (turnOn) s.players.forEach((p) => { p.score = 0; });   // the reset set starts at 0-0
  }));
  $('#mirror').addEventListener('change', (e) => applyNow((s) => { s.mirrorPlayer2 = e.target.checked; }));
  $('#clearScores').addEventListener('click', () => applyNow((s) => s.players.forEach((p) => { p.score = 0; })));
  $('#swap').addEventListener('click', () => { draft.players.reverse(); syncControls(); });
  $('#clearAll').addEventListener('click', () => {
    draft.players.forEach((p) => Object.assign(p, { name: '', team: '', character: '', alt: 1 }));
    syncControls();
  });
  // ---------- bracket and logo ----------
  const brMsg = (t, bad) => { const m = $('#brMsg'); m.textContent = t; m.style.color = bad ? '#ff9b8a' : ''; };
  $('#brUpdate').addEventListener('click', async () => {
    brMsg('Asking Start.gg...'); $('#brUpdate').disabled = true;
    try {
      const r = await fetch('/import/bracket', { method: 'POST', body: JSON.stringify({ link: $('#brLink').value }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Update failed');
      const b = data.bracket;
      brMsg(`Bracket updated at ${new Date(b.updated).toLocaleTimeString()} (${b.event || 'event'}, ${b.phase || 'bracket'}).`);
    } catch (e) { brMsg(e.message, true); }
    $('#brUpdate').disabled = false;
  });
  const logoMsg = (t, bad) => { const m = $('#logoMsg'); m.textContent = t; m.style.color = bad ? '#ff9b8a' : ''; };
  $('#logoPick').addEventListener('click', () => $('#logoFile').click());
  $('#logoFile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const r = await fetch('/logo', { method: 'POST', headers: { 'Content-Type': f.type }, body: f });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not import the logo');
      logoMsg('Logo imported. Refresh the browser sources in OBS if it does not show.');
    } catch (err) { logoMsg(err.message, true); }
    e.target.value = '';
  });
  $('#logoRemove').addEventListener('click', async () => { await fetch('/logo', { method: 'DELETE' }); logoMsg('Logo removed.'); });

  // ---------- Start.gg import ----------
  const sggMsg = (t, bad) => { const m = $('#sggMsg'); m.textContent = t; m.style.color = bad ? '#ff9b8a' : ''; };
  $('#sggSave').addEventListener('click', async () => {
    const token = $('#sggToken').value.trim();
    await fetch('/settings', { method: 'POST', body: JSON.stringify({ startggToken: token }) });
    $('#sggToken').value = ''; $('#sggToken').placeholder = token ? 'Token saved (type a new one to replace it)' : 'Start.gg API token (saved on this computer)';
    sggMsg(token ? 'Token saved.' : 'Token removed.');
  });
  $('#sggImport').addEventListener('click', async () => {
    const typed = $('#sggToken').value.trim();
    if (typed) { await fetch('/settings', { method: 'POST', body: JSON.stringify({ startggToken: typed }) }); $('#sggToken').value = ''; $('#sggToken').placeholder = 'Token saved (type a new one to replace it)'; }
    sggMsg('Asking Start.gg...'); $('#sggImport').disabled = true;
    try {
      const r = await fetch('/import/startgg', { method: 'POST', body: JSON.stringify({ link: $('#sggLink').value }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Import failed');
      draft.top8.forEach((_, i) => { draft.top8[i] = Object.assign({ name: '', team: '', country: '', character: '', alt: 1 }, data.entries[i] ? { name: data.entries[i].name, team: data.entries[i].team, country: data.entries[i].country, character: data.entries[i].character, alt: 1 } : {}); });
      if (data.tournament && !draft.tournament) draft.tournament = data.tournament;
      syncControls();
      sggMsg(`Imported ${data.entries.length} players. Check them and press Update.` + (data.notes.length ? ' ' + data.notes.join(' ') : ''), data.notes.length > 0);
    } catch (e) { sggMsg(e.message, true); }
    $('#sggImport').disabled = false;
  });
  fetch('/settings').then((r) => r.json()).then((s) => { if (s.startggToken) $('#sggToken').placeholder = 'Token saved (type a new one to replace it)'; }).catch(() => {});

  $('#update').addEventListener('click', () => { send(clone(draft)); });
  document.addEventListener('keydown', (e) => { if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); send(clone(draft)); } });

  // ---------- start ----------
  async function init() {
    chars = await (await fetch('/characters')).json();
    live = await (await fetch('/state')).json();
    draft = clone(live);
    build(); syncControls(); status(true);
    const es = new EventSource('/events');
    es.addEventListener('state', (e) => {
      const incoming = JSON.parse(e.data);
      const wasDirty = isDirty();
      live = incoming;
      draft.bracket = live.bracket; draft.logo = live.logo;   // changed by their own buttons, never part of "unsent changes"
      if (!wasDirty) { draft = clone(live); }
      syncControls();
      refreshDirty(); status(true);
    });
    es.onerror = () => status(false);
  }
  init();
})();
