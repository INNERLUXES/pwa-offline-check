import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeEntities, jsonErrorLine, jsonLines, scanHtml } from '../src/index.js';

test('html: link, meta and base elements come out with their attributes, in lower case, and their line', () => {
  const { elements } = scanHtml('<!doctype html>\n<HEAD>\n<LINK REL="Manifest" HREF=/m.json>\n<meta name=viewport content="width=device-width">\n<base href="/app/">');
  assert.deepEqual(elements.map((e) => e.tag), ['link', 'meta', 'base']);
  assert.deepEqual(elements[0].attrs, { rel: 'Manifest', href: '/m.json' });
  assert.equal(elements[0].line, 3);
  assert.equal(elements[1].attrs.content, 'width=device-width');
});

test('html: a script is read as raw text up to its end tag, and a tag inside it is not an element', () => {
  const { elements, scripts } = scanHtml('<script>var s = "<link rel=manifest href=x>"; if (a < b) {}</script><link rel="stylesheet" href="s.css">');
  assert.equal(scripts.length, 1);
  assert.match(scripts[0].text, /link rel=manifest/);
  assert.deepEqual(elements.map((e) => e.attrs.rel), ['stylesheet']);
});

test('html: an external script keeps its src, and an end tag in any letter case closes a script', () => {
  const { scripts } = scanHtml('<script src="a.js"></SCRIPT ><script type="module">import "./b.js"</Script>');
  assert.equal(scripts[0].attrs.src, 'a.js');
  assert.equal(scripts[1].attrs.type, 'module');
});

test('html: comments are skipped, and an element inside a comment is not read', () => {
  const { elements } = scanHtml('<!-- <link rel="manifest" href="old.json"> --><link rel="manifest" href="new.json">');
  assert.deepEqual(elements.map((e) => e.attrs.href), ['new.json']);
});

test('html: a quoted value can hold > and <, and a name given twice keeps its first value', () => {
  const { elements } = scanHtml('<meta name="a" content="x > y < z" content="second">');
  assert.equal(elements[0].attrs.content, 'x > y < z');
});

test('html: character references of a value are decoded', () => {
  assert.equal(decodeEntities('a&amp;b &lt;c&gt; &quot;d&quot; &#39;e&#x27; &nbsp;&unknown; &#xZZ; &'), `a&b <c> "d" 'e' ${String.fromCharCode(160)}&unknown; &#xZZ; &`);
  const { elements } = scanHtml('<link rel="manifest" href="m.json?a=1&amp;b=2">');
  assert.equal(elements[0].attrs.href, 'm.json?a=1&b=2');
});

test('html: a comment, a script and a quoted value that are never closed are errors, and the read stops', () => {
  assert.deepEqual(scanHtml('<link rel="manifest" href="a.json"><!-- never').errors, [{ kind: 'comment', line: 1 }]);
  assert.deepEqual(scanHtml('<p>\n<script>var a = 1;').errors, [{ kind: 'script', line: 2 }]);
  assert.deepEqual(scanHtml('<p>\n<meta name="never closed content=x>').errors, [{ kind: 'attribute value', line: 2 }]);
});

test('html: tags are cut at the limit and the result says so', () => {
  const result = scanHtml('<meta name=a>'.repeat(100), { maxTags: 10, maxAttributes: 8, maxValueChars: 100 });
  assert.equal(result.truncated, true);
  assert.equal(result.elements.length, 10);
});

test('html: hostile input of a few megabytes is read in a short time', () => {
  const shapes = ['<'.repeat(2_000_000), '<a '.repeat(700_000), '<script>'.repeat(300_000), '<!--'.repeat(500_000), '<a b="'.repeat(300_000), '</'.repeat(1_000_000), '<script></script'.repeat(100_000)];
  for (const shape of shapes) {
    const started = Date.now();
    scanHtml(shape);
    assert.ok(Date.now() - started < 3000, `${shape.slice(0, 8)} took ${Date.now() - started} ms`);
  }
});

test('json lines: the line of each key and each array element is found', () => {
  const text = '{\n  "name": "x",\n  "icons": [\n    {\n      "src": "a.png",\n      "sizes": "1x1"\n    },\n    {\n      "src": "b.png"\n    }\n  ]\n}\n';
  const lines = jsonLines(text);
  assert.equal(lines.get('name'), 2);
  assert.equal(lines.get('icons'), 3);
  assert.equal(lines.get('icons[0]'), 4);
  assert.equal(lines.get('icons[0].sizes'), 6);
  assert.equal(lines.get('icons[1]'), 8);
  assert.equal(lines.get('icons[1].src'), 9);
});

test('json lines: a string that holds a brace or a key-like text does not confuse the reader, and the number of paths is bounded', () => {
  const lines = jsonLines('{"a": "}{[,\\"b\\":", "c": 1}');
  assert.deepEqual([...lines.keys()], ['a', 'c']);
  assert.equal(jsonLines('{"a":1,"b":2,"c":3}', { maxPaths: 2 }).size, 2);
});

test('json error line: the line of the first mistake is found without the text of the parser message', () => {
  assert.equal(jsonErrorLine('{"a": 1}'), null);
  assert.equal(jsonErrorLine('{\n  "a": 1,\n  "b": ,\n}'), 3);
  assert.equal(jsonErrorLine('{\n  "a": 1,\n}'), 3);
  assert.equal(jsonErrorLine('{"a": [1, 2,\n 3'), 2);
  assert.equal(jsonErrorLine("{'a': 1}"), 1);
  assert.equal(jsonErrorLine('{"a": 1} x'), 1);
  assert.equal(jsonErrorLine('[1, 2] [3]'), 1);
  assert.equal(jsonErrorLine('{"a": "line\nbreak"}'), 1);
  assert.equal(jsonErrorLine('\n\n{"a": tru}'), 3);
  assert.equal(jsonErrorLine('[0, -1.5e+3, 2E2, true, false, null, "a\\u00e9\\n", {}, []]'), null);
  assert.equal(jsonErrorLine('[01]'), 1);
  assert.equal(jsonErrorLine('[1.]'), 1);
  assert.equal(jsonErrorLine('"\\x"'), 1);
  assert.equal(jsonErrorLine(''), 1);
});

test('json error line: it agrees with JSON.parse on what is valid, for a set of small texts', () => {
  const samples = ['{}', '[]', '{"a":{"b":[1,{"c":null}]}}', '[,]', '{"a"}', '{"a":}', '[1 2]', '{"a":1,}', '[1,]', 'true', 'nul', '{"a":1}}', '"x"', '-', '1e', '{"a":[}', ' [ ] ', '{"a" : 1 , "b" : [ ] }'];
  for (const text of samples) {
    let valid = true;
    try {
      JSON.parse(text);
    } catch {
      valid = false;
    }
    assert.equal(jsonErrorLine(text) === null, valid, text);
  }
});

test('json error line: deeply nested and very long text is read in a short time', () => {
  const started = Date.now();
  assert.equal(jsonErrorLine('['.repeat(1_000_000)), 1);
  assert.equal(jsonErrorLine('{"a":'.repeat(300_000)), 1);
  assert.ok(Date.now() - started < 3000);
});
