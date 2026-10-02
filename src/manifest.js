// Reading a web app manifest. The text is read by JSON.parse and nothing else; the members are then looked at in the
// way the saved W3C specification describes ("Processing the manifest"): a member that is not of the expected type is
// treated as absent, and an address is worked out against the address of the manifest. This module only reads values
// and gives back what it found; the files that an address names are looked at by check.js.

import { ICON_PURPOSES, INSTALL_DISPLAY, INSTALL_ICON_SIZES } from './data.js';
import { jsonErrorLine } from './json.js';
import { safeText } from './rules.js';

// Returns { value } for a manifest that is a JSON object, or { problem, line } with problem 'invalid' (not JSON; line is
// the line of the first mistake) or 'not-object' (JSON that is not an object). A byte order mark is ignored, as it is when a browser decodes the bytes.
export function parseManifest(text) {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  let value;
  try {
    value = JSON.parse(body);
  } catch {
    return { problem: 'invalid', line: jsonErrorLine(body) };
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { problem: 'not-object', line: null };
  return { value };
}

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const has = (object, key) => Object.hasOwn(object, key);

function parseUrl(value, base) {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

// The size lists of an icon: [{ w, h }] for 48x48 and the like, and any for the word any. The sizes attribute is a
// space-separated list; a token that is neither is ignored.
export function parseSizes(sizes) {
  const out = { pairs: [], any: false };
  for (const token of String(sizes).trim().split(/\s+/)) {
    if (token === '') continue;
    const lower = token.toLowerCase();
    if (lower === 'any') out.any = true;
    else {
      const m = /^(\d{1,5})x(\d{1,5})$/.exec(lower);
      if (m) out.pairs.push({ w: Number(m[1]), h: Number(m[2]) });
    }
  }
  return out;
}

// True when target is within scope, by the rule of the specification: the same origin, and the path of the target starts
// with the path of the scope.
export function withinScope(target, scope) {
  return target.origin === scope.origin && target.pathname.startsWith(scope.pathname);
}

// The folder part of a path: everything up to and including the last slash.
export function parentPath(pathname) {
  return pathname.slice(0, pathname.lastIndexOf('/') + 1);
}

// Looks at the members of a manifest. base is the address that the manifest is served from. Returns { issues, notes, model }. An issue is { id, path, subject, message, fix, extraFacts } with path
// the place of the member in the JSON, for its line; model holds what check.js needs to look at files and addresses.
export function inspectManifest(json, base, { maxIcons = 100 } = {}) {
  const issues = [];
  const notes = [];
  const model = { startUrl: null, startRaw: null, scopeUrl: null, icons: [], urls: [], themeColor: false };
  const issue = (id, path, subject, message, fix, extraFacts = []) => issues.push({ id, path, subject, message, fix, extraFacts });

  // name
  if (text(json.name) === '' && text(json.short_name) === '') {
    issue('name-missing', has(json, 'name') ? 'name' : has(json, 'short_name') ? 'short_name' : '', 'name', 'The manifest has neither a name nor a short_name that is a non-empty string. The install criteria name one of them. The specification lists every member as optional, so the requirement is the browser\'s, not the specification\'s.', 'Add "name" with the full name of the app, and "short_name" for places with little room.');
  }

  // start_url
  const rawStart = json.start_url;
  if (typeof rawStart !== 'string' || rawStart.trim() === '') {
    const why = !has(json, 'start_url') ? 'The manifest has no start_url.' : typeof rawStart !== 'string' ? 'start_url is not a string, so it is ignored.' : 'start_url is an empty string, so it is ignored.';
    issue('start-url-missing', has(json, 'start_url') ? 'start_url' : '', 'start_url', `${why} Without it the browser starts the app at the address of the page that links to the manifest, and the install criteria name start_url.`, 'Add "start_url", for example "./" or "/", an address of your own site.');
  } else {
    const start = parseUrl(rawStart.trim(), base);
    if (start === null) {
      issue('start-url-missing', 'start_url', 'start_url', 'start_url is not a valid URL, so it is ignored and the browser starts the app at the address of the page that links to the manifest.', 'Write start_url as a path or an address, for example "./" or "/app/".');
    } else {
      start.hash = '';
      model.startUrl = start;
      model.startRaw = rawStart.trim();
      model.urls.push({ member: 'start_url', url: start, path: 'start_url' });
    }
  }

  // display
  const displayValue = text(json.display).toLowerCase();
  const override = Array.isArray(json.display_override) ? json.display_override.filter((v) => typeof v === 'string').map((v) => v.trim().toLowerCase()) : [];
  const displayOk = INSTALL_DISPLAY.includes(displayValue) || override.some((v) => INSTALL_DISPLAY.includes(v));
  if (!displayOk) {
    if (!has(json, 'display') && override.length === 0) {
      issue('display-missing', '', 'display', 'The manifest has no display member, so the browser uses the browser display mode, which is not one of the modes that the install criteria accept.', 'Add "display": "standalone".');
    } else {
      const shown = displayValue === '' ? 'a value that is not a string' : `"${safeText(displayValue, 40)}"`;
      issue('display-not-installable', has(json, 'display') ? 'display' : 'display_override', 'display', `The display mode is ${shown}, which is not one of fullscreen, standalone, minimal-ui or window-controls-overlay, the modes that the install criteria accept.`, 'Set "display" to "standalone" (or "minimal-ui", "fullscreen").', displayValue === 'browser' ? [] : ['display-list']);
    }
  }

  // prefer_related_applications
  if (json.prefer_related_applications === true) {
    issue('prefer-related-applications', 'prefer_related_applications', 'prefer_related_applications', 'prefer_related_applications is true, and the install criteria say it must not be present or must be false.', 'Remove it, or set it to false.');
  }

  // icons
  const icons = Array.isArray(json.icons) ? json.icons : [];
  const valid = [];
  let beyond = 0;
  icons.forEach((icon, index) => {
    if (icon === null || typeof icon !== 'object' || Array.isArray(icon) || text(icon.src) === '') return;
    if (valid.length < maxIcons) valid.push({ icon, index });
    else beyond += 1;
  });
  if (beyond > 0) notes.push(`Only the first ${maxIcons} icons were looked at`);
  const unreadable = icons.length - valid.length - beyond;
  if (unreadable > 0) notes.push(`${unreadable} entr${unreadable === 1 ? 'y' : 'ies'} of icons ${unreadable === 1 ? 'has' : 'have'} no src and ${unreadable === 1 ? 'is' : 'are'} not read`);
  if (valid.length === 0) {
    issue('icons-missing', has(json, 'icons') ? 'icons' : '', 'icons', icons.length === 0 ? 'The manifest has no icons (the member is absent, not an array, or empty), and the install criteria name icons of 192px and 512px.' : 'No entry of icons has a src, and src is the only property that an icon needs.', 'Add "icons" with at least a 192x192 and a 512x512 image, each with src, sizes and type.', icons.length === 0 ? [] : ['mdn-icons-src']);
  }
  let has192 = false;
  let has512 = false;
  let anyIcon = false;
  let maskable = false;
  for (const { icon, index } of valid) {
    const path = `icons[${index}]`;
    const src = icon.src.trim();
    const sizes = typeof icon.sizes === 'string' ? parseSizes(icon.sizes) : { pairs: [], any: false };
    const sizesGiven = typeof icon.sizes === 'string' && icon.sizes.trim() !== '';
    const url = parseUrl(src, base);
    model.icons.push({ index, path, src, url, sizes, sizesGiven, type: text(icon.type) });
    if (url !== null) model.urls.push({ member: `icons[${index}].src`, url, path });
    if (sizes.any) anyIcon = true;
    if (sizes.pairs.some((p) => p.w === INSTALL_ICON_SIZES[0] && p.h === INSTALL_ICON_SIZES[0])) has192 = true;
    if (sizes.pairs.some((p) => p.w === INSTALL_ICON_SIZES[1] && p.h === INSTALL_ICON_SIZES[1])) has512 = true;
    if (!sizesGiven) {
      issue('icon-sizes-missing', path, path, `The icon ${safeText(src, 120)} has no sizes, so the browser cannot choose it by size.`, 'Add "sizes", for example "192x192", the exact size of the image.');
    }
    if (text(icon.type) === '') {
      issue('icon-type-missing', path, path, `The icon ${safeText(src, 120)} has no type, so the browser infers the image type from the file extension.`, 'Add "type", for example "image/png".');
    }
    if (typeof icon.purpose === 'string' && icon.purpose.trim() !== '') {
      const keywords = icon.purpose.trim().split(/\s+/);
      const known = keywords.filter((k) => ICON_PURPOSES.includes(k));
      if (known.length === 0) {
        issue('icon-purpose-ignored', path, path, `The purpose of the icon ${safeText(src, 120)} ("${safeText(icon.purpose, 60)}") holds no keyword that the specification defines, so the icon is ignored. The keywords are case-sensitive: monochrome, maskable, any.`, 'Use "any", "maskable" or "monochrome" (or a list of them).');
      }
      if (known.includes('maskable')) maskable = true;
    }
  }
  if (valid.length > 0 && !(has192 && has512)) {
    const missing = [!has192 ? '192x192' : null, !has512 ? '512x512' : null].filter(Boolean).join(' and ');
    if (anyIcon) notes.push(`No icon is declared as ${missing}; an icon with sizes "any" is not counted, and the tool cannot tell whether the browser accepts it for the install criteria`);
    else {
      issue('icons-missing-install-sizes', 'icons', 'icons', `No icon is declared as ${missing}, and the install criteria name a 192px and a 512px icon.`, `Add an icon with "sizes": "${!has192 ? '192x192' : '512x512'}"${!has192 && !has512 ? ' and one with "512x512"' : ''}.`, ['mdn-icons-sizes']);
    }
  }
  if (valid.length > 0 && !maskable) {
    issue('maskable-icon-missing', 'icons', 'icons', 'No icon has the purpose "maskable". An icon without it can be cropped or shown on a plain background by the system, and the specification says an icon is only to be used for its stated purpose.', 'Add a 512x512 icon with "purpose": "maskable", with the artwork inside the safe zone.');
  }

  // id
  const rawId = json.id;
  const origin = model.startUrl !== null ? model.startUrl.origin : new URL(base).origin;
  if (typeof rawId !== 'string' || rawId.trim() === '') {
    issue('id-missing', '', 'id', 'The manifest has no id, so the identity of the app is its start_url. If start_url changes later, the browser sees a different app and the installed one is not updated.', 'Add "id", for example "/" or "/recipes/", and keep it as it is for the life of the app.');
  } else {
    const id = parseUrl(rawId.trim(), `${origin}/`);
    if (id === null || id.origin !== origin) {
      issue('id-ignored', 'id', 'id', id === null ? 'id is not a valid URL, so it is ignored and the start_url is used as the identity.' : 'id is not the same origin as start_url, so it is ignored and the start_url is used as the identity.', 'Write id as a path of your own site, for example "/".');
    }
  }

  // scope
  const rawScope = json.scope;
  if (typeof rawScope === 'string' && rawScope.trim() !== '') {
    const scope = parseUrl(rawScope.trim(), base);
    if (scope === null) {
      issue('scope-excludes-start-url', 'scope', 'scope', 'scope is not a valid URL, so it is ignored and the scope is the folder of start_url.', 'Write scope as a path that ends with a slash, for example "/app/".');
    } else {
      scope.search = '';
      scope.hash = '';
      if (model.startUrl !== null && !withinScope(model.startUrl, scope)) {
        issue('scope-excludes-start-url', 'scope', 'scope', `start_url (${safeText(model.startUrl.pathname, 120)}) is not within scope (${safeText(scope.pathname, 120)}), so the scope is ignored and the browser uses the folder of start_url instead.`, 'Make scope a path that start_url begins with, for example the folder of start_url.');
      } else {
        model.scopeUrl = scope;
        model.urls.push({ member: 'scope', url: scope, path: 'scope' });
        if (!scope.pathname.endsWith('/')) {
          issue('scope-no-trailing-slash', 'scope', 'scope', `scope (${safeText(scope.pathname, 120)}) does not end with a slash, so it is a plain prefix match and also matches paths such as ${safeText(scope.pathname, 100)}-other/.`, 'End scope with a slash.');
        }
      }
    }
  } else if (model.startUrl !== null && parentPath(model.startUrl.pathname) !== '/') {
    issue('scope-missing', '', 'scope', `The manifest has no scope, so it defaults to ${safeText(parentPath(model.startUrl.pathname), 120)}, the folder of start_url. Pages outside that folder are outside the app.`, 'Add "scope" with the folder that holds all the pages of the app, ending with a slash.');
  }
  if (model.scopeUrl === null && model.startUrl !== null) {
    const fallback = new URL(model.startUrl.href);
    fallback.pathname = parentPath(fallback.pathname);
    fallback.search = '';
    model.scopeUrl = fallback;
  }

  // theme_color
  model.themeColor = text(json.theme_color) !== '';
  return { issues, notes, model };
}
