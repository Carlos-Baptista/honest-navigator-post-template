// Boots the whole app in jsdom with a simulated canvas, to check the legibility meter is wired up,
// the tabs work, and drafts saved with the old Portuguese colour names still load.
// Limit: the simulated canvas only knows "photo = colour by height" and "black rectangle with opacity".
// It is not a browser: it does not validate CSS, layout, Safari or performance.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.env.APP_HTML || '../index.html', 'utf8');

function boot(preDraft) {
  const errors = [], stats = { legReads: 0 };
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/',
    beforeParse(win) {
      if (preDraft) win.localStorage.setItem('editorCapasDraft', JSON.stringify(preDraft));
      win.__bgFn = () => [255, 255, 255];           // "photo" colour by height (0..1)
      const ctxs = new WeakMap();
      win.HTMLCanvasElement.prototype.getContext = function () {
        if (ctxs.has(this)) return ctxs.get(this);
        const canvas = this, store = { textBaseline: 'alphabetic', textAlign: 'left', globalAlpha: 1, dark: 0 };
        const c = new Proxy(store, {
          get(t, p) {
            if (p === 'canvas') return canvas;
            if (p === 'measureText') return (s) => ({ width: String(s).length * 14 });
            if (p === 'drawImage') return () => { t.dark = 0; };            // new photo: clears the overlay
            if (p === 'fillText') return (str, x, y) => { (win.__texts || (win.__texts = [])).push({ s: str, x, y }); };
            if (p === 'fillRect') return (x, y, w, h) => { (win.__rects || (win.__rects = [])).push({ fill: t.fillStyle, x, y, w, h }); if (t.fillStyle === '#000000' && w >= canvas.width) t.dark = 1 - (1 - t.dark) * (1 - t.globalAlpha); };
            if (p === 'getImageData') return (x, y, w, h) => {
              if (canvas.__small) stats.legReads++;
              const d = new Uint8ClampedArray(w * h * 4);
              for (let py = 0; py < h; py++) {
                const col = win.__bgFn(py / h).map((v) => v * (1 - t.dark));
                for (let px = 0; px < w; px++) { const i = (py * w + px) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; }
              }
              return { data: d, width: w, height: h };
            };
            if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
            if (p === 'createPattern') return () => ({});
            if (p in t) return t[p];
            return () => {};
          },
          set(t, p, v) { t[p] = v; return true; },
        });
        ctxs.set(this, c);
        return c;
      };
      const origCreate = win.document.createElement.bind(win.document);
      win.document.createElement = (tag) => { const el = origCreate(tag); if (tag === 'canvas') el.__small = true; return el; };
      win.FontFace = class { constructor(n) { this.family = n; } load() { return Promise.resolve(this); } };
      Object.defineProperty(win.document, 'fonts', { value: { add() {}, delete() {}, load: () => Promise.resolve([]), ready: Promise.resolve() } });
      win.URL.createObjectURL = () => 'blob:x'; win.URL.revokeObjectURL = () => {};
      win.addEventListener('error', (e) => errors.push(e.message));
    },
  });
  return { win: dom.window, doc: dom.window.document, errors, stats };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FAILED:', msg); } }

(async () => {
  // ---------- legacy draft: old Portuguese colour names ----------
  {
    const { win, errors } = boot({
      version: 1, pages: [{ labelText: 'hello', contextText: '', ctaText: '', textScale: 1 }], currentPage: 0,
      accent: 'secundaria', bgColor: 'clara', textColor: 'base', overlayTextColor: 'texto',
    });
    await sleep(100);
    ok(errors.length === 0, 'legacy draft: boots without errors: ' + errors.join(' | '));
    ok(win.eval('state.accent.name') === 'secondary' && win.eval('state.bgColor.name') === 'light'
       && win.eval('state.overlayTextColor.name') === 'text', 'legacy draft: old names restored as the English roles');
    ok(win.document.getElementById('labelText').value === 'hello', 'legacy draft: text restored');
    win.close();
  }

  // ---------- old draft that used the removed "Papel" style, and a brand colour for the text with no box ----------
  {
    const { win, doc, errors } = boot({
      version: 1, pages: [{ labelText: 'hello', contextText: '', ctaText: '', textScale: 1 }], currentPage: 0,
      boxStyle: 'paper', noBoxColor: 'secondary',
    });
    await sleep(100);
    ok(errors.length === 0, 'paper draft: boots without errors: ' + errors.join(' | '));
    ok(win.eval('state.boxStyle') === 'solid', 'paper draft: falls back to the solid box');
    ok(doc.querySelector('#styleSeg button[data-style="solid"]').classList.contains('active'), 'paper draft: the Solid button is the active one');
    ok(win.eval('state.noBoxColor') === 'secondary', 'paper draft: the brand colour for no-box text is restored');
    const sw = [...doc.querySelectorAll('#swatchesNoBox .swatch')];
    ok(sw.length === 7 && sw.findIndex((e) => e.classList.contains('active')) === 3, 'paper draft: the matching swatch is the active one (index ' + sw.findIndex((e) => e.classList.contains('active')) + ')');
    win.close();
  }

  // ---------- main flow ----------
  const { win, doc, errors, stats } = boot(null);
  const $ = (s) => doc.querySelector(s);
  const click = (s) => $(s).click();
  const $$ = (s) => [...doc.querySelectorAll(s)];
  function type(id, v) { const el = doc.getElementById(id); el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); }
  const meter = () => ({
    visible: !$('#legibility').classList.contains('section-hidden'),
    level: $('#legibilityRow').dataset.level, text: $('#legText').textContent.trim(),
    tipVisible: !$('#legTip').classList.contains('section-hidden'), tip: $('#legTip').textContent.trim(),
  });

  await sleep(100);
  ok(errors.length === 0, 'boots without errors: ' + errors.join(' | '));
  ok(!meter().visible, 'meter hidden at startup');
  ok(win.eval('state.accent.name') === 'accent' && win.eval('PALETTE.map(p => p.name).join()') === 'accent,secondary,light,base,text', 'palette roles are in English');

  // the "Papel" style is gone; the text colour for "Sem caixa" is a row of swatches
  ok(!$('#styleSeg button[data-style="paper"]') && $$('#styleSeg button').length === 2, 'style buttons: only Solid and None');
  const noBoxSw = () => [...doc.querySelectorAll('#swatchesNoBox .swatch')];
  ok(noBoxSw().length === 7, 'no-box colour: 7 swatches (white, black + 5 brand colours): ' + noBoxSw().length);
  ok(noBoxSw().map((e) => e.style.background).slice(0, 2).join() !== '' && noBoxSw().findIndex((e) => e.classList.contains('active')) === 0, 'no-box colour: white is the default');
  ok(!$$('#noBoxColorSeg').length, 'the old Branco/Preto control is gone');

  // tabs
  const shown = (id) => !doc.getElementById(id).classList.contains('section-hidden');
  ok(shown('tabText') && !shown('tabStyle') && !shown('tabPosition'), 'tabs: Text is shown at startup');
  click('#tabBar button[data-tab="style"]');
  ok(!shown('tabText') && shown('tabStyle') && !shown('tabPosition') && $('#tabBar button[data-tab="style"]').classList.contains('active'), 'tabs: Style');
  click('#tabBar button[data-tab="position"]');
  ok(!shown('tabText') && !shown('tabStyle') && shown('tabPosition'), 'tabs: Position');
  click('#tabBar button[data-tab="text"]');
  ok(shown('tabText') && !shown('tabStyle') && !shown('tabPosition'), 'tabs: back to Text');

  // load a "photo" on the current page, text in the label, "Sem caixa" in white
  win.eval('state.pages[0].img = ({width:1080,height:1920})');
  click('#styleSeg button[data-style="none"]');
  type('labelText', 'Quem nunca desliga');
  type('contextText', 'não é cansaço físico');

  // A) white photo, white text -> poor, and black would be better
  win.__bgFn = () => [255, 255, 255];
  type('labelText', 'Quem nunca desliga'); await sleep(320);
  let m = meter();
  ok(m.visible && m.level === 'poor', 'A: white photo with white text = poor (' + JSON.stringify(m) + ')');
  ok(/fraca/.test(m.text) && /rótulo/.test(m.text), 'A: names the label: ' + m.text);
  ok(m.tipVisible && m.tip === 'Experimenta Preto', 'A: suggests black: ' + m.tip);

  // B) black photo, white text -> good, no tip
  win.__bgFn = () => [0, 0, 0];
  type('labelText', 'Quem nunca desliga!'); await sleep(320);
  m = meter();
  ok(m.visible && m.level === 'good' && m.text === 'Legibilidade: boa' && !m.tipVisible, 'B: black photo with white text = good, no tip (' + JSON.stringify(m) + ')');

  // C) the measured area follows the position: light top, dark rest
  win.__bgFn = (fy) => fy < 0.3 ? [255, 255, 255] : [0, 0, 0];
  click('#posGrid button[data-pos="top-center"]'); await sleep(320);
  ok(meter().level === 'poor', 'C: text at the top (light area) = poor: ' + meter().text);
  click('#posGrid button[data-pos="bottom-center"]'); await sleep(320);
  ok(meter().level === 'good', 'C: text at the bottom (dark area) = good: ' + meter().text);

  // D) the footer always counts: light photo at the bottom, label on a dark area at the top
  win.__bgFn = (fy) => fy < 0.5 ? [0, 0, 0] : [255, 255, 255];
  click('#posGrid button[data-pos="top-center"]');
  type('ctaText', 'manda isto a quem também não desliga'); await sleep(320);
  m = meter();
  ok(m.level === 'poor' && /rodapé/.test(m.text), 'D: footer over a light area = poor, names the footer: ' + m.text);
  type('ctaText', ''); await sleep(320);
  ok(meter().level === 'good', 'D: without a footer, the rest is on a dark area = good');

  // E) with a box, label and context sit on the box: only the footer counts
  win.__bgFn = () => [255, 255, 255];
  click('#styleSeg button[data-style="solid"]'); await sleep(320);
  ok(!meter().visible, 'E: with a box and no footer there is nothing to measure');
  type('ctaText', 'rodapé'); await sleep(320);
  m = meter();
  ok(m.visible && /rodapé/.test(m.text) && m.tip === 'Experimenta o Overlay', 'E: with a box only the footer counts: ' + JSON.stringify(m));

  // F) overlay: white photo with a 45% overlay is not enough for small text; the tip says to raise the opacity
  click('#bgSeg button[data-bg="overlay"]'); await sleep(320);
  m = meter();
  ok(m.visible && m.level === 'poor' && m.tip === 'Sobe a opacidade do overlay', 'F: overlay 45% over white = poor, raise the opacity: ' + JSON.stringify(m));
  const slider = doc.getElementById('overlayOpacitySlider'); slider.value = 90; slider.dispatchEvent(new win.Event('input', { bubbles: true })); await sleep(320);
  ok(meter().level === 'good', 'F: overlay at 90% = good: ' + meter().text);

  // G) solid hides the meter
  click('#bgSeg button[data-bg="solid"]'); await sleep(320);
  ok(!meter().visible, 'G: solid background hides the meter');
  click('#bgSeg button[data-bg="photo"]'); await sleep(320);
  ok(meter().visible, 'G: going back to Photo shows it again');

  // H) debounce: 30 consecutive draws = a single analysis
  stats.legReads = 0;
  for (let i = 0; i < 30; i++) win.eval('draw()');
  await sleep(350);
  ok(stats.legReads === 1, 'H: 30 consecutive draw() = 1 analysis (got ' + stats.legReads + ')');

  // I) photo released before the analysis: does not blow up, hides
  win.eval('draw()'); win.eval('state.pages[0].img.width = 0'); win.eval('state.pages[0].img.height = 0'); await sleep(320);
  ok(!meter().visible && errors.length === 0, 'I: a released photo hides the meter without errors');
  win.eval('state.pages[0].img.width = 1080; state.pages[0].img.height = 1920');

  // K) text opacity counts: over dark grey, full white passes, but context (0.82) and footer (0.7) do not
  win.__bgFn = () => [110, 110, 110];
  click('#styleSeg button[data-style="none"]');
  type('labelText', 'Rótulo'); type('contextText', ''); type('ctaText', ''); await sleep(320);
  ok(meter().level === 'good', 'K: label only (opacity 1) over dark grey = good: ' + meter().text);
  type('labelText', ''); type('contextText', 'contexto'); await sleep(320);
  m = meter();
  ok(m.level === 'poor' && /contexto/.test(m.text), 'K: context only (opacity 0.82) = poor: ' + JSON.stringify(m));
  type('contextText', ''); type('ctaText', 'rodapé'); await sleep(320);
  m = meter();
  ok(m.level === 'poor' && /rodapé/.test(m.text), 'K: footer only (opacity 0.7) = poor: ' + JSON.stringify(m));
  type('labelText', 'Rótulo'); type('contextText', 'contexto'); type('ctaText', 'rodapé');

  // L) brand colours for the text with no box
  click('#styleSeg button[data-style="none"]');
  type('labelText', 'Rótulo'); type('contextText', ''); type('ctaText', '');
  win.__bgFn = () => [0, 0, 0];
  noBoxSw()[5].click(); await sleep(320);                    // index 5 = the "base" role (dark)
  ok(win.eval('state.noBoxColor') === 'base' && win.eval('noBoxHex()') === win.eval('PALETTE.find(p => p.name === "base").hex'), 'L: picking a brand swatch sets the role name and the hex');
  m = meter();
  ok(m.level === 'poor' && m.tip === 'Experimenta Branco', 'L: dark brand colour on a black photo = poor, suggests Branco: ' + JSON.stringify(m));
  noBoxSw()[0].click(); await sleep(320);                    // white
  ok(win.eval('state.noBoxColor') === 'white' && meter().level === 'good', 'L: white on a black photo = good');
  noBoxSw()[2].click(); await sleep(600);                    // "accent" (orange); also lets the draft save run
  ok(win.eval('state.noBoxColor') === 'accent' && noBoxSw()[2].classList.contains('active'), 'L: the accent swatch is active');
  const saved = JSON.parse(win.localStorage.getItem('editorCapasDraft') || 'null');
  ok(saved && saved.noBoxColor === 'accent' && saved.boxStyle === 'none', 'L: the draft stores the role name and the box style: ' + JSON.stringify(saved && [saved.noBoxColor, saved.boxStyle]));

  // M) vertical position: same margin at the top and at the bottom, centred in the middle, in every format
  win.__bgFn = () => [0, 0, 0];
  click('#styleSeg button[data-style="solid"]');
  type('labelText', 'Quem nunca desliga'); type('contextText', 'não é cansaço físico'); type('ctaText', '');
  const accentHex = win.eval('state.accent.hex').toLowerCase();
  for (const fmt of ['reel', 'carousel', 'square']) {
    click('#formatSeg button[data-format="' + fmt + '"]');
    const H = win.eval('canvas.height'), gaps = {};
    for (const pos of ['top-center', 'mid-center', 'bottom-center']) {
      click('#posGrid button[data-pos="' + pos + '"]');
      win.__rects = []; win.eval('draw()');
      const box = win.__rects.filter((r) => String(r.fill).toLowerCase() === accentHex).pop();
      gaps[pos] = { top: box.y, bottom: H - (box.y + box.h) };
    }
    ok(Math.abs(gaps['top-center'].top - H * 0.14) < 0.5, 'M: ' + fmt + ': top-center is 14% of the height from the top (' + gaps['top-center'].top + ')');
    ok(Math.abs(gaps['bottom-center'].bottom - gaps['top-center'].top) < 0.5, 'M: ' + fmt + ': bottom-center is as far from the bottom as top-center is from the top (' + gaps['bottom-center'].bottom + ' vs ' + gaps['top-center'].top + ')');
    ok(Math.abs(gaps['mid-center'].top - gaps['mid-center'].bottom) < 0.5, 'M: ' + fmt + ': mid-center is centred (' + gaps['mid-center'].top + ' / ' + gaps['mid-center'].bottom + ')');
  }
  // M2) same thing with no box (text drawn straight on the photo): a two-line label, so the block height is 2 line gaps
  click('#styleSeg button[data-style="none"]');
  type('labelText', 'Quem\nnunca'); type('contextText', ''); type('ctaText', '');
  for (const fmt of ['reel', 'carousel', 'square']) {
    click('#formatSeg button[data-format="' + fmt + '"]');
    const H = win.eval('canvas.height'), y1 = {};
    let bh = 0;
    for (const pos of ['top-center', 'mid-center', 'bottom-center']) {
      click('#posGrid button[data-pos="' + pos + '"]');
      win.__texts = []; win.eval('draw()');
      const a = win.__texts.find((t) => t.s === 'Quem'), b = win.__texts.find((t) => t.s === 'nunca');
      y1[pos] = a.y; bh = 2 * (b.y - a.y);
    }
    ok(Math.abs((y1['bottom-center'] - y1['top-center']) - (0.72 * H - bh)) < 0.5, 'M2: ' + fmt + ': no box, bottom-center keeps the same margin as top-center');
    ok(Math.abs((y1['mid-center'] - y1['top-center']) - ((H - bh) / 2 - 0.14 * H)) < 0.5, 'M2: ' + fmt + ': no box, mid-center is centred');
  }

  // put the state back as the later checks expect it
  click('#formatSeg button[data-format="reel"]'); click('#posGrid button[data-pos="top-center"]');
  click('#styleSeg button[data-style="none"]'); type('ctaText', 'rodapé');

  // J) "recomeçar" (reset) hides the meter and puts the Text tab back
  click('#tabBar button[data-tab="position"]');
  win.eval('draw()'); await sleep(320);
  ok(meter().visible, 'J: visible before the reset');
  click('#resetLink');
  ok(!meter().visible, 'J: reset hides the meter');
  ok(shown('tabText') && !shown('tabPosition'), 'J: reset goes back to the Text tab');
  ok(win.eval('state.noBoxColor') === 'white' && noBoxSw().findIndex((e) => e.classList.contains('active')) === 0, 'J: reset puts the no-box colour back to white');

  ok(errors.length === 0, 'no JavaScript errors during the test: ' + errors.join(' | '));
  console.log(`${passes} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
