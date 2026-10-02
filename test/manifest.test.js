import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app, check, find, ids, manifestWith, png } from './helpers.js';
import { inspectManifest, parentPath, parseManifest, parseSizes, withinScope } from '../src/index.js';

const BASE = 'https://pwa.invalid/manifest.webmanifest';
const inspect = (json) => inspectManifest(json, BASE);
const issueIds = (json) => inspect(json).issues.map((i) => i.id);

test('baseline: a complete app has no finding, and passes the strictest gate', async () => {
  const report = await check(app(), { failOn: 'warning' });
  assert.deepEqual(report.findings, []);
  assert.equal(report.gate.pass, true);
  assert.deepEqual(report.input.workers, ['sw.js']);
  assert.equal(report.input.manifest, 'manifest.webmanifest');
  assert.equal(report.input.scripts, 1);
});

test('manifest link: a page with no <link rel="manifest"> is an error, and every other way to write the rel is accepted', async () => {
  const none = await check(app({ 'index.html': '<!doctype html><meta name="viewport" content="width=device-width"><meta name="theme-color" content="#fff"><script src="/app.js"></script>' }));
  assert.ok(ids(none).includes('manifest-link-missing'));
  assert.equal(find(none, 'manifest-link-missing')[0].severity, 'error');
  for (const rel of ['manifest', 'MANIFEST', 'icon manifest', 'manifest  icon']) {
    const page = `<meta name="viewport" content="width=device-width"><meta name="theme-color" content="#fff"><link rel="${rel}" href="/manifest.webmanifest"><script src="/app.js"></script>`;
    assert.ok(!ids(await check(app({ 'index.html': page }))).includes('manifest-link-missing'), rel);
  }
});

test('manifest link: a link element inside a comment or in a script text is not a link', async () => {
  const page = '<meta name="viewport" content="width=device-width"><meta name="theme-color" content="#fff"><!-- <link rel="manifest" href="/manifest.webmanifest"> --><script>var s = \'<link rel="manifest" href="/manifest.webmanifest">\';</script><script src="/app.js"></script>';
  assert.ok(ids(await check(app({ 'index.html': page }))).includes('manifest-link-missing'));
});

test('manifest link: a link to a file that is not in the folder is an error, with the other letter case named', async () => {
  const missing = await check(app({ 'manifest.webmanifest': null }));
  assert.deepEqual(ids(missing).filter((i) => i.startsWith('manifest-')), ['manifest-file-missing']);
  const wrongCase = await check(app({ 'manifest.webmanifest': null, 'Manifest.webmanifest': '{}' }));
  assert.match(find(wrongCase, 'manifest-file-missing')[0].message, /named Manifest\.webmanifest/);
});

test('manifest link: a second manifest link is noted and the first is read, a remote one is not fetched', async () => {
  const two = await check(app({ 'index.html': app()['index.html'].replace('</head>', '<link rel="manifest" href="/other.json"></head>') }));
  assert.match(two.notes.join('\n'), /links 2 manifests; the first one is read/);
  const remote = await check(app({ 'index.html': app()['index.html'].replace('/manifest.webmanifest', 'https://cdn.example/m.json') }));
  assert.ok(ids(remote).includes('remote-not-read'));
  assert.equal(remote.input.manifest, null);
});

test('manifest json: invalid JSON is an error at the line of the mistake, and the text of the parser message is not shown', async () => {
  const report = await check(app({ 'manifest.webmanifest': '{\n  "name": "x",\n  "start_url": ,\n}\n' }));
  const f = find(report, 'manifest-invalid-json')[0];
  assert.equal(f.severity, 'error');
  assert.equal(f.line, 3);
  assert.doesNotMatch(f.message, /start_url|Unexpected/);
  assert.ok(f.manual[0].quote.includes('parsing exception'));
});

test('manifest json: JSON that is not an object is an error, a byte order mark is ignored', async () => {
  assert.ok(ids(await check(app({ 'manifest.webmanifest': '[1, 2]' }))).includes('manifest-invalid-json'));
  assert.deepEqual(parseManifest('null'), { problem: 'not-object', line: null });
  assert.deepEqual(parseManifest(`${String.fromCharCode(0xfeff)}{"a":1}`).value, { a: 1 });
  assert.equal(parseManifest('{').problem, 'invalid');
});

test('name: neither name nor short_name is an error; one of them is enough; an empty or non-string value counts as absent', () => {
  assert.ok(issueIds({ start_url: '/', display: 'standalone' }).includes('name-missing'));
  assert.ok(issueIds({ name: '   ', short_name: 5 }).includes('name-missing'));
  assert.ok(!issueIds({ short_name: 'Test' }).includes('name-missing'));
  assert.ok(!issueIds({ name: 'Test' }).includes('name-missing'));
});

test('start_url: absent, empty, not a string or not a valid URL is an error, a path or an address is fine', () => {
  for (const value of [undefined, '', '  ', 7, null, 'https://']) {
    const ids2 = issueIds({ name: 'x', start_url: value });
    assert.ok(ids2.includes('start-url-missing'), String(value));
  }
  for (const value of ['./', '/', '/app/', 'index.html', 'https://app.example/']) assert.ok(!issueIds({ name: 'x', start_url: value }).includes('start-url-missing'), value);
});

test('start_url: a page that is not in the folder is a warning, a folder with an index.html and a file are fine', async () => {
  const missing = await check(app({ 'manifest.webmanifest': manifestWith({ start_url: '/home.html', scope: '/' }) }));
  assert.equal(find(missing, 'start-url-not-found')[0].severity, 'warning');
  assert.match(find(missing, 'start-url-not-found')[0].message, /does not see the rewrite|tool does not see/);
  assert.ok(!ids(await check(app())).includes('start-url-not-found'));
  assert.ok(!ids(await check(app({ 'manifest.webmanifest': manifestWith({ start_url: '/offline.html' }), }))).includes('start-url-not-found'));
  const noIndex = await check(app({ 'sub/other.html': 'x', 'manifest.webmanifest': manifestWith({ start_url: '/sub/', scope: '/' }) }));
  assert.ok(ids(noIndex).includes('start-url-not-found'));
});

test('display: absent is display-missing; browser, an unknown word or a non-string is display-not-installable; the accepted modes pass', () => {
  assert.ok(issueIds({ name: 'x' }).includes('display-missing'));
  for (const value of ['browser', 'Browser', 'fullscren', 7, '']) assert.ok(issueIds({ name: 'x', display: value }).includes('display-not-installable'), String(value));
  for (const value of ['fullscreen', 'standalone', 'minimal-ui', 'window-controls-overlay', ' Standalone ']) {
    const found = issueIds({ name: 'x', display: value });
    assert.ok(!found.includes('display-missing') && !found.includes('display-not-installable'), value);
  }
});

test('display: display_override with an accepted mode satisfies the criteria, and one without does not', () => {
  assert.deepEqual(issueIds({ name: 'x', display_override: ['window-controls-overlay', 'standalone'] }).filter((i) => i.startsWith('display')), []);
  assert.ok(issueIds({ name: 'x', display_override: ['browser'] }).includes('display-not-installable'));
  assert.ok(issueIds({ name: 'x', display: 'browser', display_override: ['standalone'] }).every((i) => !i.startsWith('display')));
});

test('prefer_related_applications: true is an error, false and absent are not', () => {
  assert.ok(issueIds({ name: 'x', prefer_related_applications: true }).includes('prefer-related-applications'));
  assert.ok(!issueIds({ name: 'x', prefer_related_applications: false }).includes('prefer-related-applications'));
  assert.ok(!issueIds({ name: 'x' }).includes('prefer-related-applications'));
});

test('icons: absent, empty, not a list or without any src is an error, with a note for the entries that cannot be read', () => {
  for (const icons of [undefined, [], 'x', {}, [{ sizes: '192x192' }], [null, 3]]) assert.ok(issueIds({ name: 'x', icons }).includes('icons-missing'), JSON.stringify(icons));
  const partial = inspect({ name: 'x', icons: [{ src: 'a.png' }, { sizes: '1x1' }] });
  assert.ok(!partial.issues.some((i) => i.id === 'icons-missing'));
  assert.match(partial.notes.join(), /1 entry of icons has no src/);
});

test('icons: the 192px and the 512px icon are needed, and a missing one is named', () => {
  const only192 = inspect({ name: 'x', icons: [{ src: 'a.png', sizes: '192x192', type: 'image/png' }] });
  const issue = only192.issues.find((i) => i.id === 'icons-missing-install-sizes');
  assert.match(issue.message, /No icon is declared as 512x512/);
  const none = inspect({ name: 'x', icons: [{ src: 'a.png', sizes: '48x48', type: 'image/png' }] }).issues.find((i) => i.id === 'icons-missing-install-sizes');
  assert.match(none.message, /192x192 and 512x512/);
  assert.ok(!issueIds({ name: 'x', icons: [{ src: 'a.png', sizes: '48x48 192x192' }, { src: 'b.png', sizes: '512x512' }] }).includes('icons-missing-install-sizes'));
});

test('icons: a size of 191x191 or 192x193 is not the 192px icon, and sizes written in capitals are read', () => {
  assert.ok(issueIds({ name: 'x', icons: [{ src: 'a.png', sizes: '191x191' }, { src: 'b.png', sizes: '512x512' }] }).includes('icons-missing-install-sizes'));
  assert.ok(issueIds({ name: 'x', icons: [{ src: 'a.png', sizes: '192x193' }, { src: 'b.png', sizes: '512x512' }] }).includes('icons-missing-install-sizes'));
  assert.ok(!issueIds({ name: 'x', icons: [{ src: 'a.png', sizes: '192X192' }, { src: 'b.png', sizes: '512X512' }] }).includes('icons-missing-install-sizes'));
});

test('icons: an icon with sizes "any" is not counted, and the report says that it cannot judge instead of reporting an error', () => {
  const result = inspect({ name: 'x', icons: [{ src: 'a.svg', sizes: 'any', type: 'image/svg+xml' }] });
  assert.ok(!result.issues.some((i) => i.id === 'icons-missing-install-sizes'));
  assert.match(result.notes.join(), /sizes "any" is not counted/);
});

test('icons: sizes, type and purpose are looked at one icon at a time, with the index in the subject', () => {
  const result = inspect({ name: 'x', icons: [{ src: 'a.png' }, { src: 'b.png', sizes: '192x192', type: 'image/png', purpose: 'fizzbuzz' }] });
  const by = (id) => result.issues.filter((i) => i.id === id).map((i) => i.subject);
  assert.deepEqual(by('icon-sizes-missing'), ['icons[0]']);
  assert.deepEqual(by('icon-type-missing'), ['icons[0]']);
  assert.deepEqual(by('icon-purpose-ignored'), ['icons[1]']);
});

test('icons: a purpose is ignored only when no keyword is known, and the keywords are case-sensitive', () => {
  const purposeIssues = (purpose) => inspect({ name: 'x', icons: [{ src: 'a.png', sizes: '1x1', type: 'image/png', purpose }] }).issues.map((i) => i.id);
  assert.ok(purposeIssues('fizzbuzz').includes('icon-purpose-ignored'));
  assert.ok(purposeIssues('Maskable').includes('icon-purpose-ignored'));
  assert.ok(!purposeIssues('monochrome fizzbuzz').includes('icon-purpose-ignored'));
  assert.ok(!purposeIssues('any maskable').includes('icon-purpose-ignored'));
  assert.ok(!purposeIssues(undefined).includes('icon-purpose-ignored'));
});

test('icons: a maskable icon is wanted, and one is enough', () => {
  assert.ok(issueIds({ name: 'x', icons: [{ src: 'a.png', sizes: '192x192', type: 'image/png' }] }).includes('maskable-icon-missing'));
  assert.ok(!issueIds({ name: 'x', icons: [{ src: 'a.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' }] }).includes('maskable-icon-missing'));
});

test('icon files: an icon that is not in the folder is an error, a name with other letters is told, a present file is fine', async () => {
  const gone = await check(app({ 'icons/512.png': null }));
  assert.deepEqual(find(gone, 'icon-file-missing').map((f) => f.subject), ['icons[1]']);
  const wrong = await check(app({ 'icons/512.png': null, 'icons/512.PNG': png(512, 512) }));
  assert.match(find(wrong, 'icon-file-missing')[0].message, /named 512\.PNG/);
  assert.deepEqual(find(await check(app()), 'icon-file-missing'), []);
});

test('icon files: the size that a PNG file states must be one of the declared sizes; other formats are not looked at', async () => {
  const wrong = await check(app({ 'icons/192.png': png(180, 180) }));
  const f = find(wrong, 'icon-size-mismatch')[0];
  assert.equal(f.severity, 'warning');
  assert.match(f.message, /says 192x192, and the PNG file is 180x180/);
  assert.deepEqual(find(await check(app({ 'icons/192.png': png(192, 192) })), 'icon-size-mismatch'), []);
  const notPng = await check(app({ 'icons/192.png': 'GIF89a not a png file at all......' }));
  assert.deepEqual(find(notPng, 'icon-size-mismatch'), []);
  assert.match(notPng.notes.join(), /does not start like a PNG file/);
});

test('icon files: an icon whose sizes list several sizes matches when the file has one of them', async () => {
  const manifest = manifestWith({ icons: [{ src: '/icons/192.png', sizes: '48x48 192x192', type: 'image/png' }, { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] });
  assert.deepEqual(find(await check(app({ 'manifest.webmanifest': manifest })), 'icon-size-mismatch'), []);
});

test('id: absent is info, a path of the site is fine, another origin is ignored with a warning', async () => {
  assert.equal(inspect({ name: 'x', start_url: '/' }).issues.find((i) => i.id === 'id-missing').id, 'id-missing');
  for (const id of ['/', '/recipes/', 'recipes', 'https://pwa.invalid/x']) assert.ok(!issueIds({ name: 'x', start_url: '/', id }).includes('id-missing') && !issueIds({ name: 'x', start_url: '/', id }).includes('id-ignored'), id);
  assert.ok(issueIds({ name: 'x', start_url: 'https://app.example/', id: 'https://other.example/x' }).includes('id-ignored'));
  assert.ok(issueIds({ name: 'x', start_url: '/', id: 'http://' }).includes('id-ignored'));
  const report = await check(app({ 'manifest.webmanifest': manifestWith({ id: undefined }) }));
  assert.equal(find(report, 'id-missing')[0].severity, 'info');
});

test('scope: a scope that does not hold start_url is a warning, one that does is fine', async () => {
  const bad = inspect({ name: 'x', start_url: '/index.html', scope: '/recipes/' });
  assert.ok(bad.issues.some((i) => i.id === 'scope-excludes-start-url'));
  assert.ok(!issueIds({ name: 'x', start_url: '/recipes/', scope: '/recipes/' }).includes('scope-excludes-start-url'));
  assert.ok(!issueIds({ name: 'x', start_url: '/recipes/home.html', scope: '/' }).includes('scope-excludes-start-url'));
  assert.ok(issueIds({ name: 'x', start_url: 'https://a.example/app/', scope: 'https://b.example/app/' }).includes('scope-excludes-start-url'));
  assert.ok(issueIds({ name: 'x', start_url: '/', scope: 'https://' }).includes('scope-excludes-start-url'));
  const report = await check(app({ 'manifest.webmanifest': manifestWith({ start_url: '/offline.html', scope: '/app/' }) }));
  assert.equal(find(report, 'scope-excludes-start-url')[0].severity, 'warning');
});

test('scope: a scope without a trailing slash is info, and a missing scope is info only when start_url is not at the root', () => {
  assert.ok(issueIds({ name: 'x', start_url: '/app/', scope: '/app' }).includes('scope-no-trailing-slash'));
  assert.ok(!issueIds({ name: 'x', start_url: '/app/', scope: '/app/' }).includes('scope-no-trailing-slash'));
  assert.ok(issueIds({ name: 'x', start_url: '/app/home.html' }).includes('scope-missing'));
  assert.ok(!issueIds({ name: 'x', start_url: '/index.html' }).includes('scope-missing'));
  assert.ok(!issueIds({ name: 'x', start_url: '/' }).includes('scope-missing'));
});

test('scope: the rule is the specification\'s: the same origin and a path that starts with the scope path', () => {
  const u = (s) => new URL(s);
  assert.equal(withinScope(u('https://a.example/app/x'), u('https://a.example/app/')), true);
  assert.equal(withinScope(u('https://a.example/application'), u('https://a.example/app')), true);
  assert.equal(withinScope(u('https://a.example/other/'), u('https://a.example/app/')), false);
  assert.equal(withinScope(u('https://b.example/app/'), u('https://a.example/app/')), false);
  assert.equal(parentPath('/pages/welcome.html'), '/pages/');
  assert.equal(parentPath('/'), '/');
});

test('sizes: a list of widths and heights is read, "any" is told, other words are ignored', () => {
  assert.deepEqual(parseSizes('48x48 96X96  any nonsense 5x'), { pairs: [{ w: 48, h: 48 }, { w: 96, h: 96 }], any: true });
  assert.deepEqual(parseSizes(''), { pairs: [], any: false });
});

test('theme color and viewport: a page needs the viewport meta, and a theme color from the page or the manifest', async () => {
  const bare = '<link rel="manifest" href="/manifest.webmanifest"><script src="/app.js"></script>';
  const report = await check(app({ 'index.html': bare, 'manifest.webmanifest': manifestWith({ theme_color: undefined }) }));
  assert.equal(find(report, 'viewport-missing')[0].severity, 'warning');
  assert.equal(find(report, 'theme-color-missing')[0].severity, 'info');
  const fromManifest = await check(app({ 'index.html': bare }));
  assert.deepEqual(find(fromManifest, 'theme-color-missing'), []);
  const fromMeta = await check(app({ 'index.html': `${bare}<meta name="theme-color" content="#fff">`, 'manifest.webmanifest': manifestWith({ theme_color: undefined }) }));
  assert.deepEqual(find(fromMeta, 'theme-color-missing'), []);
  const viewportOk = await check(app({ 'index.html': `${bare}<META NAME="Viewport" CONTENT="width=device-width">` }));
  assert.deepEqual(find(viewportOk, 'viewport-missing'), []);
});

test('insecure addresses: http in start_url, scope, an icon or the manifest link is an error, localhost and the loopback are not', async () => {
  for (const [member, value] of [['start_url', 'http://app.example/'], ['scope', 'http://app.example/']]) {
    const manifest = manifestWith({ [member]: value, ...(member === 'scope' ? {} : { scope: undefined }) });
    const report = await check(app({ 'manifest.webmanifest': manifest }));
    assert.ok(find(report, 'insecure-url').some((f) => f.subject === member), member);
  }
  const icon = await check(app({ 'manifest.webmanifest': manifestWith({ icons: [{ src: 'http://cdn.example/192.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/512.png', sizes: '512x512', type: 'image/png' }] }) }));
  assert.equal(find(icon, 'insecure-url')[0].subject, 'icons[0].src');
  assert.equal(find(icon, 'insecure-url')[0].severity, 'error');
  const link = await check(app({ 'index.html': app()['index.html'].replace('/manifest.webmanifest', 'http://app.example/m.json') }));
  assert.ok(ids(link).includes('insecure-url'));
  for (const host of ['http://localhost:8080/', 'http://127.0.0.1/', 'http://app.localhost/', 'http://[::1]/', 'https://app.example/']) {
    const report = await check(app({ 'manifest.webmanifest': manifestWith({ start_url: host, scope: undefined }) }));
    assert.deepEqual(find(report, 'insecure-url'), [], host);
  }
});

test('insecure addresses: the number of findings is bounded', async () => {
  const icons = Array.from({ length: 60 }, (_, i) => ({ src: `http://cdn.example/${i}.png`, sizes: '192x192', type: 'image/png' }));
  const report = await check(app({ 'manifest.webmanifest': manifestWith({ icons }) }), { limits: undefined });
  assert.ok(find(report, 'insecure-url').length <= 20);
});

test('a manifest address that is absolute and of the site\'s own origin is read as a path of the site', async () => {
  const manifest = manifestWith({ start_url: 'https://app.example/', scope: 'https://app.example/', id: 'https://app.example/', icons: [{ src: 'https://app.example/icons/192.png', sizes: '192x192', type: 'image/png' }, { src: 'https://app.example/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] });
  const report = await check(app({ 'manifest.webmanifest': manifest }), { failOn: 'warning' });
  assert.deepEqual(report.findings, []);
});

test('addresses that are not valid URLs do not stop the run: the manifest link, the worker and an import are reported or ignored', async () => {
  const page = app()['index.html'].replace('/manifest.webmanifest', 'https://');
  const a = await check(app({ 'index.html': page }));
  assert.ok(ids(a).includes('remote-not-read'));
  const b = await check(app({ 'app.js': "navigator.serviceWorker.register('http://[bad');" }));
  assert.ok(ids(b).includes('sw-script-missing'));
  const c = await check(app({ 'sw.js': `${app()['sw.js']}\nimportScripts('https://');` }));
  assert.ok(ids(c).includes('remote-not-read'));
});

test('a manifest with very many icons is read in a short time, and only the first ones are looked at', async () => {
  const icons = Array.from({ length: 20_000 }, (_, i) => ({ src: `/i/${i}.png` }));
  const started = Date.now();
  const report = await check(app({ 'manifest.webmanifest': manifestWith({ icons }) }));
  assert.ok(Date.now() - started < 5000);
  assert.match(report.notes.join('\n'), /Only the first 100 icons were looked at/);
  assert.ok(report.findings.length < 1000);
});

test('icons beyond the limit are not looked at, and the report says so', async () => {
  const icons = Array.from({ length: 5 }, (_, i) => ({ src: `/icons/${i}.png`, sizes: '192x192', type: 'image/png' }));
  const { LIMITS } = await import('../src/index.js');
  const report = await check(app({ 'manifest.webmanifest': manifestWith({ icons }) }), { limits: { ...LIMITS, maxIcons: 2 } });
  assert.match(report.notes.join(), /Only the first 2 icons were looked at/);
  assert.equal(find(report, 'icon-file-missing').length, 2);
});
