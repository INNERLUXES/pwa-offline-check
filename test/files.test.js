import { test } from 'node:test';
import assert from 'node:assert/strict';
import { symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FILE_LIMITS, compareNames, diskSite, displayPath, fileError, locateInput, memorySite, parseRef } from '../src/index.js';
import { withFiles } from './helpers.js';

test('addresses: a relative path is worked out from the folder of the file, an absolute one from the root', () => {
  assert.deepEqual(parseRef('js/sw.js', ['app']), { kind: 'local', segments: ['app', 'js', 'sw.js'], outside: false, bad: false, trailing: false });
  assert.deepEqual(parseRef('/sw.js', ['app']).segments, ['sw.js']);
  assert.deepEqual(parseRef('../x.png', ['app', 'img']).segments, ['app', 'x.png']);
  assert.deepEqual(parseRef('./a/./b', []).segments, ['a', 'b']);
});

test('addresses: a path that climbs above the root is outside, however it is written', () => {
  assert.equal(parseRef('../x', []).outside, true);
  assert.equal(parseRef('a/../../x', []).outside, true);
  assert.equal(parseRef('/../x', []).outside, true);
  assert.equal(parseRef('..\\x', []).outside, true);
  assert.equal(parseRef('%2e%2e/x', []).outside, true);
  assert.equal(parseRef('a/b/../c', []).outside, false);
});

test('addresses: the query and the fragment are not part of the path, and a trailing slash is kept as a fact', () => {
  assert.deepEqual(parseRef('sw.js?v=3#x', []).segments, ['sw.js']);
  assert.equal(parseRef('docs/', []).trailing, true);
  assert.equal(parseRef('', []).kind, 'empty');
  assert.equal(parseRef('?q=1', []).trailing, true);
});

test('addresses: http, https and protocol-relative addresses are remote, other schemes are other, and nothing is opened', () => {
  assert.deepEqual(parseRef('https://cdn.example/x.js'), { kind: 'remote', url: 'https://cdn.example/x.js' });
  assert.equal(parseRef('//cdn.example/x.js').kind, 'remote');
  assert.equal(parseRef('HTTP://a.example/').kind, 'remote');
  for (const other of ['data:text/plain,hi', 'blob:abc', 'javascript:void(0)', 'mailto:a@b.example', 'file:///etc/passwd']) assert.equal(parseRef(other).kind, 'other', other);
});

test('addresses: a name that cannot be a file name is marked bad', () => {
  assert.equal(parseRef('a%2fb', []).bad, true);
  assert.equal(parseRef('a%5cb', []).bad, true);
  assert.equal(parseRef('a%00b', []).bad, true);
  assert.equal(parseRef('%zz', []).bad, true);
  assert.equal(parseRef('caf%C3%A9.png', []).segments[0], `caf${String.fromCharCode(0xe9)}.png`);
});

test('site in memory: a file, a folder, a missing name and a name with other letters are told apart', async () => {
  const site = memorySite({ 'a/B.txt': 'x', 'c.txt': 'y', 'link': '->outside', 'pipe': '->special' });
  assert.equal((await site.locate(['a', 'B.txt'])).status, 'file');
  assert.equal((await site.locate(['a'])).status, 'dir');
  assert.equal((await site.locate(['a', 'nope.txt'])).status, 'missing');
  assert.deepEqual(await site.locate(['a', 'b.txt']), { status: 'case', actual: 'B.txt' });
  assert.equal((await site.locate(['link'])).status, 'outside');
  assert.equal((await site.locate(['pipe'])).status, 'special');
  assert.equal((await site.locate([])).status, 'dir');
});

test('site in memory: a folder is answered with its index.html when asked to, and read and head work', async () => {
  const site = memorySite({ 'd/index.html': '<p>hi</p>', 'e/other.html': 'x' });
  assert.equal((await site.locate(['d'], { index: true })).status, 'file');
  assert.equal((await site.locate(['e'], { index: true })).status, 'missing');
  assert.equal((await site.read(['d', 'index.html'], 100)).toString(), '<p>hi</p>');
  assert.equal((await site.head(['d', 'index.html'], 3)).toString(), '<p>');
  await assert.rejects(site.read(['d', 'index.html'], 3), /over the 3 bytes limit/);
  await assert.rejects(site.read(['nope'], 10), /no such file/);
});

test('site on disk: files and folders are found, a missing name is missing, and letter case must match exactly', async () => {
  await withFiles({ 'a/Icon.png': 'x', 'index.html': 'y' }, async (dir) => {
    const site = await diskSite(dir);
    assert.equal((await site.locate(['index.html'])).status, 'file');
    assert.equal((await site.locate(['a'])).status, 'dir');
    assert.equal((await site.locate(['a', 'missing.png'])).status, 'missing');
    assert.deepEqual(await site.locate(['a', 'icon.png']), { status: 'case', actual: 'Icon.png' });
    assert.equal((await site.read(['index.html'], 100)).toString(), 'y');
  });
});

test('site on disk: a file over the size limit is refused from the size of the open file, before it is read', async () => {
  await withFiles({ 'big.js': 'x'.repeat(1000) }, async (dir) => {
    const site = await diskSite(dir);
    await assert.rejects(site.read(['big.js'], 100), (error) => /1,000 bytes is over the 100 bytes limit/.test(error.message) && error.reason.startsWith('1,000 bytes'));
    assert.equal((await site.read(['big.js'], 1000)).length, 1000);
  });
});

test('site on disk: a link to a folder outside the root is refused, however deep the file is', async () => {
  await withFiles({ 'root/real.txt': 'in', 'outside/secret.txt': 'out', 'outside/sub/deep.txt': 'deep' }, async (dir) => {
    // a junction on Windows needs no privilege; elsewhere it is a symbolic link to a folder
    await symlink(resolve(dir, 'outside'), resolve(dir, 'root/escape-dir'), 'junction');
    const site = await diskSite(resolve(dir, 'root'));
    assert.equal((await site.locate(['escape-dir', 'secret.txt'])).status, 'outside');
    assert.equal((await site.locate(['escape-dir', 'sub', 'deep.txt'])).status, 'outside');
    await assert.rejects(site.read(['escape-dir', 'secret.txt'], 100), /outside the folder/);
    await assert.rejects(site.head(['escape-dir', 'secret.txt'], 4), /outside the folder/);
    assert.equal((await site.locate(['real.txt'])).status, 'file');
  });
});

test('site on disk: a symbolic link to a file outside the root is refused, and one inside it is followed', async (t) => {
  await withFiles({ 'root/real.txt': 'in', 'outside/secret.txt': 'out' }, async (dir) => {
    try {
      await symlink(resolve(dir, 'outside/secret.txt'), resolve(dir, 'root/escape.txt'), 'file');
      await symlink(resolve(dir, 'root/real.txt'), resolve(dir, 'root/inside.txt'), 'file');
    } catch (error) {
      t.skip(`cannot make symbolic links to files here (${error.code})`);
      return;
    }
    const site = await diskSite(resolve(dir, 'root'));
    assert.equal((await site.locate(['escape.txt'])).status, 'outside');
    await assert.rejects(site.read(['escape.txt'], 100), /outside the folder/);
    assert.equal((await site.locate(['inside.txt'])).status, 'file');
    assert.equal((await site.read(['inside.txt'], 100)).toString(), 'in');
  });
});

test('site on disk: a folder is not a file to read', async () => {
  await withFiles({ 'd/x.txt': 'x' }, async (dir) => {
    const site = await diskSite(dir);
    await assert.rejects(site.read(['d'], 100));
  });
});

test('input: a folder is read from its index.html, a file as itself, and a path outside --root is refused', async () => {
  await withFiles({ 'site/index.html': 'x', 'site/app/page.html': 'y', 'other/index.html': 'z' }, async (dir) => {
    assert.deepEqual(await locateInput('site', null, dir), { root: resolve(dir, 'site'), page: 'index.html' });
    assert.deepEqual(await locateInput('site/app/page.html', null, dir), { root: resolve(dir, 'site/app'), page: 'page.html' });
    assert.deepEqual(await locateInput('site/app/page.html', 'site', dir), { root: resolve(dir, 'site'), page: 'app/page.html' });
    assert.deepEqual(await locateInput('site/app', 'site', dir), { root: resolve(dir, 'site'), page: 'app/index.html' });
    await assert.rejects(locateInput('other/index.html', 'site', dir), /outside the root folder/);
    await assert.rejects(locateInput('nope', null, dir), /no such file or folder/);
    await assert.rejects(locateInput('site', 'missing', dir), /no such folder/);
    await assert.rejects(locateInput('site', 'site/index.html', dir), /not a folder/);
  });
});

test('paths: shown relative with forward slashes, names compared by code unit, errors keep the reason apart', () => {
  assert.equal(displayPath(resolve('/a/b/c.js'), resolve('/a')), 'b/c.js');
  assert.equal(displayPath(resolve('/a'), resolve('/a')), '.');
  assert.deepEqual(['b', 'B', 'a', String.fromCharCode(0xe9), 'z'].sort(compareNames), ['B', 'a', 'b', 'z', String.fromCharCode(0xe9)]);
  const error = fileError('x.js', 'no such file');
  assert.equal(error.message, 'x.js: no such file');
  assert.equal(error.reason, 'no such file');
  assert.equal(FILE_LIMITS.maxScripts, 20);
});
