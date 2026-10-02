import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { FACTS, FINDINGS, ICON_PURPOSES, INSTALL_DISPLAY, INSTALL_ICON_SIZES, ORDER, SEVERITIES, SOURCES, SPEC_DISPLAY, WORKBOX, manualFor, sourceUrl } from '../src/index.js';

const dir = new URL('../research/sources/', import.meta.url);
const page = async (id) => readFile(new URL(SOURCES.find((s) => s.id === id).file, dir), 'utf8');
const quotes = (t) => t.split(String.fromCharCode(0x2019)).join("'").split(String.fromCharCode(0x2018)).join("'").split(String.fromCharCode(0x201c)).join('"').split(String.fromCharCode(0x201d)).join('"');
// Text compared without line breaks, runs of white space or the typographic quotes.
const flat = (t) => quotes(t).replace(/\s+/g, ' ').trim();
const has = (text, needle) => flat(text).includes(flat(needle));

test('sources: every saved page has its address on the first line and holds text', async () => {
  for (const s of SOURCES) {
    const text = await page(s.id);
    assert.equal(text.split('\n')[0], `Source: ${s.url}`, s.file);
    assert.ok(text.length > 1500, `${s.file} holds the page text`);
  }
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.url)).size);
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.file)).size);
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.id)).size);
});

test('sources: every file in research/sources is listed in src/data.js, and the other way round', async () => {
  const files = (await readdir(dir)).sort();
  assert.deepEqual(files, SOURCES.map((s) => s.file).sort());
});

test('sources: the pages come from the W3C, MDN, web.dev and the Workbox documentation only', () => {
  for (const s of SOURCES) {
    assert.match(s.url, /^https:\/\/(?:www\.w3\.org\/TR\/|developer\.mozilla\.org\/en-US\/docs\/|web\.dev\/articles\/|developer\.chrome\.com\/docs\/workbox\/)/, s.url);
  }
  assert.equal(sourceUrl('manifest-spec'), 'https://www.w3.org/TR/appmanifest/');
  assert.equal(sourceUrl('sw-spec'), 'https://www.w3.org/TR/service-workers/');
});

test('sources: the title of every page is a heading of the saved text', async () => {
  for (const s of SOURCES) {
    const lines = (await page(s.id)).split('\n').map((l) => l.replace(/ #$/, ''));
    assert.ok(lines.includes(`# ${s.title}`), `${s.file}: # ${s.title}`);
  }
});

test('facts: every quoted sentence is on the saved page it names, word for word', async () => {
  assert.ok(Object.keys(FACTS).length >= 80);
  for (const [key, fact] of Object.entries(FACTS)) {
    assert.ok(SOURCES.some((s) => s.id === fact.source), `${key}: source`);
    assert.ok(has(await page(fact.source), fact.text), `${key}: "${fact.text}"`);
  }
});

test('facts: the section of every fact is a heading of the saved page, and the sentence is under it', async () => {
  const minor = new Set(['# Note', '# Tip', '# Warning', '# Caution', '# Important']);
  for (const [key, fact] of Object.entries(FACTS)) {
    const lines = (await page(fact.source)).split(String.fromCharCode(10)).map((l) => l.replace(/ #$/, ''));
    const at = lines.indexOf(`# ${fact.section}`);
    assert.ok(at >= 0, `${key}: # ${fact.section}`);
    let end = at + 1;
    while (end < lines.length && !(lines[end].startsWith('# ') && !minor.has(lines[end]))) end += 1;
    assert.ok(has(lines.slice(at, end).join(' '), fact.text), `${key}: the sentence is under ${fact.section}`);
  }
});

test('facts: no sentence is quoted twice under two names', () => {
  const seen = new Map();
  for (const [key, fact] of Object.entries(FACTS)) {
    const id = `${fact.source}|${flat(fact.text)}`;
    assert.ok(!seen.has(id), `${key} repeats ${seen.get(id)}`);
    seen.set(id, key);
  }
});

test('facts: the display modes that the install criteria accept are the words of the web.dev page', async () => {
  const criteria = await page('install-criteria');
  assert.ok(has(criteria, 'display - must be one of fullscreen, standalone, minimal-ui, or window-controls-overlay'));
  assert.deepEqual(INSTALL_DISPLAY, ['fullscreen', 'standalone', 'minimal-ui', 'window-controls-overlay']);
  for (const mode of INSTALL_DISPLAY) assert.ok(criteria.includes(mode), mode);
});

test('facts: the display modes of the specification are the ones it lists', async () => {
  const spec = await page('manifest-spec');
  assert.deepEqual(SPEC_DISPLAY, ['fullscreen', 'standalone', 'minimal-ui', 'browser']);
  for (const mode of SPEC_DISPLAY) assert.ok(spec.includes(`\n${mode}\n`), mode);
  assert.ok(has(spec, 'The icon purposes list is the list'));
});

test('facts: the icon purposes are the ones the specification lists, in its order', async () => {
  const spec = await page('manifest-spec');
  assert.deepEqual(ICON_PURPOSES, ['monochrome', 'maskable', 'any']);
  for (const purpose of ICON_PURPOSES) assert.ok(spec.includes(`\n${purpose}`), purpose);
});

test('facts: the icon sizes of the install criteria are the 192px and 512px icons that the pages name', async () => {
  assert.deepEqual(INSTALL_ICON_SIZES, [192, 512]);
  assert.ok(has(await page('install-criteria'), 'icons - must include a 192px and a 512px icon'));
  assert.ok(has(await page('installable'), 'icons must contain a 192px and a 512px icon'));
});

test('facts: the Workbox calls that the tool recognizes are on the saved Workbox page', async () => {
  const workbox = await page('workbox');
  assert.deepEqual(WORKBOX.route, ['precacheAndRoute', 'addRoute']);
  for (const name of [...WORKBOX.route, ...WORKBOX.precache, ...WORKBOX.cleanup, ...WORKBOX.fallback]) assert.ok(workbox.includes(name), name);
  assert.ok(has(workbox, 'precacheAndRoute([ {url: \'/index.html\', revision: \'383676\'},'));
});

test('findings: every check has a unique id, a severity, an order and facts that exist', () => {
  assert.ok(FINDINGS.length >= 45);
  assert.equal(new Set(FINDINGS.map((f) => f.id)).size, FINDINGS.length);
  for (const f of FINDINGS) {
    assert.match(f.id, /^[a-z]+(?:-[a-z]+)*$/);
    assert.ok(SEVERITIES.includes(f.severity), f.id);
    assert.equal(typeof ORDER[f.id], 'number');
    for (const key of [...f.facts, ...(f.optional ?? [])]) assert.ok(FACTS[key], `${f.id}: ${key}`);
  }
  const rank = FINDINGS.map((f) => SEVERITIES.indexOf(f.severity));
  assert.deepEqual(rank, [...rank].sort((a, b) => a - b));
});

test('findings: every fact of data.js is used by at least one check', () => {
  const used = new Set(FINDINGS.flatMap((f) => [...f.facts, ...(f.optional ?? [])]));
  for (const key of Object.keys(FACTS)) assert.ok(used.has(key), `${key} is not quoted by any check`);
});

test('findings: the checks that rest on a source quote it, and the ones about the file itself do not', () => {
  const own = ['sw-import-missing', 'file-not-read', 'unterminated-token', 'limit-reached', 'workbox-not-read', 'worker-dynamic', 'sw-register-dynamic', 'remote-not-read'];
  for (const f of FINDINGS) assert.equal(f.facts.length === 0, own.includes(f.id), f.id);
  const m = manualFor('viewport-missing');
  assert.equal(m.length, 2);
  assert.deepEqual(Object.keys(m[0]).sort(), ['page', 'quote', 'section', 'url']);
  assert.throws(() => manualFor('viewport-missing', ['mdn-claim']), /does not quote/);
});
