// Pattern matching on the tokens of JavaScript (see tokenizer.js). Nothing here runs code: it looks for a small set of
// calls and names that the saved sources describe, in the tokens of a page script or a service worker script, and keeps
// what each one shows: the event types a worker listens for, the files it caches, the names of its caches, whether it
// deletes old caches, calls skipWaiting() or clients.claim(), puts responses into a cache, reads a response that is not
// the page's own, and answers a request that fails. What a script computes at run time (an address built from parts, a
// list read from another file, a worker that is bundled) is not seen, and docs/limits.md says so.

import { WORKBOX } from './data.js';

export const WORKER_LIMITS = {
  maxCalls: 2000,
  maxArgTokens: 20000,
  maxRegions: 400
};

const isWord = (t, v) => t !== undefined && t.t === 'word' && (v === undefined || t.v === v);
const isPunct = (t, v) => t !== undefined && t.t === 'punct' && t.v === v;
const OPEN = new Set(['(', '[', '{']);
const CLOSE = new Set([')', ']', '}']);

// The index of the bracket that closes the one at tokens[open], looking at most cap tokens ahead, or -1.
export function matchClose(tokens, open, cap = WORKER_LIMITS.maxArgTokens) {
  let depth = 0;
  const stop = Math.min(tokens.length, open + cap);
  for (let k = open; k < stop; k += 1) {
    const t = tokens[k];
    if (t.t !== 'punct') continue;
    if (OPEN.has(t.v)) depth += 1;
    else if (CLOSE.has(t.v)) {
      depth -= 1;
      if (depth === 0) return k;
    }
  }
  return -1;
}

// The arguments of the call whose '(' is tokens[open]: { args, end } with args a list of token lists, or null when the
// call is not closed within the limit.
export function callArgs(tokens, open, cap = WORKER_LIMITS.maxArgTokens) {
  const end = matchClose(tokens, open, cap);
  if (end === -1) return null;
  const args = [];
  let current = [];
  let depth = 0;
  for (let k = open + 1; k < end; k += 1) {
    const t = tokens[k];
    if (t.t === 'punct') {
      if (OPEN.has(t.v)) depth += 1;
      else if (CLOSE.has(t.v)) depth -= 1;
      else if (t.v === ',' && depth === 0) {
        args.push(current);
        current = [];
        continue;
      }
    }
    current.push(t);
  }
  if (current.length || args.length) args.push(current);
  return { args, end };
}

// The text of an argument that is one string, or a string with something appended after a '?' or '#' (so the part that
// is a path is known). Otherwise null: the argument is worked out when the script runs.
export function literalString(arg) {
  if (arg.length === 0 || arg[0].t !== 'string') return null;
  if (arg.length === 1) return arg[0].v;
  return isPunct(arg[1], '+') && (arg[0].v.includes('?') || arg[0].v.includes('#')) ? arg[0].v : null;
}

// The string items of an array literal given as tokens '[' ... ']': { items: [{ value, line }], dynamic } where dynamic
// says that an element was not a plain string, so the list is not complete.
export function stringArray(tokens) {
  const items = [];
  let dynamic = false;
  let depth = 0;
  let element = [];
  const flush = () => {
    if (element.length === 0) return;
    const value = literalString(element);
    if (value !== null && element.length === 1) items.push({ value, line: element[0].line });
    else dynamic = true;
    element = [];
  };
  for (let k = 1; k < tokens.length - 1; k += 1) {
    const t = tokens[k];
    if (t.t === 'punct') {
      if (OPEN.has(t.v)) depth += 1;
      else if (CLOSE.has(t.v)) depth -= 1;
      else if (t.v === ',' && depth === 0) {
        flush();
        continue;
      }
    }
    element.push(t);
  }
  flush();
  return { items, dynamic };
}

// The entries of a Workbox precache list written as an array literal: each element is a string, or an object with a url
// property (and a revision property), as the saved Workbox page describes.
export function precacheEntries(tokens) {
  const items = [];
  let dynamic = false;
  let depth = 0;
  let element = [];
  const flush = () => {
    if (element.length === 0) return;
    if (element[0].t === 'string' && element.length === 1) items.push({ value: element[0].v, line: element[0].line });
    else if (isPunct(element[0], '{')) {
      let found = false;
      for (let k = 1; k < element.length - 1; k += 1) {
        if ((isWord(element[k], 'url') || (element[k].t === 'string' && element[k].v === 'url')) && isPunct(element[k + 1], ':') && element[k + 2] !== undefined && element[k + 2].t === 'string') {
          items.push({ value: element[k + 2].v, line: element[k + 2].line });
          found = true;
          break;
        }
      }
      if (!found) dynamic = true;
    } else dynamic = true;
    element = [];
  };
  for (let k = 1; k < tokens.length - 1; k += 1) {
    const t = tokens[k];
    if (t.t === 'punct') {
      if (OPEN.has(t.v)) depth += 1;
      else if (CLOSE.has(t.v)) depth -= 1;
      else if (t.v === ',' && depth === 0) {
        flush();
        continue;
      }
    }
    element.push(t);
  }
  flush();
  return { items, dynamic };
}

// ---- what a page script shows: the registrations of a service worker

// Returns { registrations, capped }. A registration is { line, url, scope, dynamic } where url is the text of the first
// argument of navigator.serviceWorker.register(...) when it is a literal (or a name of a constant string in the same
// script), or null when it is worked out at run time (dynamic is then true), and scope is the text of the scope option
// when it is a literal, or null.
export function findRegistrations(tokens, limits = WORKER_LIMITS) {
  const consts = collectConstants(tokens);
  const registrations = [];
  let calls = 0;
  let capped = false;
  for (let k = 3; k < tokens.length - 1; k += 1) {
    if (!(isWord(tokens[k], 'register') && isPunct(tokens[k - 1], '.') && isWord(tokens[k - 2], 'serviceWorker') && isPunct(tokens[k + 1], '('))) continue;
    calls += 1;
    if (calls > limits.maxCalls) {
      capped = true;
      break;
    }
    const call = callArgs(tokens, k + 1, limits.maxArgTokens);
    const first = call ? call.args[0] ?? [] : [];
    let url = literalString(first);
    if (url === null && first.length === 1 && first[0].t === 'word' && Object.hasOwn(consts.strings, first[0].v)) url = consts.strings[first[0].v];
    let scope = null;
    let scopeDynamic = false;
    const options = call ? call.args[1] ?? [] : [];
    for (let m = 0; m < options.length - 1; m += 1) {
      if ((isWord(options[m], 'scope') || (options[m].t === 'string' && options[m].v === 'scope')) && isPunct(options[m + 1], ':')) {
        const value = literalString(valueTokens(options, m + 2));
        if (value !== null) scope = value;
        else scopeDynamic = true;
        break;
      }
    }
    registrations.push({ line: tokens[k].line, url, scope, scopeDynamic, dynamic: url === null });
  }
  return { registrations, capped };
}

// The tokens of an object property value that starts at options[from]: up to the next comma or closing bracket of the
// object itself.
function valueTokens(options, from) {
  const out = [];
  let depth = 0;
  for (let k = from; k < options.length; k += 1) {
    const t = options[k];
    if (t.t === 'punct') {
      if (OPEN.has(t.v)) depth += 1;
      else if (CLOSE.has(t.v)) {
        if (depth === 0) break;
        depth -= 1;
      } else if (t.v === ',' && depth === 0) break;
    }
    out.push(t);
  }
  return out;
}

// The constants of a script that are written as a string or as an array of strings: const NAME = 'text'; const NAME = [ ... ];
// The number of constants that are kept is bounded, and an array is kept as its list of strings, not as tokens.
function collectConstants(tokens) {
  const strings = Object.create(null);
  const arrays = Object.create(null);
  let stringCount = 0;
  let arrayCount = 0;
  for (let k = 0; k < tokens.length - 3; k += 1) {
    const t = tokens[k];
    if (t.t !== 'word' || (t.v !== 'const' && t.v !== 'let' && t.v !== 'var')) continue;
    const name = tokens[k + 1];
    if (name.t !== 'word' || !isPunct(tokens[k + 2], '=')) continue;
    const value = tokens[k + 3];
    if ((value.t === 'string' || value.t === 'template') && !(name.v in strings) && stringCount < 5000) {
      strings[name.v] = value.t === 'string' ? value.v : null;
      stringCount += 1;
    } else if (isPunct(value, '[') && !(name.v in arrays) && arrayCount < 200) {
      const end = matchClose(tokens, k + 3);
      if (end !== -1) {
        arrays[name.v] = stringArray(tokens.slice(k + 3, end + 1));
        arrayCount += 1;
      }
    }
  }
  const clean = Object.create(null);
  for (const [key, v] of Object.entries(strings)) if (v !== null) clean[key] = v;
  return { strings: clean, arrays, dynamicNames: new Set(Object.entries(strings).filter(([, v]) => v === null).map(([key]) => key)) };
}

// ---- what a service worker script shows

export function createWorkerFacts() {
  return {
    listens: { fetch: [], install: [], activate: [] },
    respondWith: [],
    skipWaiting: [],
    claim: [],
    imports: [],
    cacheOpens: [],
    addCalls: [],
    putCalls: [],
    matchFixed: [],
    catchFallback: [],
    deletesCaches: false,
    keysCall: false,
    anyDelete: false,
    methodGuard: false,
    noCors: [],
    responseGuard: false,
    workbox: { imported: false, route: [], precache: [], cleanup: false, fallback: false, dynamicLists: [] },
    consts: { strings: Object.create(null), arrays: Object.create(null), dynamicNames: new Set() },
    capped: false
  };
}

const HANDLER_PROPERTIES = { onfetch: 'fetch', oninstall: 'install', onactivate: 'activate' };

// Adds what the tokens of one file show to facts. file is the index of the file in the report.
export function scanWorkerTokens(facts, tokens, file, limits = WORKER_LIMITS) {
  const own = collectConstants(tokens);
  for (const [key, value] of Object.entries(own.strings)) if (!(key in facts.consts.strings)) facts.consts.strings[key] = value;
  for (const [key, value] of Object.entries(own.arrays)) if (!(key in facts.consts.arrays)) facts.consts.arrays[key] = value;
  for (const name of own.dynamicNames) facts.consts.dynamicNames.add(name);

  let calls = 0;
  let regions = 0;
  const here = (t) => ({ file, line: t.line });
  const budget = () => {
    calls += 1;
    if (calls > limits.maxCalls) {
      facts.capped = true;
      return false;
    }
    return true;
  };

  for (let k = 0; k < tokens.length; k += 1) {
    const t = tokens[k];
    if (t.t === 'string') {
      if (t.v === 'no-cors') facts.noCors.push(here(t));
      else if (t.v === 'opaque') facts.responseGuard = true;
      else if (t.v === 'GET') facts.methodGuard = true;
      if (t.v.startsWith('workbox-') || t.v.includes('/workbox-') || t.v.includes('workbox-sw')) facts.workbox.imported = true;
      continue;
    }
    if (t.t !== 'word') continue;
    const prev = tokens[k - 1];
    const next = tokens[k + 1];
    const afterDot = isPunct(prev, '.');

    if (t.v === 'addEventListener' && isPunct(next, '(') && tokens[k + 2] !== undefined && tokens[k + 2].t === 'string') {
      const type = tokens[k + 2].v;
      if (Object.hasOwn(facts.listens, type)) facts.listens[type].push(here(t));
    } else if (Object.hasOwn(HANDLER_PROPERTIES, t.v) && afterDot && isPunct(next, '=')) {
      facts.listens[HANDLER_PROPERTIES[t.v]].push(here(t));
    } else if (t.v === 'respondWith' && afterDot && isPunct(next, '(')) {
      facts.respondWith.push(here(t));
    } else if (t.v === 'skipWaiting' && isPunct(next, '(') && !isWord(prev, 'function')) {
      facts.skipWaiting.push(here(t));
    } else if (t.v === 'claim' && afterDot && isPunct(next, '(') && isWord(tokens[k - 2], 'clients')) {
      facts.claim.push(here(t));
    } else if (t.v === 'importScripts' && isPunct(next, '(') && budget()) {
      const call = callArgs(tokens, k + 1, limits.maxArgTokens);
      if (call === null) facts.imports.push({ file, line: t.line, value: null });
      else for (const arg of call.args) facts.imports.push({ file, line: t.line, value: literalString(arg) });
    } else if (t.v === 'open' && afterDot && isWord(tokens[k - 2], 'caches') && isPunct(next, '(') && budget()) {
      const call = callArgs(tokens, k + 1, limits.maxArgTokens);
      const arg = call && call.args[0] ? call.args[0] : [];
      let name = literalString(arg);
      let kind = name === null ? 'unknown' : 'literal';
      if (name === null && arg.length === 1 && arg[0].t === 'template') kind = 'dynamic';
      if (name === null && arg.length === 1 && arg[0].t === 'word') {
        if (Object.hasOwn(facts.consts.strings, arg[0].v)) {
          name = facts.consts.strings[arg[0].v];
          kind = 'literal';
        } else if (facts.consts.dynamicNames.has(arg[0].v)) kind = 'dynamic';
      }
      if (name === null && arg.some((a) => a.t === 'template')) kind = 'dynamic';
      facts.cacheOpens.push({ ...here(t), name, kind, ident: arg.length === 1 && arg[0].t === 'word' ? arg[0].v : null });
    } else if (t.v === 'delete' && afterDot && isPunct(next, '(')) {
      facts.anyDelete = true;
      if (isWord(tokens[k - 2], 'caches')) facts.deletesCaches = true;
    } else if (t.v === 'keys' && afterDot && isWord(tokens[k - 2], 'caches') && isPunct(next, '(')) {
      facts.keysCall = true;
    } else if ((t.v === 'addAll' || t.v === 'add') && afterDot && isPunct(next, '(')) {
      const receiver = tokens[k - 2];
      const cacheLike = t.v === 'addAll' || (receiver !== undefined && receiver.t === 'word' && receiver.v.toLowerCase().includes('cache'));
      if (cacheLike && budget()) {
        const call = callArgs(tokens, k + 1, limits.maxArgTokens);
        const arg = call && call.args[0] ? call.args[0] : [];
        let list = null;
        let ident = null;
        if (arg.length > 1 && isPunct(arg[0], '[') && isPunct(arg[arg.length - 1], ']')) list = stringArray(arg);
        else if (arg.length === 1 && arg[0].t === 'word') ident = arg[0].v;
        else if (t.v === 'add' && arg.length === 1 && arg[0].t === 'string') list = { items: [{ value: arg[0].v, line: arg[0].line }], dynamic: false };
        facts.addCalls.push({ ...here(t), call: t.v, list, ident });
      }
    } else if (t.v === 'put' && afterDot && isPunct(next, '(')) {
      facts.putCalls.push(here(t));
    } else if (t.v === 'match' && afterDot && isPunct(next, '(') && budget()) {
      const call = callArgs(tokens, k + 1, limits.maxArgTokens);
      if (call && call.args[0] && literalString(call.args[0]) !== null) facts.matchFixed.push(here(t));
    } else if (t.v === 'method' && afterDot) {
      facts.methodGuard = true;
    } else if ((t.v === 'ok' || t.v === 'status') && afterDot) {
      facts.responseGuard = true;
    } else if (t.v === 'catch' && regions < limits.maxRegions) {
      let open = -1;
      if (afterDot && isPunct(next, '(')) open = k + 1;
      else if (isPunct(next, '(')) {
        const close = matchClose(tokens, k + 1, 200);
        if (close !== -1 && isPunct(tokens[close + 1], '{')) open = close + 1;
      } else if (isPunct(next, '{')) open = k + 1;
      if (open !== -1) {
        regions += 1;
        const close = matchClose(tokens, open, limits.maxArgTokens);
        if (close !== -1) {
          for (let m = open + 1; m < close; m += 1) {
            const u = tokens[m];
            if (isWord(u, 'match') && isPunct(tokens[m - 1], '.') && isPunct(tokens[m + 1], '(')) {
              facts.catchFallback.push(here(u));
              break;
            }
            if (isWord(u, 'Response') && isWord(tokens[m - 1], 'new')) {
              facts.catchFallback.push(here(u));
              break;
            }
          }
        }
      }
    } else if (WORKBOX.route.includes(t.v) && isPunct(next, '(') && (!afterDot || isWord(tokens[k - 2], 'workbox'))) {
      facts.workbox.route.push(here(t));
      facts.workbox.imported = true;
      if (WORKBOX.precache.includes(t.v) && budget()) {
        const call = callArgs(tokens, k + 1, limits.maxArgTokens);
        const list = call && call.args[0] ? call.args[0] : [];
        if (list.length && isPunct(list[0], '[') && isPunct(list[list.length - 1], ']')) {
          const parsed = precacheEntries(list);
          facts.workbox.precache.push(...parsed.items.map((item) => ({ ...item, file })));
          if (parsed.dynamic) facts.workbox.dynamicLists.push(here(t));
        } else facts.workbox.dynamicLists.push(here(t));
      }
    } else if (t.v === 'precache' && (!afterDot || isWord(tokens[k - 2], 'workbox')) && isPunct(next, '(') && budget()) {
      facts.workbox.imported = true;
      const call = callArgs(tokens, k + 1, limits.maxArgTokens);
      const list = call && call.args[0] ? call.args[0] : [];
      if (list.length && isPunct(list[0], '[') && isPunct(list[list.length - 1], ']')) {
        const parsed = precacheEntries(list);
        facts.workbox.precache.push(...parsed.items.map((item) => ({ ...item, file })));
        if (parsed.dynamic) facts.workbox.dynamicLists.push(here(t));
      } else facts.workbox.dynamicLists.push(here(t));
    } else if (WORKBOX.cleanup.includes(t.v) && isPunct(next, '(')) {
      facts.workbox.cleanup = true;
      facts.workbox.imported = true;
    } else if (WORKBOX.fallback.includes(t.v)) {
      facts.workbox.fallback = true;
      facts.workbox.imported = true;
    } else if (t.v === 'workbox' && isPunct(next, '.')) {
      facts.workbox.imported = true;
    }
  }
}
