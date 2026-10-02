// A reader for the HTML of a page. It walks the text once, from left to right, and keeps what the checks need: the link,
// meta, base and script elements with their attributes and their line. Comments are skipped, the text of a script, a
// style, a textarea and a title is read as raw text up to its end tag, and an attribute value is read as one quoted or
// unquoted piece, so a '<' inside a value or a script is never taken for a tag. No pattern runs over the raw text, so the
// time is linear in the size of the input, and nothing is run.

export const HTML_LIMITS = {
  maxTags: 200000,
  maxAttributes: 64,
  maxValueChars: 4096
};

const RAW = new Set(['script', 'style', 'textarea', 'title']);

const isSpace = (c) => c === 32 || c === 9 || c === 10 || c === 12 || c === 13;
const isNameChar = (c) => !(isSpace(c) || c === 47 || c === 62 || c === 61 || Number.isNaN(c));
const isLetter = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);

const isDigit = (d, hex) => (d >= '0' && d <= '9') || (hex && ((d >= 'a' && d <= 'f') || (d >= 'A' && d <= 'F')));

// The characters that &name; stands for, as far as an address or a name needs them.
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

// Decodes the character references of an attribute value: &amp; &lt; &gt; &quot; &apos; and numbers (&#39; &#x27;).
export function decodeEntities(value) {
  let out = '';
  let i = 0;
  const n = value.length;
  while (i < n) {
    const at = value.indexOf('&', i);
    if (at === -1) {
      out += value.slice(i);
      break;
    }
    out += value.slice(i, at);
    const semi = value.indexOf(';', at);
    if (semi === -1 || semi - at > 10) {
      out += '&';
      i = at + 1;
      continue;
    }
    const name = value.slice(at + 1, semi);
    let char = null;
    if (name[0] === '#') {
      const hex = name[1] === 'x' || name[1] === 'X';
      const digits = name.slice(hex ? 2 : 1);
      const code = digits !== '' && [...digits].every((d) => isDigit(d, hex)) ? parseInt(digits, hex ? 16 : 10) : NaN;
      if (code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)) char = String.fromCodePoint(code);
    } else if (Object.hasOwn(ENTITIES, name)) {
      char = ENTITIES[name];
    }
    if (char === null) {
      out += '&';
      i = at + 1;
    } else {
      out += char;
      i = semi + 1;
    }
  }
  return out;
}

// Returns { elements, scripts, errors, truncated }.
//   elements: every <link>, <meta> and <base> as { tag, attrs, line } (attribute names in lower case, values decoded; a
//             name given twice keeps its first value, as HTML does)
//   scripts:  every <script> as { attrs, text, line }
//   errors:   { kind, line } for a comment, a script or a quoted value that is never closed; the rest is not read
export function scanHtml(text, limits = HTML_LIMITS) {
  const elements = [];
  const scripts = [];
  const errors = [];
  const n = text.length;

  // the offset where each line starts, so that a position can be turned into a line number by a binary search
  const starts = [0];
  for (let k = 0; k < n; k += 1) {
    const c = text.charCodeAt(k);
    if (c === 10 || (c === 13 && text.charCodeAt(k + 1) !== 10)) starts.push(k + 1);
  }
  const lineAt = (pos) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

  // The offset of the end tag </name (any letter case) at or after from, or -1.
  const findEnd = (name, from) => {
    let at = text.indexOf('</', from);
    while (at !== -1) {
      if (text.slice(at + 2, at + 2 + name.length).toLowerCase() === name) {
        const after = text.charCodeAt(at + 2 + name.length);
        if (Number.isNaN(after) || isSpace(after) || after === 62 || after === 47) return at;
      }
      at = text.indexOf('</', at + 2);
    }
    return -1;
  };

  let i = 0;
  let tags = 0;
  let truncated = false;
  while (i < n) {
    const lt = text.indexOf('<', i);
    if (lt === -1) break;
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      if (end === -1) {
        errors.push({ kind: 'comment', line: lineAt(lt) });
        break;
      }
      i = end + 3;
      continue;
    }
    const next = text.charCodeAt(lt + 1);
    if (next === 33 || next === 63 || next === 47) {
      // <!doctype>, <?...>, </end>
      const end = text.indexOf('>', lt + 2);
      if (end === -1) break;
      i = end + 1;
      continue;
    }
    if (!isLetter(next)) {
      i = lt + 1;
      continue;
    }
    tags += 1;
    if (tags > limits.maxTags) {
      truncated = true;
      break;
    }
    let j = lt + 1;
    while (j < n && isNameChar(text.charCodeAt(j))) j += 1;
    const tag = text.slice(lt + 1, j).toLowerCase();
    const attrs = {};
    let count = 0;
    let closed = false;
    let failed = false;
    while (j < n) {
      while (j < n && (isSpace(text.charCodeAt(j)) || text.charCodeAt(j) === 47)) j += 1;
      if (j >= n) break;
      if (text.charCodeAt(j) === 62) {
        closed = true;
        j += 1;
        break;
      }
      const nameStart = j;
      j += 1;
      while (j < n && isNameChar(text.charCodeAt(j))) j += 1;
      const name = text.slice(nameStart, j).toLowerCase();
      while (j < n && isSpace(text.charCodeAt(j))) j += 1;
      let value = '';
      if (text.charCodeAt(j) === 61) {
        j += 1;
        while (j < n && isSpace(text.charCodeAt(j))) j += 1;
        const q = text.charCodeAt(j);
        if (q === 34 || q === 39) {
          const end = text.indexOf(q === 34 ? '"' : "'", j + 1);
          if (end === -1) {
            errors.push({ kind: 'attribute value', line: lineAt(lt) });
            failed = true;
            break;
          }
          value = text.slice(j + 1, Math.min(end, j + 1 + limits.maxValueChars));
          j = end + 1;
        } else {
          const from = j;
          while (j < n && !isSpace(text.charCodeAt(j)) && text.charCodeAt(j) !== 62) j += 1;
          value = text.slice(from, Math.min(j, from + limits.maxValueChars));
        }
      }
      if (count < limits.maxAttributes && !Object.hasOwn(attrs, name)) {
        attrs[name] = decodeEntities(value);
        count += 1;
      }
    }
    if (failed) break;
    const line = lineAt(lt);
    if (tag === 'link' || tag === 'meta' || tag === 'base') elements.push({ tag, attrs, line });
    i = closed ? j : n;
    if (closed && RAW.has(tag)) {
      const end = findEnd(tag, i);
      if (end === -1) {
        if (tag === 'script') {
          errors.push({ kind: 'script', line });
          scripts.push({ attrs, text: text.slice(i, i + 4 * 1024 * 1024), line });
        }
        break;
      }
      if (tag === 'script') scripts.push({ attrs, text: text.slice(i, end), line });
      i = end;
    }
  }
  return { elements, scripts, errors, truncated };
}
