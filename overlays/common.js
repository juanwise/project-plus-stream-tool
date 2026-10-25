// Shared helpers for the overlays: live state, art lookup and small animations (no libraries needed).
(function () {
  const listeners = [];
  let current = null;

  window.PP = {
    onState(fn) { listeners.push(fn); if (current) fn(current, null); },
    art: (code, alt) => (code ? `/art/${code}/${alt || 1}` : ''),
    icon: (code, alt) => (code ? `/icon/${code}/${alt || 1}` : ''),
    characters: [],
    charName(code) { const c = this.characters.find((x) => x.code === code); return c ? c.name : ''; },
    same: (a, b) => JSON.stringify(a) === JSON.stringify(b),

    // Round shown on the overlays: the panel's text, "Grand Finals Reset" once the bracket reset is on.
    roundLabel(s) {
      if (s.grandFinals && s.grandFinals.on && s.grandFinals.reset) return 'Grand Finals Reset';
      return s.round || '';
    },
    firstTo: (s) => (s.bestOf === 5 ? 3 : 2),

    // Web Animations helper: PP.anim(el, [{...},{...}], {duration, delay})
    anim(el, frames, opts) {
      if (!el) return null;
      return el.animate(frames, Object.assign({ duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }, opts));
    },
    slideIn(el, from, delay) {
      const t = { left: 'translateX(-120px)', right: 'translateX(120px)', up: 'translateY(60px)', down: 'translateY(-60px)' }[from || 'up'];
      return this.anim(el, [{ opacity: 0, transform: t }, { opacity: 1, transform: 'none' }], { delay: delay || 0 });
    },
    pulse(el) {
      return this.anim(el, [{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: .35 }, { transform: 'scale(1)' }], { duration: 450, fill: 'none' });
    },
    // Plain text, or image src, only touched when it changed so animations don't restart.
    setText(el, text) { if (el && el.textContent !== text) el.textContent = text; },
    setImg(el, src) {
      if (!el) return;
      if (!src) { el.removeAttribute('src'); el.style.visibility = 'hidden'; return; }
      el.style.visibility = 'visible';
      if (el.getAttribute('src') !== src) el.setAttribute('src', src);
    },
    // "Team | Name" style label
    plusSvg(size, extra) {
      return `<svg class="plus-mark" width="${size}" height="${size}" viewBox="0 0 100 100" ${extra || ''}>
        <defs><linearGradient id="ppg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14e0b4"/><stop offset="1" stop-color="#3cff4a"/></linearGradient></defs>
        <path d="M34 4h32v30h30v32H66v30H34V66H4V34h30z" fill="url(#ppg)" stroke="#031008" stroke-width="7" stroke-linejoin="round"/>
        <path d="M38 12h24v30h30v16H62v30H38V58H8V42h30z" fill="none" stroke="#e9fff3" stroke-opacity=".55" stroke-width="2" stroke-linejoin="round"/></svg>`;
    },
  };

  // The overlays are drawn on a 1920x1080 stage. Scale it to fit whatever size the OBS browser source has
  // (default 800x600, or any canvas), so nothing is cut off.
  function fitStage() {
    const w = window.innerWidth || 1920, h = window.innerHeight || 1080;
    const k = Math.min(w / 1920, h / 1080);
    const b = document.body;
    b.style.transformOrigin = '0 0';
    b.style.transform = k === 1 ? '' : `translate(${(w - 1920 * k) / 2}px, ${(h - 1080 * k) / 2}px) scale(${k})`;
  }
  document.documentElement.style.cssText = 'overflow:hidden;background:transparent';
  window.addEventListener('resize', fitStage);
  document.addEventListener('DOMContentLoaded', fitStage);
  fitStage();

  // Shrinks a single-line text until it fits maxWidth (px), never below minPx.
  PP.fitText = function (el, maxWidth, basePx, minPx) {
    const prevWidth = el.style.width;
    el.style.width = 'max-content';          // measure the text itself, not the box it sits in
    el.style.fontSize = basePx + 'px';
    let size = basePx;
    while (el.offsetWidth > maxWidth && size > minPx) { size -= 1; el.style.fontSize = size + 'px'; }
    el.style.width = prevWidth;
  };

  function connect() {
    const es = new EventSource('/events');
    es.addEventListener('state', (e) => {
      const next = JSON.parse(e.data);
      const prev = current;
      current = next;
      listeners.forEach((fn) => fn(next, prev));
    });
  }

  fetch('/characters').then((r) => r.json()).then((c) => { PP.characters = c; }).catch(() => {}).finally(connect);
})();
