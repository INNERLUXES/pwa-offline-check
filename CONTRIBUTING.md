# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows and macOS, the repository checks, CodeQL, and a secure development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, with `!` for a breaking change.

## Changing a check

1. Describe the change in docs/method.md first: what the check reports, its severity, what it can see and what it cannot, and the sentence of the source it rests on. Where the tool makes a conclusion of its own (a threshold, a list of names, a severity, a reading of what code does), say so and say why, and say it in the message of the finding too. Keep the install criteria and the specification apart: a member that the specification lists as optional but that the install criteria name is reported as the install criteria's, not the specification's.
2. Add a test with the files written inline, small enough that the result can be worked out by hand, and a near miss that must not match. Use made-up names.
3. Names from a file go through `safeText` before they reach a finding or a note, so control characters are removed. A finding shows a path, a name or an address that it is about, cut to a length, and never a whole string or a comment.
4. A finding id, once released, keeps its meaning: pipelines and other tools read it from the JSON and CSV reports.
5. A thing the tool cannot read is reported, never skipped. A finding that a file cannot settle says that it is a review item.

## Changing a quoted sentence, a list of names or a size

The sentences, the display modes, the icon purposes, the icon sizes and the Workbox calls in `src/data.js` come from the pages saved in `research/sources`. When a page changes, save the new text in `research/sources` (the address on the first line), change `src/data.js` to match, and update docs/rules-and-sources.md. `test/data.test.js` compares every sentence, name and size with the saved text, so changing one without the other fails.

Never add a fact, a requirement or a rule from memory or from a blog post. A new check needs the page, opened and saved, and the words of the page that give the sentence. A check for a browser other than the ones the saved pages describe needs that browser's own documentation saved the same way; none is saved today, so none exists.

## Changing a reader

The JavaScript tokenizer, the HTML reader and the JSON reader are the base of every check.

1. Add a test for every form you add and one for the near miss. Keep the read linear: one pass over the characters, no pattern on the raw text, no search that starts again from the beginning for each character.
2. Keep the limits on the size of a file, the number of files, tokens, tags and calls, and add a hostile-input test with a time limit for a new shape.
3. Paths are worked out by `parseRef` and opened through the site in `src/files.js`, never with `path.join` on a name from a file. Paths shown in a report are relative, with forward slashes. File names are matched by letter case and compared by code unit, never by locale. Do not assume that a backslash is a separator on Linux or macOS.

## Rules for the code

- No runtime dependencies. Node 22 or newer and nothing else.
- The tool reads the files it is given and writes only to the screen. It fetches nothing, opens no network connection, runs no program, and never runs the JavaScript it reads.
- Source files stay ASCII; build any other character from its number.
- Never commit a real secret, even as a fixture. `npm run check` fails on anything that looks like a credential.
- The README and the documents carry no dates or years.

## Before you open the pull request

```
npm test
npm run check
npm run example
```
