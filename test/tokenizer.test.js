import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKEN_LIMITS, tokenize } from '../src/index.js';

const words = (code) => tokenize(code).tokens.filter((t) => t.t === 'word').map((t) => t.v);
const strings = (code) => tokenize(code).tokens.filter((t) => t.t === 'string').map((t) => t.v);

test('tokenizer: words, strings and punctuation come out as tokens with their line', () => {
  const { tokens, errors } = tokenize("self.addEventListener('fetch', fn);\nfoo();\n");
  assert.deepEqual(errors, []);
  assert.deepEqual(tokens.map((t) => t.v).slice(0, 7), ['self', '.', 'addEventListener', '(', 'fetch', ',', 'fn']);
  assert.equal(tokens.find((t) => t.v === 'foo').line, 2);
});

test('tokenizer: line comments and block comments are skipped, and a call inside one is not seen', () => {
  assert.deepEqual(words('// caches.open("x")\n/* skipWaiting() \n spans lines */ real();'), ['real']);
  assert.equal(tokenize('a\n/* one\ntwo */\nb').tokens[1].line, 4);
});

test('tokenizer: a call inside a string is not a call', () => {
  assert.deepEqual(words('const s = "self.skipWaiting()"; x();'), ['const', 's', 'x']);
  assert.deepEqual(strings('const s = "self.skipWaiting()";'), ['self.skipWaiting()']);
});

test('tokenizer: single, double and escaped quotes are read as one string', () => {
  assert.deepEqual(strings(`a('it\\'s', "say \\"hi\\"", 'back\\\\slash')`), ["it's", 'say "hi"', 'back\\slash']);
});

test('tokenizer: a template literal without an expression is a string, with an expression it is a template token', () => {
  assert.deepEqual(strings('const a = `plain text`;'), ['plain text']);
  const { tokens } = tokenize('const a = `v-${VERSION}-cache`; b();');
  assert.ok(tokens.some((t) => t.t === 'template'));
  assert.deepEqual(tokens.filter((t) => t.t === 'word').map((t) => t.v), ['const', 'a', 'VERSION', 'b']);
});

test('tokenizer: braces inside a template expression and nested templates do not end the template early', () => {
  const { tokens, errors } = tokenize('const a = `x ${ {k: 1}.k } y ${ `n${z}` } end`; after();');
  assert.deepEqual(errors, []);
  assert.deepEqual(tokens.filter((t) => t.t === 'word').map((t) => t.v).slice(-2), ['z', 'after']);
});

test('tokenizer: a regular expression literal is one token, and a slash after a name is a division', () => {
  const a = tokenize('x = /"[/]\'/g; y();');
  assert.deepEqual(a.errors, []);
  assert.ok(a.tokens.some((t) => t.t === 'regex'));
  assert.deepEqual(a.tokens.filter((t) => t.t === 'word').map((t) => t.v), ['x', 'y']);
  const b = tokenize('var r = a / b / c; d();');
  assert.ok(!b.tokens.some((t) => t.t === 'regex'));
  assert.deepEqual(b.tokens.filter((t) => t.t === 'word').map((t) => t.v), ['var', 'r', 'a', 'b', 'c', 'd']);
});

test('tokenizer: a slash after return or an open parenthesis starts a regular expression', () => {
  assert.ok(tokenize('return /ab+c/.test(s)').tokens.some((t) => t.t === 'regex'));
  assert.ok(tokenize('f(/x/)').tokens.some((t) => t.t === 'regex'));
  assert.ok(!tokenize('f(a) / 2').tokens.some((t) => t.t === 'regex'));
});

test('tokenizer: a string, a template and a comment that are never closed are errors that stop the read', () => {
  assert.deepEqual(tokenize('a("never closed\nb();').errors, [{ kind: 'string', line: 1 }]);
  assert.deepEqual(tokenize('a();\n`never closed').errors, [{ kind: 'template literal', line: 2 }]);
  assert.deepEqual(tokenize('a();\n/* never closed').errors, [{ kind: 'comment', line: 2 }]);
  assert.deepEqual(words('ok(); /* never closed'), ['ok']);
});

test('tokenizer: the tokens are cut at the limit and the result says so', () => {
  const result = tokenize('a(); '.repeat(100), { ...TOKEN_LIMITS, maxTokens: 50 });
  assert.equal(result.truncated, true);
  assert.equal(result.tokens.length, 50);
});

test('tokenizer: a string is kept only up to the length limit', () => {
  const long = 'x'.repeat(10000);
  const token = tokenize(`a("${long}")`).tokens.find((t) => t.t === 'string');
  assert.equal(token.v.length, TOKEN_LIMITS.maxStringChars);
});

test('tokenizer: line ends of all three kinds are counted once', () => {
  assert.equal(tokenize('a\r\nb\rc\nd').tokens.map((t) => t.line).join(), '1,2,3,4');
});

test('tokenizer: hostile input of a few megabytes is read in a short time', () => {
  const shapes = ['"'.repeat(2_000_000), '`${'.repeat(400_000), '/*'.repeat(1_000_000), '(/['.repeat(700_000), "'a\\".repeat(600_000), '/'.repeat(2_000_000), '{'.repeat(2_000_000)];
  for (const shape of shapes) {
    const started = Date.now();
    tokenize(shape);
    assert.ok(Date.now() - started < 3000, `${shape.slice(0, 6)} took ${Date.now() - started} ms`);
  }
});

test('tokenizer: a byte order mark and non-breaking spaces are white space', () => {
  assert.deepEqual(words(`${String.fromCharCode(0xfeff)}a${String.fromCharCode(160)}b`), ['a', 'b']);
});
