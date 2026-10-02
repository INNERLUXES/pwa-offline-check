# Limits

## What a static reading can know

- **It sees text, not a browser.** The tool does not know which browser will install the app, what the server sends in its headers, whether the address is served over HTTPS, what is in the user's cache, or how a launcher crops an icon. A finding says what the files show. A pass is not a working PWA: open the app in a browser and use the application panel of its developer tools.
- **A finding is a review item, not proof.** Several findings rest on a conclusion that the sources do not state, and the message says so. `start-url-not-found` cannot see a server that rewrites an address. `sw-scope-too-wide` cannot see a `Service-Worker-Allowed` header. `sw-cache-non-get`, `sw-cache-opaque` and `sw-no-offline-fallback` look for patterns in the tokens of the worker, and a check that is written another way is not seen.
- **The install criteria are one browser's.** The requirements for `name`, `start_url`, `display` and the 192px and 512px icons come from the saved web.dev page for Chrome and from the MDN page for Chromium-based browsers. The saved pages say that other browsers have similar criteria with minor differences, and name no other rule, so none is checked. The specification itself lists every member as optional.
- **An icon with sizes `any` is not judged.** The saved pages name a 192px and a 512px icon, and do not say whether a scalable icon counts, so the tool reports a note and no error.

## What the JavaScript reading cannot see

- **Dynamic addresses.** An address or a list that is built when the script runs (`"/sw-" + hash + ".js"`, `assets.map(...)`, a list read from another file) is not worked out. A registration with such an address is `sw-register-dynamic`, and a list like that is `worker-dynamic`. Only the parts written as string literals are checked.
- **Bundled workers.** A worker that a bundler produced, with its own module system and renamed names, is read as the text it is. The patterns look for the names of the browser API (`addEventListener`, `caches`, `respondWith`, and so on), which survive a bundler, but a registration that sits in a bundle that the page does not name is not seen, and a minifier that renames `self` or builds a property name from parts hides a call.
- **Modules.** Only the scripts that the page names are read. A module that they import is not followed.
- **Whole-file patterns.** The checks do not follow which function calls which. `.put(` anywhere in the worker counts as caching, a `.method` anywhere counts as a check of the method, and a `catch` anywhere that calls `.match(` counts as a fallback. This keeps the reading simple and the time linear, and it means a pattern can be satisfied by code that never runs on the path that matters.
- **Workbox.** The tool recognizes the calls that the saved Workbox page documents (`precacheAndRoute`, `addRoute`, `precache`, `cleanupOutdatedCaches`, `PrecacheFallbackPlugin`, `setCatchHandler`) and reads a literal precache list. It does not read what Workbox does at run time, other routes and strategies (`registerRoute` and the strategy classes are not on the saved page), or a precache list that a build step injects. For such a worker the checks of the fetch handler, the cache names and the fallback are not applied, and `workbox-not-read` says so.
- **Version words.** A cache name counts as versioned when it holds a digit or the word "version". A name like `static-assets` that is never changed is reported, and a name like `app-cache-1` that is never changed is not.

## What the tool does not check

- Whether the app works when it is offline: the tool reads the code that is meant to make it work, and does not run it.
- The content of the cached files, the size of the cache, the storage quota, and the update flow beyond what `sw-skip-waiting`, `sw-clients-claim`, `sw-cache-unversioned` and `sw-old-caches-kept` say.
- Push, background sync, and the other service worker features: they are not part of installing, working offline or updating safely.
- Screenshots, shortcuts, the share target, and the other manifest members that the install criteria do not name.
- HTTP headers. The neighbour tool `security-headers-check` reads the security headers of the responses of a page; this tool reads the manifest and the worker. The neighbour tool `app-manifest-check` reads the settings files of a native mobile app, such as `AndroidManifest.xml` and `Info.plist`; this tool reads the manifest of a web app.
- Other pages of the app than the one given.

## Size and depth

- The limits of [inputs.md](inputs.md) apply, and a limit is reported, not skipped.
- The tokenizer and the HTML reader read every character once. A string, a template literal, a comment, a script element or a quoted value that is never closed stops the read of that file at its opening line (`unterminated-token`). A slash that might start a regular expression is tried once for each line, so a long line of slashes does not make the read slow.
- The arguments of a call are looked at up to 20,000 tokens from its opening bracket. A call that is longer is treated as not readable, and at most 2,000 calls of each kind are looked at in a file.
