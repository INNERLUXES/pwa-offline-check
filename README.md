# pwa-offline-check

Reads a built web app folder and reports what stops a Progressive Web App from installing, working offline or updating safely. You give it the folder (or the HTML file of its page). It reads the page, the web app manifest that the page links, the scripts that the page names and the service worker that a script registers, and names, for every problem, the file and the line, the severity, a sentence on how to fix it, and the sentence of the official source that the finding rests on, with the address of the page.

A PWA fails in quiet ways. A manifest without a 512px icon is never offered for install, and nothing in the build says so. A service worker that caches a file which is not in the folder fails its install, and the app has no offline copy. A worker registered from `/js/sw.js` with the scope `/` is refused by the browser. A cache named `app-cache` with no cleanup keeps every old copy. A fetch handler that has no answer for a failed request shows the browser's error page the first time the train goes into a tunnel. All of these are visible in the files, before the app reaches a browser. This tool reads them in a second, so the check can run on every pull request that touches the build.

- Every finding has an id, a severity (error, warning or info), the file and the line, what it is about, a plain message, a fix and the quoted sentences of the source with the page address.
- The quotes are quotes. The pages of the W3C Web Application Manifest and Service Workers specifications, of MDN, of web.dev and of the Workbox documentation are saved in [research/sources](research/sources), and a test compares every quoted sentence in [src/data.js](src/data.js) with the saved text. The specifications list every manifest member as optional; the install requirements come from the install criteria pages, and a finding says which one it rests on. Where a finding draws a conclusion that no source states, the message says that it is the tool's own.
- Nothing is skipped without a word. A file that could not be read, a script from another address, a list of files that is built when the worker runs, a worker that uses Workbox and a file cut by a limit are findings or notes, never a pass.
- It reads files only. It never fetches an address, never runs a script, never starts a browser and opens no connection. An address that climbs out of the folder, or a link that leads out of it, is refused.
- A careful tokenizer reads the JavaScript: it skips comments and reads strings, template literals and regular expressions as single tokens, so a call that sits in a comment or a string is not a call. The checks are patterns on the tokens. The time is linear in the size of the input.
- It does not repeat its neighbours: it does not read native mobile app manifests or HTTP headers, see [Related](#related).
- Reports as text, Markdown, JSON and CSV, with an exit code for a pipeline gate. Info findings never fail the run.
- Plain JavaScript, no dependencies; the same files always give the same report.

```
npm test
```

```
ℹ tests 182
ℹ pass 181
ℹ fail 0
ℹ skipped 1
```

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/pwa-offline-check.git
cd pwa-offline-check
node bin/pwa-offline-check.js examples/recipe-box
```

Or without a clone, on the folder that your build writes:

```
npx --yes github:INNERLUXES/pwa-offline-check dist
```

`examples/` holds a made-up recipe box app. `examples/recipe-box` is a small PWA with several problems, wrong on purpose: no viewport, a manifest whose `display` is `browser`, a scope that leaves out the start page, an icon file that does not exist, an icon on an http address, a worker that is registered from `/js/` with the scope `/`, that caches files which are not there, that has an unversioned cache and no fallback, and that puts every response into the cache. `examples/recipe-box-fixed` is the same app done properly, and passes the strictest gate.

## Usage

```
node bin/pwa-offline-check.js examples/recipe-box
```

```
pwa-offline-check: index.html
read: 4 files (the page, the manifest, 1 script, 1 worker)
findings: 5 error, 7 warning, 5 info

WARNING  viewport-missing  index.html:1
         about: meta viewport
         The page has no <meta name="viewport">. On a narrow screen the browser lays the page out in a wider virtual viewport and shrinks it, so a responsive app looks like a small desktop page.
         fix: Add <meta name="viewport" content="width=device-width, initial-scale=1"> to the <head>.
         source (<meta name="viewport"> HTML attribute value, Viewport width and screen width): "The viewport <meta> element mitigates this problem of virtual viewport on narrow screen devices."
           https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Viewport_meta_element
         source (<meta name="viewport"> HTML attribute value, Viewport width and screen width): "The recommended setting is the following, which sets the viewport to match the device's width:"
           https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Viewport_meta_element

INFO     theme-color-missing  index.html:1
         about: theme-color
         Neither the page (<meta name="theme-color">) nor the manifest (theme_color) sets a theme color, so the browser draws its own frame around the app.
         fix: Add <meta name="theme-color" content="#..."> and "theme_color" in the manifest.
         source (<meta name> HTML attribute, Meta names defined in the HTML specification): "Indicates a suggested color that user agents should use to customize the display of the page or of the surrounding user interface."
           https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name
         source (Web Application Manifest, 1.12 theme_color member): "The manifest's theme_color member is a themeable member that serves as the default theme color for an application context."
           https://www.w3.org/TR/appmanifest/

INFO     id-missing  manifest.webmanifest:1
         about: id
         The manifest has no id, so the identity of the app is its start_url. If start_url changes later, the browser sees a different app and the installed one is not updated.
         fix: Add "id", for example "/" or "/recipes/", and keep it as it is for the life of the app.
         source (Web Application Manifest, 1.11 id member): "Set manifest["id"] to manifest["start_url"]."
           https://www.w3.org/TR/appmanifest/
         source (Web Application Manifest, 1.11 id member): "When the user agent sees a manifest with an identity that does not correspond to an already-installed application, it SHOULD treat that manifest as a description of a distinct application, even if it is served from the same URL as that of another application."
           https://www.w3.org/TR/appmanifest/
         source (id, Description): "When a browser comes across an app manifest with an id that does not correspond to an already installed application, it treats that manifest as a description of a distinct application, even if it is served from the same URL as another application."
           https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id

WARNING  scope-excludes-start-url  manifest.webmanifest:4
         about: scope
         start_url (/index.html) is not within scope (/recipes/), so the scope is ignored and the browser uses the folder of start_url instead.
         fix: Make scope a path that start_url begins with, for example the folder of start_url.
         source (Web Application Manifest, 1.6 scope member): "If manifest["start_url"] is not within scope of scope, return."
           https://www.w3.org/TR/appmanifest/
         source (Web Application Manifest, 5. Navigation scope): "Return a boolean indicating whether targetPath starts with scopePath."
           https://www.w3.org/TR/appmanifest/
         source (scope, Values): "If scope is not specified in the manifest or the value is invalid (i.e., not a string, not a valid URL, or start_url is not within the specified scope), the effective scope will be set to the start_url value after removing its filename, query, and fragment."
           https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/scope

ERROR    display-not-installable  manifest.webmanifest:5
         about: display
         The display mode is "browser", which is not one of fullscreen, standalone, minimal-ui or window-controls-overlay, the modes that the install criteria accept.
         fix: Set "display" to "standalone" (or "minimal-ui", "fullscreen").
         source (What does it take to be installable?, Install criteria): "In Chrome, your Progressive Web App must meet the following criteria before it will fire the beforeinstallprompt event and show the in-browser install promotion:"
           https://web.dev/articles/install-criteria
         source (What does it take to be installable?, Install criteria): "display - must be one of fullscreen, standalone, minimal-ui, or window-controls-overlay"
           https://web.dev/articles/install-criteria

INFO     maskable-icon-missing  manifest.webmanifest:7
         about: icons
         No icon has the purpose "maskable". An icon without it can be cropped or shown on a plain background by the system, and the specification says an icon is only to be used for its stated purpose.
         fix: Add a 512x512 icon with "purpose": "maskable", with the artwork inside the safe zone.
         source (Web Application Manifest, 2.1 purpose member): "The image is designed with icon masks and safe zone in mind, such that any part of the image that is outside the safe zone can safely be ignored and masked away by the user agent."
           https://www.w3.org/TR/appmanifest/

ERROR    icon-file-missing  manifest.webmanifest:13
         about: icons[1]
         The icon icons/icon-256.svg names /icons/icon-256.svg, and no such file is in the folder. A browser cannot use an icon that it cannot fetch (this conclusion is the tool's own).
         fix: Add the image at that path, or correct src.
         source (icons, Values): "Each icon object can have one or more properties. Of these, only src is required."
           https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons

WARNING  icon-sizes-missing  manifest.webmanifest:13
         about: icons[1]
         The icon icons/icon-256.svg has no sizes, so the browser cannot choose it by size.
         fix: Add "sizes", for example "192x192", the exact size of the image.
         source (icons, Values): "If sizes is not specified, the selection and display of the icon may vary depending on the browser's implementation."
           https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons

INFO     icon-type-missing  manifest.webmanifest:13
         about: icons[1]
         The icon icons/icon-256.svg has no type, so the browser infers the image type from the file extension.
         fix: Add "type", for example "image/png".
         source (icons, Values): "If omitted, browsers typically infer the image type from the file extension."
           https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons
         source (icons, Performance considerations): "Specifying the type property can significantly improve performance because it allows browsers to ignore images with unsupported formats more easily."
           https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons

ERROR    insecure-url  manifest.webmanifest:16
         about: icons[2].src
         The manifest member icons[2].src is http://recipebox.example/icons/icon-512.svg, an address that is served over http. A service worker needs a secure context, and the install criteria name HTTPS, so the app cannot be installed or work offline from there.
         fix: Serve the app and every address it names over https. http is allowed only for localhost and the loopback addresses, for development.
         source (Service Workers Nightly, 6.1. Secure Context): "Service workers must execute in secure contexts."
           https://www.w3.org/TR/service-workers/
         source (Service Workers Nightly, 6.1. Secure Context): "This effectively means that service workers and their service worker clients need to be hosted over HTTPS."
           https://www.w3.org/TR/service-workers/
         source (Making PWAs installable, HTTPS, localhost, or loopback are required): "For a PWA to be installable it must be served using the https protocol, or from a local development environment using localhost or 127.0.0.1 — with or without a port number."
           https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable
         source (What does it take to be installable?, Install criteria): "Be served over HTTPS."
           https://web.dev/articles/install-criteria
         source (Service Workers Nightly, 6.1. Secure Context): "A user agent can allow localhost (see the requirements), 127.0.0.0/8, and ::1/128 for development purposes."
           https://www.w3.org/TR/service-workers/

WARNING  sw-scope-too-wide  js/app.js:12
         about: /
         register() asks for the scope /, but the worker is at /js/sw.js, so the widest scope it can have is /js/. The registration fails unless the server sends a Service-Worker-Allowed header for the worker file; the tool does not see headers.
         fix: Move the worker to /, or narrow the scope, or send Service-Worker-Allowed with the worker.
         source (Service Workers Nightly, 6.5. Path restriction): "a service worker script at https://www.example.com/~bob/sw.js can be registered for the scope url https://www.example.com/~bob/ but not for the scope https://www.example.com/ or https://www.example.com/~alice/."
           https://www.w3.org/TR/service-workers/
         source (Service Workers Nightly, 6.5. Path restriction): "Servers can remove the path restriction by setting a Service-Worker-Allowed header on the service worker script."
           https://www.w3.org/TR/service-workers/
         source (Using Service Workers, Why is my service worker failing to register?): "The service worker registration contains a scope option broader than permitted by the worker path."
           https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
         source (Service-Worker-Allowed header, Using Service-Worker-Allowed to broaden service worker scope): "If the server doesn't set the header, the service worker registration will fail, as the scope option ({ scope: "/" }) requests a scope broader than the directory where the service worker script is located (/product/sw.js)."
           https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Service-Worker-Allowed

ERROR    precache-file-missing  js/sw.js:2
         about: /img/logo.png
         The worker caches /img/logo.png, and no such file is in the folder. The list is relative to the worker file, and the install fails if one file in it cannot be fetched, so the app gets no offline copy (this conclusion about the file is the tool's own).
         fix: Remove the file from the list, or add the file, or correct the path.
         source (Service Workers Nightly, 5.4.4. addAll(requests)): "If response’s type is "error", or response’s status is not an ok status or is 206, reject responsePromise with a TypeError."
           https://www.w3.org/TR/service-workers/
         source (Service Workers Nightly, 4.4.1. event.waitUntil(f)): "If any of the promises rejects, the installation fails."
           https://www.w3.org/TR/service-workers/
         source (Using Service Workers, Install and activate: populating your cache): "If the promise is rejected, the installation fails, and the worker won't do anything."
           https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
         source (Using Service Workers, Install and activate: populating your cache): "The URLs are relative to the worker's location."
           https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers

ERROR    precache-file-missing  js/sw.js:2
         about: /offline.html
         The worker caches /offline.html, and no such file is in the folder. The list is relative to the worker file, and the install fails if one file in it cannot be fetched, so the app gets no offline copy (this conclusion about the file is the tool's own).
         fix: Remove the file from the list, or add the file, or correct the path.
         source (Service Workers Nightly, 5.4.4. addAll(requests)): "If response’s type is "error", or response’s status is not an ok status or is 206, reject responsePromise with a TypeError."
           https://www.w3.org/TR/service-workers/
         source (Service Workers Nightly, 4.4.1. event.waitUntil(f)): "If any of the promises rejects, the installation fails."
           https://www.w3.org/TR/service-workers/
         source (Using Service Workers, Install and activate: populating your cache): "If the promise is rejected, the installation fails, and the worker won't do anything."
           https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
         source (Using Service Workers, Install and activate: populating your cache): "The URLs are relative to the worker's location."
           https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers

INFO     sw-skip-waiting  js/sw.js:5
         about: skipWaiting
         The worker calls skipWaiting(), so a new version takes over at once, while pages that the old version controls are still open. Those pages and the new worker can disagree about the files and the cache (this conclusion is the tool's own).
         fix: Keep it only if the new worker works with the pages of the old version, or ask the user to reload.
         source (Service Workers Nightly, 4.1.4. skipWaiting()): "The skipWaiting() method allows this service worker to progress from the registration’s waiting position to active even while service worker clients are using the registration."
           https://www.w3.org/TR/service-workers/
         source (ServiceWorkerGlobalScope: skipWaiting() method): "The skipWaiting() method of the ServiceWorkerGlobalScope interface forces the waiting service worker to become the active service worker."
           https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting
         source (Using Service Workers, Replacing an existing service worker): "When installation completes successfully, the new version waits while the old version is still controlling clients."
           https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers

WARNING  sw-cache-unversioned  js/sw.js:6
         about: recipe-box
         The cache is named "recipe-box", with no version in the name, and the worker has no activate handler that deletes old caches. When the files change, the old copies stay in the browser until something clears them (this conclusion is the tool's own).
         fix: Put a version in the cache name (for example "app-v2") and, in the activate handler, delete the caches whose names are not the current one.
         source (Using Service Workers, Install and activate: populating your cache): "The contents of the cache are kept until you clear them."
           https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
         source (Using Service Workers, Deleting old caches): "You can use the activate event to remove data from the previous caches."
           https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
         source (Using Service Workers, Updating your service worker): "We are calling the new cache v2, so the previous v1 cache isn't disturbed."
           https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
         source (Using Service Workers, Deleting old caches): "While there are open pages that are controlled by the previous version of the worker, you need to keep both caches, because the previous version needs its version of the cache."
           https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers

WARNING  sw-no-offline-fallback  js/sw.js:9
         about: fetch
         The fetch handler has no fallback for a request that cannot be answered: no catch that returns a cached page or a Response, and no cached offline page matched by a fixed address. When the network is gone and a page is not in the cache, the browser shows its own error page.
         fix: Cache an offline page when the worker installs, and return it from a catch (caches.match("/offline.html")) when a navigation fails.
         source (Using Service Workers, Recovering failed requests): "The only trouble we have now is that if the request doesn't match anything in the cache, and the network is not available, our request will still fail."
           https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers
         source (Using Service Workers, Recovering failed requests): "Let's provide a default fallback so that whatever happens, the user will at least get something:"
           https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers

WARNING  sw-cache-non-get  js/sw.js:14
         about: cache.put
         The worker puts responses into a cache and never looks at the request method. A cache accepts only GET requests, so a POST or another method makes put() fail with a TypeError (this conclusion about your code is the tool's own).
         fix: Cache only when event.request.method === "GET", and let other requests go to the network.
         source (Service Workers Nightly, 5.4.5. put(request, response)): "If innerRequest’s url’s scheme is not one of "http" and "https", or innerRequest’s method is not `GET`, return a promise rejected with a TypeError."
           https://www.w3.org/TR/service-workers/

GATE: FAIL - 5 errors
```

The exit code is `1`: a manifest that cannot be installed, a file that does not exist, an address over http and a precache list with files that are not there are errors, and errors fail the run by default. The seven warnings do not, unless you run with `--fail-on warning`. The paths are relative to the folder that is checked, with forward slashes on every system, and the lines are the lines of the file that holds the problem: the member of the manifest, the call in the worker.

The fixed app passes, also with `--fail-on warning`:

```
node bin/pwa-offline-check.js examples/recipe-box-fixed --fail-on warning
```

```
pwa-offline-check: index.html
read: 4 files (the page, the manifest, 1 script, 1 worker)
findings: 0 error, 0 warning, 1 info

INFO     sw-clients-claim  sw.js:14
         about: clients.claim
         The worker calls clients.claim(), so it controls pages that were loaded without it, or by another worker, as soon as it is active.
         fix: Keep it if that is what you want: without it, pages are controlled only after the next load.
         source (Clients: claim() method): "The claim() method of the Clients interface allows an active service worker to set itself as the controller for all clients within its scope."
           https://developer.mozilla.org/en-US/docs/Web/API/Clients/claim
         source (Clients: claim() method): "Be aware that this results in your service worker controlling pages that loaded regularly over the network, or possibly via a different service worker."
           https://developer.mozilla.org/en-US/docs/Web/API/Clients/claim
         source (Using Service Workers, Initial installation): "Existing documents will have to be reloaded to actually be controlled, because a document starts life with or without a service worker and maintains that for its lifetime."
           https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers

GATE: PASS (--fail-on warning)
```

The one info finding is `clients.claim()`: it is not a problem, it says what the call does so that a reader knows it is there. Info findings never fail the run.

Passing means that none of the checks found anything in the files. It does not mean that the app works in a browser: [docs/limits.md](docs/limits.md) lists what a static reading cannot show, and the app should still be opened in a browser and used offline before release.

```
pwa-offline-check <folder-or-html-file> [options]
```

```
--root <folder>     the root of the site, when the page is in a subfolder of it (default: the folder
                    of the page); an address that starts with a slash is read from here, and
                    nothing outside it is read
--format <name>     text, markdown, json or csv (default: text)
--fail-on <level>   exit with 1 when a finding is at this level or above: error or warning
                    (default: error); info never fails the run
--help              show the usage
--version           show the version
```

A folder is read from its `index.html`. Paths in the report are relative to the site root, with forward slashes on every system. Only the page that you give is read; run the tool once for each kind of page.

## The checks

| Id | Severity | What it reports |
| --- | --- | --- |
| `manifest-link-missing` | error | no `<link rel="manifest">` in the page |
| `manifest-file-missing` | error | the manifest link names a file that is not in the folder |
| `manifest-invalid-json` | error | the manifest is not JSON, or not a JSON object |
| `name-missing` | error | neither `name` nor `short_name` |
| `start-url-missing` | error | `start_url` is absent, empty or not a valid URL |
| `display-missing` | error | no `display` (and no usable `display_override`) |
| `display-not-installable` | error | `display` is not fullscreen, standalone, minimal-ui or window-controls-overlay |
| `prefer-related-applications` | error | `prefer_related_applications` is `true` |
| `icons-missing` | error | no icon with a `src` |
| `icons-missing-install-sizes` | error | no `192x192` icon, or no `512x512` icon |
| `icon-file-missing` | error | the `src` of an icon is not in the folder |
| `insecure-url` | error | an address of the app over `http` that is not a loopback address |
| `sw-script-missing` | error | the registered worker is not in the folder, or is on another origin |
| `sw-import-missing` | error | `importScripts()` names a file that is not in the folder |
| `precache-file-missing` | error | a file in an `addAll()` or a Workbox precache list is not in the folder |
| `file-not-read` | error | a file was outside the folder, not a regular file, over the size limit, or over the total |
| `unterminated-token` | error | a string, comment, template, script element or value that is never closed |
| `limit-reached` | error | a file is over the token, tag or call limit, so the rest was not checked |
| `start-url-not-found` | warning | `start_url` names a page that is not in the folder |
| `icon-sizes-missing` | warning | an icon with no `sizes` |
| `icon-size-mismatch` | warning | the size in the header of a PNG file is not one of the declared sizes |
| `icon-purpose-ignored` | warning | an icon `purpose` with no keyword the specification defines |
| `id-ignored` | warning | `id` is not a valid URL or is of another origin than `start_url` |
| `scope-excludes-start-url` | warning | `scope` does not hold `start_url` |
| `viewport-missing` | warning | no `<meta name="viewport">` |
| `sw-register-missing` | warning | no `navigator.serviceWorker.register` call in the page or its scripts |
| `sw-scope-too-wide` | warning | the scope is wider than the folder of the worker, so the registration fails without a `Service-Worker-Allowed` header |
| `sw-scope-misses-page` | warning | the page that registers the worker is outside its scope |
| `sw-scope-misses-start-url` | warning | `start_url` is outside the scope of the worker |
| `sw-no-fetch-handler` | warning | the worker has no `fetch` handler |
| `sw-fetch-no-respondwith` | warning | a `fetch` handler that never calls `respondWith()` |
| `sw-cache-unversioned` | warning | a cache name with no version, and nothing that deletes old caches |
| `sw-cache-non-get` | warning | `cache.put()` in a worker that never looks at the request method |
| `sw-cache-opaque` | warning | a `no-cors` request whose response is cached without a look at its type or status |
| `sw-no-offline-fallback` | warning | no answer for a request that fails |
| `maskable-icon-missing` | info | no icon with the purpose `maskable` |
| `icon-type-missing` | info | an icon with no `type` |
| `id-missing` | info | no `id`, so the identity of the app is its `start_url` |
| `scope-missing` | info | no `scope`, and `start_url` is in a folder |
| `scope-no-trailing-slash` | info | a `scope` that does not end with a slash |
| `theme-color-missing` | info | no theme color in the page or the manifest |
| `sw-skip-waiting` | info | `skipWaiting()` is called |
| `sw-clients-claim` | info | `clients.claim()` is called |
| `sw-old-caches-kept` | info | versioned cache names and nothing that deletes the older caches |
| `workbox-precache-read` | info | a Workbox precache call was read |
| `workbox-not-read` | info | the worker uses Workbox, and what Workbox does at run time is not read |
| `worker-dynamic` | info | a list of files or an imported script that is built when the worker runs |
| `sw-register-dynamic` | info | a registration whose address is built when the script runs |
| `remote-not-read` | info | the manifest or an imported script is at another address |

[docs/method.md](docs/method.md) gives each check, its exact rule, what it can see and what it cannot. [docs/rules-and-sources.md](docs/rules-and-sources.md) lists every quoted sentence with the saved page it comes from.

## Install requirements and the specification

The Web Application Manifest specification lists every member as optional: a manifest with no `name` is valid. What a browser needs before it offers to install the app is a separate list, which the saved web.dev page gives for Chrome, and the MDN page on installability gives for Chromium-based browsers: `name` or `short_name`, `start_url`, `display` (one of fullscreen, standalone, minimal-ui or window-controls-overlay), icons that include a 192px and a 512px icon, and `prefer_related_applications` absent or false, over HTTPS. The checks for those members say that they rest on the install criteria. Other browsers have their own rules, which are not saved here and so are not checked. The MDN page also says that a service worker is not a requirement for install, so a missing registration is a warning about offline use, not an install blocker.

## Where the facts come from

| Fact | Source |
| --- | --- |
| How a manifest is processed: members, `start_url`, `scope`, `id`, `display`, icon purposes | https://www.w3.org/TR/appmanifest/ |
| How a service worker is registered, scoped, installed and activated; the path restriction; the cache; `skipWaiting()`; secure contexts | https://www.w3.org/TR/service-workers/ |
| What a browser needs for install: the members, the icon sizes, HTTPS | https://web.dev/articles/install-criteria and https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable |
| The manifest members `icons`, `scope`, `start_url`, `id`, `display` | the MDN reference pages, listed in [docs/rules-and-sources.md](docs/rules-and-sources.md) |
| The worker lifecycle, versioned caches, cleaning up, the fetch event, fallbacks, `Service-Worker-Allowed` | https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers and the pages of the cache and header |
| Opaque responses, `Cache.put()` and `Cache.addAll()` | the MDN pages of those methods |
| The viewport and the theme color | the MDN pages on the viewport element and on meta names |
| The Workbox precache calls the tool recognizes | https://developer.chrome.com/docs/workbox/modules/workbox-precaching |

## Formats

- `text`: for a terminal: the files read, the counts, then each finding with its file and line, what it is about, message, fix and the quoted sentences with their addresses.
- `markdown`: the same as a table for a pull request comment or the job summary. Pipes, line breaks and angle brackets from the input are escaped, so a name from a file cannot break the table.
- `json`: the whole report: the files read, the counts, every finding with id, severity, file, line, subject, message, fix and source sentences, the notes and the gate.
- `csv`: one row per finding, quoted as RFC 4180 says. A cell that starts with `=`, `+`, `-` or `@` gets a leading `'`, so a spreadsheet does not run it as a formula.

To put the report in the job summary of a GitHub Actions run:

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  - name: Build the app
    run: npm ci && npm run build
  - name: PWA report
    run: npx --yes github:INNERLUXES/pwa-offline-check dist --format markdown >> "$GITHUB_STEP_SUMMARY"
  - name: PWA gate
    run: npx --yes github:INNERLUXES/pwa-offline-check dist --fail-on warning
```

It needs no browser, no secrets and no network access of its own; a Linux runner is enough, and it runs after the build, on the folder that the build wrote. Start with the default gate (errors only), and move to `--fail-on warning` when the first report is clean.

## Exit codes

`0` no finding at the `--fail-on` level, `1` at least one such finding (by default: an error), `2` a usage or input error (a missing path, a folder with no `index.html`, a page over the size limit, a page outside `--root`, an unknown option).

A file that cannot be read is not exit code `2`, apart from the page itself: it is a finding (`file-not-read`, `manifest-file-missing`, `sw-script-missing`), so the run still checks everything else.

## Limits

The tool reads what the files say, not what a browser does. It does not see HTTP headers, the address that the app is served from, a list that is built when a script runs, a worker that a bundler produced out of a module graph, or what Workbox does at run time. A finding says what the files show. A pass is not a tested PWA. [docs/limits.md](docs/limits.md) lists the rest, and [docs/threat-model.md](docs/threat-model.md) and [docs/secure-defaults.md](docs/secure-defaults.md) say how the tool treats a hostile folder.

## Related

The tool covers the manifest, the worker and the page of a web app. It does not repeat its neighbours in the same organization: `app-manifest-check` reads the settings files of a native mobile app (`AndroidManifest.xml`, `Info.plist`, the network security config), and `security-headers-check` reads the security headers of the responses that a page gets. This tool reads the web app manifest and the service worker, which neither of them reads, and it does not read headers.

## Background

- How progressive web apps are designed, built, made installable and kept working offline, with checks like this one in the pipeline: [progressive web app development services](https://innerluxes.dev/software-development/progressive-web-apps).

## License

MIT
