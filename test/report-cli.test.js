import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { LIMITS, USAGE, VERSION, checkSite, csvCell, mdCell, memorySite, parseArgs, safeText, toCsv, toJson, toMarkdown, toText } from '../src/index.js';
import { PAGE, WORKER, app, check, cli, find, ids, manifestWith, run, withFiles } from './helpers.js';

const BROKEN = app({ 'manifest.webmanifest': manifestWith({ display: 'browser' }) });

test('exit codes: 0 without a finding at the level, 1 with one, 2 for a usage or input error', async () => {
  assert.equal((await run(app(), ['.'])).code, 0);
  assert.equal((await run(BROKEN, ['.'])).code, 1);
  assert.equal((await run(app(), [])).code, 2);
  assert.equal((await run({}, ['missing'])).code, 2);
});

test('--fail-on: warnings fail only at the level warning, and info never fails', async () => {
  const warn = app({ 'index.html': PAGE.replace('<meta name="viewport" content="width=device-width, initial-scale=1">', '') });
  assert.equal((await run(warn, ['.'])).code, 0);
  assert.equal((await run(warn, ['.', '--fail-on', 'warning'])).code, 1);
  const info = app({ 'manifest.webmanifest': manifestWith({ id: undefined }) });
  const r = await run(info, ['.', '--fail-on', 'warning']);
  assert.equal(r.code, 0);
  assert.match(r.out, /INFO {5}id-missing/);
  assert.match(r.out, /GATE: PASS \(--fail-on warning\)/);
  assert.equal((await run(info, ['.', '--fail-on', 'info'])).code, 2);
});

test('arguments: unknown options, missing values, bad formats and addresses are usage errors that print the usage', async () => {
  for (const argv of [['--nope'], ['.', '--format'], ['.', '--format', 'xml'], ['https://example.test/'], ['-'], ['.', '--fail-on', '--format'], ['a', 'b'], ['.', '--root', 'http://x.test/']]) {
    const r = await cli(argv);
    assert.equal(r.code, 2, argv.join(' '));
    assert.match(r.err, /Usage: pwa-offline-check/);
    assert.equal(r.out, '');
  }
  assert.throws(() => parseArgs(['.', '--root']), /needs a value/);
});

test('arguments: --help and --version print and exit 0, and the usage lists the checks and the exit codes', async () => {
  const help = await cli(['--help']);
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  assert.match(USAGE, /sw-no-fetch-handler/);
  assert.match(USAGE, /Exit codes: 0 no finding/);
  const version = await cli(['--version']);
  assert.equal(version.out, `${VERSION}\n`);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
});

test('input: a folder is read from its index.html, an HTML file is the page, and --root sets what a leading slash means', async () => {
  const files = app();
  const folder = JSON.parse((await run(files, ['.', '--format', 'json'])).out);
  assert.equal(folder.page, 'index.html');
  const sub = { ...files, 'app/page.html': PAGE, 'app/index.html': PAGE };
  const file = JSON.parse((await run(sub, ['app/page.html', '--root', '.', '--format', 'json'])).out);
  assert.equal(file.page, 'app/page.html');
  assert.equal(file.input.manifest, 'manifest.webmanifest');
  const nested = JSON.parse((await run(sub, ['app', '--root', '.', '--format', 'json'])).out);
  assert.equal(nested.page, 'app/index.html');
});

test('input: a folder with no index.html, a page outside the root and a missing page stop the run with exit code 2', async () => {
  const none = await run({ 'x.txt': 'x' }, ['.']);
  assert.equal(none.code, 2);
  assert.match(none.err, /index\.html: no such file/);
  const outside = await run({ 'a/index.html': PAGE, 'b/index.html': PAGE }, ['b', '--root', 'a']);
  assert.equal(outside.code, 2);
  assert.match(outside.err, /outside the root folder/);
  assert.equal((await run(app(), ['nope.html'])).code, 2);
});

test('input: a page over the size limit is refused with exit code 2, before it is read', async () => {
  const { main } = await import('../src/index.js');
  await withFiles({ 'index.html': 'x'.repeat(5000) }, async (dir) => {
    let err = '';
    const code = await main(['.'], { out: () => {}, err: (t) => { err += t; } }, { ...LIMITS, maxPageBytes: 1000 }, dir);
    assert.equal(code, 2);
    assert.match(err, /5,000 bytes is over the 1,000 bytes limit/);
  });
});

test('paths in the report are relative to the site, with forward slashes, and never absolute', async () => {
  const out = (await run(BROKEN, ['.'])).out;
  assert.doesNotMatch(out, /[A-Za-z]:\\|\/tmp\/|\\/);
  assert.match(out, /manifest\.webmanifest:\d+/);
});

test('text report: the counts, each finding with its file, line, fix and the quoted sources with their addresses, then the gate', async () => {
  const report = await check(BROKEN);
  const text = toText(report);
  assert.match(text, /^pwa-offline-check: index\.html\n/);
  assert.match(text, /findings: 1 error, 0 warning, 0 info/);
  assert.match(text, /ERROR {4}display-not-installable {2}manifest\.webmanifest:\d+/);
  assert.match(text, /fix: Set "display"/);
  assert.match(text, /source \(What does it take to be installable\?, Install criteria\): "display - must be one of/);
  assert.match(text, /https:\/\/web\.dev\/articles\/install-criteria/);
  assert.match(text, /GATE: FAIL - 1 error\n$/);
  assert.match(toText(await check(app())), /no findings[\s\S]*GATE: PASS/);
});

test('markdown report: a table row per finding, and text from a file cannot break the table or write HTML', async () => {
  const name = 'a|b<script>&"c"';
  const report = await check(app({ 'sw.js': `caches.open('v1').then((c) => c.addAll(['/${name}.js']));` }));
  const md = toMarkdown(report);
  assert.match(md, /^## pwa-offline-check: /);
  assert.match(md, /\| Severity \| Check \| Where \| About \| Message \| Fix \| Source \|/);
  assert.doesNotMatch(md, /<script>/);
  assert.match(md, /a\\\|b&lt;script&gt;&amp;/);
  for (const row of md.split('\n').filter((l) => l.startsWith('| error'))) assert.equal(row.replace(/\\\|/g, '').split('|').length, 9);
  assert.equal(mdCell('x|y\\z<&>\nw'), 'x\\|y\\\\z&lt;&amp;&gt; w');
});

test('json report: the whole report, with every finding, its sources, the notes and the gate', async () => {
  const report = JSON.parse(toJson(await check(BROKEN)));
  assert.equal(report.tool, 'pwa-offline-check');
  assert.deepEqual(Object.keys(report), ['tool', 'version', 'page', 'input', 'findings', 'notes', 'counts', 'gate']);
  assert.deepEqual(Object.keys(report.findings[0]), ['id', 'severity', 'file', 'line', 'subject', 'message', 'fix', 'manual']);
  assert.deepEqual(Object.keys(report.findings[0].manual[0]), ['page', 'section', 'url', 'quote']);
  assert.deepEqual(report.gate, { failOn: 'error', pass: false, reason: '1 error' });
  assert.deepEqual(report.input.files.map((f) => f.kind), ['page', 'manifest', 'script', 'worker']);
});

test('csv report: one row per finding with CRLF line ends, RFC 4180 quoting and a quote before a formula', async () => {
  const report = await check(app({ 'sw.js': "caches.open('v1').then((c) => c.addAll(['/=HYPERLINK(1).js', '/a\"b,c.js']));" }));
  const csv = toCsv(report);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'severity,id,file,line,about,message,fix,source_page,source_section,source_url');
  assert.equal(lines.at(-1), '');
  assert.equal(lines.length, 2 + report.findings.length);
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('+x'), "'+x");
  assert.equal(csvCell('-x'), "'-x");
  assert.equal(csvCell('@x'), "'@x");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '');
  assert.ok(csv.includes('"/a""b,c.js"'));
});

test('output is clean: control, line separator and direction characters in a name become a space', async () => {
  const hostile = `/a${String.fromCharCode(27)}[2Jb${String.fromCharCode(0x202e)}c${String.fromCharCode(0x2028)}d.js`;
  const report = await check(app({ 'sw.js': `caches.open('v1').then((c) => c.addAll(['${hostile}']));` }));
  const all = toText(report) + toMarkdown(report) + toJson(report) + toCsv(report);
  const unsafe = (s) => [...s].some((ch) => { const c = ch.charCodeAt(0); return c < 32 || (c >= 0x7f && c <= 0x9f) || c === 0x2028 || c === 0x2029 || c === 0x200e || c === 0x200f || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069); });
  assert.equal(unsafe(all.split(String.fromCharCode(13)).join('').split(String.fromCharCode(10)).join('')), false);
  assert.equal(safeText(`a${String.fromCharCode(7)}b`), 'a b');
  assert.equal(safeText('x'.repeat(300), 10), 'xxxxxxx...');
});

test('output is clean: a manifest member with control characters does not reach the report as one', async () => {
  const manifest = JSON.parse(manifestWith({}));
  manifest.display = `stand${String.fromCharCode(27)}alone`;
  const report = await check(app({ 'manifest.webmanifest': JSON.stringify(manifest) }));
  assert.match(find(report, 'display-not-installable')[0].message, /stand alone/);
});

test('the findings are listed by file in the order read, then by line, and the same files give the same report', async () => {
  const a = await check(BROKEN);
  const b = await check(BROKEN);
  assert.equal(toJson(a), toJson(b));
  const files = app({ 'index.html': PAGE.replace('<meta name="viewport" content="width=device-width, initial-scale=1">', ''), 'manifest.webmanifest': manifestWith({ display: 'browser', id: undefined }) });
  const report = await check(files);
  const order = report.findings.map((f) => f.file);
  assert.deepEqual(order, [...order].sort((x, y) => report.input.files.findIndex((f) => f.path === x) - report.input.files.findIndex((f) => f.path === y)));
});

test('hostile files: an unterminated comment, string or script is an error finding, and the run goes on', async () => {
  const report = await check(app({ 'sw.js': `${WORKER}\n/* never closed`, 'app.js': "navigator.serviceWorker.register('/sw.js');\nvar s = 'never closed" }));
  assert.deepEqual(find(report, 'unterminated-token').map((f) => [f.file, f.line]), [['app.js', 2], ['sw.js', 14]]);
  assert.equal(report.gate.pass, false);
  const page = await check(app({ 'index.html': `${PAGE}<!-- never closed` }));
  assert.equal(find(page, 'unterminated-token')[0].file, 'index.html');
});

test('hostile files: a worker with more tokens than the limit is cut and the result says so', async () => {
  const report = await check(app({ 'sw.js': `${WORKER}\n${'a();'.repeat(500)}` }), { limits: { ...LIMITS, maxTokens: 300 } });
  assert.equal(find(report, 'limit-reached')[0].severity, 'error');
  assert.equal(find(report, 'limit-reached')[0].file, 'sw.js');
});

test('hostile files: a script over the size limit and a file that is outside the root are findings, not skipped and not read', async () => {
  const big = await check(app({ 'app.js': 'x'.repeat(5000) }), { limits: { ...LIMITS, maxScriptBytes: 1000 } });
  assert.match(find(big, 'file-not-read')[0].message, /5,000 bytes is over the 1,000 bytes limit/);
  const outside = await check(app({ 'sw.js': '->outside' }));
  assert.match(find(outside, 'file-not-read')[0].message, /outside the folder/);
  const special = await check(app({ 'manifest.webmanifest': '->special' }));
  assert.match(find(special, 'file-not-read')[0].message, /not a regular file/);
});

test('hostile files: a link that climbs above the root is not read, whichever file holds it', async () => {
  const manifestLink = await check(app({ 'index.html': PAGE.replace('/manifest.webmanifest', '../../manifest.webmanifest') }));
  assert.match(find(manifestLink, 'file-not-read')[0].message, /climbs above the folder/);
  const icon = await check(app({ 'manifest.webmanifest': manifestWith({ icons: [{ src: '../../etc/x.png', sizes: '192x192', type: 'image/png' }, { src: '/icons/512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }] }) }));
  assert.match(find(icon, 'file-not-read')[0].message, /climbs above the folder/);
  const script = await check(app({ 'index.html': PAGE.replace('/app.js', '../../app.js') }));
  assert.ok(script.notes.join().includes('not found in the folder'));
  const imports = await check(app({ 'sw.js': `${WORKER}\nimportScripts('../../x.js');` }));
  assert.deepEqual(find(imports, 'sw-import-missing'), []);
});

test('hostile files: a symbolic link that leads out of the folder is refused when the folder is read from disk', async (t) => {
  await withFiles({ 'root/index.html': PAGE, 'root/manifest.webmanifest': JSON.stringify({ name: 'x' }), 'secret/sw.js': WORKER, 'secret/app.js': "navigator.serviceWorker.register('/sw.js');" }, async (dir) => {
    try {
      await symlink(resolve(dir, 'secret'), resolve(dir, 'root/linked'), 'junction');
    } catch (error) {
      t.skip(`cannot make a link here (${error.code})`);
      return;
    }
    await writeFile(resolve(dir, 'root/index.html'), PAGE.replace('/app.js', '/linked/app.js'));
    const r = await run_in(dir, ['root', '--format', 'json']);
    const report = JSON.parse(r.out);
    assert.ok(report.findings.some((f) => f.id === 'file-not-read'));
    assert.deepEqual(report.input.workers, []);
  });
});

async function run_in(dir, args) {
  const { main } = await import('../src/index.js');
  let out = '';
  let err = '';
  const code = await main(args, { out: (x) => { out += x; }, err: (x) => { err += x; } }, undefined, dir);
  return { code, out, err };
}

test('an example folder on disk gives the same report as the same files in memory', async () => {
  await withFiles(app(), async (dir) => {
    await mkdir(resolve(dir, 'extra'), { recursive: true });
    const disk = JSON.parse((await run_in(dir, ['.', '--format', 'json'])).out);
    const memory = JSON.parse(toJson(await checkSite(memorySite(app()), { version: VERSION })));
    assert.deepEqual(disk.findings, memory.findings);
    assert.deepEqual(disk.input.files.map((f) => f.path), memory.input.files.map((f) => f.path));
  });
});

test('the total size of the files read is bounded', async () => {
  const files = app({ 'app.js': "navigator.serviceWorker.register('/sw.js');", 'sw.js': WORKER });
  const report = await check(files, { limits: { ...LIMITS, maxTotalBytes: 400 } });
  assert.match(report.notes.join('\n'), /total size of the files read reached the limit/);
  assert.ok(ids(report).includes('file-not-read') || ids(report).includes('manifest-file-missing') || report.notes.length > 0);
});
