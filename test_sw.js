// Tests for sw.js (network first), running it in a sandbox with a fake CacheStorage, fetch and timers.
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync(process.env.APP_SW || '../sw.js', 'utf8');

const ORIGIN = 'https://example.test';
const BASE = ORIGIN + '/app/';
let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) passes++; else { fails++; console.log('FAILED:', msg); } }
const flush = () => new Promise((r) => setImmediate(r));

function setup() {
  const stores = new Map();                                  // cache name -> Map(url -> Response)
  const abs = (r) => (typeof r === 'string' ? new URL(r, BASE).href : r.url);
  const bare = (u) => u.split('?')[0];
  const cacheApi = (name) => {
    const m = stores.get(name);
    return {
      async addAll(list) { for (const r of list) { const req = typeof r === 'string' ? { url: abs(r) } : r; this.lastAddAll = (this.lastAddAll || []).concat(req); const res = await net.fetch(req, {}); m.set(abs(req), res.clone()); } },
      async put(req, res) { m.set(abs(req), res); },
      async match(req, opts) {
        const u = abs(req);
        if (m.has(u)) return m.get(u).clone();
        if (opts && opts.ignoreSearch) for (const [k, v] of m) if (bare(k) === bare(u)) return v.clone();
        return undefined;
      },
    };
  };
  const caches = {
    async open(name) { if (!stores.has(name)) stores.set(name, new Map()); return cacheApi(name); },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
  const net = {
    mode: 'online', version: 'new', calls: [],
    fetch(req, init) {
      net.calls.push({ url: abs(req), init, req });
      if (net.mode === 'offline') return Promise.reject(new TypeError('offline'));
      if (net.mode === 'hang') return new Promise(() => {});
      return Promise.resolve(new Response(net.version + ':' + abs(req), { status: net.mode === '500' ? 503 : net.mode === '404' ? 404 : 200 }));
    },
  };
  const timers = [];
  const handlers = {};
  const flags = { skipWaiting: 0, claim: 0 };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: () => { flags.skipWaiting++; },
    clients: { claim: () => { flags.claim++; } },
  };
  // In a browser, new Request('./') resolves against the worker's URL; Node needs it spelled out.
  class SWRequest extends Request { constructor(u, init) { super(typeof u === 'string' ? new URL(u, BASE).href : u, init); } }
  const sandbox = { self, caches, fetch: (r, i) => net.fetch(r, i), URL, Request: SWRequest, Response, Promise, Error, TypeError,
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {} };
  vm.runInNewContext(code, sandbox);
  const fire = async (type, ev) => { const waits = []; ev.waitUntil = (p) => waits.push(p); ev.respondWith = (p) => { ev.response = Promise.resolve(p); }; handlers[type](ev); await Promise.all(waits); return ev; };
  const get = (path, extra) => ({ method: 'GET', url: new URL(path, BASE).href, mode: 'cors', ...extra });
  return { stores, caches, net, timers, flags, fire, get, handlers };
}

let finished = false;
// A promise that never settles would make Node exit quietly with code 0: treat that as a failure.
process.on('exit', () => { if (!finished) { console.log('FAILED: the test did not finish (a promise never settled)'); process.exitCode = 1; } });
process.on('unhandledRejection', (e) => { console.log('FAILED: unhandled rejection: ' + (e && e.message)); process.exit(1); });

(async () => {
  // ---- install: precache with the HTTP cache bypassed, and take over right away
  {
    const t = setup();
    await t.fire('install', {});
    const keys = [...t.stores.keys()];
    ok(keys.length === 1 && keys[0] === 'editor-capas', 'install: one cache, named editor-capas (' + keys + ')');
    ok(t.stores.get('editor-capas').size === 11, 'install: precaches the 11 app files (' + t.stores.get('editor-capas').size + ')');
    ok(t.net.calls.length === 11, 'install: fetches each file once (' + t.net.calls.length + ')');
    ok(t.net.calls.every((c) => c.req && c.req.cache === 'reload'), 'install: bypasses the browser HTTP cache (cache: reload)');
    ok(t.flags.skipWaiting === 1, 'install: skipWaiting');
  }
  // ---- activate: removes the old versioned caches
  {
    const t = setup();
    await t.caches.open('editor-capas-v20'); await t.caches.open('editor-capas-v3'); await t.caches.open('editor-capas');
    await t.fire('activate', {});
    ok(JSON.stringify([...t.stores.keys()]) === '["editor-capas"]', 'activate: only the current cache is kept (' + [...t.stores.keys()] + ')');
    ok(t.flags.claim === 1, 'activate: clients.claim');
  }
  // ---- online: the network wins over the cache, and the cache is refreshed
  {
    const t = setup();
    const c = await t.caches.open('editor-capas');
    await c.put(t.get('index.html'), new Response('old:' + t.get('index.html').url));
    t.net.version = 'new';
    const ev = await t.fire('fetch', { request: t.get('index.html') });
    const body = await (await ev.response).text();
    ok(body.startsWith('new:'), 'online: serves the NEW file even though an old copy is cached (' + body + ')');
    ok(t.net.calls[0].init && t.net.calls[0].init.cache === 'no-cache', 'online: asks the server to revalidate (cache: no-cache)');
    await flush();
    const cached = await (await c.match(t.get('index.html'))).text();
    ok(cached.startsWith('new:'), 'online: the cached copy is updated for offline use (' + cached + ')');
  }
  // ---- offline: the cached copy; navigation to an unknown URL falls back to index.html
  {
    const t = setup();
    const c = await t.caches.open('editor-capas');
    await c.put(t.get('index.html'), new Response('cached-index'));
    await c.put(t.get('anybody.ttf'), new Response('cached-font'));
    t.net.mode = 'offline';
    let ev = await t.fire('fetch', { request: t.get('anybody.ttf') });
    ok(await (await ev.response).text() === 'cached-font', 'offline: serves the cached file');
    ev = await t.fire('fetch', { request: t.get('index.html?from=homescreen', { mode: 'navigate' }) });
    ok(await (await ev.response).text() === 'cached-index', 'offline: a navigation with a query string finds the cached page');
    ev = await t.fire('fetch', { request: t.get('somewhere/else', { mode: 'navigate' }) });
    ok(await (await ev.response).text() === 'cached-index', 'offline: a navigation to an unknown URL falls back to index.html');
    ev = await t.fire('fetch', { request: t.get('not-cached.png') });
    let failed = false; try { await ev.response; } catch (e) { failed = true; }
    ok(failed, 'offline: a file that was never cached fails, like a normal offline request');
  }
  // ---- slow network: after the timeout, the cached copy is served
  {
    const t = setup();
    const c = await t.caches.open('editor-capas');
    await c.put(t.get('index.html'), new Response('cached-index'));
    t.net.mode = 'hang';
    const ev = await t.fire('fetch', { request: t.get('index.html') });
    await flush();
    ok(t.timers.length === 1 && t.timers[0].ms === 4000, 'slow: a 4 s timeout is armed (' + JSON.stringify(t.timers.map((x) => x.ms)) + ')');
    t.timers[0].fn();
    ok(await (await ev.response).text() === 'cached-index', 'slow: serves the cached copy once the timeout fires');
  }
  // ---- server errors
  {
    const t = setup();
    const c = await t.caches.open('editor-capas');
    await c.put(t.get('index.html'), new Response('cached-index'));
    t.net.mode = '500';
    let ev = await t.fire('fetch', { request: t.get('index.html') });
    ok(await (await ev.response).text() === 'cached-index', 'a 5xx from the server falls back to the cached copy');
    ev = await t.fire('fetch', { request: t.get('uncached.js') });
    ok((await ev.response).status === 503, 'a 5xx with nothing cached is passed on');
    t.net.mode = '404';
    ev = await t.fire('fetch', { request: t.get('gone.js') });
    await flush();
    ok((await ev.response).status === 404 && !(await c.match(t.get('gone.js'))), 'a 404 is passed on and not cached');
  }
  // ---- what the service worker must leave alone
  {
    const t = setup();
    let ev = await t.fire('fetch', { request: t.get('index.html', { method: 'POST' }) });
    ok(ev.response === undefined, 'POST requests are not handled');
    ev = await t.fire('fetch', { request: { method: 'GET', url: 'https://fonts.googleapis.com/css2?family=Lora', mode: 'cors' } });
    ok(ev.response === undefined, 'other origins (Google Fonts) are not handled');
  }

  finished = true;
  console.log(`${passes} ok, ${fails} failed`);
  process.exit(fails ? 1 : 0);
})();
