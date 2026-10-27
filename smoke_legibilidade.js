// Arranque da app inteira em jsdom, com canvas simulado, para ver se o medidor está bem ligado.
// Limite: o canvas simulado só sabe "foto = cor por altura" e "retângulo preto com opacidade".
// Não é um browser: não valida CSS, layout, Safari nem desempenho.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.env.APP_HTML || '../index.html', 'utf8');

const errors = [];
const stats = { legReads: 0 };
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/',
  beforeParse(win) {
    win.__bgFn = () => [255, 255, 255];           // cor da "foto" por altura (0..1)
    const ctxs = new WeakMap();
    win.HTMLCanvasElement.prototype.getContext = function () {
      if (ctxs.has(this)) return ctxs.get(this);
      const canvas = this, store = { textBaseline: 'alphabetic', textAlign: 'left', globalAlpha: 1, dark: 0 };
      const c = new Proxy(store, {
        get(t, p) {
          if (p === 'canvas') return canvas;
          if (p === 'measureText') return (s) => ({ width: String(s).length * 14 });
          if (p === 'drawImage') return () => { t.dark = 0; };            // nova foto: limpa o overlay
          if (p === 'fillRect') return (x, y, w, h) => { if (t.fillStyle === '#000000' && w >= canvas.width) t.dark = 1 - (1 - t.dark) * (1 - t.globalAlpha); };
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
const win = dom.window, doc = win.document;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FALHOU:', msg); } }
const $ = (s) => doc.querySelector(s);
const click = (s) => $(s).click();
function type(id, v) { const el = doc.getElementById(id); el.value = v; el.dispatchEvent(new win.Event('input', { bubbles: true })); }
const meter = () => ({
  visible: !$('#legibility').classList.contains('section-hidden'),
  level: $('#legibilityRow').dataset.level, text: $('#legText').textContent.trim(),
  tipVisible: !$('#legTip').classList.contains('section-hidden'), tip: $('#legTip').textContent.trim(),
});
const photo = () => win.eval('({width:1080,height:1920})');

(async () => {
  await sleep(100);
  ok(errors.length === 0, 'arranque sem erros: ' + errors.join(' | '));
  ok(!meter().visible, 'medidor escondido no arranque');

  // carregar uma "foto" na página atual, texto no rótulo, "Sem caixa" a branco
  win.eval('state.pages[0].img = ({width:1080,height:1920})');
  click('#styleSeg button[data-style="none"]');
  type('labelText', 'Quem nunca desliga');
  type('contextText', 'não é cansaço físico');

  // A) foto branca, texto branco → fraca, e preto seria melhor
  win.__bgFn = () => [255, 255, 255];
  type('labelText', 'Quem nunca desliga'); await sleep(320);
  let m = meter();
  ok(m.visible && m.level === 'poor', 'A: foto branca com texto branco = fraca (' + JSON.stringify(m) + ')');
  ok(/fraca/.test(m.text) && /rótulo/.test(m.text), 'A: nomeia o rótulo: ' + m.text);
  ok(m.tipVisible && m.tip === 'Experimenta Preto', 'A: sugere Preto: ' + m.tip);

  // B) foto preta, texto branco → boa, sem dica
  win.__bgFn = () => [0, 0, 0];
  type('labelText', 'Quem nunca desliga!'); await sleep(320);
  m = meter();
  ok(m.visible && m.level === 'good' && m.text === 'Legibilidade: boa' && !m.tipVisible, 'B: foto preta com texto branco = boa, sem dica (' + JSON.stringify(m) + ')');

  // C) a zona do texto segue a posição: topo claro, resto escuro
  win.__bgFn = (fy) => fy < 0.3 ? [255, 255, 255] : [0, 0, 0];
  click('#posGrid button[data-pos="top-center"]'); await sleep(320);
  ok(meter().level === 'poor', 'C: texto no topo (zona clara) = fraca: ' + meter().text);
  click('#posGrid button[data-pos="bottom-center"]'); await sleep(320);
  ok(meter().level === 'good', 'C: texto em baixo (zona escura) = boa: ' + meter().text);

  // D) o rodapé conta sempre: foto clara em baixo, texto do rótulo em cima numa zona escura
  win.__bgFn = (fy) => fy < 0.5 ? [0, 0, 0] : [255, 255, 255];
  click('#posGrid button[data-pos="top-center"]');
  type('ctaText', 'manda isto a quem também não desliga'); await sleep(320);
  m = meter();
  ok(m.level === 'poor' && /rodapé/.test(m.text), 'D: rodapé sobre zona clara = fraca, nomeia o rodapé: ' + m.text);
  type('ctaText', ''); await sleep(320);
  ok(meter().level === 'good', 'D: sem rodapé, o resto está sobre zona escura = boa');

  // E) com caixa, o rótulo e o contexto vão sobre a caixa: só o rodapé conta
  win.__bgFn = () => [255, 255, 255];
  click('#styleSeg button[data-style="solid"]'); await sleep(320);
  ok(!meter().visible, 'E: com caixa e sem rodapé não há nada para medir');
  type('ctaText', 'rodapé'); await sleep(320);
  m = meter();
  ok(m.visible && /rodapé/.test(m.text) && m.tip === 'Experimenta o Overlay', 'E: com caixa só o rodapé conta: ' + JSON.stringify(m));

  // F) overlay: foto branca com overlay a 45% ainda não chega para o texto pequeno; a dica manda subir a opacidade
  click('#bgSeg button[data-bg="overlay"]'); await sleep(320);
  m = meter();
  ok(m.visible && m.level === 'poor' && m.tip === 'Sobe a opacidade do overlay', 'F: overlay 45% sobre branco = fraca, sobe a opacidade: ' + JSON.stringify(m));
  const slider = doc.getElementById('overlayOpacitySlider'); slider.value = 90; slider.dispatchEvent(new win.Event('input', { bubbles: true })); await sleep(320);
  ok(meter().level === 'good', 'F: overlay a 90% = boa: ' + meter().text);

  // G) sólido esconde o medidor
  click('#bgSeg button[data-bg="solid"]'); await sleep(320);
  ok(!meter().visible, 'G: fundo sólido esconde o medidor');
  click('#bgSeg button[data-bg="photo"]'); await sleep(320);
  ok(meter().visible, 'G: voltar a Foto mostra-o outra vez');

  // H) debounce: 30 desenhos seguidos = uma só análise
  stats.legReads = 0;
  for (let i = 0; i < 30; i++) win.eval('draw()');
  await sleep(350);
  ok(stats.legReads === 1, 'H: 30 draw() seguidos = 1 análise (foram ' + stats.legReads + ')');

  // I) foto libertada antes da análise: não rebenta, esconde
  win.eval('draw()'); win.eval('state.pages[0].img.width = 0'); win.eval('state.pages[0].img.height = 0'); await sleep(320);
  ok(!meter().visible && errors.length === 0, 'I: foto libertada esconde o medidor sem erros');
  win.eval('state.pages[0].img.width = 1080; state.pages[0].img.height = 1920');

  // K) a opacidade do texto conta: sobre cinzento escuro o branco pleno passa, mas o contexto (0,82) e o rodapé (0,7) não
  win.__bgFn = () => [110, 110, 110];
  click('#styleSeg button[data-style="none"]');
  type('labelText', 'Rótulo'); type('contextText', ''); type('ctaText', ''); await sleep(320);
  ok(meter().level === 'good', 'K: só rótulo (opacidade 1) sobre cinzento escuro = boa: ' + meter().text);
  type('labelText', ''); type('contextText', 'contexto'); await sleep(320);
  m = meter();
  ok(m.level === 'poor' && /contexto/.test(m.text), 'K: só contexto (opacidade 0,82) = fraca: ' + JSON.stringify(m));
  type('contextText', ''); type('ctaText', 'rodapé'); await sleep(320);
  m = meter();
  ok(m.level === 'poor' && /rodapé/.test(m.text), 'K: só rodapé (opacidade 0,7) = fraca: ' + JSON.stringify(m));
  type('labelText', 'Rótulo'); type('contextText', 'contexto'); type('ctaText', 'rodapé');

  // J) recomeçar esconde o medidor
  win.eval('draw()'); await sleep(320);
  ok(meter().visible, 'J: visível antes de recomeçar');
  click('#resetLink');
  ok(!meter().visible, 'J: recomeçar esconde o medidor');

  ok(errors.length === 0, 'sem erros de JavaScript durante o teste: ' + errors.join(' | '));
  console.log(`${passes} ok, ${fails} falhas`);
  process.exit(fails ? 1 : 0);
})();
