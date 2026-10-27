// Tests for the pure logic: legibility meter and draft colour-name compatibility.
// The pure functions live between /*PURE:APP:START*/ and /*PURE:APP:END*/ in index.html.
const fs = require('fs');
const html = fs.readFileSync(process.env.APP_HTML || '../index.html', 'utf8');
const block = html.split('/*PURE:APP:START*/')[1].split('/*PURE:APP:END*/')[0];
const api = new Function(`
  const FORMATS = { reel: 1, carousel: 1, square: 1 };   // defined outside the pure block in the app
  const MAX_PAGES = 10;
` + block + `
  return { relLuminance, contrastRatio, hexToRgb, scaleRects, legibilityLevel, lowContrastShare,
           analyzeLegibility, legibilityTip, sanitizeDraft, LEG_SCALE };`)();

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FAILED:', msg); } }
function near(a, b, eps, msg) { ok(Math.abs(a - b) <= eps, `${msg} (got ${a}, expected ${b})`); }

// RGBA image w×h, colour by position (fx, fy = 0..1)
function img(w, h, colorAt) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = colorAt(x / w, y / h), i = (y * w + x) * 4;
    d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  return d;
}
const W = [255, 255, 255], K = [0, 0, 0];

// --- contrast and luminance
near(api.relLuminance(255, 255, 255), 1, 1e-9, 'white luminance');
near(api.relLuminance(0, 0, 0), 0, 1e-9, 'black luminance');
near(api.contrastRatio(1, 0), 21, 1e-9, 'black/white = 21:1');
const orange = api.relLuminance(...api.hexToRgb('#C8601A')), cream = api.relLuminance(...api.hexToRgb('#EDE5D8'));
near(api.contrastRatio(orange, cream), 3.27, 0.02, 'cream on orange (design system value)');
ok(JSON.stringify(api.hexToRgb('#1C1B17')) === '[28,27,23]', 'hexToRgb');

// --- levels
ok(api.legibilityLevel(0) === 'good' && api.legibilityLevel(0.10) === 'good', 'up to 10% = good');
ok(api.legibilityLevel(0.1001) === 'fair' && api.legibilityLevel(0.35) === 'fair', '10–35% = fair');
ok(api.legibilityLevel(0.3501) === 'poor' && api.legibilityLevel(1) === 'poor', 'above 35% = poor');

// --- share of pixels below the minimum
const R = [{ x: 0, y: 0, w: 10, h: 10 }];
ok(api.lowContrastShare(img(10, 10, () => W), 10, 10, R, W, 1, 3) === 1, 'white on white: everything fails');
ok(api.lowContrastShare(img(10, 10, () => K), 10, 10, R, W, 1, 3) === 0, 'white on black: nothing fails');
near(api.lowContrastShare(img(10, 10, (fx) => fx < 0.5 ? W : K), 10, 10, R, W, 1, 3), 0.5, 1e-9, 'half light, half dark = 50%');
// opacity: 70% white on mid grey is below 4.5:1, while full white on black passes
ok(api.lowContrastShare(img(10, 10, () => [128, 128, 128]), 10, 10, R, W, 0.7, 4.5) === 1, 'translucent text on mid grey fails');
ok(api.lowContrastShare(img(10, 10, () => K), 10, 10, R, W, 0.7, 4.5) === 0, 'translucent text on black passes');
// clipping: an area partly outside is clipped; fully outside counts for nothing
ok(api.lowContrastShare(img(10, 10, () => W), 10, 10, [{ x: 5, y: 5, w: 100, h: 100 }], W, 1, 3) === 1, 'area leaving the canvas is clipped');
ok(api.lowContrastShare(img(10, 10, () => W), 10, 10, [{ x: 50, y: 50, w: 5, h: 5 }], W, 1, 3) === null, 'area outside the canvas = nothing to measure');
ok(api.lowContrastShare(img(10, 10, () => W), 10, 10, [], W, 1, 3) === null, 'no areas = nothing to measure');

// --- the worst element wins; elements without areas are ignored
const data = img(10, 10, (fx, fy) => fy < 0.5 ? W : K);           // top half white, bottom half black
const top = [{ x: 0, y: 0, w: 10, h: 4 }], bottom = [{ x: 0, y: 6, w: 10, h: 4 }];
let res = api.analyzeLegibility(data, 10, 10, [
  { key: 'label', rects: bottom, rgb: W, alpha: 1, min: 3 },
  { key: 'cta', rects: top, rgb: W, alpha: 0.7, min: 4.5 },
  { key: 'context', rects: [], rgb: W, alpha: 1, min: 4.5 },
]);
ok(res.key === 'cta' && res.level === 'poor' && res.share === 1, 'the footer over the light area is the worst');
res = api.analyzeLegibility(data, 10, 10, [{ key: 'label', rects: bottom, rgb: W, alpha: 1, min: 3 }]);
ok(res.level === 'good' && res.share === 0, 'label only, over the dark area = good');
ok(api.analyzeLegibility(data, 10, 10, [{ key: 'label', rects: [], rgb: W, alpha: 1, min: 3 }]) === null, 'nothing to measure = null');

// --- area scaling
const s = api.scaleRects([{ x: 60, y: 120, w: 600, h: 30 }], api.LEG_SCALE)[0];
near(s.x, 10, 1e-9, 'scale x'); near(s.y, 20, 1e-9, 'scale y'); near(s.w, 100, 1e-9, 'scale w'); near(s.h, 5, 1e-9, 'scale h');

// --- tips
const base = { bgMode: 'photo', boxStyle: 'none', overlayOpacity: 45, overlayTextLum: 0.8, share: 1, alt: { name: 'black', share: 0 } };
ok(api.legibilityTip(base) === 'Experimenta Preto', 'no box, black is much better -> Preto');
ok(api.legibilityTip({ ...base, alt: { name: 'white', share: 0 } }) === 'Experimenta Branco', 'no box, white is much better -> Branco');
ok(api.legibilityTip({ ...base, alt: { name: 'white', share: 0.9 } }) === 'Experimenta o Overlay', 'the alternative does not help enough -> Overlay');
ok(api.legibilityTip({ ...base, alt: { name: 'white', share: 0.85 } }) === 'Experimenta Branco', 'exactly 0.15 better still counts');
ok(api.legibilityTip({ ...base, alt: null }) === 'Experimenta o Overlay', 'no alternative -> Overlay');
ok(api.legibilityTip({ ...base, boxStyle: 'solid' }) === 'Experimenta o Overlay', 'with a box (footer only) -> Overlay');
ok(api.legibilityTip({ ...base, bgMode: 'overlay' }) === 'Sobe a opacidade do overlay', 'overlay with light text -> raise the opacity');
ok(api.legibilityTip({ ...base, bgMode: 'overlay', overlayOpacity: 90 }) === null, 'overlay already at the maximum -> no tip');
ok(api.legibilityTip({ ...base, bgMode: 'overlay', overlayTextLum: 0.02 }) === 'Experimenta uma cor de texto clara', 'overlay with dark text -> light text');

// --- draft: box style and the text colour with no box
const NAMES0 = ['accent', 'secondary', 'light', 'base', 'text'];
const dr = (extra) => ({ version: 1, pages: [{ labelText: 'x', contextText: '', ctaText: '', textScale: 1 }], ...extra });
ok(api.sanitizeDraft(dr({ boxStyle: 'solid' }), NAMES0).boxStyle === 'solid', 'boxStyle solid is kept');
ok(api.sanitizeDraft(dr({ boxStyle: 'none' }), NAMES0).boxStyle === 'none', 'boxStyle none is kept');
ok(api.sanitizeDraft(dr({ boxStyle: 'paper' }), NAMES0).boxStyle === 'solid', 'the removed "paper" style falls back to solid');
ok(api.sanitizeDraft(dr({ boxStyle: 'nonsense' }), NAMES0).boxStyle === 'solid', 'unknown box style falls back to solid');
for (const v of ['white', 'black', 'accent', 'secondary', 'light', 'base', 'text'])
  ok(api.sanitizeDraft(dr({ noBoxColor: v }), NAMES0).noBoxColor === v, 'noBoxColor accepts ' + v);
ok(api.sanitizeDraft(dr({ noBoxColor: 'acento' }), NAMES0).noBoxColor === 'accent', 'noBoxColor maps an old Portuguese role name');
ok(api.sanitizeDraft(dr({ noBoxColor: '#ff0000' }), NAMES0).noBoxColor === 'white', 'noBoxColor rejects a raw hex');
ok(api.sanitizeDraft(dr({ noBoxColor: 'constructor' }), NAMES0).noBoxColor === 'white', 'noBoxColor rejects prototype keys');
ok(api.sanitizeDraft(dr({ noBoxColor: 7 }), NAMES0).noBoxColor === 'white', 'noBoxColor rejects non-strings');
ok(api.sanitizeDraft(dr({}), NAMES0).noBoxColor === 'white', 'noBoxColor defaults to white');

// --- draft colour names: English now, old Portuguese names still accepted
const NAMES = ['accent', 'secondary', 'light', 'base', 'text'];
const draft = (extra) => ({ version: 1, pages: [{ labelText: 'x', contextText: '', ctaText: '', textScale: 1 }], ...extra });
let d = api.sanitizeDraft(draft({ accent: 'secondary', bgColor: 'light', textColor: 'base', overlayTextColor: 'text' }), NAMES);
ok(d.accent === 'secondary' && d.bgColor === 'light' && d.textColor === 'base' && d.overlayTextColor === 'text', 'English names are kept');
d = api.sanitizeDraft(draft({ accent: 'secundaria', bgColor: 'clara', textColor: 'base', overlayTextColor: 'texto' }), NAMES);
ok(d.accent === 'secondary' && d.bgColor === 'light' && d.textColor === 'base' && d.overlayTextColor === 'text', 'old Portuguese names are mapped');
d = api.sanitizeDraft(draft({ accent: 'acento', bgColor: 'texto' }), NAMES);
ok(d.accent === 'accent' && d.bgColor === 'text', 'acento/texto are mapped');
d = api.sanitizeDraft(draft({ accent: 'constructor', bgColor: '__proto__', textColor: 42, overlayTextColor: null }), NAMES);
ok(d.accent === 'accent' && d.bgColor === 'text' && d.textColor === 'base' && d.overlayTextColor === 'text', 'unknown names fall back to the defaults');

console.log(`${passes} ok, ${fails} failed`);
process.exit(fails ? 1 : 0);
