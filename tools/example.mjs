// Runs the README examples, checks that they report what the README shows, and writes the reports of the failing
// example to examples/output. CI runs it and then fails if those files changed, so the example output in the
// repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main, LIMITS } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// Runs the tool on folders of the repository; paths in the report are relative to the folder that is checked.
async function run(argv) {
  let out = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => process.stderr.write(t) }, LIMITS, root);
  return { code, out };
}

const problems = [];
function expect(name, result, code, expected, unwanted) {
  const missing = expected.filter((e) => !result.out.includes(e));
  const wrong = unwanted.filter((e) => result.out.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})`);
  }
}

const failingArgs = ['examples/recipe-box'];
const failing = await run(failingArgs);
process.stdout.write(failing.out);
expect('failing app', failing, 1, [
  'findings: 5 error, 7 warning, 5 info',
  'WARNING  viewport-missing  index.html:1',
  'INFO     theme-color-missing  index.html:1',
  'INFO     id-missing  manifest.webmanifest:1',
  'WARNING  scope-excludes-start-url  manifest.webmanifest:4',
  'ERROR    display-not-installable  manifest.webmanifest:5',
  'INFO     maskable-icon-missing  manifest.webmanifest:7',
  'ERROR    icon-file-missing  manifest.webmanifest:13',
  'WARNING  icon-sizes-missing  manifest.webmanifest:13',
  'INFO     icon-type-missing  manifest.webmanifest:13',
  'ERROR    insecure-url  manifest.webmanifest:16',
  'WARNING  sw-scope-too-wide  js/app.js:12',
  'ERROR    precache-file-missing  js/sw.js:2',
  'INFO     sw-skip-waiting  js/sw.js:5',
  'WARNING  sw-cache-unversioned  js/sw.js:6',
  'WARNING  sw-no-offline-fallback  js/sw.js:9',
  'WARNING  sw-cache-non-get  js/sw.js:14',
  'GATE: FAIL - 5 errors'
], ['GATE: PASS']);

process.stdout.write('\n');
const fixedArgs = ['examples/recipe-box-fixed', '--fail-on', 'warning'];
const fixed = await run(fixedArgs);
process.stdout.write(fixed.out);
expect('fixed app with --fail-on warning', fixed, 0, [
  'findings: 0 error, 0 warning, 1 info',
  'INFO     sw-clients-claim  sw.js:14',
  'GATE: PASS (--fail-on warning)'
], ['ERROR', 'WARNING ']);

// The README shows the runs as they are printed.
const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
if (!readme.includes(failing.out)) problems.push('README: the sample output of the failing app differs from a real run');
if (!readme.includes(fixed.out)) problems.push('README: the sample output of the fixed app differs from a real run');

// The same app in the other formats, kept as examples of what each one looks like.
await mkdir(resolve(root, 'examples/output'), { recursive: true });
await writeFile(resolve(root, 'examples/output/recipe-box.txt'), failing.out);
for (const [format, name] of [['markdown', 'recipe-box.md'], ['json', 'recipe-box.json'], ['csv', 'recipe-box.csv']]) {
  const r = await run([...failingArgs, '--format', format]);
  if (r.code !== 1) problems.push(`${format}: exit code ${r.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output', name), r.out);
}

if (problems.length) {
  for (const p of problems) console.error(`example: ${p}`);
  process.exit(1);
}
