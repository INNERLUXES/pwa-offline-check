# Changes

## 1.0.0

First release.

- Reads a built web app folder (the page, the web app manifest it links, the scripts it names and the service worker that a script registers) and reports what stops a Progressive Web App from installing, working offline or updating safely. Never fetches anything, never runs a script, never starts a browser.
- Page: `manifest-link-missing`, `viewport-missing`, `theme-color-missing`, `insecure-url`.
- Manifest, by the saved W3C Web Application Manifest specification, the MDN pages for each member and the install criteria of web.dev and MDN: `manifest-file-missing`, `manifest-invalid-json`, `name-missing`, `start-url-missing`, `start-url-not-found`, `display-missing`, `display-not-installable`, `prefer-related-applications`, `icons-missing`, `icons-missing-install-sizes`, `icon-file-missing`, `icon-sizes-missing`, `icon-size-mismatch`, `icon-purpose-ignored`, `icon-type-missing`, `maskable-icon-missing`, `id-missing`, `id-ignored`, `scope-excludes-start-url`, `scope-no-trailing-slash`, `scope-missing`.
- Service worker, by the saved W3C Service Workers specification and the MDN pages: `sw-register-missing`, `sw-register-dynamic`, `sw-script-missing`, `sw-import-missing`, `sw-scope-too-wide`, `sw-scope-misses-page`, `sw-scope-misses-start-url`, `sw-no-fetch-handler`, `sw-fetch-no-respondwith`, `precache-file-missing`, `worker-dynamic`, `sw-cache-unversioned`, `sw-old-caches-kept`, `sw-skip-waiting`, `sw-clients-claim`, `sw-cache-non-get`, `sw-cache-opaque`, `sw-no-offline-fallback`.
- Workbox: the documented precache calls are recognized and a literal precache list is checked against the folder (`workbox-precache-read`); everything else that Workbox does is not read (`workbox-not-read`).
- Nothing is skipped silently: a file that could not be read, a script or manifest at another address, and a file cut by a limit are findings (`file-not-read`, `remote-not-read`, `unterminated-token`, `limit-reached`).
- Every finding has an id, a severity (error, warning, info), the file and line, what it is about, a message, a fix and the sentences of the source it rests on, with the address of the page. The specification's optional members and the install criteria are kept apart, and a conclusion that no source states is worded as the tool's own.
- The pages of the sources are saved in `research/sources`; a test compares every quoted sentence, display mode, icon purpose, icon size and Workbox call with the saved text.
- A tokenizer for JavaScript (comments, strings, template literals, regular expressions), a reader for HTML and a reader for the line of a JSON mistake; no pattern runs on the raw text, and the time is linear in the size of the input.
- Safe input: addresses are worked out as a browser works them out and looked up under the site root; a path that climbs above it or a link that leads out of it is refused; file names are matched by letter case; files over their size limit are refused; token, tag, call, file and script counts are bounded; control characters are removed from every text shown.
- Reports as text, Markdown, JSON and CSV; `--root` for a page in a subfolder; `--fail-on` for a pipeline gate; info never fails the run; exit code `2` for a usage or input error.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation.
