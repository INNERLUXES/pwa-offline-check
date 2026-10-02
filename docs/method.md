# Method

The tool answers one question about a built web app: what stops it from installing, from working offline, or from updating safely? It reads the page, the web app manifest that the page links, the scripts that the page names and the service worker that a script registers, as text. It never runs a script, never fetches an address and never opens a browser. Each thing it finds becomes a finding with a file and a line, a severity, a message, a fix and the sentences of the official source that the finding rests on.

A static reading cannot see what a browser sees. It does not see the HTTP headers that the server sends, the files that a build step adds after the check, a worker that is built when the page runs, or what a browser does on a particular device. Every check below therefore says what it can see and what it cannot, and where the tool draws a conclusion that no source states, the message says that the conclusion is its own.

## Where the requirements come from

Two kinds of source are used, and they are not the same thing.

- The **W3C specifications** (the Web Application Manifest and Service Workers) say how a browser processes a manifest and a worker. The manifest specification lists every member as optional: "A manifest can have any of the following members at its root, all of which are optional." Nothing in it says that a manifest without `name` is an error.
- The **install criteria** say what a browser needs before it offers to install the app. They come from the saved web.dev page for Chrome ("In Chrome, your Progressive Web App must meet the following criteria before it will fire the beforeinstallprompt event and show the in-browser install promotion") and from the MDN page "Making PWAs installable", which says that Chromium-based browsers require the same members. So a finding such as `name-missing` says that the criteria name `name`, and says that the specification does not require it. Other browsers have their own rules, which are not saved here, so they are not checked.

MDN is used for the members, the service worker lifecycle and the cache. The Workbox page is used only to recognize the calls that it documents.

## Severities

- **error**: the app cannot be installed or cannot start as written, or a file that the app needs is not there, or a file could not be read to the end. A missing manifest link, a manifest that is not JSON, a missing `name`, `start_url`, `display` or `icons`, a file of the precache list that does not exist, an address served over http, a registered worker that is not in the folder.
- **warning**: the app installs or runs, but offline use or an update is likely to fail or to leave old files behind. A scope that does not hold the page, no fetch handler, a cache with no version and no cleanup, a fetch handler with no fallback for a failed request, no viewport.
- **info**: something worth knowing that is not a gap by itself: a missing `id`, a missing maskable icon, `skipWaiting()` and `clients.claim()`, a worker that is not read because it is built when it runs.

By default only errors fail the run. `--fail-on warning` fails on warnings too. Info never fails the run.

## How an address is worked out

An address written in a file is read the way a browser reads it, and then looked up under the site root, which is the folder that the tool was given (or `--root`).

- A **relative** address is worked out from the folder of the file that holds it. For the manifest link and for `register()` that file is the page, and for a manifest member (`start_url`, `scope`, an icon `src`) it is the manifest. For a file that a worker caches or imports it is the folder of the worker, because the saved MDN page says "The URLs are relative to the worker's location."
- An address that starts with a **slash** is worked out from the root. `/sw.js` is `sw.js` in the root folder.
- The query and the fragment are dropped: `sw.js?v=3#x` is the file `sw.js`.
- An address that climbs above the root (`../../x.js`) is refused and reported, not clamped to the root. A backslash is read as a slash, as a browser reads it in a URL.
- A name is matched by **letter case exactly**, on every system. A file `Icon.PNG` does not answer `icon.png`, because a server that runs on Linux does not answer it either. The finding names the file that has the other letters.
- A symbolic link is followed only when its target is inside the root.
- An address of another origin (`https://cdn.example/x.js`) is not fetched. It is counted in a note, or reported as `remote-not-read` when it is the manifest or an imported script. An absolute address of the site's own origin (the origin written in `start_url`, `scope` or `id`) is read as a path of the site.
- `http:` addresses are looked at for `insecure-url`: `localhost`, `*.localhost`, `127.x.x.x` and `[::1]` are allowed, as the secure context text allows them.

A `<base>` element is not followed; the report has a note when the page has one.

## Reading JavaScript

A page script and a worker are read by a tokenizer that skips comments and reads strings, template literals and regular expression literals as single tokens, so a call that is written inside a comment or a string is not seen as a call. It reads each character once and uses no pattern on the raw text, so the time is linear in the size of the file. Nothing is evaluated.

Then a small set of patterns is looked for in the tokens:

- `navigator.serviceWorker.register(url, { scope })`, with the address and the scope as string literals, or the address as a name of a `const` string in the same script;
- `addEventListener("fetch" | "install" | "activate", ...)` and `self.onfetch = ...` and the other two on-properties;
- `.respondWith(`, `.skipWaiting(`, `clients.claim(`, `importScripts(`, `caches.open(`, `caches.keys(`, `caches.delete(`, `.addAll(`, `.add(` on a receiver whose name holds "cache", `.put(`, `.match(`;
- the property `.method` and the string `"GET"`, `"no-cors"` and `"opaque"`, and the properties `.ok` and `.status`;
- a `catch` block or a `.catch(` whose body calls `.match(` or `new Response(`;
- the Workbox calls of the saved page: `precacheAndRoute`, `addRoute`, `precache`, `cleanupOutdatedCaches`, `PrecacheFallbackPlugin`, `setCatchHandler`.

The list of an `addAll()` is read when it is an array literal of strings, or a name of a `const` array of strings in the same file. A list that is built when the worker runs is reported as `worker-dynamic`, and the files in it are not checked. `docs/limits.md` lists what this cannot see.

## The checks

Each check gives the rule, the sentences of the sources that it rests on (the sentences themselves are in [rules-and-sources.md](rules-and-sources.md)), and what the tool cannot see.

### The page

#### `manifest-link-missing` (error)

The page has no `<link>` element whose `rel` holds the word `manifest` (any letter case, among other words). Rests on: "For a web app to be a PWA it must be installable, and for it to be installable it must include a manifest.", "The manifest is included using a <link> element in the app's HTML:" and the link relation registration. Only the page that was given is read; the MDN page says every page of the app must link the manifest. Cannot see: a link that a script adds when the page runs.

#### `viewport-missing` (warning)

No `<meta name="viewport">`. Rests on the MDN page on the viewport: "The viewport <meta> element mitigates this problem of virtual viewport on narrow screen devices." The conclusion that a page without it looks like a small desktop page on a phone is that page's own explanation of the virtual viewport. The content of the element is not judged.

#### `theme-color-missing` (info)

Neither `<meta name="theme-color">` nor the manifest member `theme_color`. Rests on the MDN page on meta names and on the specification's text on `theme_color`. It is a hint, not a requirement.

#### `insecure-url` (error)

An address in the manifest (`start_url`, `scope`, an icon `src`), the manifest link, a `register()` address or an `importScripts()` address that starts with `http:` and is not a loopback address. Rests on the Service Workers specification ("Service workers must execute in secure contexts."), on its note that this means HTTPS, on the MDN statement that a PWA must be served over https or from localhost, and on the web.dev criterion "Be served over HTTPS." Cannot see: the address that the app is really served from. A page that is served over http is not seen, because the tool does not know the address of the page.

### The manifest

#### `manifest-file-missing` (error)

The manifest link names a file that is not in the folder (or exists with other letters). The app cannot be installed without it.

#### `manifest-invalid-json` (error)

The file is not valid JSON, or is JSON that is not an object. Rests on the processing rule: "If the json is a parsing exception, or json is not an ordered map: Set json to an empty ordered map." A browser then ignores every member. The line is the line of the first mistake, found by the tool's own reader; the message of the JSON parser is not shown, because it can quote the file.

#### `name-missing` (error)

Neither `name` nor `short_name` is a non-empty string. Rests on the install criteria ("short_name or name"). The specification lists the member as optional, and the message says so. A value that is not a string is treated as absent, as the specification's text member processing does.

#### `start-url-missing` (error)

`start_url` is absent, empty, not a string, or not a valid URL. Rests on the install criteria, on the MDN statement that on some browsers it must be specified for a PWA to be installable, and on the specification's default ("Set manifest["start_url"] to document URL."), which is why the app would start at the page that links the manifest.

#### `start-url-not-found` (warning)

`start_url` names a file or a folder (with an `index.html`) that is not in the folder. The conclusion that the app would start on an error page is the tool's own. Cannot see: a server that rewrites the address to a page it builds, as a single-page app host does.

#### `display-missing` (error) and `display-not-installable` (error)

`display` is absent (and no `display_override` has an accepted mode), or it is a value that is not one of `fullscreen`, `standalone`, `minimal-ui` or `window-controls-overlay`. Rests on the criterion "display - must be one of fullscreen, standalone, minimal-ui, or window-controls-overlay" and on the specification: "When the display member is missing, or if there is no valid display member, the user agent uses the browser display mode as the applied display mode." A `display_override` that holds an accepted mode satisfies the check, as the MDN list "display and/or display_override" says. `browser` is a valid value for the specification and fails the install criteria.

#### `prefer-related-applications` (error)

`prefer_related_applications` is `true`. Rests on the criterion "prefer_related_applications must not be present, or be false".

#### `icons-missing` (error)

`icons` is absent, empty, not a list, or no entry has a `src`. Rests on the criterion that the icons must include a 192px and a 512px icon, and on the MDN statement that `src` is the only property that an icon needs.

#### `icons-missing-install-sizes` (error)

No icon declares exactly `192x192`, or none declares exactly `512x512`. Rests on "icons - must include a 192px and a 512px icon". An icon whose `sizes` is `any` is not counted, and the tool does not report an error for it: it notes that it cannot tell whether the browser counts that icon for the criteria, because the saved pages do not say so.

#### `icon-file-missing` (error)

The `src` of an icon names a file that is not in the folder. Rests on the MDN text on `src`. The conclusion that the browser cannot use an icon it cannot fetch is the tool's own.

#### `icon-sizes-missing` (warning)

An icon has no `sizes`. Rests on "If sizes is not specified, the selection and display of the icon may vary depending on the browser's implementation."

#### `icon-size-mismatch` (warning)

A `.png` icon declares sizes, and the width and height in the header of the PNG file are none of them. Rests on "For raster formats like PNG, specifying the exact available sizes is recommended." Only the first bytes of the file are read, to take the two numbers of the header chunk; the image is not decoded. Other formats are not looked at. A `.png` file that does not start like a PNG gets a note.

#### `icon-purpose-ignored` (warning)

The `purpose` of an icon holds no keyword that the specification defines (`monochrome`, `maskable`, `any`; they are case-sensitive). Rests on "If none of the stated purposes are recognized, the icon is totally ignored."

#### `icon-type-missing` (info)

An icon has no `type`. Rests on the MDN text that browsers then infer the type from the file extension, and that the property can improve performance.

#### `maskable-icon-missing` (info)

No icon has the purpose `maskable`. Rests on the specification's definition of a maskable icon. It is a hint: a launcher may crop an icon that is not maskable.

#### `id-missing` (info)

No `id`. Rests on the specification ("Set manifest["id"] to manifest["start_url"].") and on the statement that a manifest whose identity does not match an installed app is treated as a distinct application. The consequence that a later change of `start_url` makes the browser see another app is the tool's own reading of those two sentences.

#### `id-ignored` (warning)

`id` is not a valid URL or is not of the same origin as `start_url`, so it is ignored. Rests on "If id is not same origin as manifest["start_url"], return."

#### `scope-excludes-start-url` (warning)

`scope` is present, and `start_url` is not within it (or `scope` is not a valid URL). The rule of the specification is used: the same origin, and the path of the target starts with the path of the scope. Rests on "If manifest["start_url"] is not within scope of scope, return.", so the scope is dropped and the default scope is used.

#### `scope-no-trailing-slash` (info)

`scope` does not end with a slash. Rests on "For this reason, it's recommended to define a scope ending with a /."

#### `scope-missing` (info)

No `scope`, and the folder of `start_url` is not the root. Rests on the specification: "To be safe, explicitly specify scope."

### The service worker

#### `sw-register-missing` (warning)

No `navigator.serviceWorker.register` call in the page or in the scripts that it names. A manifest does not need a worker for the install criteria (the MDN page says so), so this is not an install blocker. It is a warning because without a worker the app has nothing to show offline. Cannot see: a registration in a script that the page does not name (an imported module, a bundle that another script loads), or one written another way.

#### `sw-register-dynamic` (info)

The address passed to `register()` is worked out when the script runs. The worker is not read.

#### `sw-script-missing` (error)

The registered worker is not in the folder, or is on another origin, or climbs above the root. Rests on the MDN list of reasons that a registration fails: "The path of the service worker file is incorrect." and "The path to your service worker points to a service worker of a different origin to your app."

#### `sw-import-missing` (error)

`importScripts()` names a file of the folder that is not there. The conclusion that the worker then fails to start is the tool's own. A file that is there is read as part of the worker.

#### `sw-scope-too-wide` (warning)

`register()` asks for a scope above the folder of the worker. Rests on the specification's path restriction (a worker at `/~bob/sw.js` can be registered for `/~bob/` "but not for the scope https://www.example.com/") and on the MDN text that without a `Service-Worker-Allowed` header the registration fails. Cannot see the header, so the message says the registration fails unless the server sends it.

#### `sw-scope-misses-page` (warning)

The effective scope (the `scope` option, or the folder of the worker) does not hold the page that registers it, so the worker never controls that page. Rests on "The default scope for a service worker is the directory where the worker is located."

#### `sw-scope-misses-start-url` (warning)

The scope holds the page but not the `start_url` of the manifest, so the installed app starts on a page that the worker does not control. The consequence for offline use is the tool's own.

#### `sw-no-fetch-handler` (warning)

No `fetch` listener (and no Workbox route). Rests on the MDN text that a fetch event fires for every resource the worker controls and that the worker answers with `respondWith()`. Caching files in the install handler does not serve them by itself.

#### `sw-fetch-no-respondwith` (warning)

A `fetch` listener exists and nothing calls `respondWith()`, so every request goes to the network.

#### `precache-file-missing` (error)

A file in a list passed to `addAll()` (or `cache.add()`, or a Workbox precache list) is not in the folder. Rests on the specification: a response that is not an ok status makes `addAll()` reject, and "If any of the promises rejects, the installation fails." The conclusion that a missing file is a 404 is the tool's own. An address without a file extension is not checked and is counted in a note, because a server can answer it with a page it builds.

#### `worker-dynamic` (info)

An `addAll()` list, or an `importScripts()` address, that is not written as strings in the worker. What is written out is checked, and the report says that the rest was not.

#### `sw-cache-unversioned` (warning)

`caches.open()` with a name that has no digit and no "version" in it, and no activate handler that deletes caches (a `caches.delete()` call, or `caches.keys()` with a `.delete()`), and no Workbox cleanup. Rests on the MDN text on versioned caches ("We are calling the new cache v2, so the previous v1 cache isn't disturbed."), on cleaning up in `activate` ("You can use the activate event to remove data from the previous caches.") and on "The contents of the cache are kept until you clear them." The rule that a digit makes a name versioned is the tool's own. A name that is built with a template literal, or a name that is not a literal, counts as versioned.

#### `sw-old-caches-kept` (info)

The cache names carry a version and nothing deletes the older caches, so each release leaves its cache behind.

#### `sw-skip-waiting` (info)

`skipWaiting()` is called. It lets a new version take over while pages of the old version are open. Rests on the specification and the MDN text on skipWaiting and on the waiting step. Whether the two versions can disagree is the tool's own reading.

#### `sw-clients-claim` (info)

`clients.claim()` is called. Rests on the MDN text that it makes the worker control pages that loaded without it, "or possibly via a different service worker."

#### `sw-cache-non-get` (warning)

The worker has a fetch handler and puts responses into a cache with `.put(`, and nothing in it looks at the request method (no `.method` property, no `"GET"` string). Rests on the specification: a put with a request whose method is not `GET` is rejected with a TypeError. Cannot see: a check that is written another way, in a file that is not read.

#### `sw-cache-opaque` (warning)

The worker makes a request with `mode: "no-cors"`, caches responses (`.put(` or `.addAll(`), and nothing looks at the response (no `"opaque"` string, no `.ok`, no `.status`). Rests on the MDN definition of an opaque response and on the cache pages: `addAll()` cannot store one, `put()` can.

#### `sw-no-offline-fallback` (warning)

The fetch handler answers requests and has no fallback for a failed one: no `catch` (or `.catch(`) that calls `.match(` or `new Response(`, and no `.match(` of a fixed string address. Rests on the MDN text: "The only trouble we have now is that if the request doesn't match anything in the cache, and the network is not available, our request will still fail." A fallback that is written another way is not seen. The tool does not check that the fallback page is cached.

### Workbox

#### `workbox-precache-read` (info) and `workbox-not-read` (info)

Workbox is recognized by an import of a `workbox-*` module, by a call of one of the documented functions, or by the `workbox` global. For the documented calls the tool reads what the saved Workbox page says: `precacheAndRoute()` and `addRoute()` add a route for fetch, the precache list (an array of objects with `url` and `revision`) is cached when the worker installs, and on activation the assets that are no longer in the list are removed. The files of a literal list are checked like any other precache list. Everything else that Workbox does is not read, so for a worker that uses Workbox the tool does not apply the checks of the fetch handler, the cache names and the fallback, and says so in `workbox-not-read`. A list that is not written in the file (for example the list that a build step injects) is reported and not read.

### About the files themselves

#### `remote-not-read` (info)

The manifest or an imported script is at another address. Nothing is fetched.

#### `file-not-read` (error)

A file that a page, a manifest or a worker names was not read: it is outside the folder (a link or a `..` leads out), it is not a regular file, it is over the size limit, or the total size of the files read has reached the limit. It is never skipped quietly.

#### `unterminated-token` (error)

A comment, a string, a template literal, a script element or a quoted attribute is never closed. Nothing after it in that file was read.

#### `limit-reached` (error)

A file has more tokens or tags than the limit, or a worker has more calls of one kind than the limit, or a precache list is too long. The rest was not checked.
