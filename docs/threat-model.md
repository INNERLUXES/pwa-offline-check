# Threat model

## What the tool touches

- It reads the page that is named on the command line, and the files under the site root that an address in the page, the manifest or a worker names: the manifest, the scripts, the workers, the files they import, the icons and the files that a worker caches. Nothing else on the disk is opened, and it lists the folders on the way to a file so that it can match names by letter case.
- It does not follow an address to another origin. An `http:` or `https:` address is looked at as text, and nothing is fetched.
- A symbolic link given as an argument, or found on the way to a file, is followed only when its real target is a regular file or a folder inside the real path of the root.
- It writes only to the screen (standard output and standard error).
- It opens no network connection and runs no program: not a shell, not a browser, not a build tool.

## What the input may hold

An app folder is often checked in a pipeline that runs on pull requests, including pull requests from people outside the team. The tool treats every file as possibly hostile. A file can be huge, hold millions of quotes, comment openers, brackets or slashes, never close a string or a script element, hold a name made of control characters, name a path that climbs out of the folder, or be a link to a file elsewhere on the disk. A worker can hold code that would do harm if it ran. The tool never runs it.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A huge file, a huge number of files, or very many tokens, tags or calls exhaust memory or time | A file over its size limit is refused from the size of the open file before it is read, the files together over 20 MB are refused, the number of scripts, workers and imported files is bounded, and a file with more tokens or tags than the limit is cut with `limit-reached` |
| A crafted run of quotes, comment openers, backticks, slashes, brackets or tags makes a reader run for a very long time | The tokenizer, the HTML reader and the JSON reader read each character once and use no regular expression on the raw text. A slash that cannot start a regular expression is not tried again on the same line. The arguments of a call are looked at up to a fixed number of tokens, and the number of calls of each kind is bounded. Tests run megabytes of each hostile shape and set a time limit |
| A string, a comment, a script element or a value is never closed, so the tool silently ignores the rest of the file | It is an error finding, `unterminated-token`, so the gate fails, and the rest of the file is reported as not read |
| A file is skipped, and a check passes without having run | A file that cannot be read is `file-not-read`, a file cut by a limit is `limit-reached`, a file at another address is `remote-not-read`, a list or an address that is built at run time is `worker-dynamic` or `sw-register-dynamic`, a worker that uses Workbox is `workbox-not-read`, and the notes say what was counted and not read |
| An address in the page or the manifest reads a file outside the folder (`../../secret`, an absolute path, a link) | The address is worked out with its dots resolved, and an address that climbs above the root is refused and reported. The real path of every file is checked against the real path of the root, so a symbolic link or a junction that leads out is refused, also on a folder in the middle of the path. A file that is not a regular file is refused |
| An address makes the tool a fetcher | The tool has no code that fetches. A command-line argument that looks like a URL is refused, and reading from standard input is refused |
| A pipe or a device in place of a file makes the tool hang | The type is looked at before the file is opened and again on the open file, and anything that is not a regular file is refused |
| A file or a cache name rewrites the terminal through escape sequences, or reorders text with direction characters | Control characters (C0 and C1), line and paragraph separators and Unicode direction controls are replaced by a space before any text reaches a report or an error message, and the length is capped |
| A name breaks the Markdown table in the job summary, or hides text as an HTML tag | Pipes, backslashes, line breaks, `<`, `>` and `&` are escaped in every table cell |
| A CSV report runs a formula when opened in a spreadsheet | Cells that start with `=`, `+`, `-`, `@`, a tab or a carriage return get a leading `'`; every cell is quoted as RFC 4180 says |
| The message of the JSON parser quotes the manifest into the report | The text of that message is never used. The line of the first mistake is found by the tool's own reader |
| The order or the result differs between systems | File names are matched by letter case exactly and compared by code unit, never by locale, and shown with forward slashes on every system |
| A key such as `__proto__` in the manifest changes how objects behave | The members are read with own-property checks, and no object is built from a name in the input that is later used for lookup |
| The JavaScript of the app is run by the check | It is not. It is read as tokens, and the tool has no code that evaluates, imports or loads it. A test checks that the source of the tool names no such call |

## What the tool does not defend against

The person who runs the tool is trusted: the paths they give are read. A report written to a shared place is as sensitive as its names: file names, cache names and addresses of the app can be confidential even though the content of the files is not printed.
