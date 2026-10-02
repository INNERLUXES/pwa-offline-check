// A tokenizer for JavaScript text. It reads the file once, from left to right, character by character, and never runs a
// pattern over the raw text, so the time is linear in the size of the input. It skips comments, and it reads strings,
// template literals and regular expression literals as single tokens, so the text inside them is never taken for code.
// Nothing is run: the tokens are only looked at by the pattern matching in worker.js and page.js.
//
// Token types: word (a name or a keyword), string (v holds the text; a template literal without ${ } is a string too),
// template (a template literal with ${ }; v is null), number, regex, punct (one character) and the position of each
// token in .line. A token never holds more than MAX_STRING characters of text.

export const TOKEN_LIMITS = {
  maxTokens: 1000000,
  maxStringChars: 2048
};

const isDigit = (c) => c >= 48 && c <= 57;
// White space beyond ASCII: the no-break space, the byte order mark, and the Unicode space and separator characters.
const isWide = (c) => c === 160 || c === 0xfeff || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000;
const isIdStart = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || (c > 127 && !isWide(c));
const isIdPart = (c) => isIdStart(c) || isDigit(c);
const isSpace = (c) => c === 32 || c === 9 || c === 11 || c === 12 || (c > 127 && isWide(c));

// After one of these words a slash starts a regular expression and does not divide.
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
// After one of these characters a slash starts a regular expression.
const REGEX_AFTER_PUNCT = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);

// Returns { tokens, errors, truncated }. An error is { kind, line } for a string, a template, a comment or a regular
// expression class that is never closed; the tokens before it are kept and the rest of the text is not read.
export function tokenize(text, limits = TOKEN_LIMITS) {
  const tokens = [];
  const errors = [];
  const n = text.length;
  const braceStack = [];
  let i = 0;
  let line = 1;
  let depth = 0;
  let truncated = false;
  let noRegexUntil = -1;

  const push = (t, v, atLine) => {
    tokens.push({ t, v, line: atLine });
  };

  // Reads the part of a template literal that starts at text[start] (just after a backtick or a closing brace). Returns
  // { next, text, lines, state } where state is 'end' (closed by a backtick), 'expr' (stopped at ${) or 'open'.
  const scanTemplate = (start) => {
    let j = start;
    let lines = 0;
    let out = '';
    while (j < n) {
      const c = text.charCodeAt(j);
      if (c === 96) return { next: j + 1, text: out, lines, state: 'end' };
      if (c === 36 && text.charCodeAt(j + 1) === 123) return { next: j + 2, text: out, lines, state: 'expr' };
      if (c === 92) {
        const d = text.charCodeAt(j + 1);
        if (d === 10 || (d === 13 && text.charCodeAt(j + 2) !== 10)) lines += 1;
        if (out.length < limits.maxStringChars) out += unescape(text, j + 1);
        j += 2;
        continue;
      }
      if (c === 10 || (c === 13 && text.charCodeAt(j + 1) !== 10)) lines += 1;
      if (out.length < limits.maxStringChars) out += text[j];
      j += 1;
    }
    return { next: n, text: out, lines, state: 'open' };
  };

  while (i < n) {
    if (tokens.length >= limits.maxTokens) {
      truncated = true;
      break;
    }
    const c = text.charCodeAt(i);
    if (c === 10) {
      line += 1;
      i += 1;
      continue;
    }
    if (c === 13) {
      if (text.charCodeAt(i + 1) !== 10) line += 1;
      i += 1;
      continue;
    }
    if (isSpace(c)) {
      i += 1;
      continue;
    }
    const startLine = line;
    const last = tokens.length ? tokens[tokens.length - 1] : null;

    if (c === 47) {
      const d = text.charCodeAt(i + 1);
      // // comment
      if (d === 47) {
        i += 2;
        while (i < n && text.charCodeAt(i) !== 10 && text.charCodeAt(i) !== 13) i += 1;
        continue;
      }
      // /* comment */
      if (d === 42) {
        i += 2;
        let closed = false;
        while (i < n) {
          const e = text.charCodeAt(i);
          if (e === 42 && text.charCodeAt(i + 1) === 47) {
            i += 2;
            closed = true;
            break;
          }
          if (e === 10 || (e === 13 && text.charCodeAt(i + 1) !== 10)) line += 1;
          i += 1;
        }
        if (!closed) {
          errors.push({ kind: 'comment', line: startLine });
          break;
        }
        continue;
      }
      // a regular expression literal, or a division
      const regexAllowed = last === null || (last.t === 'punct' && REGEX_AFTER_PUNCT.has(last.v)) || (last.t === 'word' && REGEX_AFTER_WORD.has(last.v));
      if (regexAllowed && i >= noRegexUntil) {
        let j = i + 1;
        let inClass = false;
        let closed = false;
        while (j < n) {
          const e = text.charCodeAt(j);
          if (e === 10 || e === 13) break;
          if (e === 92) {
            j += 2;
            continue;
          }
          if (e === 91) inClass = true;
          else if (e === 93) inClass = false;
          else if (e === 47 && !inClass) {
            closed = true;
            break;
          }
          j += 1;
        }
        if (closed) {
          j += 1;
          while (j < n && isIdPart(text.charCodeAt(j))) j += 1;
          i = j;
          push('regex', '', startLine);
          continue;
        }
        // Not closed on this line: it was a division after all. No other slash of this line is tried as a regular
        // expression, so the scan is not repeated and the time stays linear.
        noRegexUntil = j;
      }
      i += 1;
      push('punct', '/', startLine);
      continue;
    }

    // 'string' and "string"
    if (c === 39 || c === 34) {
      let j = i + 1;
      let out = '';
      let closed = false;
      while (j < n) {
        const e = text.charCodeAt(j);
        if (e === c) {
          closed = true;
          break;
        }
        if (e === 10 || e === 13) break;
        if (e === 92) {
          const f = text.charCodeAt(j + 1);
          if (f === 10 || (f === 13 && text.charCodeAt(j + 2) !== 10)) line += 1;
          if (out.length < limits.maxStringChars) out += unescape(text, j + 1);
          j += 2;
          continue;
        }
        if (out.length < limits.maxStringChars) out += text[j];
        j += 1;
      }
      if (!closed) {
        errors.push({ kind: 'string', line: startLine });
        break;
      }
      i = j + 1;
      push('string', out, startLine);
      continue;
    }

    // `template`, with ${ } holding code that is read as ordinary tokens
    if (c === 96) {
      const part = scanTemplate(i + 1);
      line += part.lines;
      if (part.state === 'open') {
        errors.push({ kind: 'template literal', line: startLine });
        break;
      }
      i = part.next;
      if (part.state === 'end') push('string', part.text, startLine);
      else {
        push('template', null, startLine);
        braceStack.push(depth);
        depth += 1;
      }
      continue;
    }

    if (c === 125 && braceStack.length && braceStack[braceStack.length - 1] === depth - 1) {
      // the } that closes a ${ } of a template literal: go on reading the template
      braceStack.pop();
      depth -= 1;
      const part = scanTemplate(i + 1);
      line += part.lines;
      if (part.state === 'open') {
        errors.push({ kind: 'template literal', line: startLine });
        break;
      }
      i = part.next;
      if (part.state === 'expr') {
        braceStack.push(depth);
        depth += 1;
      }
      continue;
    }

    if (isDigit(c)) {
      let j = i + 1;
      while (j < n) {
        const d = text.charCodeAt(j);
        if (isDigit(d) || isIdPart(d) || d === 46) j += 1;
        else break;
      }
      i = j;
      push('number', '', startLine);
      continue;
    }

    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isIdPart(text.charCodeAt(j))) j += 1;
      push('word', text.slice(i, j), startLine);
      i = j;
      continue;
    }

    i += 1;
    if (c === 123) depth += 1;
    else if (c === 125) depth -= 1;
    push('punct', String.fromCharCode(c), startLine);
  }
  return { tokens, errors, truncated };
}

// The character that a backslash escape stands for, as far as a file name or a path needs it: \n, \t, \r and the
// quote and backslash characters. Anything else stands for itself.
function unescape(text, at) {
  const c = text[at];
  if (c === 'n') return '\n';
  if (c === 't') return '\t';
  if (c === 'r') return '\r';
  return c === undefined ? '' : c;
}
