// Reads a built web app (its page, the manifest that the page links, the scripts that the page names and the service
// worker that a script registers), runs the checks and returns one report. The tool reads files under the folder it is
// given and opens no connection. docs/method.md gives the reason behind every finding.

import { FACTS, SOURCES, sourceUrl } from './data.js';
import { FILE_LIMITS, compareNames, parseRef } from './files.js';
import { HTML_LIMITS, scanHtml } from './html.js';
import { jsonLines } from './json.js';
import { inspectManifest, parentPath, parseManifest } from './manifest.js';
import { FINDINGS, ORDER, RANK, SEVERITIES, meetsThreshold, safeText } from './rules.js';
import { TOKEN_LIMITS, tokenize } from './tokenizer.js';
import { WORKER_LIMITS, createWorkerFacts, findRegistrations, scanWorkerTokens, stringArray } from './worker.js';

export const LIMITS = { ...FILE_LIMITS, ...TOKEN_LIMITS, ...HTML_LIMITS, ...WORKER_LIMITS, maxIcons: 100, maxPrecache: 5000, maxInsecure: 20 };
export { FINDINGS, RANK, SEVERITIES, meetsThreshold, safeText };

const BY_ID = Object.fromEntries(FINDINGS.map((f) => [f.id, f]));
const sourceTitle = (id) => SOURCES.find((s) => s.id === id).title;

// The address that the site is given when its own origin is not written anywhere: nothing is fetched from it, it only
// lets relative addresses be worked out the way a browser works them out.
const FAKE_ORIGIN = 'https://pwa.invalid';

function plural(count, one, many = `${one}s`) {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

// The sentences of the sources that a finding quotes.
export function manualFor(id, extraFacts = []) {
  for (const key of extraFacts) if (!(BY_ID[id].optional ?? []).includes(key)) throw new Error(`${id} does not quote ${key}`);
  return [...BY_ID[id].facts, ...extraFacts].map((key) => {
    const fact = FACTS[key];
    return { page: sourceTitle(fact.source), section: fact.section, url: sourceUrl(fact.source), quote: fact.text };
  });
}

const encodePath = (segments) => segments.map((s) => encodeURIComponent(s)).join('/');
const segmentsOf = (pathname) => pathname.split('/').filter(Boolean).map((s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
});

function isLoopback(hostname) {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h === '[::1]') return true;
  const parts = h.split('.');
  return parts.length === 4 && parts[0] === '127' && parts.every((p) => p !== '' && p.length <= 3 && [...p].every((c) => c >= '0' && c <= '9'));
}

const SCRIPT_TYPES = new Set(['', 'module', 'text/javascript', 'application/javascript', 'text/ecmascript', 'application/ecmascript']);
const hasDigit = (text) => [...text].some((c) => c >= '0' && c <= '9');

// Reports on the files under the site. site is made by diskSite or memorySite in files.js; page is the path of the HTML
// file under the site (default index.html). Paths in the report are relative to the site, with forward slashes.
export async function checkSite(site, { page = 'index.html', failOn = 'error', version = '0.0.0', limits = LIMITS } = {}) {
  const found = [];
  const notes = [];
  const files = [];
  const fileIndex = new Map();
  let totalBytes = 0;
  let stopped = false;

  const addFile = (path, kind, bytes) => {
    if (!fileIndex.has(path)) {
      fileIndex.set(path, files.length);
      files.push({ path: safeText(path, 400), kind, bytes });
    }
    return fileIndex.get(path);
  };
  const emit = (id, file, line, fields) => {
    found.push({
      id,
      severity: BY_ID[id].severity,
      file,
      fileIndex: fileIndex.get(file) ?? 0,
      line: Math.max(1, line || 1),
      subject: safeText(fields.subject ?? '', 200),
      message: fields.message,
      fix: fields.fix,
      manual: manualFor(id, fields.extraFacts ?? [])
    });
  };

  // Reads a file under the site, counts its size, and says why when it cannot be read. Returns { buffer } or { problem }.
  const load = async (segments, max) => {
    const located = await site.locate(segments);
    if (located.status === 'missing') return { problem: 'missing' };
    if (located.status === 'case') return { problem: 'case', actual: located.actual };
    if (located.status === 'outside') return { problem: 'outside' };
    if (located.status === 'dir') return { problem: 'folder' };
    if (located.status !== 'file') return { problem: 'special' };
    if (totalBytes + (located.size ?? 0) > limits.maxTotalBytes) {
      stopped = true;
      return { problem: 'budget' };
    }
    try {
      const buffer = await site.read(segments, max);
      totalBytes += buffer.length;
      return { buffer };
    } catch (error) {
      return { problem: 'unreadable', reason: error.reason ?? error.message };
    }
  };

  const reasonText = (problem, name) => {
    if (problem.problem === 'case') return `no file with this exact name; there is a file named ${safeText(problem.actual, 120)}, and a server that matches letter case does not find it`;
    if (problem.problem === 'outside') return 'is outside the folder that is read, or a link leads outside it, so it was not read';
    if (problem.problem === 'folder') return `${safeText(name, 120)} is a folder, not a file`;
    if (problem.problem === 'special') return 'is not a regular file, so it was not read';
    if (problem.problem === 'budget') return 'was not read, because the files read so far are over the total size limit';
    if (problem.problem === 'unreadable') return `could not be read (${safeText(problem.reason, 160)})`;
    return 'no such file';
  };

  // ---- the page
  const pageSegments = String(page).split('/').filter(Boolean);
  const pageName = pageSegments.join('/');
  const pageLoad = await load(pageSegments, limits.maxPageBytes);
  if (pageLoad.problem) throw Object.assign(new Error(`${safeText(pageName, 200)}: ${reasonText(pageLoad, pageName)}`), { reason: reasonText(pageLoad, pageName) });
  addFile(pageName, 'page', pageLoad.buffer.length);
  const pageText = pageLoad.buffer.toString('utf8');
  const pageDir = pageSegments.slice(0, -1);
  const pageUrl = new URL(`${FAKE_ORIGIN}/${encodePath(pageSegments)}`);

  const html = scanHtml(pageText.charCodeAt(0) === 0xfeff ? pageText.slice(1) : pageText, limits);
  for (const e of html.errors) {
    emit('unterminated-token', pageName, e.line, { subject: 'page', message: `A ${e.kind} that opens here is never closed. Nothing after this line was read, so the rest of the page was not checked.`, fix: `Close the ${e.kind}.` });
  }
  if (html.truncated) emit('limit-reached', pageName, 1, { subject: 'page', message: 'The page has more tags than the limit allows, so the rest of the page was not checked.', fix: 'Split the page, or move its content into scripts.' });

  const elements = html.elements;
  const attr = (el, name) => (Object.hasOwn(el.attrs, name) ? el.attrs[name] : null);
  const relOf = (el) => (attr(el, 'rel') ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const manifestLinks = elements.filter((el) => el.tag === 'link' && relOf(el).includes('manifest'));
  const metaNamed = (name) => elements.find((el) => el.tag === 'meta' && (attr(el, 'name') ?? '').trim().toLowerCase() === name);
  if (elements.some((el) => el.tag === 'base' && attr(el, 'href') !== null)) notes.push('A base element is not followed: relative addresses are worked out from the address of the page itself');

  // ---- a message about an address that is not https
  let insecure = 0;
  // url is a URL, or the text of an address (which is ignored when it is not a valid one)
  const checkSecure = (address, where, subject, file, line) => {
    let url = address;
    if (typeof address === 'string') {
      try {
        url = new URL(address);
      } catch {
        return;
      }
    }
    if (url.protocol !== 'http:' || isLoopback(url.hostname)) return;
    insecure += 1;
    if (insecure > limits.maxInsecure) return;
    emit('insecure-url', file, line, {
      subject,
      message: `${where} is ${safeText(url.href, 160)}, an address that is served over http. A service worker needs a secure context, and the install criteria name HTTPS, so the app cannot be installed or work offline from there.`,
      fix: 'Serve the app and every address it names over https. http is allowed only for localhost and the loopback addresses, for development.',
      extraFacts: ['sw-secure-localhost']
    });
  };

  // ---- the manifest
  let manifest = null; // { path, index, model }
  let manifestDir = [];
  let siteOrigin = FAKE_ORIGIN;
  if (manifestLinks.length === 0) {
    emit('manifest-link-missing', pageName, 1, { subject: 'link rel="manifest"', message: 'The page has no <link rel="manifest">, so the browser has no manifest to read and the app cannot be installed.', fix: 'Add <link rel="manifest" href="manifest.webmanifest"> to the <head> of every page of the app.', extraFacts: [] });
  } else {
    if (manifestLinks.length > 1) notes.push(`The page links ${manifestLinks.length} manifests; the first one is read`);
    const link = manifestLinks[0];
    const href = attr(link, 'href') ?? '';
    const ref = parseRef(href, pageDir);
    if (ref.kind === 'remote') {
      checkSecure(ref.url, 'The manifest address', 'manifest', pageName, link.line);
      emit('remote-not-read', pageName, link.line, { subject: 'manifest', message: `The manifest is at another address (${safeText(ref.url, 160)}). The tool reads files and fetches nothing, so the manifest was not checked.`, fix: 'Check a built copy of the app that holds its manifest, or give the tool the folder that serves it.' });
    } else if (ref.kind !== 'local') {
      emit('file-not-read', pageName, link.line, { subject: 'manifest', message: `The manifest link ${ref.kind === 'empty' ? 'is empty' : 'is not a path to a file'}, so the manifest was not read.`, fix: 'Point href at the manifest file, for example "manifest.webmanifest".' });
    } else if (ref.outside || ref.bad) {
      emit('file-not-read', pageName, link.line, { subject: 'manifest', message: `The manifest link ${safeText(href, 160)} ${ref.outside ? 'climbs above the folder that is read' : 'holds a name that cannot be a file name'}, so the manifest was not read.`, fix: 'Keep the manifest inside the folder of the app.' });
    } else {
      const name = ref.segments.join('/');
      const got = ref.trailing ? { problem: 'folder' } : await load(ref.segments, limits.maxManifestBytes);
      if (got.problem === 'missing' || got.problem === 'case') {
        emit('manifest-file-missing', pageName, link.line, { subject: name, message: `The page links ${safeText(name, 160)}, and there is ${got.problem === 'case' ? `no file with this exact name; there is a file named ${safeText(got.actual, 120)}, and a server that matches letter case does not find it` : 'no such file'}. Without a manifest the app cannot be installed.`, fix: 'Add the manifest file at that path, or correct the href.' });
      } else if (got.problem) {
        emit('file-not-read', pageName, link.line, { subject: name, message: `The manifest ${safeText(name, 160)} ${reasonText(got, name)}.`, fix: 'Point the link at a regular file of the folder, under the size limit.' });
      } else {
        addFile(name, 'manifest', got.buffer.length);
        manifestDir = ref.segments.slice(0, -1);
        const parsed = parseManifest(got.buffer.toString('utf8'));
        if (parsed.problem) {
          emit('manifest-invalid-json', name, parsed.line ?? 1, {
            subject: 'manifest',
            message: parsed.problem === 'invalid' ? 'The manifest is not valid JSON. A browser treats it as empty, so none of its members count and the app cannot be installed.' : 'The manifest is JSON but not an object. A browser treats it as empty, so none of its members count and the app cannot be installed.',
            fix: 'Fix the JSON: members are "name": value pairs inside one pair of braces, with double quotes and no trailing comma.'
          });
        } else {
          const json = parsed.value;
          const absolute = [json.start_url, json.scope, json.id].find((v) => typeof v === 'string' && /^https?:\/\//i.test(v.trim()));
          if (absolute !== undefined) {
            try {
              siteOrigin = new URL(absolute.trim()).origin;
            } catch {
              siteOrigin = FAKE_ORIGIN;
            }
          }
          const base = `${siteOrigin}/${encodePath(ref.segments)}`;
          const result = inspectManifest(json, base, { maxIcons: limits.maxIcons });
          const lines = jsonLines(got.buffer.toString('utf8').replace(/^\ufeff/, ''));
          const lineOf = (path) => (path === '' ? 1 : lines.get(path) ?? lines.get(path.split('.')[0]) ?? 1);
          for (const i of result.issues) emit(i.id, name, lineOf(i.path), { subject: i.subject, message: i.message, fix: i.fix, extraFacts: i.extraFacts });
          for (const note of result.notes) notes.push(note);
          manifest = { path: name, json, model: result.model, lineOf };
        }
      }
    }
  }

  // what a manifest address names under the site: { segments } for a path of the site, or null for another origin
  const localTarget = (raw, baseSegments) => {
    const ref = parseRef(raw, baseSegments);
    if (ref.kind === 'local') return ref;
    if (ref.kind === 'remote') {
      try {
        const u = new URL(ref.url);
        if (u.origin === siteOrigin) return { kind: 'local', segments: segmentsOf(u.pathname), outside: false, bad: false, trailing: u.pathname.endsWith('/') };
      } catch {
        return null;
      }
    }
    return null;
  };

  if (manifest !== null) {
    const { model, path: manifestPath, lineOf } = manifest;
    // addresses that are not https
    for (const u of model.urls) checkSecure(u.url, `The manifest member ${u.member}`, u.member, manifestPath, lineOf(u.path));

    // start_url names a page that is in the folder
    if (model.startRaw !== null) {
      const target = localTarget(model.startRaw, manifestDir);
      if (target !== null && !target.outside && !target.bad) {
        const located = await site.locate(target.segments, { index: true });
        if (located.status === 'missing' || located.status === 'case' || located.status === 'dir') {
          emit('start-url-not-found', manifestPath, lineOf('start_url'), { subject: 'start_url', message: `start_url (${safeText(model.startRaw, 160)}) names ${safeText(`/${target.segments.join('/')}${target.trailing ? '/' : ''}`, 160)}, and no such file is in the folder${located.status === 'case' ? ` (a file named ${safeText(located.actual, 120)} differs in letter case)` : ''}. The app would start on an error page. If your server rewrites this address to a page, the tool does not see the rewrite (this conclusion is the tool's own).`, fix: 'Point start_url at a page that exists, for example "./" when the folder has an index.html.' });
        }
      }
    }

    // the icon files
    for (const icon of model.icons) {
      const target = localTarget(icon.src, manifestDir);
      if (target === null) continue;
      if (target.outside || target.bad) {
        emit('file-not-read', manifestPath, lineOf(icon.path), { subject: icon.path, message: `The icon ${safeText(icon.src, 160)} ${target.outside ? 'climbs above the folder that is read' : 'holds a name that cannot be a file name'}, so it was not read.`, fix: 'Keep the icons inside the folder of the app.' });
        continue;
      }
      const located = await site.locate(target.segments);
      const name = `/${target.segments.join('/')}`;
      if (located.status === 'missing' || located.status === 'case' || located.status === 'dir') {
        emit('icon-file-missing', manifestPath, lineOf(icon.path), { subject: icon.path, message: `The icon ${safeText(icon.src, 160)} names ${safeText(name, 160)}, and ${located.status === 'dir' ? 'that is a folder' : located.status === 'case' ? `there is no file with this exact name (there is one named ${safeText(located.actual, 120)}, and a server that matches letter case does not find it)` : 'no such file is in the folder'}. A browser cannot use an icon that it cannot fetch (this conclusion is the tool's own).`, fix: 'Add the image at that path, or correct src.' });
        continue;
      }
      if (located.status !== 'file') {
        emit('file-not-read', manifestPath, lineOf(icon.path), { subject: icon.path, message: `The icon ${safeText(icon.src, 160)} ${located.status === 'outside' ? 'is outside the folder that is read, or a link leads outside it' : 'is not a regular file'}, so it was not read.`, fix: 'Keep the icons inside the folder, as regular files.' });
        continue;
      }
      const last = target.segments[target.segments.length - 1] ?? '';
      if (last.toLowerCase().endsWith('.png') && icon.sizes.pairs.length > 0 && !icon.sizes.any) {
        let head = null;
        try {
          head = await site.head(target.segments, 24);
        } catch {
          head = null;
        }
        const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
        if (head !== null && head.length >= 24 && signature.every((b, i) => head[i] === b) && head.toString('latin1', 12, 16) === 'IHDR') {
          const w = head.readUInt32BE(16);
          const h = head.readUInt32BE(20);
          if (!icon.sizes.pairs.some((p) => p.w === w && p.h === h)) {
            emit('icon-size-mismatch', manifestPath, lineOf(icon.path), { subject: icon.path, message: `The icon ${safeText(icon.src, 160)} says ${icon.sizes.pairs.map((p) => `${p.w}x${p.h}`).join(' ')}, and the PNG file is ${w}x${h}. The browser chooses an icon by the declared size (this conclusion is the tool's own).`, fix: `Write "sizes": "${w}x${h}", or replace the image with one of the declared size.` });
          }
        } else notes.push(`The icon ${safeText(icon.src, 100)} ends in .png but does not start like a PNG file, so its size was not checked`);
      }
    }
  }

  // ---- viewport and theme color
  if (metaNamed('viewport') === undefined) {
    emit('viewport-missing', pageName, 1, { subject: 'meta viewport', message: 'The page has no <meta name="viewport">. On a narrow screen the browser lays the page out in a wider virtual viewport and shrinks it, so a responsive app looks like a small desktop page.', fix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.' });
  }
  if (metaNamed('theme-color') === undefined && !(manifest !== null && manifest.model.themeColor)) {
    emit('theme-color-missing', pageName, 1, { subject: 'theme-color', message: 'Neither the page (<meta name="theme-color">) nor the manifest (theme_color) sets a theme color, so the browser draws its own frame around the app.', fix: 'Add <meta name="theme-color" content="#..."> and "theme_color" in the manifest.' });
  }

  // ---- the scripts of the page
  const scripts = [];
  let remoteScripts = 0;
  let missingScripts = 0;
  // The registrations are taken out of the tokens of each script as it is read, so that the tokens of all the scripts are not
  // held in memory together.
  const registrations = [];
  let inlineScripts = 0;
  const addTokens = (tokens, file) => {
    const result = findRegistrations(tokens, limits);
    if (result.capped) emit('limit-reached', file, 1, { subject: 'script', message: 'The script has more registrations than the limit allows, so the rest was not looked at.', fix: 'Register the service worker once.' });
    for (const r of result.registrations) registrations.push({ ...r, file });
  };
  for (const script of html.scripts) {
    const type = (attr(script, 'type') ?? '').trim().toLowerCase();
    if (!SCRIPT_TYPES.has(type)) continue;
    const src = attr(script, 'src');
    if (src === null) {
      const read = tokenize(script.text, limits);
      for (const t of read.tokens) t.line += script.line - 1;
      for (const e of read.errors) emit('unterminated-token', pageName, e.line + script.line - 1, { subject: 'inline script', message: `A ${e.kind} in this script is never closed. Nothing after this line of the script was read.`, fix: `Close the ${e.kind}.` });
      if (read.truncated) emit('limit-reached', pageName, script.line, { subject: 'inline script', message: 'The script has more tokens than the limit allows, so the rest of it was not checked.', fix: 'Move the script into its own file and keep it smaller.' });
      inlineScripts += 1;
      addTokens(read.tokens, pageName);
      continue;
    }
    if (scripts.length >= limits.maxScripts) {
      notes.push(`Only the first ${limits.maxScripts} scripts of the page were read`);
      break;
    }
    const ref = parseRef(src, pageDir);
    if (ref.kind === 'remote') {
      remoteScripts += 1;
      continue;
    }
    if (ref.kind !== 'local' || ref.outside || ref.bad || ref.trailing) {
      missingScripts += 1;
      continue;
    }
    const name = ref.segments.join('/');
    const got = await load(ref.segments, limits.maxScriptBytes);
    if (got.problem) {
      if (got.problem === 'missing' || got.problem === 'case') missingScripts += 1;
      else emit('file-not-read', pageName, script.line, { subject: name, message: `The script ${safeText(name, 160)} ${reasonText(got, name)}.`, fix: 'Keep the script inside the folder, as a regular file under the size limit.' });
      continue;
    }
    scripts.push(name);
    addFile(name, 'script', got.buffer.length);
    const read = tokenize(got.buffer.toString('utf8'), limits);
    for (const e of read.errors) emit('unterminated-token', name, e.line, { subject: 'script', message: `A ${e.kind} that opens here is never closed. Nothing after this line was read, so the rest of the script was not checked.`, fix: `Close the ${e.kind}.` });
    if (read.truncated) emit('limit-reached', name, 1, { subject: 'script', message: 'The script has more tokens than the limit allows, so the rest of it was not checked.', fix: 'Split the script into smaller files.' });
    addTokens(read.tokens, name);
  }
  if (remoteScripts > 0) notes.push(`${plural(remoteScripts, 'script')} from another address ${remoteScripts === 1 ? 'was' : 'were'} not fetched, so a registration inside ${remoteScripts === 1 ? 'it' : 'them'} is not seen`);
  if (missingScripts > 0) notes.push(`${plural(missingScripts, 'script')} named by the page ${missingScripts === 1 ? 'was' : 'were'} not found in the folder and ${missingScripts === 1 ? 'was' : 'were'} not read`);

  // ---- registrations
  if (registrations.length === 0) {
    emit('sw-register-missing', pageName, 1, {
      subject: 'navigator.serviceWorker.register',
      message: `No call of navigator.serviceWorker.register was found in the page or in the ${plural(scripts.length, 'script')} it names (${plural(inlineScripts, 'inline script')} read too). Without a service worker the app cannot work offline. The manifest does not need one for install, so this is not a blocker for the install prompt. A registration inside a bundled script that the page does not name, or one written another way, is not seen.`,
      fix: 'Register a worker from the page: navigator.serviceWorker.register("/sw.js").'
    });
  }

  const workerPaths = [];
  for (const r of registrations) {
    if (r.dynamic) {
      emit('sw-register-dynamic', r.file, r.line, { subject: 'register', message: 'The address passed to register() is worked out when the script runs, so the tool cannot tell which worker file it is, and did not check it.', fix: 'Write the address as a string, for example register("/sw.js"), so that it can be checked.' });
      continue;
    }
    const ref = parseRef(r.url, pageDir);
    if (ref.kind === 'remote') {
      checkSecure(ref.url, 'The worker address', 'register', r.file, r.line);
      emit('sw-script-missing', r.file, r.line, { subject: safeText(r.url, 120), message: `The worker address ${safeText(r.url, 160)} is on another origin or address than the page. A service worker must be served from the origin that registers it.`, fix: 'Serve the worker from the same origin as the app.', extraFacts: ['mdn-sw-origin'] });
      continue;
    }
    if (ref.kind !== 'local' || ref.outside || ref.bad || ref.trailing) {
      emit('sw-script-missing', r.file, r.line, { subject: safeText(r.url, 120), message: `The worker address ${safeText(r.url, 160)} ${ref.outside ? 'climbs above the folder that is read' : 'is not a path to a file'}, so the worker was not read.`, fix: 'Register a file of the folder, for example "/sw.js".' });
      continue;
    }
    const key = ref.segments.join('/');
    if (workerPaths.some((w) => w.key === key)) continue;
    if (workerPaths.length >= limits.maxWorkers) {
      notes.push(`Only the first ${limits.maxWorkers} registered workers were read`);
      continue;
    }
    workerPaths.push({ key, segments: ref.segments, reg: r });
  }

  const workers = [];
  const workerFindings = [];
  for (const w of workerPaths) {
    const got = await load(w.segments, limits.maxScriptBytes);
    if (got.problem === 'missing' || got.problem === 'case') {
      emit('sw-script-missing', w.reg.file, w.reg.line, { subject: w.key, message: `register() names ${safeText(`/${w.key}`, 160)}, and ${got.problem === 'case' ? `there is no file with this exact name (there is one named ${safeText(got.actual, 120)}, and a server that matches letter case does not find it)` : 'no such file is in the folder'}. The registration fails and the app has no service worker.`, fix: 'Add the worker file at that path, or correct the address.' });
      continue;
    }
    if (got.problem) {
      emit('file-not-read', w.reg.file, w.reg.line, { subject: w.key, message: `The worker ${safeText(w.key, 160)} ${reasonText(got, w.key)}.`, fix: 'Keep the worker inside the folder, as a regular file under the size limit.' });
      continue;
    }
    addFile(w.key, 'worker', got.buffer.length);
    workers.push(w.key);
    const facts = createWorkerFacts();
    const read = tokenize(got.buffer.toString('utf8'), limits);
    for (const e of read.errors) emit('unterminated-token', w.key, e.line, { subject: 'worker', message: `A ${e.kind} that opens here is never closed. Nothing after this line was read, so the rest of the worker was not checked.`, fix: `Close the ${e.kind}.` });
    if (read.truncated) emit('limit-reached', w.key, 1, { subject: 'worker', message: 'The worker has more tokens than the limit allows, so the rest of it was not checked.', fix: 'Split the worker into smaller files.' });
    scanWorkerTokens(facts, read.tokens, w.key, limits);

    // importScripts of files of the folder are read as part of the worker; a remote one is not fetched
    const workerDir = w.segments.slice(0, -1);
    const queue = facts.imports.splice(0);
    let imported = 0;
    const done = new Set([w.key]);
    while (queue.length) {
      const imp = queue.shift();
      if (imp.value === null) {
        emit('worker-dynamic', imp.file, imp.line, { subject: 'importScripts', message: 'An address passed to importScripts() is worked out when the worker runs, so the file it names was not read.', fix: 'Write the address as a string so that it can be read.' });
        continue;
      }
      // The Workbox runtime is a library: it is recognized by its name and its code is not read as part of the worker.
      if (imp.value.includes('workbox')) {
        facts.workbox.imported = true;
        continue;
      }
      const iref = parseRef(imp.value, workerDir);
      if (iref.kind === 'remote') {
        checkSecure(iref.url, 'An importScripts address', 'importScripts', imp.file, imp.line);
        emit('remote-not-read', imp.file, imp.line, { subject: safeText(imp.value, 120), message: `importScripts() loads ${safeText(imp.value, 160)} from another address. The tool fetches nothing, so that script was not read.`, fix: 'Keep the code of the worker in files of the folder, so that it can be checked.' });
        continue;
      }
      if (iref.kind !== 'local' || iref.outside || iref.bad) continue;
      const ikey = iref.segments.join('/');
      if (done.has(ikey)) continue;
      done.add(ikey);
      imported += 1;
      if (imported > limits.maxImports) {
        notes.push(`Only the first ${limits.maxImports} scripts imported by a worker were read`);
        break;
      }
      const ig = await load(iref.segments, limits.maxScriptBytes);
      if (ig.problem === 'missing' || ig.problem === 'case') {
        emit('sw-import-missing', imp.file, imp.line, { subject: ikey, message: `importScripts() names ${safeText(`/${ikey}`, 160)}, and ${ig.problem === 'case' ? `there is no file with this exact name (there is one named ${safeText(ig.actual, 120)})` : 'no such file is in the folder'}. The worker fails to start (this conclusion is the tool's own).`, fix: 'Add the file, or correct the address.' });
        continue;
      }
      if (ig.problem) {
        emit('file-not-read', imp.file, imp.line, { subject: ikey, message: `The imported script ${safeText(ikey, 160)} ${reasonText(ig, ikey)}.`, fix: 'Keep the file inside the folder, as a regular file under the size limit.' });
        continue;
      }
      addFile(ikey, 'worker', ig.buffer.length);
      const iread = tokenize(ig.buffer.toString('utf8'), limits);
      for (const e of iread.errors) emit('unterminated-token', ikey, e.line, { subject: 'worker', message: `A ${e.kind} that opens here is never closed. Nothing after this line was read.`, fix: `Close the ${e.kind}.` });
      scanWorkerTokens(facts, iread.tokens, ikey, limits);
      queue.push(...facts.imports.splice(0));
    }
    if (facts.capped) emit('limit-reached', w.key, 1, { subject: 'worker', message: 'The worker has more calls of one kind than the limit allows, so the rest of it was not looked at.', fix: 'Split the worker into smaller files.' });
    workerFindings.push({ w, facts, workerDir });
  }

  // ---- what the workers show
  let unchecked = 0;
  for (const { w, facts, workerDir } of workerFindings) {
    const main = w.key;
    const wb = facts.workbox;
    const explicitFetch = facts.listens.fetch.length > 0;
    const hasFetch = explicitFetch || wb.route.length > 0;
    const first = (list) => list[0] ?? { file: main, line: 1 };

    // scope
    const workerPath = `/${w.key}`;
    const maxScope = parentPath(workerPath);
    let effective = maxScope;
    if (w.reg.scope !== null) {
      let scopeUrl = null;
      try {
        scopeUrl = new URL(w.reg.scope, pageUrl);
      } catch {
        scopeUrl = null;
      }
      if (scopeUrl !== null) {
        effective = scopeUrl.pathname;
        if (!scopeUrl.pathname.startsWith(maxScope)) {
          emit('sw-scope-too-wide', w.reg.file, w.reg.line, { subject: safeText(w.reg.scope, 120), message: `register() asks for the scope ${safeText(scopeUrl.pathname, 120)}, but the worker is at ${safeText(workerPath, 120)}, so the widest scope it can have is ${safeText(maxScope, 120)}. The registration fails unless the server sends a Service-Worker-Allowed header for the worker file; the tool does not see headers.`, fix: `Move the worker to ${safeText(parentPath(scopeUrl.pathname), 120)}, or narrow the scope, or send Service-Worker-Allowed with the worker.` });
        }
      }
    }
    if (!pageUrl.pathname.startsWith(effective)) {
      emit('sw-scope-misses-page', w.reg.file, w.reg.line, { subject: safeText(effective, 120), message: `The scope of the worker is ${safeText(effective, 120)}, and the page that registers it is ${safeText(pageUrl.pathname, 120)}, outside it. The worker never controls this page.`, fix: `Move the worker to the root of the app (for example /sw.js), or register it with a scope that holds the page.` });
    } else if (manifest !== null && manifest.model.startUrl !== null && !manifest.model.startUrl.pathname.startsWith(effective)) {
      emit('sw-scope-misses-start-url', w.reg.file, w.reg.line, { subject: safeText(effective, 120), message: `The scope of the worker is ${safeText(effective, 120)}, and start_url is ${safeText(manifest.model.startUrl.pathname, 120)}, outside it. The installed app starts on a page that the worker does not control, so the start page is not served offline.`, fix: 'Move the worker to a folder that holds start_url, or make the scope wide enough.' });
    }

    // Workbox
    if (wb.imported) {
      const at = first(wb.route);
      emit('workbox-not-read', wb.route.length ? at.file : main, wb.route.length ? at.line : 1, { subject: 'workbox', message: 'This worker uses Workbox. The tool reads the calls that the saved Workbox page documents (precacheAndRoute, precache, cleanupOutdatedCaches, PrecacheFallbackPlugin) and not what Workbox does when the worker runs, so the checks of the fetch handler, the cache names and the offline fallback are not applied to the parts that Workbox handles.', fix: 'Read the Workbox configuration by hand, and test the offline behavior in a browser.' });
    }
    if (wb.route.length > 0 || wb.precache.length > 0) {
      const at = first(wb.route);
      emit('workbox-precache-read', at.file, at.line, { subject: 'precacheAndRoute', message: `The precache list holds ${plural(wb.precache.length, 'entry', 'entries')}${wb.dynamicLists.length ? ', and part of it is not written in the file, so that part was not read' : ''}. Workbox adds the route for the fetch event, precaches the files when the worker installs, and on activation removes cached assets that are no longer in the list.`, fix: 'No change is needed. The files of the list are checked against the folder.', extraFacts: wb.fallback ? ['workbox-fallback'] : [] });
    }

    // fetch handler
    if (!hasFetch && !wb.imported) {
      emit('sw-no-fetch-handler', main, 1, { subject: 'fetch', message: 'The worker has no fetch event handler, so it answers no request and the app has nothing to show when the network is gone. Caching files in the install handler alone does not serve them.', fix: 'Add self.addEventListener("fetch", ...) that answers from the cache, with a network fallback.' });
    } else if (explicitFetch && facts.respondWith.length === 0 && !wb.imported) {
      const at = first(facts.listens.fetch);
      emit('sw-fetch-no-respondwith', at.file, at.line, { subject: 'fetch', message: 'The worker listens for fetch but never calls event.respondWith(), so every request goes to the network as if there were no worker.', fix: 'Call event.respondWith() with a promise of a Response, from the cache or from the network.' });
    }

    // files that the worker caches
    const items = [];
    for (const call of facts.addCalls) {
      let list = call.list;
      if (list === null && call.ident !== null && Object.hasOwn(facts.consts.arrays, call.ident)) list = facts.consts.arrays[call.ident];
      let dynamic = list === null;
      if (list !== null) {
        for (const item of list.items) items.push({ ...item, file: call.file });
        if (list.dynamic) dynamic = true;
      }
      if (dynamic) emit('worker-dynamic', call.file, call.line, { subject: call.call, message: `The list passed to ${call.call}() is not a list of strings written in the worker (it is built when the worker runs, or read from another place), so the files it caches were checked only as far as they are written out.`, fix: 'Write the list of files in the worker, or check the generated list by hand after the build.' });
    }
    for (const entry of wb.precache) items.push({ ...entry });
    if (items.length > limits.maxPrecache) {
      emit('limit-reached', main, 1, { subject: 'precache', message: `The worker caches more than ${limits.maxPrecache.toLocaleString('en-US')} files, so the rest of the list was not checked.`, fix: 'Cache fewer files at install, and the rest at run time.' });
      items.length = limits.maxPrecache;
    }
    const seen = new Set();
    for (const item of items) {
      const key = `${item.file}:${item.line}:${item.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const ref = parseRef(item.value, workerDir);
      if (ref.kind !== 'local') continue;
      const lastName = ref.segments[ref.segments.length - 1] ?? '';
      if (!ref.trailing && !lastName.includes('.')) {
        unchecked += 1;
        continue;
      }
      const shown = safeText(item.value, 160);
      if (ref.outside || ref.bad) {
        emit('precache-file-missing', item.file, item.line, { subject: shown, message: `The worker caches ${shown}, which ${ref.outside ? 'climbs above the folder that is read' : 'holds a name that cannot be a file name'}, so the file was not found. The install fails if a file in the list cannot be fetched.`, fix: 'Cache only files of the folder.', extraFacts: ['mdn-url-relative'] });
        continue;
      }
      const located = await site.locate(ref.segments, { index: true });
      if (located.status === 'file') continue;
      emit('precache-file-missing', item.file, item.line, { subject: shown, message: `The worker caches ${shown}, and ${located.status === 'case' ? `there is no file with this exact name (there is one named ${safeText(located.actual, 120)}, and a server that matches letter case does not find it)` : located.status === 'dir' ? 'that is a folder with no index.html' : located.status === 'outside' ? 'a link leads outside the folder that is read' : 'no such file is in the folder'}. The list is relative to the worker file, and the install fails if one file in it cannot be fetched, so the app gets no offline copy (this conclusion about the file is the tool's own).`, fix: 'Remove the file from the list, or add the file, or correct the path.', extraFacts: ['mdn-url-relative'] });
    }

    // cache names
    const literal = facts.cacheOpens.filter((c) => c.kind === 'literal');
    const unversioned = literal.filter((c) => !hasDigit(c.name) && !c.name.toLowerCase().includes('version'));
    const activateCleans = facts.listens.activate.length > 0 && (facts.deletesCaches || (facts.keysCall && facts.anyDelete));
    const cleanup = activateCleans || wb.route.length > 0 || wb.precache.length > 0 || wb.cleanup;
    if (unversioned.length > 0 && !cleanup) {
      const at = unversioned[0];
      emit('sw-cache-unversioned', at.file, at.line, { subject: safeText(at.name, 80), message: `The cache is named "${safeText(at.name, 80)}", with no version in the name, and the worker has no activate handler that deletes old caches. When the files change, the old copies stay in the browser until something clears them (this conclusion is the tool's own).`, fix: 'Put a version in the cache name (for example "app-v2") and, in the activate handler, delete the caches whose names are not the current one.', extraFacts: ['mdn-keep-both'] });
    } else if (facts.cacheOpens.length > 0 && !cleanup) {
      const at = facts.cacheOpens[0];
      emit('sw-old-caches-kept', at.file, at.line, { subject: 'activate', message: 'The cache names carry a version, and no activate handler deletes the caches of older versions, so each release leaves its cache behind.', fix: 'In the activate handler, delete the caches whose names are not the current one.' });
    }

    // skipWaiting and claim
    if (facts.skipWaiting.length > 0) {
      const at = facts.skipWaiting[0];
      emit('sw-skip-waiting', at.file, at.line, { subject: 'skipWaiting', message: 'The worker calls skipWaiting(), so a new version takes over at once, while pages that the old version controls are still open. Those pages and the new worker can disagree about the files and the cache (this conclusion is the tool\'s own).', fix: 'Keep it only if the new worker works with the pages of the old version, or ask the user to reload.' });
    }
    if (facts.claim.length > 0) {
      const at = facts.claim[0];
      emit('sw-clients-claim', at.file, at.line, { subject: 'clients.claim', message: 'The worker calls clients.claim(), so it controls pages that were loaded without it, or by another worker, as soon as it is active.', fix: 'Keep it if that is what you want: without it, pages are controlled only after the next load.', extraFacts: ['mdn-claim-reload'] });
    }

    // caching of responses
    if (facts.putCalls.length > 0 && explicitFetch && !facts.methodGuard && !wb.imported) {
      const at = facts.putCalls[0];
      emit('sw-cache-non-get', at.file, at.line, { subject: 'cache.put', message: 'The worker puts responses into a cache and never looks at the request method. A cache accepts only GET requests, so a POST or another method makes put() fail with a TypeError (this conclusion about your code is the tool\'s own).', fix: 'Cache only when event.request.method === "GET", and let other requests go to the network.' });
    }
    if (facts.noCors.length > 0 && (facts.putCalls.length > 0 || facts.addCalls.length > 0) && !facts.responseGuard) {
      const at = facts.noCors[0];
      emit('sw-cache-opaque', at.file, at.line, { subject: 'no-cors', message: 'The worker makes a request with mode "no-cors" and caches responses, and it never looks at the type or the status of a response. A no-cors response to another origin is opaque: its status is 0 and nothing in it can be read, so the cache can fill with failed or useless copies (this conclusion about your code is the tool\'s own).', fix: 'Fetch cross-origin files with CORS, or cache them only after checking response.type and response.ok.' });
    }

    // offline fallback
    if (explicitFetch && facts.respondWith.length > 0 && !wb.imported && facts.catchFallback.length === 0 && facts.matchFixed.length === 0) {
      const at = first(facts.listens.fetch);
      emit('sw-no-offline-fallback', at.file, at.line, { subject: 'fetch', message: 'The fetch handler has no fallback for a request that cannot be answered: no catch that returns a cached page or a Response, and no cached offline page matched by a fixed address. When the network is gone and a page is not in the cache, the browser shows its own error page.', fix: 'Cache an offline page when the worker installs, and return it from a catch (caches.match("/offline.html")) when a navigation fails.' });
    }
  }
  if (unchecked > 0) notes.push(`${plural(unchecked, 'cached address', 'cached addresses')} without a file extension ${unchecked === 1 ? 'was' : 'were'} not checked, because a server can answer such an address with a page it builds`);
  if (stopped) notes.push('The total size of the files read reached the limit, so later files were not read');

  // ---- the report
  found.sort((a, b) => a.fileIndex - b.fileIndex || a.line - b.line || ORDER[a.id] - ORDER[b.id] || compareNames(a.subject, b.subject) || compareNames(a.message, b.message));
  const findings = found.map(({ fileIndex: _drop, ...rest }) => ({ ...rest, file: safeText(rest.file, 400) }));
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  const failing = findings.filter((f) => meetsThreshold(f.severity, failOn));
  const eCount = failing.filter((f) => f.severity === 'error').length;
  const wCount = failing.filter((f) => f.severity === 'warning').length;
  const reason = [eCount ? plural(eCount, 'error') : null, wCount ? plural(wCount, 'warning') : null].filter(Boolean).join(', ');

  return {
    tool: 'pwa-offline-check',
    version,
    page: safeText(pageName, 400),
    input: { files, manifest: manifest ? safeText(manifest.path, 400) : null, workers: workers.map((x) => safeText(x, 400)), scripts: scripts.length },
    findings,
    notes,
    counts,
    gate: { failOn, pass: failing.length === 0, reason }
  };
}
