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

  const OVERLAYS = [['VS screen', 'vs'], ['Scoreboard', 'scoreboard'], ['Top 8', 'top8'], ['Full Bracket', 'bracket', 'full'], ['Top 8 Bracket', 'bracket', 'top8'], ['Waiting for next game', 'waiting']];
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
      draft.bracket = live.bracket; draft.bracketFull = live.bracketFull; draft.bracketTop8 = live.bracketTop8; draft.bracketView = live.bracketView; draft.logo = live.logo;
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
      <label>Country / Flag<select class="country" data-path="${p}.country"><option value="">- no flag -</option>${COUNTRIES.map(([c, n]) => `<option value="${c}">${n}</option>`).join('')}</select></label>
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
    $('#urls').innerHTML = OVERLAYS.map(([n, f, view]) => {
      const suffix = view ? `?view=${view}` : '', url = `${location.origin}/overlays/${f}.html${suffix}`, open = `/overlays/${f}.html${suffix}`;
      return `<div class="urlrow"><div class="url"><b>${n}</b><code>${url}</code><button data-copy="${url}">Copy</button><button data-open="${open}">Open</button></div>
      <div class="swatches"><small>Theme</small>${(window.PP_THEMES || []).map((t) => `<button class="sw" data-theme="${t.id}" data-overlay="${f}" title="${t.name}" style="background:linear-gradient(135deg,${t.vars.bright} 0 50%,${t.vars.lime} 50% 100%)"></button>`).join('')}</div></div>`;
    }).join('');
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
    $$('#brView button').forEach((b) => b.classList.toggle('on', b.dataset.v === (draft.bracketView || 'full')));
    if (document.activeElement !== $('#brFullLink') && !$('#brFullLink').value && live.bracketFull) $('#brFullLink').value = live.bracketFull.link || '';
    if (document.activeElement !== $('#brTop8Link') && !$('#brTop8Link').value && live.bracketTop8) $('#brTop8Link').value = live.bracketTop8.link || ''; 
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
    } else if (t.closest('#brView')) {
      (async () => { const view = t.dataset.v; try { const r = await fetch('/bracket/view', { method:'POST', body:JSON.stringify({ view }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || 'Could not switch bracket'); brMsg(`Showing ${view === 'full' ? 'Full Bracket' : 'Top 8'} in the overlay.`); } catch (e) { brMsg(e.message, true); } })();
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
  async function importBracket(view) {
    const input = view === 'full' ? $('#brFullLink') : $('#brTop8Link');
    const button = view === 'full' ? $('#brFullUpdate') : $('#brTop8Update');
    brMsg(`Asking Start.gg for ${view === 'full' ? 'Full Bracket' : 'Top 8'}...`); button.disabled = true;
    try {
      const r = await fetch('/import/bracket', { method: 'POST', body: JSON.stringify({ link: input.value, view }) });
      const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Update failed');
      brMsg(`${view === 'full' ? 'Full Bracket' : 'Top 8'} updated at ${new Date(data.bracket.updated).toLocaleTimeString()} (${data.bracket.event || 'event'}, ${data.bracket.phase || 'bracket'}).`);
    } catch (e) { brMsg(e.message, true); }
    button.disabled = false;
  }
  $('#brFullUpdate').addEventListener('click', () => importBracket('full'));
  $('#brTop8Update').addEventListener('click', () => importBracket('top8'));
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

  // ---------- YouTube thumbnail generator ----------
  const thumbCanvas = $('#thumbCanvas'), thumbCtx = thumbCanvas.getContext('2d');
  let thumbBackgroundImage = null;
  const thumbMsg = (t, bad) => { $('#thumbMsg').textContent = t; $('#thumbMsg').style.color = bad ? '#ff9b8a' : ''; };
  function loadImage(url) {
    return new Promise((resolve) => { const im = new Image(); im.onload=()=>resolve(im); im.onerror=()=>resolve(null); im.src=url; });
  }
  async function drawImageFit(im, x, y, w, h, fit='contain') {
    if (!im) return;
    const scale = fit === 'cover' ? Math.max(w/im.width,h/im.height) : Math.min(w/im.width,h/im.height);
    const iw=im.width*scale, ih=im.height*scale;
    thumbCtx.drawImage(im,x+(w-iw)/2,y+(h-ih)/2,iw,ih);
  }
  function thumbFont() { return $('#thumbFont')?.value || 'Arial'; }
  function fitCanvasText(text, x, y, max, base, color, align='left', weight=900) {
    let size=base; thumbCtx.font=`${weight} ${size}px "${thumbFont()}"`; while(thumbCtx.measureText(text).width>max && size>18){size-=2;thumbCtx.font=`${weight} ${size}px "${thumbFont()}"`;}
    thumbCtx.textAlign=align; thumbCtx.lineJoin='round';
    const ow=Number($('#thumbTextOutlineWidth')?.value ?? 3), oc=$('#thumbTextOutlineColor')?.value || '#000000';
    if(ow>0){thumbCtx.lineWidth=ow;thumbCtx.strokeStyle=oc;thumbCtx.strokeText(text,x,y,max);}
    thumbCtx.fillStyle=color; thumbCtx.fillText(text,x,y,max);
  }
  function drawPlusPattern(v) {
    const ctx=thumbCtx; ctx.save(); ctx.globalAlpha=.13; ctx.fillStyle=v.lime;
    // Repeating Project+ style plus symbols, in several sizes and at a slight rotation.
    for(let y=35;y<760;y+=92) for(let x=25;x<1320;x+=105) {
      ctx.save(); ctx.translate(x,y); ctx.rotate(-Math.PI/8); const size=((Math.floor(x/105)+Math.floor(y/92))%3===0)?26:17, bar=Math.max(5,Math.round(size*.34));
      ctx.fillRect(-bar/2,-size/2,bar,size); ctx.fillRect(-size/2,-bar/2,size,bar); ctx.restore();
    }
    ctx.restore();
  }
  function drawThumbnailVS(centerX, centerY, width, color, style='brush') {
    const ctx=thumbCtx, scale=width/220;
    ctx.save(); ctx.translate(centerX,centerY); ctx.scale(scale,scale);
    ctx.lineJoin='miter'; ctx.lineCap='square'; ctx.textAlign='center'; ctx.textBaseline='middle';
    if (style === 'classic') {
      ctx.font='900 100px Impact, "Arial Black", sans-serif';
      ctx.lineWidth=5; ctx.strokeStyle='#111111'; ctx.strokeText('VS',0,2);
      ctx.fillStyle=color; ctx.fillText('VS',0,2);
      ctx.strokeStyle=color; ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-95,53); ctx.lineTo(91,-53); ctx.stroke();
    } else if (style === 'outline') {
      ctx.font='900 100px Impact, "Arial Black", sans-serif'; ctx.lineWidth=5; ctx.strokeStyle=color; ctx.strokeText('VS',0,0);
      ctx.lineWidth=2; ctx.beginPath(); ctx.moveTo(-112,58); ctx.lineTo(78,-54); ctx.stroke();
    } else if (style === 'minimal') {
      ctx.font='900 100px Impact, "Arial Black", sans-serif'; ctx.fillStyle=color; ctx.fillText('VS',0,0);
      ctx.strokeStyle=color; ctx.lineWidth=4; ctx.beginPath(); ctx.moveTo(-90,56); ctx.lineTo(83,-56); ctx.stroke();
    } else if (style === 'circle') {
      ctx.strokeStyle=color; ctx.lineWidth=8; ctx.beginPath(); ctx.arc(0,0,68,.22*Math.PI,1.16*Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,68,1.25*Math.PI,2.17*Math.PI); ctx.stroke();
      ctx.font='900 86px Impact, "Arial Black", sans-serif'; ctx.fillStyle=color; ctx.fillText('VS',0,1);
      ctx.strokeStyle=color; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(-92,55); ctx.lineTo(91,-55); ctx.stroke();
    } else {
      // Brush: tapered paint swashes behind bold, slightly angled lettering.
      ctx.fillStyle=color; ctx.globalAlpha=.22;
      ctx.beginPath(); ctx.moveTo(-112,-18); ctx.lineTo(-38,-54); ctx.lineTo(-69,-28); ctx.lineTo(4,-12); ctx.lineTo(-57,-4); ctx.lineTo(-103,10); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(110,8); ctx.lineTo(48,40); ctx.lineTo(70,17); ctx.lineTo(-4,5); ctx.lineTo(57,-8); ctx.lineTo(103,-17); ctx.closePath(); ctx.fill();
      ctx.globalAlpha=1; ctx.translate(0,3); ctx.rotate(-.09);
      ctx.font='900 100px Impact, "Arial Black", sans-serif'; ctx.lineWidth=2.5; ctx.strokeStyle=color; ctx.strokeText('VS',0,0); ctx.fillStyle=color; ctx.fillText('VS',0,0);
      ctx.globalAlpha=.85; ctx.lineWidth=2.2; ctx.strokeStyle=color;
      for (const s of [[-102,-46,-62,-35],[-115,-31,-79,-23],[-92,36,-54,28],[70,-32,108,-45],[78,26,112,16],[55,42,89,34]]) {ctx.beginPath();ctx.moveTo(s[0],s[1]);ctx.lineTo(s[2],s[3]);ctx.stroke();}
    }
    ctx.restore();
  }
  async function generateThumbnail() {
    const c=thumbCanvas, ctx=thumbCtx, themeId=$('#thumbTheme').value || 'green';
    const theme=(window.PP_THEMES||[]).find(t=>t.id===themeId) || (window.PP_THEMES||[])[0];
    const v=theme ? theme.vars : {ink:'#031008',deep:'#05361e',mid:'#07482a',bright:'#1ee27a',lime:'#8cff4f',mint:'#c8ffe3',muted:'#a9e8c6',card1:'#0b8f4e'};
    ctx.clearRect(0,0,1280,720);
    if (thumbBackgroundImage) {
      await drawImageFit(thumbBackgroundImage,0,0,1280,720,'cover');
      ctx.fillStyle='rgba(0,0,0,.42)'; ctx.fillRect(0,0,1280,720);
      // Subtle theme tint to preserve readability while keeping the uploaded background visible.
      ctx.fillStyle=v.deep; ctx.globalAlpha=.18; ctx.fillRect(0,0,1280,720); ctx.globalAlpha=1;
    } else {
      const bg=ctx.createLinearGradient(0,0,1280,720); bg.addColorStop(0,v.ink);bg.addColorStop(.55,v.deep);bg.addColorStop(1,v.card1);ctx.fillStyle=bg;ctx.fillRect(0,0,1280,720);
      drawPlusPattern(v);
    }
    ctx.fillStyle=v.lime;ctx.fillRect(0,0,1280,10);ctx.fillRect(0,710,1280,10);
    const title=$('#thumbTitle').value.trim() || 'Project+ Match'; fitCanvasText(title,640,68,1180,46,v.mint,'center',900);
    const players=draft.players||[];
    for(let i=0;i<2;i++){
      const p=players[i]||{}, left=i===0?55:675, cardW=550;
      // Borderless character art with user-adjustable size and placement.
      const artUrl=p.character?`/art/${p.character}/${p.alt||1}`:'';
      const art=artUrl?await loadImage(artUrl):null;
      const scale=(Number($('#thumbCharacterSize').value)||100)/100;
      const vertical=Number($('#thumbCharacterY').value)||88;
      const xOffset=Number($(i===0?'#thumbP1X':'#thumbP2X').value)||0;
      const artW=(cardW+10)*scale, artH=445*scale;
      if(art) await drawImageFit(art,left-5+xOffset+(cardW+10-artW)/2,vertical,artW,artH,'contain');
      const tag=(p.team||'').trim(), name=(p.name||'Player '+(i+1)).trim();
      if (p.country) { const flag=await loadImage('/flag/'+p.country); if(flag) { const fw=Number($('#thumbFlagSize').value)||44, fh=fw*29/44; thumbCtx.drawImage(flag,left+cardW/2-fw/2,510+(29-fh)/2,fw,fh); } }
      ctx.textAlign='center';ctx.fillStyle=v.lime;ctx.font=`800 24px "${thumbFont()}"`;ctx.lineJoin='round';const tagOW=Number($('#thumbTextOutlineWidth').value)||0;if(tagOW>0){ctx.lineWidth=tagOW;ctx.strokeStyle=$('#thumbTextOutlineColor').value||'#000000';ctx.strokeText(tag,left+cardW/2,558,cardW-34);}ctx.fillText(tag,left+cardW/2,558,cardW-34);
      const playerSize=Number($('#thumbPlayerNameSize').value)||40;
      const nameX=left+cardW/2+(Number($('#thumbP'+(i+1)+'NameX').value)||0); const nameY=Number($('#thumbP'+(i+1)+'NameY').value)||600;
      fitCanvasText(name,nameX,nameY,cardW-34,playerSize,'#ffffff','center',900);
      const charSize=Number($('#thumbCharacterNameSize').value)||19;
      ctx.fillStyle=v.muted;ctx.font=`700 ${charSize}px "${thumbFont()}"`;ctx.textAlign='center';ctx.lineJoin='round';const charText=p.character?(charOf(p.character)||{}).name||p.character:'PROJECT+';const charX=left+cardW/2+(Number($('#thumbP'+(i+1)+'CharX').value)||0),charY=Number($('#thumbP'+(i+1)+'CharY').value)||633,ow=Number($('#thumbTextOutlineWidth').value)||0;if(ow>0){ctx.lineWidth=ow;ctx.strokeStyle=$('#thumbTextOutlineColor').value||'#000000';ctx.strokeText(charText,charX,charY,cardW-30);}ctx.fillText(charText,charX,charY,cardW-30);
    }
    // Built-in simple brush-style VS logo with adjustable size, color, and position.
    drawThumbnailVS(640+(Number($('#thumbLogoX').value)||0), Number($('#thumbLogoY').value)||355,
      Number($('#thumbLogoSize').value)||220, $('#thumbLogoColor').value||'#ffffff', $('#thumbLogoStyle').value||'brush');
    thumbMsg('Thumbnail generated. Click Download PNG to save it.');
  }
  (window.PP_THEMES||[]).forEach(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=t.name;$('#thumbTheme').appendChild(o);});
  $('#thumbBackground').addEventListener('change', async (e)=>{
    const file=e.target.files && e.target.files[0];
    if(!file){thumbBackgroundImage=null;thumbMsg('Custom background cleared. The themed Plus-pattern background will be used.');return;}
    if(!/^image\/(png|jpeg|webp)$/.test(file.type)){thumbMsg('Choose a PNG, JPG or WebP image.',true);e.target.value='';return;}
    const url=URL.createObjectURL(file); thumbBackgroundImage=await loadImage(url); URL.revokeObjectURL(url);
    thumbMsg(thumbBackgroundImage?'Custom background loaded. Click Generate thumbnail to preview it.':'Could not load that image.',!thumbBackgroundImage);
  });
  const thumbSliders = [
    ['thumbLogoSize','thumbLogoSizeOut',v=>`${v} px wide`],
    ['thumbFlagSize','thumbFlagSizeOut',v=>`${v} px wide`],
    ['thumbTextOutlineWidth','thumbTextOutlineWidthOut',v=>`${v} px`],
    ['thumbLogoX','thumbLogoXOut',v=>`${v} px`], ['thumbLogoY','thumbLogoYOut',v=>`${v} px`],
    ['thumbCharacterSize','thumbCharacterSizeOut',v=>`${v}%`],
    ['thumbCharacterY','thumbCharacterYOut',v=>`${v} px`],
    ['thumbP1X','thumbP1XOut',v=>`${v} px`], ['thumbP2X','thumbP2XOut',v=>`${v} px`],
    ['thumbP1NameX','thumbP1NameXOut',v=>`${v} px`], ['thumbP1NameY','thumbP1NameYOut',v=>`${v} px`],
    ['thumbP2NameX','thumbP2NameXOut',v=>`${v} px`], ['thumbP2NameY','thumbP2NameYOut',v=>`${v} px`],
    ['thumbP1CharX','thumbP1CharXOut',v=>`${v} px`], ['thumbP1CharY','thumbP1CharYOut',v=>`${v} px`],
    ['thumbP2CharX','thumbP2CharXOut',v=>`${v} px`], ['thumbP2CharY','thumbP2CharYOut',v=>`${v} px`],
    ['thumbPlayerNameSize','thumbPlayerNameSizeOut',v=>`${v} px`],
    ['thumbCharacterNameSize','thumbCharacterNameSizeOut',v=>`${v} px`]
  ];
  $('#thumbLogoColor').addEventListener('input',e=>$('#thumbLogoColorOut').textContent=e.target.value);
  $('#thumbTextOutlineColor').addEventListener('input',e=>$('#thumbTextOutlineColorOut').textContent=e.target.value);
  thumbSliders.forEach(([id,out,fmt])=>{
    const input=$('#'+id), output=$('#'+out); if(!input||!output)return;
    const update=()=>{output.textContent=fmt(input.value);}; update();
    input.addEventListener('input',update);
  });
  const thumbDefaultValues = {
    thumbTheme:'green', thumbFont:'Arial', thumbTitle:'Project+ Match', thumbLogoStyle:'brush', thumbLogoSize:220, thumbLogoColor:'#ffffff', thumbLogoX:0, thumbLogoY:355, thumbFlagSize:44, thumbTextOutlineColor:'#000000', thumbTextOutlineWidth:3,
    thumbCharacterSize:100, thumbCharacterY:88, thumbP1X:0, thumbP2X:0,
    thumbP1NameX:0, thumbP1NameY:130, thumbP2NameX:0, thumbP2NameY:130,
    thumbCharacterNameSize:19, thumbP1CharX:0, thumbP1CharY:170, thumbP2CharX:0, thumbP2CharY:170, thumbPlayerNameSize:40
  };
  $('#thumbToggleLayout').addEventListener('click',()=>{
    const box=$('#thumbLayoutControls'), hidden=box.style.display==='none';
    box.style.display=hidden?'':'none'; $('#thumbToggleLayout').textContent=hidden?'Hide layout controls':'Show layout controls';
    $('#thumbToggleLayout').setAttribute('aria-expanded',String(hidden));
  });
  const thumbProfileIds = [...Object.keys(thumbDefaultValues), 'thumbFlagSize', 'thumbTextOutlineColor', 'thumbTextOutlineWidth'];
  function collectThumbProfile(){const obj={};thumbProfileIds.forEach(id=>{const el=$('#'+id);if(el)obj[id]=el.value;});return obj;}
  function applyThumbProfile(obj){if(!obj)return false;Object.entries(obj).forEach(([id,value])=>{const el=$('#'+id);if(el)el.value=String(value);});thumbSliders.forEach(([id,out,fmt])=>{const input=$('#'+id),output=$('#'+out);if(input&&output)output.textContent=fmt(input.value);});$('#thumbLogoColorOut').textContent=$('#thumbLogoColor').value;$('#thumbTextOutlineColorOut').textContent=$('#thumbTextOutlineColor').value;return true;}
  $('#thumbSaveProfile').addEventListener('click',()=>{try{const slot=$('#thumbProfileSlot').value;const profiles=JSON.parse(localStorage.getItem('ppThumbnailProfiles')||'{}');profiles[slot]=collectThumbProfile();localStorage.setItem('ppThumbnailProfiles',JSON.stringify(profiles));thumbMsg(`Saved current thumbnail layout to Profile ${slot}.`);}catch(e){thumbMsg('Could not save profile: '+e.message,true);}});
  $('#thumbLoadProfile').addEventListener('click',()=>{try{const slot=$('#thumbProfileSlot').value;const profiles=JSON.parse(localStorage.getItem('ppThumbnailProfiles')||'{}');if(!profiles[slot]){thumbMsg(`Profile ${slot} is empty. Save a layout to it first.`,true);return;}applyThumbProfile(profiles[slot]);generateThumbnail().catch(e=>thumbMsg('Could not generate thumbnail: '+e.message,true));thumbMsg(`Loaded thumbnail layout Profile ${slot}.`);}catch(e){thumbMsg('Could not load profile: '+e.message,true);}});
  $('#thumbReset').addEventListener('click',()=>{
    Object.entries(thumbDefaultValues).forEach(([id,value])=>{const el=$('#'+id);if(el)el.value=String(value);});
    $('#thumbBackground').value=''; thumbBackgroundImage=null;
    $('#thumbLogoColorOut').textContent='#ffffff'; $('#thumbTextOutlineColorOut').textContent='#000000';
    thumbSliders.forEach(([id,out,fmt])=>{const input=$('#'+id),output=$('#'+out);if(input&&output)output.textContent=fmt(input.value);});
    thumbMsg('Thumbnail settings returned to default. Custom background cleared. Generate the thumbnail to preview.');
    generateThumbnail().catch(e=>thumbMsg('Could not generate thumbnail: '+e.message,true));
  });
  $('#thumbGenerate').addEventListener('click',()=>generateThumbnail().catch(e=>thumbMsg('Could not generate thumbnail: '+e.message,true)));
  $('#thumbDownload').addEventListener('click',()=>{try{const a=document.createElement('a');a.download='project-plus-thumbnail.png';a.href=thumbCanvas.toDataURL('image/png');a.click();}catch(e){thumbMsg('Generate the thumbnail first, then try downloading again.',true);}});

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
      draft.bracket = live.bracket; draft.bracketFull = live.bracketFull; draft.bracketTop8 = live.bracketTop8; draft.bracketView = live.bracketView; draft.logo = live.logo;   // changed by their own buttons, never part of "unsent changes"
      if (!wasDirty) { draft = clone(live); }
      syncControls();
      refreshDirty(); status(true);
    });
    es.onerror = () => status(false);
  }
  init();
})();
