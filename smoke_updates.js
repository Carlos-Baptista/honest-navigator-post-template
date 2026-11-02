// Boots the app in jsdom to check the version label and the "new version" banner.
// There is no service worker in jsdom: this only covers the page side (see test_sw.js for the worker).
const { JSDOM } = require('jsdom');
const fs = require('fs');
const html = fs.readFileSync(process.env.APP_HTML || '../index.html', 'utf8');

function boot(fetchImpl) {
  const errors = [], calls = [];
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.test/app/',
    beforeParse(win) {
      const ctxs = new WeakMap();
      win.HTMLCanvasElement.prototype.getContext = function () {
        if (ctxs.has(this)) return ctxs.get(this);
        const store = { textBaseline: 'alphabetic', textAlign: 'left', globalAlpha: 1, font: '10px x' };
        const c = new Proxy(store, {
          get(t, p) {
            if (p === 'canvas') return this;
            if (p === 'measureText') return (s) => ({ width: String(s).length * 10 });
            if (p === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
            if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
            if (p === 'createPattern') return () => ({});
            if (p in t) return t[p];
            return () => {};
          },
          set(t, p, v) { t[p] = v; return true; },
        });
        ctxs.set(this, c); return c;
      };
      win.FontFace = class { constructor(n) { this.family = n; } load() { return Promise.resolve(this); } };
      Object.defineProperty(win.document, 'fonts', { value: { add() {}, delete() {}, load: () => Promise.resolve([]), ready: Promise.resolve() } });
      win.URL.createObjectURL = () => 'blob:x'; win.URL.revokeObjectURL = () => {};
      win.fetch = (url, init) => { calls.push({ url, init }); return fetchImpl(url, init); };
      win.addEventListener('error', (e) => errors.push(e.message));
    },
  });
  return { win: dom.window, doc: dom.window.document, errors, calls };
}

const pageWith = (version) => async () => ({ ok: true, text: async () => `<html><head><meta name="app-version" content="${version}"></head></html>` });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FAILED:', msg); } }
const myVersion = /<meta name="app-version" content="([^"]+)"/.exec(html)[1];
const bumped = myVersion.replace(/\d+$/, (n) => String(+n + 1));

(async () => {
  // ---------- version label ----------
  {
    const { doc, win, errors } = boot(pageWith(myVersion));
    await sleep(50);
    ok(errors.length === 0, 'boots without errors: ' + errors.join(' | '));
    ok(/^v\d+$/.test(myVersion), 'the app-version meta tag looks like v<number>: ' + myVersion);
    ok(doc.getElementById('appVersion').textContent === 'Versão ' + myVersion.slice(1), 'the version label shows the meta tag: ' + doc.getElementById('appVersion').textContent);
    ok(doc.getElementById('updateBanner').classList.contains('section-hidden'), 'the banner is hidden at startup');
    win.close();
  }

  // ---------- same version: no banner; checks are throttled ----------
  {
    const { win, doc, calls } = boot(pageWith(myVersion));
    await win.eval('checkForUpdate()');
    ok(calls.length === 1 && calls[0].url === 'index.html' && calls[0].init.cache === 'no-cache', 'the check asks the server for index.html with cache: no-cache');
    ok(doc.getElementById('updateBanner').classList.contains('section-hidden'), 'same version: no banner');
    await win.eval('checkForUpdate()');
    ok(calls.length === 1, 'checks within a minute of each other are throttled (' + calls.length + ' fetches)');
    win.eval('lastUpdateCheck = 0');
    await win.eval('checkForUpdate()');
    ok(calls.length === 2, 'after the gap, it checks again');
    win.close();
  }

  // ---------- failures never show a banner or throw ----------
  for (const [name, impl] of [['offline', async () => { throw new TypeError('offline'); }], ['a 404', async () => ({ ok: false, text: async () => '' })],
                              ['a page without the tag', async () => ({ ok: true, text: async () => '<html></html>' })]]) {
    const { win, doc, errors } = boot(impl);
    await win.eval('checkForUpdate()');
    ok(doc.getElementById('updateBanner').classList.contains('section-hidden') && errors.length === 0, 'no banner and no error when the check hits ' + name);
    win.close();
  }

  // ---------- a newer version ----------
  {
    const { win, doc, calls } = boot(pageWith(bumped));
    const banner = doc.getElementById('updateBanner'), text = doc.getElementById('updateText'), btn = doc.getElementById('updateBtn');
    let reloads = 0; win.eval('reloadApp = () => { window.__reloads = (window.__reloads || 0) + 1; }');
    await win.eval('checkForUpdate()');
    ok(!banner.classList.contains('section-hidden') && /Nova versão/.test(text.textContent), 'newer version: the banner shows');

    // the visibilitychange path
    win.eval('lastUpdateCheck = 0'); const before = calls.length;
    doc.dispatchEvent(new win.Event('visibilitychange'));
    await sleep(20);
    ok(calls.length === before + 1, 'coming back to the app triggers a check');

    // no photos loaded: one tap reloads, after saving the draft
    doc.getElementById('labelText').value = 'texto de teste'; doc.getElementById('labelText').dispatchEvent(new win.Event('input', { bubbles: true }));
    btn.click();
    ok(win.__reloads === 1, 'no photos: a single tap reloads');
    const saved = JSON.parse(win.localStorage.getItem('editorCapasDraft') || 'null');
    ok(saved && saved.pages[0].labelText === 'texto de teste', 'the draft is saved before reloading');

    // with photos: the first tap warns, the second reloads
    win.eval('state.pages[0].img = ({width:10,height:10})');
    win.__reloads = 0;
    btn.click();
    ok(win.__reloads === 0 && /apaga as fotos/.test(text.textContent) && /mesmo assim/.test(btn.textContent), 'with photos: the first tap only warns: ' + text.textContent);
    btn.click();
    ok(win.__reloads === 1, 'with photos: the second tap reloads');

    // "Depois": hidden, and not shown again for the same version
    win.eval('state.pages[0].img = null');
    doc.getElementById('updateLater').click();
    ok(banner.classList.contains('section-hidden'), 'Depois hides the banner');
    win.eval('lastUpdateCheck = 0'); await win.eval('checkForUpdate()');
    ok(banner.classList.contains('section-hidden'), 'the same version does not come back after Depois');
    win.close();
  }

  // ---------- Depois only ignores that version ----------
  {
    let served = bumped;
    const { win, doc } = boot(async () => ({ ok: true, text: async () => `<meta name="app-version" content="${served}">` }));
    const banner = doc.getElementById('updateBanner');
    await win.eval('checkForUpdate()');
    doc.getElementById('updateLater').click();
    served = bumped.replace(/\d+$/, (n) => String(+n + 1));
    win.eval('lastUpdateCheck = 0'); await win.eval('checkForUpdate()');
    ok(!banner.classList.contains('section-hidden'), 'a version newer than the one dismissed shows the banner again');
    win.close();
  }

  console.log(`${passes} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
