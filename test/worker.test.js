import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LIMITS, callArgs, createWorkerFacts, findRegistrations, literalString, matchClose, precacheEntries, scanWorkerTokens, stringArray, tokenize } from '../src/index.js';
import { PAGE, WORKER, app, check, find, ids, manifestWith } from './helpers.js';

const tokens = (code) => tokenize(code).tokens;
const scan = (code) => {
  const facts = createWorkerFacts();
  scanWorkerTokens(facts, tokens(code), 'sw.js');
  return facts;
};
// An app whose worker is this code.
const withWorker = (code, extra = {}) => app({ 'sw.js': code, ...extra });

test('calls: the arguments of a call are split at the commas of its own level', () => {
  const t = tokens('f(a, [1, 2], {k: g(x, y)}, "s")');
  const call = callArgs(t, 1);
  assert.equal(call.args.length, 4);
  assert.deepEqual(call.args[0].map((x) => x.v), ['a']);
  assert.equal(call.args[3][0].v, 's');
  assert.equal(t[call.end].v, ')');
  assert.equal(matchClose(t, 1), call.end);
});

test('calls: a call that is not closed within the limit is not read', () => {
  assert.equal(callArgs(tokens('f(a, b'), 1), null);
  assert.equal(matchClose(tokens('f(' + 'a,'.repeat(100) + ')'), 1, 10), -1);
});

test('literals: a string, or a string followed by something appended after a query mark, is a literal path', () => {
  assert.equal(literalString(tokens('"/sw.js"')), '/sw.js');
  assert.equal(literalString(tokens('"/sw.js?v=" + VERSION')), '/sw.js?v=');
  assert.equal(literalString(tokens('"/sw-" + name + ".js"')), null);
  assert.equal(literalString(tokens('url')), null);
  assert.equal(literalString([]), null);
});

test('arrays: the strings of an array literal are listed, and anything else marks the list as incomplete', () => {
  assert.deepEqual(stringArray(tokens("['/', '/a.js', `/b.css`]")).items.map((i) => i.value), ['/', '/a.js', '/b.css']);
  assert.equal(stringArray(tokens("['/', ...more]")).dynamic, true);
  assert.equal(stringArray(tokens("['/', base + '/x']")).dynamic, true);
  assert.equal(stringArray(tokens('[]')).items.length, 0);
});

test('arrays: a Workbox precache list gives the url of each object, and a plain string too', () => {
  const list = precacheEntries(tokens("[{url: '/index.html', revision: '383676'}, {url: '/a.js', revision: null}, '/b.css']"));
  assert.deepEqual(list.items.map((i) => i.value), ['/index.html', '/a.js', '/b.css']);
  assert.equal(list.dynamic, false);
  assert.equal(precacheEntries(tokens('[{ revision: 1 }]')).dynamic, true);
});

test('registrations: the address and the scope of navigator.serviceWorker.register are read when they are literals', () => {
  const { registrations } = findRegistrations(tokens("navigator.serviceWorker.register('/sw.js', { scope: '/app/' });"));
  assert.deepEqual(registrations.map((r) => [r.url, r.scope, r.dynamic]), [['/sw.js', '/app/', false]]);
});

test('registrations: a constant string in the same script is followed, anything else is dynamic', () => {
  const a = findRegistrations(tokens("const SW = '/worker.js'; navigator.serviceWorker.register(SW);")).registrations[0];
  assert.equal(a.url, '/worker.js');
  const b = findRegistrations(tokens('navigator.serviceWorker.register(url);')).registrations[0];
  assert.equal(b.dynamic, true);
  const c = findRegistrations(tokens("navigator.serviceWorker.register('/sw-' + hash + '.js');")).registrations[0];
  assert.equal(c.dynamic, true);
  const d = findRegistrations(tokens("navigator.serviceWorker.register('/sw.js', { scope: base });")).registrations[0];
  assert.equal(d.scopeDynamic, true);
});

test('registrations: a call in a comment or a string is not a registration, and a method named register of another object is not', () => {
  assert.equal(findRegistrations(tokens("// navigator.serviceWorker.register('/sw.js')\nconst s = \"navigator.serviceWorker.register('/sw.js')\";")).registrations.length, 0);
  assert.equal(findRegistrations(tokens("app.register('/sw.js'); registry.register('x');")).registrations.length, 0);
});

test('worker facts: event listeners and on-properties are told apart by type', () => {
  const facts = scan("self.addEventListener('install', a); addEventListener(\"fetch\", b); self.onactivate = c; self.addEventListener(kind, d);");
  assert.equal(facts.listens.install.length, 1);
  assert.equal(facts.listens.fetch.length, 1);
  assert.equal(facts.listens.activate.length, 1);
});

test('worker facts: skipWaiting and clients.claim are seen as calls, and a definition or another claim is not', () => {
  const facts = scan('self.skipWaiting(); self.clients.claim(); function skipWaiting() {} other.claim(); claim();');
  assert.equal(facts.skipWaiting.length, 1);
  assert.equal(facts.claim.length, 1);
});

test('worker facts: cache names are literals, constants, dynamic names or unknown, in that order of certainty', () => {
  const facts = scan("const NAME = 'app-v2'; const T = `app-${V}`; caches.open('static'); caches.open(NAME); caches.open(T); caches.open(other); caches.open(`x-${y}`);");
  assert.deepEqual(facts.cacheOpens.map((c) => [c.name, c.kind]), [['static', 'literal'], ['app-v2', 'literal'], [null, 'dynamic'], [null, 'unknown'], [null, 'dynamic']]);
});

test('worker facts: addAll takes any receiver, add only a receiver that is named like a cache', () => {
  const facts = scan("c.addAll(['/a']); cache.add('/b'); items.add('/c'); myCache.add('/d');");
  assert.deepEqual(facts.addCalls.map((c) => c.call), ['addAll', 'add', 'add']);
});

test('worker facts: a catch that returns a cached response or a new Response is a fallback, in both forms of catch', () => {
  assert.equal(scan("try { await fetch(r); } catch (e) { return caches.match('/o.html'); }").catchFallback.length, 1);
  assert.equal(scan("fetch(r).catch(() => new Response('offline'));").catchFallback.length, 1);
  assert.equal(scan('try { x(); } catch { return caches.match(r); }').catchFallback.length, 1);
  assert.equal(scan('try { x(); } catch (e) { log(e); }').catchFallback.length, 0);
  assert.equal(scan("caches.match('/offline.html')").matchFixed.length, 1);
  assert.equal(scan('caches.match(event.request)').matchFixed.length, 0);
});

test('worker facts: the Workbox calls of the saved page are recognized, with the entries of a literal precache list', () => {
  const facts = scan("import {precacheAndRoute, cleanupOutdatedCaches} from 'workbox-precaching'; cleanupOutdatedCaches(); precacheAndRoute([{url: '/a.js', revision: '1'}, '/b.css']);");
  assert.equal(facts.workbox.imported, true);
  assert.equal(facts.workbox.cleanup, true);
  assert.equal(facts.workbox.route.length, 1);
  assert.deepEqual(facts.workbox.precache.map((e) => e.value), ['/a.js', '/b.css']);
  assert.equal(scan('precacheAndRoute(self.__WB_MANIFEST);').workbox.dynamicLists.length, 1);
});

test('worker facts: the calls of one kind are counted against a limit, and the result says it was cut', () => {
  const facts = createWorkerFacts();
  scanWorkerTokens(facts, tokens("a.add('x');".repeat(30).replace(/a\./g, 'cache.')), 'sw.js', { ...LIMITS, maxCalls: 5 });
  assert.equal(facts.capped, true);
  assert.equal(facts.addCalls.length, 5);
});

test('register: a page without a registration gets a warning, and a registration in an inline script or an external one is found', async () => {
  const none = await check(app({ 'app.js': 'console.log(1);' }));
  assert.equal(find(none, 'sw-register-missing')[0].severity, 'warning');
  assert.deepEqual(none.input.workers, []);
  const inline = await check(app({ 'app.js': 'console.log(1);', 'index.html': PAGE.replace('<script src="/app.js"></script>', '<script>navigator.serviceWorker.register("/sw.js");</script>') }));
  assert.deepEqual(find(inline, 'sw-register-missing'), []);
  assert.deepEqual(inline.input.workers, ['sw.js']);
});

test('register: scripts of another type are not read, and a registration in a comment does not count', async () => {
  const page = PAGE.replace('<script src="/app.js"></script>', '<script type="application/ld+json">{"x": "navigator.serviceWorker.register(\'/sw.js\')"}</script><script>// navigator.serviceWorker.register("/sw.js")\n</script>');
  assert.ok(ids(await check(app({ 'index.html': page }))).includes('sw-register-missing'));
  const module = PAGE.replace('<script src="/app.js"></script>', '<script type="module">navigator.serviceWorker.register("/sw.js");</script>');
  assert.deepEqual(find(await check(app({ 'index.html': module })), 'sw-register-missing'), []);
});

test('register: a script from another address is not fetched, and a script that is not in the folder is counted', async () => {
  const page = PAGE.replace('<script src="/app.js"></script>', '<script src="https://cdn.example/a.js"></script><script src="/gone.js"></script>');
  const report = await check(app({ 'index.html': page }));
  assert.match(report.notes.join('\n'), /1 script from another address was not fetched/);
  assert.match(report.notes.join('\n'), /1 script named by the page was not found in the folder/);
  assert.ok(ids(report).includes('sw-register-missing'));
});

test('register: an address worked out at run time is an info finding, and nothing is guessed', async () => {
  const report = await check(app({ 'app.js': 'navigator.serviceWorker.register(workerUrl);' }));
  assert.equal(find(report, 'sw-register-dynamic')[0].severity, 'info');
  assert.deepEqual(report.input.workers, []);
  assert.deepEqual(find(report, 'sw-register-missing'), []);
});

test('register: a worker that is not in the folder is an error, with the other letter case named, and so is one on another origin', async () => {
  const gone = await check(app({ 'sw.js': null }));
  assert.equal(find(gone, 'sw-script-missing')[0].severity, 'error');
  const wrong = await check(app({ 'sw.js': null, 'SW.js': WORKER }));
  assert.match(find(wrong, 'sw-script-missing')[0].message, /named SW\.js/);
  const other = await check(app({ 'app.js': "navigator.serviceWorker.register('https://cdn.example/sw.js');" }));
  assert.match(find(other, 'sw-script-missing')[0].message, /another origin/);
  const climbing = await check(app({ 'app.js': "navigator.serviceWorker.register('../../sw.js');" }));
  assert.match(find(climbing, 'sw-script-missing')[0].message, /climbs above the folder/);
});

test('register: the worker is read from the page folder when the address is relative, and from the root when it starts with a slash', async () => {
  const files = app({ 'index.html': null, 'site/index.html': PAGE.replace('/manifest.webmanifest', '../manifest.webmanifest').replace('/app.js', 'app.js'), 'site/app.js': "navigator.serviceWorker.register('sw.js');", 'site/sw.js': WORKER });
  const report = await check(files, { page: 'site/index.html' });
  assert.deepEqual(report.input.workers, ['site/sw.js']);
  assert.deepEqual(find(report, 'sw-script-missing'), []);
});

test('scope: a scope wider than the folder of the worker is a warning that names the header, a narrower one is fine', async () => {
  const wide = await check(app({ 'js/sw.js': WORKER, 'sw.js': null, 'app.js': "navigator.serviceWorker.register('/js/sw.js', { scope: '/' });" }));
  const f = find(wide, 'sw-scope-too-wide')[0];
  assert.equal(f.severity, 'warning');
  assert.match(f.message, /Service-Worker-Allowed/);
  const narrow = await check(app({ 'app.js': "navigator.serviceWorker.register('/sw.js', { scope: '/app/' });" }));
  assert.deepEqual(find(narrow, 'sw-scope-too-wide'), []);
  const same = await check(app({ 'app.js': "navigator.serviceWorker.register('/sw.js', { scope: '/' });" }));
  assert.deepEqual(find(same, 'sw-scope-too-wide'), []);
});

test('scope: a worker in a folder does not control a page outside it, and not a start_url outside it', async () => {
  const files = { 'js/sw.js': WORKER, 'sw.js': null, 'app.js': "navigator.serviceWorker.register('/js/sw.js');" };
  const page = await check(app(files));
  assert.equal(find(page, 'sw-scope-misses-page')[0].severity, 'warning');
  assert.match(find(page, 'sw-scope-misses-page')[0].message, /never controls this page/);
  const inside = { 'js/index.html': PAGE.replace('<script src="/app.js"></script>', '<script src="/js/app.js"></script>'), 'js/app.js': "navigator.serviceWorker.register('/js/sw.js');", 'js/sw.js': WORKER, 'index.html': null, 'app.js': null, 'sw.js': null };
  const start = await check(app(inside), { page: 'js/index.html' });
  assert.deepEqual(find(start, 'sw-scope-misses-page'), []);
  assert.equal(find(start, 'sw-scope-misses-start-url')[0].severity, 'warning');
});

test('fetch handler: a worker with no fetch handler is a warning, and every way to add one is accepted', async () => {
  const none = await check(withWorker("self.addEventListener('install', () => {});"));
  assert.equal(find(none, 'sw-no-fetch-handler')[0].severity, 'warning');
  for (const code of ["self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));", "addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));", 'self.onfetch = (e) => e.respondWith(fetch(e.request));']) {
    assert.deepEqual(find(await check(withWorker(code)), 'sw-no-fetch-handler'), [], code);
  }
});

test('fetch handler: a handler that never calls respondWith is a warning', async () => {
  const report = await check(withWorker("self.addEventListener('fetch', (e) => { console.log(e.request.url); });"));
  assert.equal(find(report, 'sw-fetch-no-respondwith')[0].severity, 'warning');
  assert.deepEqual(find(await check(withWorker("self.addEventListener('fetch', (e) => { e.respondWith(fetch(e.request)); });")), 'sw-fetch-no-respondwith'), []);
});

test('precache: a file in the list that is not in the folder is an error, at the line of the entry', async () => {
  const report = await check(withWorker("const FILES = [\n  '/',\n  '/index.html',\n  '/gone.js',\n];\nself.addEventListener('install', (e) => e.waitUntil(caches.open('v1').then((c) => c.addAll(FILES))));\nself.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));"));
  const f = find(report, 'precache-file-missing');
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'error');
  assert.equal(f[0].line, 4);
  assert.equal(f[0].file, 'sw.js');
  assert.equal(f[0].subject, '/gone.js');
});

test('precache: the paths are relative to the worker, a query and a fragment are dropped, and a folder needs its index.html', async () => {
  const files = { 'js/sw.js': "self.addEventListener('install', (e) => e.waitUntil(caches.open('v1').then((c) => c.addAll(['lib.js?v=3', '../index.html#top', 'missing.js', '/docs/', '/other/']))));\nself.addEventListener('fetch', (e) => e.respondWith(fetch(e.request)));", 'js/lib.js': 'x', 'docs/index.html': 'x', 'other/readme.txt': 'x', 'sw.js': null, 'app.js': "navigator.serviceWorker.register('/js/sw.js', { scope: '/' });" };
  const report = await check(app(files));
  assert.deepEqual(find(report, 'precache-file-missing').map((f) => f.subject).sort(), ['/other/', 'missing.js']);
});

test('precache: letter case must match, and the other name is told', async () => {
  const report = await check(withWorker("caches.open('v1').then((c) => c.addAll(['/App.js']));", { 'App.JS': 'x' }));
  assert.equal(find(report, 'precache-file-missing').length, 1);
  const wrong = await check(withWorker("caches.open('v1').then((c) => c.addAll(['/app.JS']));"));
  assert.match(find(wrong, 'precache-file-missing')[0].message, /named app\.js/);
});

test('precache: an address without an extension is not checked and is counted, a path that climbs above the root is a missing file', async () => {
  const report = await check(withWorker("caches.open('v1').then((c) => c.addAll(['/app-route', '/other-route', '../../x.js']));"));
  assert.match(report.notes.join('\n'), /2 cached addresses without a file extension were not checked/);
  assert.match(find(report, 'precache-file-missing')[0].message, /climbs above the folder/);
});

test('precache: cache.add of one string is checked, and an address on another origin is not', async () => {
  const report = await check(withWorker("caches.open('v1').then((cache) => cache.add('/nope.css')); caches.open('v1').then((c) => c.addAll(['https://cdn.example/x.js']));"));
  assert.deepEqual(find(report, 'precache-file-missing').map((f) => f.subject), ['/nope.css']);
});

test('precache: a list that is built when the worker runs is an info finding that says what was not read', async () => {
  const report = await check(withWorker("caches.open('v1').then((c) => c.addAll(assets.map((a) => '/' + a)));\ncaches.open('v1').then((c) => c.addAll(['/index.html', ...extra]));"));
  const dynamic = find(report, 'worker-dynamic');
  assert.equal(dynamic.length, 2);
  assert.equal(dynamic[0].severity, 'info');
  assert.deepEqual(find(report, 'precache-file-missing'), []);
});

test('cache names: a name with no version and no cleanup is a warning, a version in the name or a cleanup is not', async () => {
  const unversioned = await check(withWorker("caches.open('app-cache').then((c) => c.addAll(['/']));"));
  assert.equal(find(unversioned, 'sw-cache-unversioned')[0].severity, 'warning');
  for (const code of ["caches.open('app-v2').then((c) => c.addAll(['/']));", "caches.open(`app-${VERSION}`);", "const V = 'static-2'; caches.open(V);"]) {
    assert.deepEqual(find(await check(withWorker(`${code}\nself.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((k) => Promise.all(k.map((n) => caches.delete(n))))));`)), 'sw-cache-unversioned'), [], code);
  }
  const cleaned = await check(withWorker("caches.open('app-cache');\nself.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))))));"));
  assert.deepEqual(find(cleaned, 'sw-cache-unversioned'), []);
  assert.deepEqual(find(await check(withWorker("caches.open('app-1');")), 'sw-cache-unversioned'), []);
});

test('cache names: a cleanup that is not in an activate handler does not count', async () => {
  const report = await check(withWorker("caches.open('app-cache');\nself.addEventListener('install', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k))))));"));
  assert.ok(ids(report).includes('sw-cache-unversioned'));
});

test('cache names: a versioned name with no cleanup is an info finding, and with a cleanup it is nothing', async () => {
  const kept = await check(withWorker("caches.open('app-v1');"));
  assert.equal(find(kept, 'sw-old-caches-kept')[0].severity, 'info');
  assert.deepEqual(find(await check(app()), 'sw-old-caches-kept'), []);
});

test('skipWaiting and claim: each is an info finding that names the effect, and neither fails any gate', async () => {
  const report = await check(withWorker(`${WORKER}\nself.skipWaiting();\nself.clients.claim();`), { failOn: 'warning' });
  assert.equal(find(report, 'sw-skip-waiting')[0].severity, 'info');
  assert.equal(find(report, 'sw-clients-claim')[0].severity, 'info');
  assert.equal(report.gate.pass, true);
  assert.deepEqual(find(await check(app()), 'sw-skip-waiting'), []);
});

test('non-GET: put without a look at the request method is a warning, a method check or a GET string is not', async () => {
  const code = (guard) => `${guard}\nself.addEventListener('fetch', (e) => { e.respondWith(fetch(e.request).then((r) => { caches.open('v1').then((c) => c.put(e.request, r.clone())); return r; }).catch(() => caches.match('/offline.html'))); });`;
  assert.equal(find(await check(withWorker(code(''))), 'sw-cache-non-get')[0].severity, 'warning');
  assert.deepEqual(find(await check(withWorker(code("const ok = (e) => e.request.method === 'POST';"))), 'sw-cache-non-get'), []);
  assert.deepEqual(find(await check(withWorker(code("const m = 'GET';"))), 'sw-cache-non-get'), []);
  assert.deepEqual(find(await check(withWorker("caches.open('v1').then((c) => c.put('/x', new Response('x')));")), 'sw-cache-non-get'), []);
});

test('opaque responses: a no-cors request whose response is cached without a look at it is a warning, a check of the response is not', async () => {
  const code = (check2) => `self.addEventListener('fetch', (e) => { e.respondWith(fetch(e.request.url, { mode: 'no-cors' }).then((r) => { ${check2} caches.open('v1').then((c) => c.put(e.request, r.clone())); return r; }).catch(() => caches.match('/offline.html'))); });\nif (e.request.method === 'GET') {}`;
  assert.equal(find(await check(withWorker(code(''))), 'sw-cache-opaque')[0].severity, 'warning');
  assert.deepEqual(find(await check(withWorker(code("if (r.type === 'opaque') return r;"))), 'sw-cache-opaque'), []);
  assert.deepEqual(find(await check(withWorker(code('if (!r.ok) return r;'))), 'sw-cache-opaque'), []);
  assert.deepEqual(find(await check(withWorker("fetch(u, { mode: 'no-cors' });")), 'sw-cache-opaque'), []);
});

test('offline fallback: a fetch handler that cannot answer a failed request is a warning, a catch or a fixed cached page is not', async () => {
  const none = await check(withWorker("self.addEventListener('fetch', (e) => e.respondWith(caches.match(e.request).then((h) => h || fetch(e.request))));"));
  assert.equal(find(none, 'sw-no-offline-fallback')[0].severity, 'warning');
  const withCatch = "self.addEventListener('fetch', (e) => e.respondWith(fetch(e.request).catch(() => caches.match('/offline.html'))));";
  assert.deepEqual(find(await check(withWorker(withCatch)), 'sw-no-offline-fallback'), []);
  const tryCatch = "self.addEventListener('fetch', (e) => e.respondWith((async () => { try { return await fetch(e.request); } catch (err) { return new Response('offline', { status: 503 }); } })()));";
  assert.deepEqual(find(await check(withWorker(tryCatch)), 'sw-no-offline-fallback'), []);
  const fixed = "self.addEventListener('fetch', (e) => e.respondWith(caches.match(e.request).then((h) => h || caches.match('/offline.html'))));";
  assert.deepEqual(find(await check(withWorker(fixed)), 'sw-no-offline-fallback'), []);
  const noRespond = await check(withWorker("self.addEventListener('fetch', () => {});"));
  assert.deepEqual(find(noRespond, 'sw-no-offline-fallback'), []);
});

test('importScripts: a script of the folder is read as part of the worker, so a handler in it counts', async () => {
  const files = { 'sw.js': "importScripts('/lib/handlers.js');", 'lib/handlers.js': WORKER };
  const report = await check(app(files), { failOn: 'warning' });
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.input.files.map((f) => f.path).filter((p) => p.startsWith('lib')), ['lib/handlers.js']);
});

test('importScripts: a script that is not in the folder is an error, and one from another address is an info finding that is not fetched', async () => {
  const gone = await check(withWorker(`${WORKER}\nimportScripts('/lib/gone.js');`));
  assert.equal(find(gone, 'sw-import-missing')[0].severity, 'error');
  const remote = await check(withWorker(`${WORKER}\nimportScripts('https://cdn.example/helpers.js');`));
  assert.equal(find(remote, 'remote-not-read')[0].severity, 'info');
  const dynamic = await check(withWorker(`${WORKER}\nimportScripts(path);`));
  assert.equal(find(dynamic, 'worker-dynamic')[0].severity, 'info');
});

test('importScripts: the imports are bounded and a file is read once', async () => {
  const calls = Array.from({ length: 15 }, (_, i) => `importScripts('/lib/${i}.js');`).join('\n');
  const files = { 'sw.js': `${WORKER}\n${calls}\nimportScripts('/lib/0.js');` };
  for (let i = 0; i < 15; i += 1) files[`lib/${i}.js`] = 'void 0;';
  const report = await check(app(files));
  assert.match(report.notes.join('\n'), /Only the first 10 scripts imported by a worker were read/);
  assert.equal(report.input.files.filter((f) => f.path.startsWith('lib/')).length, 10);
});

test('workbox: a precache list is read and its files are checked, and the fetch, cache name and fallback checks are not applied to Workbox', async () => {
  const code = "import {precacheAndRoute, cleanupOutdatedCaches} from 'workbox-precaching';\ncleanupOutdatedCaches();\nprecacheAndRoute([{url: '/index.html', revision: 'a1'}, {url: '/gone.css', revision: 'b2'}]);";
  const report = await check(withWorker(code));
  assert.deepEqual(find(report, 'precache-file-missing').map((f) => f.subject), ['/gone.css']);
  assert.equal(find(report, 'workbox-precache-read')[0].severity, 'info');
  assert.match(find(report, 'workbox-precache-read')[0].message, /2 entries/);
  assert.equal(find(report, 'workbox-not-read')[0].severity, 'info');
  for (const id of ['sw-no-fetch-handler', 'sw-no-offline-fallback', 'sw-cache-unversioned', 'sw-fetch-no-respondwith']) assert.deepEqual(find(report, id), [], id);
});

test('workbox: a worker that imports Workbox from the workbox CDN script is marked, and not read further', async () => {
  const report = await check(withWorker("importScripts('https://storage.googleapis.test/workbox-sw.js');\nworkbox.routing.registerRoute(() => true, new workbox.strategies.NetworkFirst());"));
  assert.equal(find(report, 'workbox-not-read').length, 1);
  assert.deepEqual(find(report, 'sw-no-fetch-handler'), []);
  assert.deepEqual(find(report, 'remote-not-read'), []);
});

test('workbox: a precache list that comes from the build is an info finding, with nothing checked', async () => {
  const report = await check(withWorker("import {precacheAndRoute} from 'workbox-precaching';\nprecacheAndRoute(self.__WB_MANIFEST);"));
  assert.ok(ids(report).includes('workbox-precache-read'));
  assert.match(find(report, 'workbox-precache-read')[0].message, /0 entries, and part of it is not written in the file/);
  assert.deepEqual(find(report, 'precache-file-missing'), []);
});

test('workbox: the shape that a build tool writes (define, workbox.precacheAndRoute, workbox.cleanupOutdatedCaches) is read', async () => {
  const code = "define(['./workbox-3e911b1d'], function (workbox) {\n  'use strict';\n  self.skipWaiting();\n  workbox.clientsClaim();\n  workbox.precacheAndRoute([{ \"url\": \"index.html\", \"revision\": \"0a27a4163254fc8fce870c8cc3a3f94f\" }, { \"url\": \"gone.js\", \"revision\": null }], {});\n  workbox.cleanupOutdatedCaches();\n});";
  const report = await check(withWorker(code));
  assert.deepEqual(find(report, 'precache-file-missing').map((f) => f.subject), ['gone.js']);
  assert.equal(find(report, 'workbox-precache-read').length, 1);
  assert.deepEqual(find(report, 'sw-no-fetch-handler'), []);
  assert.deepEqual(find(report, 'sw-cache-unversioned'), []);
});

test('workbox: a Workbox runtime file of the folder that the worker imports is recognized by its name and is not read as part of the worker', async () => {
  const files = { 'sw.js': "importScripts('/workbox-1a2b3c.js');\nworkbox.precacheAndRoute([]);", 'workbox-1a2b3c.js': "self.addEventListener('fetch', () => {}); self.skipWaiting(); caches.open('x');" };
  const report = await check(app(files));
  assert.deepEqual(report.input.files.map((f) => f.path).filter((p) => p.startsWith('workbox')), []);
  assert.deepEqual(find(report, 'sw-skip-waiting'), []);
  assert.equal(find(report, 'workbox-not-read').length, 1);
});

test('files: CRLF line ends and a byte order mark give the same lines as LF, in the page, the manifest and the worker', async () => {
  const crlf = (text) => text.split('\n').join('\r\n');
  const bom = String.fromCharCode(0xfeff);
  const base = app({ 'manifest.webmanifest': manifestWith({ display: 'browser' }), 'sw.js': "\n\nself.skipWaiting();\n" + WORKER });
  const converted = app({ 'index.html': bom + crlf(base['index.html']), 'manifest.webmanifest': bom + crlf(base['manifest.webmanifest']), 'sw.js': bom + crlf(base['sw.js']) });
  converted['manifest.webmanifest'] = bom + crlf(base['manifest.webmanifest']);
  const a = (await check(base)).findings.map((f) => [f.id, f.file, f.line]);
  const b = (await check(converted)).findings.map((f) => [f.id, f.file, f.line]);
  assert.deepEqual(b, a);
  assert.ok(a.some(([id, , line]) => id === 'sw-skip-waiting' && line === 3));
});

test('files: a backslash in an address is read as a slash, as a browser reads it', async () => {
  const report = await check(app({ 'js/sw.js': WORKER, 'sw.js': null, 'app.js': "navigator.serviceWorker.register('js\\\\sw.js', { scope: '/js/' });" }));
  assert.deepEqual(report.input.workers, ['js/sw.js']);
});

test('hostile worker: megabytes of nested calls, brackets and quotes are read in a short time and the run still ends with a report', async () => {
  const shapes = ['c.addAll('.repeat(120_000), "caches.open('".repeat(200_000), '[['.repeat(500_000) + ']'.repeat(10), 'x.catch('.repeat(150_000), 'a.add('.repeat(150_000)];
  for (const shape of shapes) {
    const started = Date.now();
    const report = await check(app({ 'sw.js': `${shape}\n` }));
    assert.ok(report.findings.length > 0);
    assert.ok(Date.now() - started < 5000, `${shape.slice(0, 10)} took ${Date.now() - started} ms`);
  }
});

test('the manifest and the worker agree: the worker of the baseline app controls the start page', async () => {
  const report = await check(app({ 'manifest.webmanifest': manifestWith({ start_url: '/offline.html' }) }), { failOn: 'warning' });
  assert.deepEqual(report.findings, []);
});
