# Rules and sources

Every name and every quoted sentence that the tool relies on comes from a page of an official source, which is saved as text in [research/sources](../research/sources) with its address on the first line. `test/data.test.js` compares them: each sentence below must be on the saved page it names, under the heading it names, word for word, and the display modes, the icon purposes, the icon sizes and the Workbox calls that the checks read must be on the saved pages. The tool quotes the sources; it does not paraphrase them. Where a finding draws a conclusion that no sentence states, the message says that the conclusion is its own.

The pages were saved as text from the pages that the addresses serve. The W3C pages are living documents, and the saved text is the text that the checks were written from. A construct that the saved pages do not describe is not checked, and a browser that works from a later version of a page may differ.

The sources are of two kinds. The specifications (the Web Application Manifest and Service Workers) say how a manifest and a worker are processed. The install criteria (the web.dev page and the MDN page on installability) say what a browser needs before it offers to install the app. A finding names the one it rests on, and says when the specification calls a member optional.

## Pages

| Heading | Address | Saved as |
| --- | --- | --- |
| Web Application Manifest | https://www.w3.org/TR/appmanifest/ | research/sources/w3c-web-app-manifest.txt |
| Service Workers Nightly | https://www.w3.org/TR/service-workers/ | research/sources/w3c-service-workers.txt |
| Making PWAs installable | https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable | research/sources/mdn-making-pwas-installable.txt |
| What does it take to be installable? | https://web.dev/articles/install-criteria | research/sources/web-dev-install-criteria.txt |
| icons | https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons | research/sources/mdn-manifest-icons.txt |
| scope | https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/scope | research/sources/mdn-manifest-scope.txt |
| start_url | https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/start_url | research/sources/mdn-manifest-start-url.txt |
| id | https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id | research/sources/mdn-manifest-id.txt |
| display | https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display | research/sources/mdn-manifest-display.txt |
| Using Service Workers | https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers | research/sources/mdn-using-service-workers.txt |
| ServiceWorkerGlobalScope: skipWaiting() method | https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting | research/sources/mdn-skipwaiting.txt |
| Clients: claim() method | https://developer.mozilla.org/en-US/docs/Web/API/Clients/claim | research/sources/mdn-clients-claim.txt |
| Cache: put() method | https://developer.mozilla.org/en-US/docs/Web/API/Cache/put | research/sources/mdn-cache-put.txt |
| Cache: addAll() method | https://developer.mozilla.org/en-US/docs/Web/API/Cache/addAll | research/sources/mdn-cache-addall.txt |
| Response: type property | https://developer.mozilla.org/en-US/docs/Web/API/Response/type | research/sources/mdn-response-type.txt |
| Service-Worker-Allowed header | https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Service-Worker-Allowed | research/sources/mdn-service-worker-allowed.txt |
| Secure contexts | https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts | research/sources/mdn-secure-contexts.txt |
| <meta name="viewport"> HTML attribute value | https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Viewport_meta_element | research/sources/mdn-viewport-meta.txt |
| <meta name> HTML attribute | https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name | research/sources/mdn-meta-name.txt |
| workbox-precaching | https://developer.chrome.com/docs/workbox/modules/workbox-precaching | research/sources/workbox-precaching.txt |

## The sentences of each check

A check without a sentence is about the files themselves, or is a conclusion of the tool that no source states.

### `manifest-link-missing`

- Making PWAs installable, The web app manifest: "For a web app to be a PWA it must be installable, and for it to be installable it must include a manifest."
- Making PWAs installable, The web app manifest: "The manifest is included using a <link> element in the app's HTML:"
- Web Application Manifest, A.2 Link relation type registration: "Links to a manifest. A manifest provides developers with a centralized place to put metadata associated with a web application."
- Making PWAs installable, The web app manifest (added when it applies): "If the PWA has more than one page, every page must reference the manifest in this way."

### `manifest-file-missing`

- Making PWAs installable, The web app manifest: "For a web app to be a PWA it must be installable, and for it to be installable it must include a manifest."

### `manifest-invalid-json`

- Web Application Manifest, 1.17.1 Processing the manifest: "If the json is a parsing exception, or json is not an ordered map: Set json to an empty ordered map."
- Making PWAs installable, The web app manifest: "For a web app to be a PWA it must be installable, and for it to be installable it must include a manifest."

### `name-missing`

- What does it take to be installable?, Install criteria: "In Chrome, your Progressive Web App must meet the following criteria before it will fire the beforeinstallprompt event and show the in-browser install promotion:"
- What does it take to be installable?, Install criteria: "short_name or name"
- Web Application Manifest, 1. Web Application Manifest: "A manifest can have any of the following members at its root, all of which are optional."

### `start-url-missing`

- What does it take to be installable?, Install criteria: "In Chrome, your Progressive Web App must meet the following criteria before it will fire the beforeinstallprompt event and show the in-browser install promotion:"
- What does it take to be installable?, Install criteria: "start_url"
- Web Application Manifest, 1.10 start_url member: "Set manifest["start_url"] to document URL."
- start_url, Values: "On some browsers the start_url must be specified for a PWA to be installable (see the compatibility section below)."
- start_url, Values: "If start_url is unspecified or the value is invalid (i.e., not a string, not a valid URL, or not same-origin as the page that links to the manifest), the URL of the page that links to the manifest is used."

### `display-missing`

- What does it take to be installable?, Install criteria: "In Chrome, your Progressive Web App must meet the following criteria before it will fire the beforeinstallprompt event and show the in-browser install promotion:"
- What does it take to be installable?, Install criteria: "display - must be one of fullscreen, standalone, minimal-ui, or window-controls-overlay"
- Making PWAs installable, Required manifest members: "display and/or display_override"
- Web Application Manifest, 6. Display modes: "When the display member is missing, or if there is no valid display member, the user agent uses the browser display mode as the applied display mode."

### `display-not-installable`

- What does it take to be installable?, Install criteria: "In Chrome, your Progressive Web App must meet the following criteria before it will fire the beforeinstallprompt event and show the in-browser install promotion:"
- What does it take to be installable?, Install criteria: "display - must be one of fullscreen, standalone, minimal-ui, or window-controls-overlay"
- Web Application Manifest, 1.8 display member (added when it applies): "If display modes list doesn't contain json["display"], return."
- Web Application Manifest, 6. Display modes (added when it applies): "When the display member is missing, or if there is no valid display member, the user agent uses the browser display mode as the applied display mode."
- display, Values (added when it applies): "A string with keyword values. If not specified, the default value browser is used."

### `prefer-related-applications`

- What does it take to be installable?, Install criteria: "In Chrome, your Progressive Web App must meet the following criteria before it will fire the beforeinstallprompt event and show the in-browser install promotion:"
- What does it take to be installable?, Install criteria: "prefer_related_applications must not be present, or be false"
- Making PWAs installable, Required manifest members: "prefer_related_applications must be false or not present"

### `icons-missing`

- What does it take to be installable?, Install criteria: "In Chrome, your Progressive Web App must meet the following criteria before it will fire the beforeinstallprompt event and show the in-browser install promotion:"
- What does it take to be installable?, Install criteria: "icons - must include a 192px and a 512px icon"
- Making PWAs installable, Required manifest members: "icons must contain a 192px and a 512px icon"
- icons, Values (added when it applies): "Each icon object can have one or more properties. Of these, only src is required."

### `icons-missing-install-sizes`

- What does it take to be installable?, Install criteria: "In Chrome, your Progressive Web App must meet the following criteria before it will fire the beforeinstallprompt event and show the in-browser install promotion:"
- What does it take to be installable?, Install criteria: "icons - must include a 192px and a 512px icon"
- Making PWAs installable, Required manifest members: "icons must contain a 192px and a 512px icon"
- icons, Values (added when it applies): "If sizes is not specified, the selection and display of the icon may vary depending on the browser's implementation."

### `icon-file-missing`

- icons, Values: "Each icon object can have one or more properties. Of these, only src is required."

### `insecure-url`

- Service Workers Nightly, 6.1. Secure Context: "Service workers must execute in secure contexts."
- Service Workers Nightly, 6.1. Secure Context: "This effectively means that service workers and their service worker clients need to be hosted over HTTPS."
- Making PWAs installable, HTTPS, localhost, or loopback are required: "For a PWA to be installable it must be served using the https protocol, or from a local development environment using localhost or 127.0.0.1 — with or without a port number."
- What does it take to be installable?, Install criteria: "Be served over HTTPS."
- Service Workers Nightly, 6.1. Secure Context (added when it applies): "A user agent can allow localhost (see the requirements), 127.0.0.0/8, and ::1/128 for development purposes."
- Secure contexts, Service workers and worklets (added when it applies): "Only secure contexts are allowed to register service workers, so service workers are always secure contexts."
- Using Service Workers, Setting up to play with service workers (added when it applies): "Service workers are restricted to running across HTTPS for security reasons."

### `sw-script-missing`

- Using Service Workers, Why is my service worker failing to register?: "The path of the service worker file is incorrect."
- Using Service Workers, Why is my service worker failing to register? (added when it applies): "The path to your service worker points to a service worker of a different origin to your app."

### `sw-import-missing`

No sentence: this check is about the files themselves, or is the tool's own conclusion.

### `precache-file-missing`

- Service Workers Nightly, 5.4.4. addAll(requests): "If response’s type is "error", or response’s status is not an ok status or is 206, reject responsePromise with a TypeError."
- Service Workers Nightly, 4.4.1. event.waitUntil(f): "If any of the promises rejects, the installation fails."
- Using Service Workers, Install and activate: populating your cache: "If the promise is rejected, the installation fails, and the worker won't do anything."
- Using Service Workers, Install and activate: populating your cache (added when it applies): "The URLs are relative to the worker's location."

### `file-not-read`

No sentence: this check is about the files themselves, or is the tool's own conclusion.

### `unterminated-token`

No sentence: this check is about the files themselves, or is the tool's own conclusion.

### `limit-reached`

No sentence: this check is about the files themselves, or is the tool's own conclusion.

### `start-url-not-found`

- What does it take to be installable?, Install criteria: "In Chrome, your Progressive Web App must meet the following criteria before it will fire the beforeinstallprompt event and show the in-browser install promotion:"
- What does it take to be installable?, Install criteria: "start_url"
- Web Application Manifest, 1.10 start_url member: "The start_url member is purely advisory, and a user agent MAY ignore it or provide the end-user the choice not to make use of it."

### `icon-sizes-missing`

- icons, Values: "If sizes is not specified, the selection and display of the icon may vary depending on the browser's implementation."

### `icon-size-mismatch`

- icons, Values: "For raster formats like PNG, specifying the exact available sizes is recommended."

### `icon-purpose-ignored`

- Web Application Manifest, 2.1 purpose member: "If none of the stated purposes are recognized, the icon is totally ignored."
- icons, Values: "However, if only unrecognized purposes are specified (e.g., fizzbuzz), then it will be ignored."

### `id-ignored`

- Web Application Manifest, 1.11 id member: "If id is not same origin as manifest["start_url"], return."
- id, Values: "If id is not specified or the value is invalid in any way (such as not a string, not a valid URL, not same-origin with start_url), the start_url value is used."

### `scope-excludes-start-url`

- Web Application Manifest, 1.6 scope member: "If manifest["start_url"] is not within scope of scope, return."
- Web Application Manifest, 5. Navigation scope: "Return a boolean indicating whether targetPath starts with scopePath."
- scope, Values: "If scope is not specified in the manifest or the value is invalid (i.e., not a string, not a valid URL, or start_url is not within the specified scope), the effective scope will be set to the start_url value after removing its filename, query, and fragment."

### `viewport-missing`

- <meta name="viewport"> HTML attribute value, Viewport width and screen width: "The viewport <meta> element mitigates this problem of virtual viewport on narrow screen devices."
- <meta name="viewport"> HTML attribute value, Viewport width and screen width: "The recommended setting is the following, which sets the viewport to match the device's width:"

### `sw-register-missing`

- Making PWAs installable, Installability: "While not a requirement for a PWA to be installable, many PWAs use service workers to provide an offline experience."
- Using Service Workers, Install and activate: populating your cache: "It is emitted just once, immediately after registration is successfully completed, and is generally used to populate your browser's offline caching capabilities with the assets you need to run your app offline."

### `sw-scope-too-wide`

- Service Workers Nightly, 6.5. Path restriction: "a service worker script at https://www.example.com/~bob/sw.js can be registered for the scope url https://www.example.com/~bob/ but not for the scope https://www.example.com/ or https://www.example.com/~alice/."
- Service Workers Nightly, 6.5. Path restriction: "Servers can remove the path restriction by setting a Service-Worker-Allowed header on the service worker script."
- Using Service Workers, Why is my service worker failing to register?: "The service worker registration contains a scope option broader than permitted by the worker path."
- Service-Worker-Allowed header, Using Service-Worker-Allowed to broaden service worker scope: "If the server doesn't set the header, the service worker registration will fail, as the scope option ({ scope: "/" }) requests a scope broader than the directory where the service worker script is located (/product/sw.js)."

### `sw-scope-misses-page`

- Using Service Workers, Why is my service worker failing to register?: "The default scope for a service worker is the directory where the worker is located."
- Using Service Workers, Why is my service worker failing to register?: "In other words, if the script sw.js is located in /js/sw.js, it can only control URLs in (or nested within) the /js/ path by default."
- Service Workers Nightly, Start Register: "The scope url for the registration is set to the location of the service worker script by default."

### `sw-scope-misses-start-url`

- Using Service Workers, Why is my service worker failing to register?: "The default scope for a service worker is the directory where the worker is located."
- Using Service Workers, Why is my service worker failing to register?: "In other words, if the script sw.js is located in /js/sw.js, it can only control URLs in (or nested within) the /js/ path by default."
- Service Workers Nightly, Start Register (added when it applies): "The scope url for the registration is set to the location of the service worker script by default."

### `sw-no-fetch-handler`

- Using Service Workers, Custom responses to requests: "A fetch event fires every time any resource controlled by a service worker is fetched, which includes the documents inside the specified scope, and any resources referenced in those documents"
- Using Service Workers, Custom responses to requests: "You can attach a fetch event listener to the service worker, then call the respondWith() method on the event to hijack our HTTP responses and update them with your own content."
- Using Service Workers, Install and activate: populating your cache: "It is emitted just once, immediately after registration is successfully completed, and is generally used to populate your browser's offline caching capabilities with the assets you need to run your app offline."

### `sw-fetch-no-respondwith`

- Using Service Workers, Custom responses to requests: "You can attach a fetch event listener to the service worker, then call the respondWith() method on the event to hijack our HTTP responses and update them with your own content."

### `sw-cache-unversioned`

- Using Service Workers, Install and activate: populating your cache: "The contents of the cache are kept until you clear them."
- Using Service Workers, Deleting old caches: "You can use the activate event to remove data from the previous caches."
- Using Service Workers, Updating your service worker: "We are calling the new cache v2, so the previous v1 cache isn't disturbed."
- Using Service Workers, Deleting old caches (added when it applies): "While there are open pages that are controlled by the previous version of the worker, you need to keep both caches, because the previous version needs its version of the cache."

### `sw-cache-non-get`

- Service Workers Nightly, 5.4.5. put(request, response): "If innerRequest’s url’s scheme is not one of "http" and "https", or innerRequest’s method is not `GET`, return a promise rejected with a TypeError."

### `sw-cache-opaque`

- Response: type property, Value: "A response to a cross-origin request whose mode was set to no-cors. The status property is set to 0, body is null, headers are empty and immutable."
- Cache: put() method, Cache: put() method: "Cache.add/Cache.addAll do not cache responses with Response.status values that are not in the 200 range, whereas Cache.put lets you store any request/response pair. As a result, Cache.add/Cache.addAll can't be used to store opaque responses, whereas Cache.put can."
- Cache: addAll() method, Exceptions: "The Response status is not in the 200 range (i.e., not a successful response.) This occurs if the request does not return successfully, but also if the request is a cross-origin no-cors request (in which case the reported status is always 0.)"

### `sw-no-offline-fallback`

- Using Service Workers, Recovering failed requests: "The only trouble we have now is that if the request doesn't match anything in the cache, and the network is not available, our request will still fail."
- Using Service Workers, Recovering failed requests: "Let's provide a default fallback so that whatever happens, the user will at least get something:"

### `maskable-icon-missing`

- Web Application Manifest, 2.1 purpose member: "The image is designed with icon masks and safe zone in mind, such that any part of the image that is outside the safe zone can safely be ignored and masked away by the user agent."

### `icon-type-missing`

- icons, Values: "If omitted, browsers typically infer the image type from the file extension."
- icons, Performance considerations: "Specifying the type property can significantly improve performance because it allows browsers to ignore images with unsupported formats more easily."

### `id-missing`

- Web Application Manifest, 1.11 id member: "Set manifest["id"] to manifest["start_url"]."
- Web Application Manifest, 1.11 id member: "When the user agent sees a manifest with an identity that does not correspond to an already-installed application, it SHOULD treat that manifest as a description of a distinct application, even if it is served from the same URL as that of another application."
- id, Description: "When a browser comes across an app manifest with an id that does not correspond to an already installed application, it treats that manifest as a description of a distinct application, even if it is served from the same URL as another application."

### `scope-missing`

- Web Application Manifest, 5. Navigation scope: "If the scope member is not present in the manifest, it defaults to the parent path of the start_url member."
- Web Application Manifest, 5. Navigation scope: "Developers should take care, if they rely on the default behavior, that all of the application's page URLs begin with the parent path of the start URL. To be safe, explicitly specify scope."

### `scope-no-trailing-slash`

- scope, Scope matching mechanism: "For this reason, it's recommended to define a scope ending with a /."

### `theme-color-missing`

- <meta name> HTML attribute, Meta names defined in the HTML specification: "Indicates a suggested color that user agents should use to customize the display of the page or of the surrounding user interface."
- Web Application Manifest, 1.12 theme_color member: "The manifest's theme_color member is a themeable member that serves as the default theme color for an application context."

### `sw-skip-waiting`

- Service Workers Nightly, 4.1.4. skipWaiting(): "The skipWaiting() method allows this service worker to progress from the registration’s waiting position to active even while service worker clients are using the registration."
- ServiceWorkerGlobalScope: skipWaiting() method, ServiceWorkerGlobalScope: skipWaiting() method: "The skipWaiting() method of the ServiceWorkerGlobalScope interface forces the waiting service worker to become the active service worker."
- Using Service Workers, Replacing an existing service worker: "When installation completes successfully, the new version waits while the old version is still controlling clients."

### `sw-clients-claim`

- Clients: claim() method, Clients: claim() method: "The claim() method of the Clients interface allows an active service worker to set itself as the controller for all clients within its scope."
- Clients: claim() method, Clients: claim() method: "Be aware that this results in your service worker controlling pages that loaded regularly over the network, or possibly via a different service worker."
- Using Service Workers, Initial installation (added when it applies): "Existing documents will have to be reloaded to actually be controlled, because a document starts life with or without a service worker and maintains that for its lifetime."

### `sw-old-caches-kept`

- Using Service Workers, Replacing an existing service worker: "The primary use of activate is to clean up resources used in previous versions of the service worker, such as the old cache in this example."
- Service Workers Nightly, 4.4.1. event.waitUntil(f): "This is primarily used to ensure that any functional events are not dispatched to the service worker until it upgrades database schemas and deletes the outdated cache entries."

### `workbox-precache-read`

- workbox-precaching, Explanation of the Precache List: "workbox-precaching expects an array of objects with a url and revision property. This array is sometimes referred to as a precache manifest:"
- workbox-precaching, Serving Precached Responses: "Calling precacheAndRoute() or addRoute() will create a route that matches requests for precached URLs."
- workbox-precaching, How workbox-precaching Works: "workbox-precaching does all of this during the service worker's install event."
- workbox-precaching, How workbox-precaching Works: "It's in the activate event that workbox-precaching will check for any cached assets that are no longer present in the list of current URLs, and remove those from the cache."
- workbox-precaching, PrecacheFallbackPlugin (added when it applies): "PrecacheFallbackPlugin allows you to specify an "offline fallback" response to be used when a given strategy is unable to generate a response."

### `workbox-not-read`

No sentence: this check is about the files themselves, or is the tool's own conclusion.

### `worker-dynamic`

No sentence: this check is about the files themselves, or is the tool's own conclusion.

### `sw-register-dynamic`

No sentence: this check is about the files themselves, or is the tool's own conclusion.

### `remote-not-read`

No sentence: this check is about the files themselves, or is the tool's own conclusion.
