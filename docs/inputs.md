# Inputs

The tool takes one path: the folder of a built web app, or the HTML file of its page. It reads that page, and the files that the page, the manifest and the worker name inside the same folder, and nothing else. It follows no address to another origin, opens no file that is outside the folder, and starts no browser.

## The page

- **A folder** is read from its `index.html`, and the folder is the root of the site. An address that starts with a slash is read from there.
- **An HTML file** is the page. Its own folder is the root of the site, unless `--root <folder>` names a folder above it: for `app/page.html` with `--root .`, the root is the current folder and `/manifest.webmanifest` is `manifest.webmanifest` there. A page that is outside the `--root` folder is refused.
- Only that one page is read. The MDN page on installability says that every page of an app must link the manifest, and the tool checks the page it was given. Run it once for each kind of page.
- **Encoding.** The text is read as UTF-8. A byte order mark at the start of a file is ignored. Line ends can be LF, CRLF or CR.
- **Size.** A page over 2 MB is refused from the size of the open file, before it is read, with exit code 2.

## What is read from the page

- The `<link>` elements whose `rel` holds `manifest` (the first one is read, and a note says when there are more), and the `<meta>` elements named `viewport` and `theme-color`.
- The scripts: every inline `<script>` and every `<script src>` whose address is a path in the folder. Scripts of the types `module`, `text/javascript`, `application/javascript` and the other plain JavaScript types are read; a script of another type (for example `application/ld+json`) is not. At most 20 scripts are read.
- A script from another address is counted in a note and not fetched. A script that is named and not in the folder is counted too.

## The manifest

The file that the first manifest link names, up to 1 MB. It is read as JSON, and the members are looked at as the saved specification processes them. The addresses in it are worked out from the address of the manifest ([method.md](method.md), "How an address is worked out"). The icon files are looked at, and for a `.png` the width and height of its header are read.

## The service workers

Every address that a page script passes to `navigator.serviceWorker.register()` as a string (or as a name of a constant string) is a worker. At most three workers are read, each up to 2 MB. A file that a worker passes to `importScripts()` as a string, and that is in the folder, is read as part of the worker, up to 10 files in all. The files that a worker caches with `addAll()` are looked up in the folder and not read, except for the first bytes of a `.png` icon.

## Limits

| What | Limit |
| --- | --- |
| The page | 2 MB |
| The manifest | 1 MB |
| A script or a worker file | 2 MB each |
| All files read together | 20 MB |
| Scripts of the page | 20 |
| Workers | 3 |
| Files imported by a worker | 10 |
| Icons looked at | 100 |
| Files in a precache list | 5,000 |
| Tokens of one script | 1,000,000 |
| Tags in the page | 200,000 |

A file over its limit is reported as `file-not-read`, and a file with more tokens or tags than the limit is cut and reported as `limit-reached`. A limit is never a quiet skip.

## What is not read

- Any address on another origin: the manifest, a script, a worker, an icon, a cached file.
- A module that a script imports (`import "./x.js"`): the tool reads the scripts that the page names, not the files that they load.
- The HTTP headers of the server. A rule that lives in a header (`Service-Worker-Allowed`, a Content-Security-Policy, a cache rule for the worker file) is not seen.
- Anything that a script computes when it runs, and the files that a build adds after the check.
- The content of an image, apart from the size in the header of a PNG file.
