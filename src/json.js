// Finds the line of the members of a manifest, so that a finding can name the line of the member it is about. The
// values are read by JSON.parse; this reader only walks the text once, tracks the nesting with a list and not with
// recursion, and records the line where each key and each array element starts. A path is written as icons[1].sizes.

export const JSON_LIMITS = {
  maxPaths: 20000
};

// Returns a Map of path -> line. The text is expected to be valid JSON; for text that is not, the map is just partial.
export function jsonLines(text, limits = JSON_LIMITS) {
  const lines = new Map();
  const stack = [];
  const n = text.length;
  let line = 1;
  let pendingKey = null;
  let i = 0;

  const childPath = () => {
    const top = stack[stack.length - 1];
    if (top === undefined) return '';
    if (top.type === 'array') return `${top.path}[${top.index}]`;
    if (pendingKey === null) return top.path;
    return top.path === '' ? pendingKey : `${top.path}.${pendingKey}`;
  };
  const record = (path) => {
    if (lines.size < limits.maxPaths && !lines.has(path)) lines.set(path, line);
  };

  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 10 || (c === 13 && text.charCodeAt(i + 1) !== 10)) {
      line += 1;
      i += 1;
      continue;
    }
    if (c === 34) {
      const startLine = line;
      let j = i + 1;
      let out = '';
      while (j < n) {
        const d = text.charCodeAt(j);
        if (d === 34) break;
        if (d === 92) {
          out += text[j + 1] ?? '';
          j += 2;
          continue;
        }
        if (d === 10 || (d === 13 && text.charCodeAt(j + 1) !== 10)) line += 1;
        if (out.length < 200) out += text[j];
        j += 1;
      }
      i = j + 1;
      const top = stack[stack.length - 1];
      if (top !== undefined && top.type === 'object' && top.expectKey) {
        pendingKey = out;
        top.expectKey = false;
        const path = top.path === '' ? out : `${top.path}.${out}`;
        if (lines.size < limits.maxPaths && !lines.has(path)) lines.set(path, startLine);
      } else if (top !== undefined && top.type === 'array') {
        record(`${top.path}[${top.index}]`);
      }
      continue;
    }
    if (c === 123 || c === 91) {
      const path = childPath();
      if (stack.length) record(path);
      stack.push({ type: c === 123 ? 'object' : 'array', path, index: 0, expectKey: c === 123 });
      pendingKey = null;
      i += 1;
      continue;
    }
    if (c === 125 || c === 93) {
      stack.pop();
      pendingKey = null;
      i += 1;
      continue;
    }
    if (c === 44) {
      const top = stack[stack.length - 1];
      if (top !== undefined) {
        if (top.type === 'array') top.index += 1;
        else top.expectKey = true;
      }
      pendingKey = null;
      i += 1;
      continue;
    }
    i += 1;
  }
  return lines;
}

// The line of the first mistake in text that is not valid JSON, or null when the text is valid. The reader follows the JSON
// grammar with a list for the nesting, in one pass. It does not use the message of JSON.parse, which differs between
// versions of Node and can quote the file.
export function jsonErrorLine(text) {
  const n = text.length;
  const stack = [];
  let line = 1;
  let i = 0;
  // value | valueOrClose | keyOrClose | key | colon | after | end
  let state = 'value';
  const ws = () => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 10 || (c === 13 && text.charCodeAt(i + 1) !== 10)) line += 1;
      if (c === 32 || c === 9 || c === 10 || c === 13) i += 1;
      else break;
    }
  };
  const isHex = (h) => h !== undefined && ((h >= '0' && h <= '9') || (h >= 'a' && h <= 'f') || (h >= 'A' && h <= 'F'));
  const str = () => {
    i += 1;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 34) {
        i += 1;
        return true;
      }
      if (c < 32) return false;
      if (c === 92) {
        const d = text[i + 1];
        if (d === 'u') {
          if (!(isHex(text[i + 2]) && isHex(text[i + 3]) && isHex(text[i + 4]) && isHex(text[i + 5]))) return false;
          i += 6;
          continue;
        }
        if (d === undefined || !'"\\/bfnrt'.includes(d)) return false;
        i += 2;
        continue;
      }
      i += 1;
    }
    return false;
  };
  const literal = (word) => {
    if (!text.startsWith(word, i)) return false;
    i += word.length;
    return true;
  };
  const digits = () => {
    const start = i;
    while (text[i] >= '0' && text[i] <= '9') i += 1;
    return i > start;
  };
  const number = () => {
    if (text[i] === '-') i += 1;
    if (text[i] === '0') i += 1;
    else if (!digits()) return false;
    if (text[i] === '.') {
      i += 1;
      if (!digits()) return false;
    }
    if (text[i] === 'e' || text[i] === 'E') {
      i += 1;
      if (text[i] === '+' || text[i] === '-') i += 1;
      if (!digits()) return false;
    }
    return true;
  };
  for (;;) {
    ws();
    if (i >= n) return state === 'end' ? null : line;
    const c = text[i];
    if (state === 'end') return line;
    if (state === 'value' || state === 'valueOrClose') {
      if (state === 'valueOrClose' && c === ']') {
        stack.pop();
        i += 1;
        state = stack.length ? 'after' : 'end';
      } else if (c === '{') {
        stack.push('{');
        i += 1;
        state = 'keyOrClose';
      } else if (c === '[') {
        stack.push('[');
        i += 1;
        state = 'valueOrClose';
      } else {
        const ok = c === '"' ? str() : c === 't' ? literal('true') : c === 'f' ? literal('false') : c === 'n' ? literal('null') : number();
        if (!ok) return line;
        state = stack.length ? 'after' : 'end';
      }
    } else if (state === 'keyOrClose' || state === 'key') {
      if (state === 'keyOrClose' && c === '}') {
        stack.pop();
        i += 1;
        state = stack.length ? 'after' : 'end';
      } else {
        if (c !== '"' || !str()) return line;
        state = 'colon';
      }
    } else if (state === 'colon') {
      if (c !== ':') return line;
      i += 1;
      state = 'value';
    } else {
      // after a value inside an object or an array
      const top = stack[stack.length - 1];
      if (c === ',') {
        i += 1;
        state = top === '{' ? 'key' : 'value';
      } else if ((c === '}' && top === '{') || (c === ']' && top === '[')) {
        stack.pop();
        i += 1;
        state = stack.length ? 'after' : 'end';
      } else return line;
    }
  }
}
