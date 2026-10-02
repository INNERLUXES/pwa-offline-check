// Command line: pwa-offline-check <folder-or-html-file> [options]

import { readFileSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { FINDINGS, LIMITS, checkSite } from './check.js';
import { diskSite } from './files.js';
import { safeText } from './rules.js';
import { toText, toMarkdown, toJson, toCsv } from './report.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, csv: toCsv };
const THRESHOLDS = ['error', 'warning'];

export const USAGE = `Usage: pwa-offline-check <folder-or-html-file> [options]

Reads a built web app and reports what stops it from installing, working offline or updating safely: the page, the web
app manifest that it links, the scripts it names and the service worker that a script registers. A folder is read from
its index.html; an HTML file is read as the page, and its folder is the root of the site. Every finding quotes the
official source it rests on. It reads files only: it never fetches an address, runs a script or opens a connection.

Options:
  --root <folder>     the root of the site, when the page is in a subfolder of it (default: the folder of the page);
                      an address that starts with a slash is read from here, and nothing outside it is read
  --format <name>     text, markdown, json or csv (default: text)
  --fail-on <level>   exit with 1 when a finding is at this level or above: error or warning
                      (default: error); info never fails the run
  --help              show this text
  --version           show the version

Checks: ${FINDINGS.map((f) => f.id).join(', ')}

Exit codes: 0 no finding at the --fail-on level, 1 such a finding, 2 usage or input error.
`;

export function parseArgs(argv) {
  const o = { input: null, root: null, format: 'text', failOn: 'error', help: false, version: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--format') o.format = next();
    else if (a === '--fail-on') o.failOn = next();
    else if (a === '--root') o.root = next();
    else if (a === '-') throw new Error('reading from standard input is not supported; give the path of a folder or an HTML file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else if (o.input !== null) throw new Error('give one folder or one HTML file');
    else o.input = a;
  }
  if (!o.help && !o.version) {
    if (o.input === null) throw new Error('give the path of the built app folder or of its HTML file');
    for (const value of [o.input, o.root]) if (value !== null && /^[a-z][a-z0-9+.-]*:\/\//i.test(value)) throw new Error('give a local path; the tool never fetches a URL');
    if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, markdown, json or csv)`);
    if (!THRESHOLDS.includes(o.failOn)) throw new Error(`--fail-on takes error or warning, not ${o.failOn}`);
  }
  return o;
}

const clean = (text) => safeText(text, 1000);

// Works out the site root and the path of the page under it from the arguments. Throws an Error with a plain message.
export async function locateInput(input, rootOption, base = process.cwd()) {
  const full = resolve(base, input);
  let info;
  try {
    info = await stat(full);
  } catch (error) {
    throw new Error(`${safeText(input, 200)}: ${error.code === 'ENOENT' ? 'no such file or folder' : `cannot be read (${error.code ?? error.message})`}`);
  }
  let root = info.isDirectory() ? full : dirname(full);
  if (rootOption !== null) {
    root = resolve(base, rootOption);
    let rootInfo;
    try {
      rootInfo = await stat(root);
    } catch {
      throw new Error(`--root ${safeText(rootOption, 200)}: no such folder`);
    }
    if (!rootInfo.isDirectory()) throw new Error(`--root ${safeText(rootOption, 200)}: not a folder`);
  }
  const realRoot = await realpath(root);
  const realFull = await realpath(full);
  const rel = relative(realRoot, realFull);
  if (rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${safeText(input, 200)}: is outside the root folder ${safeText(rootOption ?? input, 200)}`);
  const page = info.isDirectory() ? [...(rel === '' ? [] : rel.split(sep)), 'index.html'] : rel.split(sep);
  return { root, page: page.join('/') };
}

// Exit code: 0 no finding at the --fail-on level, 1 such a finding, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = LIMITS, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`pwa-offline-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  let report;
  try {
    const { root, page } = await locateInput(o.input, o.root, base);
    const site = await diskSite(root);
    report = await checkSite(site, { page, failOn: o.failOn, version: VERSION, limits });
  } catch (error) {
    io.err(`pwa-offline-check: ${clean(error.message)}\n`);
    return 2;
  }
  io.out(FORMATS[o.format](report));
  return report.gate.pass ? 0 : 1;
}
