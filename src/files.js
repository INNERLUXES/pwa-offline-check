// Reading the files of the web app. The tool is given a folder (the site root) and reads only inside it: an address that
// is written in a page, a manifest or a worker is worked out as a path under the root, and a path that climbs above the
// root, that goes through a symbolic link to a place outside it, or that is not a regular file is refused and reported.
// A file is read whole, and only when it is a regular file under the size limit; the size is taken from the open file,
// so it cannot change between the check and the read. File names are matched by letter case exactly, on every system,
// because a server that runs on Linux does. Nothing is written, and nothing is fetched.

import { open, readdir, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const FILE_LIMITS = {
  maxPageBytes: 2 * 1024 * 1024,
  maxManifestBytes: 1024 * 1024,
  maxScriptBytes: 2 * 1024 * 1024,
  maxTotalBytes: 20 * 1024 * 1024,
  maxScripts: 20,
  maxWorkers: 3,
  maxImports: 10
};

// An error with the path in its message and the reason alone in .reason, so a caller can show its own path.
export function fileError(path, reason) {
  return Object.assign(new Error(`${path}: ${reason}`), { reason });
}

function megabytes(bytes) {
  return bytes >= 1048576 ? `${(bytes / 1048576).toLocaleString('en-US')} MB` : `${bytes.toLocaleString('en-US')} bytes`;
}

function toPosix(path) {
  return sep === '/' ? path : path.split(sep).join('/');
}

// A path as shown in a report: relative to the base folder with forward slashes; a path outside it is shown absolute,
// also with forward slashes.
export function displayPath(path, base) {
  const rel = relative(base, path);
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return toPosix(path);
  return toPosix(rel);
}

// ---- addresses

const SCHEME = /^([a-z][a-z0-9+.-]*):/i;

// Sorts an address written in a file into: empty, remote (http, https or a protocol-relative one), other (data:, blob:,
// mailto: and so on) or local (a path on the same site). A local one is split into its path segments, worked out from
// baseSegments (the folder of the file that holds the address) or from the root when it starts with a slash. outside is
// true when the path climbs above the root, and bad is true when a segment cannot be a file name.
export function parseRef(ref, baseSegments = []) {
  const raw = String(ref).trim();
  if (raw === '') return { kind: 'empty' };
  if (raw.startsWith('//')) return { kind: 'remote', url: `https:${raw}` };
  const scheme = SCHEME.exec(raw);
  if (scheme) {
    const name = scheme[1].toLowerCase();
    if (name === 'http' || name === 'https') return { kind: 'remote', url: raw };
    return { kind: 'other', scheme: name };
  }
  let end = raw.length;
  for (const mark of ['?', '#']) {
    const at = raw.indexOf(mark);
    if (at !== -1 && at < end) end = at;
  }
  const path = raw.slice(0, end).split('\\').join('/');
  const trailing = path.endsWith('/') || path === '' || path.endsWith('/.') || path.endsWith('/..') || path === '.' || path === '..';
  const stack = path.startsWith('/') ? [] : [...baseSegments];
  let outside = false;
  let bad = false;
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    let name = part;
    try {
      name = decodeURIComponent(part);
    } catch {
      bad = true;
    }
    if (name === '..') {
      if (stack.length === 0) outside = true;
      else stack.pop();
      continue;
    }
    if (name.includes('/') || name.includes('\\') || name.includes('\0') || [...name].some((c) => c.charCodeAt(0) < 32)) bad = true;
    stack.push(name);
  }
  return { kind: 'local', segments: stack, outside, bad, trailing };
}

// ---- a site: a folder, or a set of files held in memory (for tests and for other programs that already hold the files)

// Compares names by code unit, so the order is the same on every system and in every locale.
export function compareNames(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// The shared part: walks the segments one by one, matching each name by letter case exactly, and asks the source for
// what is behind a path. status is file, dir, missing, case (the name exists with other letters), outside or special.
async function walk(source, segments) {
  let current = [];
  for (const name of segments) {
    const names = await source.list(current);
    if (names === null) return { status: 'missing' };
    if (!names.includes(name)) {
      const near = names.find((n) => n.toLowerCase() === name.toLowerCase());
      return near === undefined ? { status: 'missing' } : { status: 'case', actual: near };
    }
    current = [...current, name];
  }
  return { ...(await source.kind(current)), segments: current };
}

class Site {
  constructor(source) {
    this.source = source;
  }

  // Where a path leads. A folder is answered with its index.html when asked to (index: true).
  async locate(segments, { index = false } = {}) {
    const found = await walk(this.source, segments);
    if (found.status === 'dir' && index) return walk(this.source, [...segments, 'index.html']);
    return found;
  }

  async read(segments, maxBytes) {
    return this.source.read(segments, maxBytes);
  }

  // The first bytes of a file, for the size that a PNG file states in its header.
  async head(segments, count) {
    return this.source.head(segments, count);
  }
}

const NAME = (segments) => segments.join('/');

// A folder on disk. A symbolic link is followed only when its target is a regular file or a folder inside the root.
export async function diskSite(root) {
  const base = resolve(root);
  const realRoot = await realpath(base);
  const cache = new Map();
  const inside = (real) => {
    const rel = relative(realRoot, real);
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  };
  const source = {
    async list(segments) {
      const key = NAME(segments);
      if (cache.has(key)) return cache.get(key);
      let names = null;
      try {
        names = await readdir(resolve(base, ...segments));
      } catch {
        names = null;
      }
      cache.set(key, names);
      return names;
    },
    async kind(segments) {
      const full = resolve(base, ...segments);
      let real;
      try {
        real = await realpath(full);
      } catch {
        return { status: 'missing' };
      }
      if (!inside(real)) return { status: 'outside' };
      const info = await stat(real).catch(() => null);
      if (info === null) return { status: 'missing' };
      if (info.isDirectory()) return { status: 'dir' };
      if (info.isFile()) return { status: 'file', size: info.size };
      return { status: 'special' };
    },
    async head(segments, count) {
      const buffer = Buffer.alloc(count);
      const real = await realpath(resolve(base, ...segments));
      if (!inside(real)) throw fileError(NAME(segments), 'is outside the folder that is read');
      const handle = await open(real, 'r');
      try {
        const { bytesRead } = await handle.read(buffer, 0, count, 0);
        return buffer.subarray(0, bytesRead);
      } finally {
        await handle.close();
      }
    },
    async read(segments, maxBytes) {
      const display = NAME(segments);
      const full = resolve(base, ...segments);
      let real;
      try {
        real = await realpath(full);
      } catch (error) {
        throw fileError(display, error.code === 'ENOENT' ? 'no such file' : `cannot be read (${error.code ?? error.message})`);
      }
      if (!inside(real)) throw fileError(display, 'is outside the folder that is read');
      let handle;
      try {
        handle = await open(real, 'r');
      } catch (error) {
        throw fileError(display, error.code === 'ENOENT' ? 'no such file' : `cannot be read (${error.code ?? error.message})`);
      }
      try {
        const opened = await handle.stat();
        if (!opened.isFile()) throw fileError(display, 'not a regular file');
        if (opened.size > maxBytes) throw fileError(display, `${opened.size.toLocaleString('en-US')} bytes is over the ${megabytes(maxBytes)} limit`);
        const buffer = Buffer.alloc(opened.size);
        let done = 0;
        while (done < opened.size) {
          const { bytesRead } = await handle.read(buffer, done, opened.size - done, done);
          if (bytesRead === 0) break;
          done += bytesRead;
        }
        return buffer.subarray(0, done);
      } finally {
        await handle.close();
      }
    }
  };
  return Object.assign(new Site(source), { root: base });
}

// Files held in memory: an object of path -> text or Buffer, with forward slashes. A value that is the string
// "->outside" stands for a symbolic link to a place outside the root, and "->special" for a file that is not a regular
// file; both exist only for tests.
export function memorySite(files) {
  const entries = new Map();
  for (const [path, value] of Object.entries(files)) {
    const parts = path.split('/').filter(Boolean);
    for (let i = 1; i < parts.length; i += 1) entries.set(parts.slice(0, i).join('/'), { dir: true });
    entries.set(parts.join('/'), { value });
  }
  const source = {
    async list(segments) {
      const key = NAME(segments);
      if (key !== '' && !(entries.get(key) ?? {}).dir) return null;
      const out = new Set();
      for (const path of entries.keys()) {
        if (key === '' ? true : path.startsWith(`${key}/`)) {
          const rest = key === '' ? path : path.slice(key.length + 1);
          if (rest !== '') out.add(rest.split('/')[0]);
        }
      }
      return [...out].sort(compareNames);
    },
    async kind(segments) {
      const key = NAME(segments);
      if (key === '') return { status: 'dir' };
      const entry = entries.get(key);
      if (entry === undefined) return { status: 'missing' };
      if (entry.dir) return { status: 'dir' };
      if (entry.value === '->outside') return { status: 'outside' };
      if (entry.value === '->special') return { status: 'special' };
      return { status: 'file', size: Buffer.byteLength(entry.value) };
    },
    async head(segments, count) {
      const buffer = await source.read(segments, Number.MAX_SAFE_INTEGER);
      return buffer.subarray(0, count);
    },
    async read(segments, maxBytes) {
      const display = NAME(segments);
      const entry = entries.get(display);
      if (entry === undefined || entry.dir) throw fileError(display, 'no such file');
      if (entry.value === '->outside') throw fileError(display, 'is outside the folder that is read');
      if (entry.value === '->special') throw fileError(display, 'not a regular file');
      const buffer = Buffer.isBuffer(entry.value) ? entry.value : Buffer.from(entry.value);
      if (buffer.length > maxBytes) throw fileError(display, `${buffer.length.toLocaleString('en-US')} bytes is over the ${megabytes(maxBytes)} limit`);
      return buffer;
    }
  };
  return Object.assign(new Site(source), { root: '.' });
}
