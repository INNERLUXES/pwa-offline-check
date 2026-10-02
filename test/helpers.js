// Shared test helpers: web apps written inline and held in memory, files written into a temporary folder that is removed
// after the test, and the command line run with captured output.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { checkSite, diskSite, main, memorySite } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'pwa-offline-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The head of a PNG file of this size: the signature and the IHDR chunk, enough for the size check.
export function png(width, height) {
  const buffer = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'latin1');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

export const PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#336699">
<title>Test app</title>
<link rel="manifest" href="/manifest.webmanifest">
</head>
<body>
<script src="/app.js"></script>
</body>
</html>
`;

export const MANIFEST = {
  id: '/',
  name: 'Test app',
  short_name: 'Test',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  theme_color: '#336699',
  icons: [
    { src: '/icons/192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icons/512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icons/maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
};

export const WORKER = `const CACHE = 'test-v1';
const FILES = ['/', '/index.html', '/app.js', '/offline.html'];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)).catch(() => caches.match('/offline.html')));
});
`;

// A web app that passes every check at the level warning. Pass overrides: a key whose value is null is removed.
export function app(overrides = {}) {
  const files = {
    'index.html': PAGE,
    'manifest.webmanifest': JSON.stringify(MANIFEST, null, 2),
    'app.js': "if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');\n",
    'sw.js': WORKER,
    'offline.html': '<!doctype html><title>Offline</title>\n',
    'icons/192.png': png(192, 192),
    'icons/512.png': png(512, 512),
    'icons/maskable.png': png(512, 512)
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete files[key];
    else files[key] = value;
  }
  return files;
}

// A manifest with some members changed: a member whose value is undefined is removed.
export function manifestWith(changes) {
  const m = { ...MANIFEST };
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete m[key];
    else m[key] = value;
  }
  return JSON.stringify(m, null, 2);
}

// Checks a web app held in memory.
export async function check(files, options = {}) {
  return checkSite(memorySite(files), options);
}

export const ids = (report) => report.findings.map((f) => f.id);
export const find = (report, id) => report.findings.filter((f) => f.id === id);

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function run(files, args = []) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, dir);
    return { code, out, err };
  });
}

// Runs the command line with exactly these arguments.
export async function cli(argv) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } });
  return { code, out, err };
}

export { diskSite, memorySite };
