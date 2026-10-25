// Colour themes of the overlays. Every overlay can use any of them (chosen on the panel's Overlays tab).
// A theme is a base hue (h), an accent hue (a) and a saturation factor (s); "green" keeps the original hand-picked colours.
(function () {
  function hsl(h, s, l) {
    s /= 100; l /= 100;
    const k = (n) => (n + h / 30) % 12, f = (n) => l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [Math.round(255 * f(0)), Math.round(255 * f(8)), Math.round(255 * f(4))];
  }
  const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
  const GREEN = { ink: '#031008', deep: '#05361e', mid: '#07482a', mid2: '#0a6b3a', card1: '#0b8f4e', card2: '#03200f', green: '#0c9b55', bright: '#1ee27a',
    lime: '#8cff4f', acc2: '#b6ff7a', limepale: '#e9ffd0', mint: '#c8ffe3', muted: '#a9e8c6', bg1: '#10b866', bg2: '#0a8a4b', plus1: '#14e0b4', plus2: '#3cff4a' };

  function make(h, a, s) {
    const c = (hh, ss, ll) => hsl(hh, Math.min(100, ss * s), ll);
    return { ink: c(h, 75, 3), deep: c(h, 84, 12), mid: c(h, 82, 16), mid2: c(h, 84, 23), card1: c(h, 85, 31), card2: c(h, 85, 7), green: c(h, 86, 33),
      bright: c(h, 77, 51), lime: c(a, 100, 65), acc2: c(a, 100, 74), limepale: c(a, 100, 91), mint: c(h, 100, 89), muted: c(h, 63, 77),
      bg1: c(h, 84, 40), bg2: c(h, 87, 30), plus1: c(h + 20, 84, 48), plus2: c(a, 100, 62) };
  }
  const defs = [
    ['green', 'Green', null], ['teal', 'Teal', [176, 140, 1]], ['blue', 'Blue', [215, 180, 1]], ['purple', 'Purple', [268, 305, 1]],
    ['pink', 'Pink', [322, 48, 1]], ['red', 'Red', [356, 42, 1]], ['orange', 'Orange', [24, 54, 1]], ['gold', 'Gold', [46, 68, 1]], ['steel', 'Steel', [212, 190, .28]],
  ];
  const themes = defs.map(([id, name, p]) => {
    const vars = p ? make(p[0], p[1], p[2]) : null;
    const out = {};
    for (const k of Object.keys(GREEN)) out[k] = vars ? hex(vars[k]) : GREEN[k];
    return { id, name, vars: out };
  });

  const rgbOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)].join(',');
  window.PP_THEMES = themes;
  window.PP_applyTheme = function (id) {
    const t = themes.find((x) => x.id === id) || themes[0], root = document.documentElement;
    for (const [k, v] of Object.entries(t.vars)) root.style.setProperty('--' + k, v);
    for (const k of ['ink', 'deep', 'lime', 'mint']) root.style.setProperty('--' + k + '-rgb', rgbOf(t.vars[k]));
  };
})();
