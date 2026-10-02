// Every name and every quoted sentence that the checks rely on comes from a page of an official source: the W3C
// specifications, the MDN pages, the web.dev install criteria and the Workbox page. The pages are saved as text in
// research/sources (the address is on the first line), and test/data.test.js compares this file with the saved text.
// Nothing here was written from memory: a sentence that is not on a saved page is not a fact of this file.

// id: used in FACTS; title: a heading of the saved page; file: the saved text in research/sources; url: the address.
export const SOURCES = [
  { id: 'manifest-spec', title: 'Web Application Manifest', url: 'https://www.w3.org/TR/appmanifest/', file: 'w3c-web-app-manifest.txt' },
  { id: 'sw-spec', title: 'Service Workers Nightly', url: 'https://www.w3.org/TR/service-workers/', file: 'w3c-service-workers.txt' },
  { id: 'installable', title: 'Making PWAs installable', url: 'https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable', file: 'mdn-making-pwas-installable.txt' },
  { id: 'install-criteria', title: 'What does it take to be installable?', url: 'https://web.dev/articles/install-criteria', file: 'web-dev-install-criteria.txt' },
  { id: 'mdn-icons', title: 'icons', url: 'https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons', file: 'mdn-manifest-icons.txt' },
  { id: 'mdn-scope', title: 'scope', url: 'https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/scope', file: 'mdn-manifest-scope.txt' },
  { id: 'mdn-start-url', title: 'start_url', url: 'https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/start_url', file: 'mdn-manifest-start-url.txt' },
  { id: 'mdn-id', title: 'id', url: 'https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id', file: 'mdn-manifest-id.txt' },
  { id: 'mdn-display', title: 'display', url: 'https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display', file: 'mdn-manifest-display.txt' },
  { id: 'using-sw', title: 'Using Service Workers', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers', file: 'mdn-using-service-workers.txt' },
  { id: 'skip-waiting', title: 'ServiceWorkerGlobalScope: skipWaiting() method', url: 'https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting', file: 'mdn-skipwaiting.txt' },
  { id: 'clients-claim', title: 'Clients: claim() method', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Clients/claim', file: 'mdn-clients-claim.txt' },
  { id: 'cache-put', title: 'Cache: put() method', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Cache/put', file: 'mdn-cache-put.txt' },
  { id: 'cache-add-all', title: 'Cache: addAll() method', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Cache/addAll', file: 'mdn-cache-addall.txt' },
  { id: 'response-type', title: 'Response: type property', url: 'https://developer.mozilla.org/en-US/docs/Web/API/Response/type', file: 'mdn-response-type.txt' },
  { id: 'sw-allowed', title: 'Service-Worker-Allowed header', url: 'https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Service-Worker-Allowed', file: 'mdn-service-worker-allowed.txt' },
  { id: 'secure-contexts', title: 'Secure contexts', url: 'https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts', file: 'mdn-secure-contexts.txt' },
  { id: 'viewport', title: '<meta name="viewport"> HTML attribute value', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Guides/Viewport_meta_element', file: 'mdn-viewport-meta.txt' },
  { id: 'meta-name', title: '<meta name> HTML attribute', url: 'https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name', file: 'mdn-meta-name.txt' },
  { id: 'workbox', title: 'workbox-precaching', url: 'https://developer.chrome.com/docs/workbox/modules/workbox-precaching', file: 'workbox-precaching.txt' }
];

export const sourceUrl = (id) => SOURCES.find((s) => s.id === id).url;

const DASH = '\u2014';

// The sentences that the findings quote. section is a heading of the saved page; text is copied from it.
export const FACTS = {
  // ---- the manifest: W3C Web Application Manifest
  'manifest-members-optional': {
    source: 'manifest-spec',
    section: '1. Web Application Manifest',
    text: 'A manifest can have any of the following members at its root, all of which are optional.'
  },
  'manifest-link-type': {
    source: 'manifest-spec',
    section: 'A.2 Link relation type registration',
    text: 'Links to a manifest. A manifest provides developers with a centralized place to put metadata associated with a web application.'
  },
  'manifest-json-ignored': {
    source: 'manifest-spec',
    section: '1.17.1 Processing the manifest',
    text: 'If the json is a parsing exception, or json is not an ordered map: Set json to an empty ordered map.'
  },
  'start-url-default': {
    source: 'manifest-spec',
    section: '1.10 start_url member',
    text: 'Set manifest["start_url"] to document URL.'
  },
  'start-url-advisory': {
    source: 'manifest-spec',
    section: '1.10 start_url member',
    text: 'The start_url member is purely advisory, and a user agent MAY ignore it or provide the end-user the choice not to make use of it.'
  },
  'scope-start-url': {
    source: 'manifest-spec',
    section: '1.6 scope member',
    text: 'If manifest["start_url"] is not within scope of scope, return.'
  },
  'scope-default': {
    source: 'manifest-spec',
    section: '5. Navigation scope',
    text: 'If the scope member is not present in the manifest, it defaults to the parent path of the start_url member.'
  },
  'scope-explicit': {
    source: 'manifest-spec',
    section: '5. Navigation scope',
    text: 'Developers should take care, if they rely on the default behavior, that all of the application\'s page URLs begin with the parent path of the start URL. To be safe, explicitly specify scope.'
  },
  'scope-prefix': {
    source: 'manifest-spec',
    section: '5. Navigation scope',
    text: 'Return a boolean indicating whether targetPath starts with scopePath.'
  },
  'id-default': {
    source: 'manifest-spec',
    section: '1.11 id member',
    text: 'Set manifest["id"] to manifest["start_url"].'
  },
  'id-identity': {
    source: 'manifest-spec',
    section: '1.11 id member',
    text: 'When the user agent sees a manifest with an identity that does not correspond to an already-installed application, it SHOULD treat that manifest as a description of a distinct application, even if it is served from the same URL as that of another application.'
  },
  'id-same-origin': {
    source: 'manifest-spec',
    section: '1.11 id member',
    text: 'If id is not same origin as manifest["start_url"], return.'
  },
  'icon-purpose-unrecognized': {
    source: 'manifest-spec',
    section: '2.1 purpose member',
    text: 'If none of the stated purposes are recognized, the icon is totally ignored.'
  },
  'icon-maskable': {
    source: 'manifest-spec',
    section: '2.1 purpose member',
    text: 'The image is designed with icon masks and safe zone in mind, such that any part of the image that is outside the safe zone can safely be ignored and masked away by the user agent.'
  },
  'display-default': {
    source: 'manifest-spec',
    section: '6. Display modes',
    text: 'When the display member is missing, or if there is no valid display member, the user agent uses the browser display mode as the applied display mode.'
  },
  'display-list': {
    source: 'manifest-spec',
    section: '1.8 display member',
    text: 'If display modes list doesn\'t contain json["display"], return.'
  },
  'theme-color-member': {
    source: 'manifest-spec',
    section: '1.12 theme_color member',
    text: 'The manifest\'s theme_color member is a themeable member that serves as the default theme color for an application context.'
  },

  // ---- the manifest: MDN pages for each member
  'mdn-start-url-fallback': {
    source: 'mdn-start-url',
    section: 'Values',
    text: 'If start_url is unspecified or the value is invalid (i.e., not a string, not a valid URL, or not same-origin as the page that links to the manifest), the URL of the page that links to the manifest is used.'
  },
  'mdn-start-url-required': {
    source: 'mdn-start-url',
    section: 'Values',
    text: 'On some browsers the start_url must be specified for a PWA to be installable (see the compatibility section below).'
  },
  'mdn-scope-invalid': {
    source: 'mdn-scope',
    section: 'Values',
    text: 'If scope is not specified in the manifest or the value is invalid (i.e., not a string, not a valid URL, or start_url is not within the specified scope), the effective scope will be set to the start_url value after removing its filename, query, and fragment.'
  },
  'mdn-scope-slash': {
    source: 'mdn-scope',
    section: 'Scope matching mechanism',
    text: 'For this reason, it\'s recommended to define a scope ending with a /.'
  },
  'mdn-id-fallback': {
    source: 'mdn-id',
    section: 'Values',
    text: 'If id is not specified or the value is invalid in any way (such as not a string, not a valid URL, not same-origin with start_url), the start_url value is used.'
  },
  'mdn-id-distinct': {
    source: 'mdn-id',
    section: 'Description',
    text: 'When a browser comes across an app manifest with an id that does not correspond to an already installed application, it treats that manifest as a description of a distinct application, even if it is served from the same URL as another application.'
  },
  'mdn-display-default': {
    source: 'mdn-display',
    section: 'Values',
    text: 'A string with keyword values. If not specified, the default value browser is used.'
  },
  'mdn-icons-src': {
    source: 'mdn-icons',
    section: 'Values',
    text: 'Each icon object can have one or more properties. Of these, only src is required.'
  },
  'mdn-icons-sizes': {
    source: 'mdn-icons',
    section: 'Values',
    text: 'If sizes is not specified, the selection and display of the icon may vary depending on the browser\'s implementation.'
  },
  'mdn-icons-sizes-raster': {
    source: 'mdn-icons',
    section: 'Values',
    text: 'For raster formats like PNG, specifying the exact available sizes is recommended.'
  },
  'mdn-icons-type-omitted': {
    source: 'mdn-icons',
    section: 'Values',
    text: 'If omitted, browsers typically infer the image type from the file extension.'
  },
  'mdn-icons-type-speed': {
    source: 'mdn-icons',
    section: 'Performance considerations',
    text: 'Specifying the type property can significantly improve performance because it allows browsers to ignore images with unsupported formats more easily.'
  },
  'mdn-icons-purpose-unrecognized': {
    source: 'mdn-icons',
    section: 'Values',
    text: 'However, if only unrecognized purposes are specified (e.g., fizzbuzz), then it will be ignored.'
  },

  // ---- install criteria: MDN and web.dev
  'installable-needs-manifest': {
    source: 'installable',
    section: 'The web app manifest',
    text: 'For a web app to be a PWA it must be installable, and for it to be installable it must include a manifest.'
  },
  'installable-link-element': {
    source: 'installable',
    section: 'The web app manifest',
    text: 'The manifest is included using a <link> element in the app\'s HTML:'
  },
  'installable-every-page': {
    source: 'installable',
    section: 'The web app manifest',
    text: 'If the PWA has more than one page, every page must reference the manifest in this way.'
  },
  'installable-icons': {
    source: 'installable',
    section: 'Required manifest members',
    text: 'icons must contain a 192px and a 512px icon'
  },
  'installable-display': {
    source: 'installable',
    section: 'Required manifest members',
    text: 'display and/or display_override'
  },
  'installable-related': {
    source: 'installable',
    section: 'Required manifest members',
    text: 'prefer_related_applications must be false or not present'
  },
  'installable-https': {
    source: 'installable',
    section: 'HTTPS, localhost, or loopback are required',
    text: `For a PWA to be installable it must be served using the https protocol, or from a local development environment using localhost or 127.0.0.1 ${DASH} with or without a port number.`
  },
  'installable-no-sw': {
    source: 'installable',
    section: 'Installability',
    text: 'While not a requirement for a PWA to be installable, many PWAs use service workers to provide an offline experience.'
  },
  'criteria-intro': {
    source: 'install-criteria',
    section: 'Install criteria',
    text: 'In Chrome, your Progressive Web App must meet the following criteria before it will fire the beforeinstallprompt event and show the in-browser install promotion:'
  },
  'criteria-name': {
    source: 'install-criteria',
    section: 'Install criteria',
    text: 'short_name or name'
  },
  'criteria-icons': {
    source: 'install-criteria',
    section: 'Install criteria',
    text: 'icons - must include a 192px and a 512px icon'
  },
  'criteria-start-url': {
    source: 'install-criteria',
    section: 'Install criteria',
    text: 'start_url'
  },
  'criteria-display': {
    source: 'install-criteria',
    section: 'Install criteria',
    text: 'display - must be one of fullscreen, standalone, minimal-ui, or window-controls-overlay'
  },
  'criteria-related': {
    source: 'install-criteria',
    section: 'Install criteria',
    text: 'prefer_related_applications must not be present, or be false'
  },
  'criteria-https': {
    source: 'install-criteria',
    section: 'Install criteria',
    text: 'Be served over HTTPS.'
  },

  // ---- the page: viewport and theme color
  'viewport-virtual': {
    source: 'viewport',
    section: 'Viewport width and screen width',
    text: 'The viewport <meta> element mitigates this problem of virtual viewport on narrow screen devices.'
  },
  'viewport-recommended': {
    source: 'viewport',
    section: 'Viewport width and screen width',
    text: 'The recommended setting is the following, which sets the viewport to match the device\'s width:'
  },
  'theme-color-meta': {
    source: 'meta-name',
    section: 'Meta names defined in the HTML specification',
    text: 'Indicates a suggested color that user agents should use to customize the display of the page or of the surrounding user interface.'
  },

  // ---- secure context
  'sw-secure-context': {
    source: 'sw-spec',
    section: '6.1. Secure Context',
    text: 'Service workers must execute in secure contexts.'
  },
  'sw-secure-https': {
    source: 'sw-spec',
    section: '6.1. Secure Context',
    text: 'This effectively means that service workers and their service worker clients need to be hosted over HTTPS.'
  },
  'sw-secure-localhost': {
    source: 'sw-spec',
    section: '6.1. Secure Context',
    text: 'A user agent can allow localhost (see the requirements), 127.0.0.0/8, and ::1/128 for development purposes.'
  },
  'mdn-secure-origins': {
    source: 'secure-contexts',
    section: 'Service workers and worklets',
    text: 'Only secure contexts are allowed to register service workers, so service workers are always secure contexts.'
  },
  'mdn-sw-https': {
    source: 'using-sw',
    section: 'Setting up to play with service workers',
    text: 'Service workers are restricted to running across HTTPS for security reasons.'
  },

  // ---- registration, scope and the path restriction
  'mdn-register-path': {
    source: 'using-sw',
    section: 'Why is my service worker failing to register?',
    text: 'The path of the service worker file is incorrect.'
  },
  'mdn-register-scope': {
    source: 'using-sw',
    section: 'Why is my service worker failing to register?',
    text: 'The service worker registration contains a scope option broader than permitted by the worker path.'
  },
  'mdn-default-scope': {
    source: 'using-sw',
    section: 'Why is my service worker failing to register?',
    text: 'The default scope for a service worker is the directory where the worker is located.'
  },
  'mdn-default-scope-example': {
    source: 'using-sw',
    section: 'Why is my service worker failing to register?',
    text: 'In other words, if the script sw.js is located in /js/sw.js, it can only control URLs in (or nested within) the /js/ path by default.'
  },
  'sw-scope-default': {
    source: 'sw-spec',
    section: 'Start Register',
    text: 'The scope url for the registration is set to the location of the service worker script by default.'
  },
  'sw-path-restriction': {
    source: 'sw-spec',
    section: '6.5. Path restriction',
    text: 'a service worker script at https://www.example.com/~bob/sw.js can be registered for the scope url https://www.example.com/~bob/ but not for the scope https://www.example.com/ or https://www.example.com/~alice/.'
  },
  'sw-path-header': {
    source: 'sw-spec',
    section: '6.5. Path restriction',
    text: 'Servers can remove the path restriction by setting a Service-Worker-Allowed header on the service worker script.'
  },
  'mdn-allowed-fails': {
    source: 'sw-allowed',
    section: 'Using Service-Worker-Allowed to broaden service worker scope',
    text: 'If the server doesn\'t set the header, the service worker registration will fail, as the scope option ({ scope: "/" }) requests a scope broader than the directory where the service worker script is located (/product/sw.js).'
  },
  'mdn-sw-origin': {
    source: 'using-sw',
    section: 'Why is my service worker failing to register?',
    text: 'The path to your service worker points to a service worker of a different origin to your app.'
  },

  // ---- fetch, install, activate, caches
  'mdn-fetch-event': {
    source: 'using-sw',
    section: 'Custom responses to requests',
    text: 'A fetch event fires every time any resource controlled by a service worker is fetched, which includes the documents inside the specified scope, and any resources referenced in those documents'
  },
  'mdn-respond-with': {
    source: 'using-sw',
    section: 'Custom responses to requests',
    text: 'You can attach a fetch event listener to the service worker, then call the respondWith() method on the event to hijack our HTTP responses and update them with your own content.'
  },
  'mdn-install-offline': {
    source: 'using-sw',
    section: 'Install and activate: populating your cache',
    text: 'It is emitted just once, immediately after registration is successfully completed, and is generally used to populate your browser\'s offline caching capabilities with the assets you need to run your app offline.'
  },
  'mdn-url-relative': {
    source: 'using-sw',
    section: 'Install and activate: populating your cache',
    text: 'The URLs are relative to the worker\'s location.'
  },
  'mdn-install-fails': {
    source: 'using-sw',
    section: 'Install and activate: populating your cache',
    text: 'If the promise is rejected, the installation fails, and the worker won\'t do anything.'
  },
  'sw-install-fails': {
    source: 'sw-spec',
    section: '4.4.1. event.waitUntil(f)',
    text: 'If any of the promises rejects, the installation fails.'
  },
  'sw-add-all-reject': {
    source: 'sw-spec',
    section: '5.4.4. addAll(requests)',
    text: 'If response\u2019s type is "error", or response\u2019s status is not an ok status or is 206, reject responsePromise with a TypeError.'
  },
  'mdn-add-all-status': {
    source: 'cache-add-all',
    section: 'Exceptions',
    text: 'The Response status is not in the 200 range (i.e., not a successful response.) This occurs if the request does not return successfully, but also if the request is a cross-origin no-cors request (in which case the reported status is always 0.)'
  },
  'mdn-cache-kept': {
    source: 'using-sw',
    section: 'Install and activate: populating your cache',
    text: 'The contents of the cache are kept until you clear them.'
  },
  'mdn-delete-old': {
    source: 'using-sw',
    section: 'Deleting old caches',
    text: 'You can use the activate event to remove data from the previous caches.'
  },
  'mdn-keep-both': {
    source: 'using-sw',
    section: 'Deleting old caches',
    text: 'While there are open pages that are controlled by the previous version of the worker, you need to keep both caches, because the previous version needs its version of the cache.'
  },
  'mdn-new-version-name': {
    source: 'using-sw',
    section: 'Updating your service worker',
    text: 'We are calling the new cache v2, so the previous v1 cache isn\'t disturbed.'
  },
  'mdn-activate-cleanup': {
    source: 'using-sw',
    section: 'Replacing an existing service worker',
    text: 'The primary use of activate is to clean up resources used in previous versions of the service worker, such as the old cache in this example.'
  },
  'sw-activate-cleanup': {
    source: 'sw-spec',
    section: '4.4.1. event.waitUntil(f)',
    text: 'This is primarily used to ensure that any functional events are not dispatched to the service worker until it upgrades database schemas and deletes the outdated cache entries.'
  },
  'mdn-fallback': {
    source: 'using-sw',
    section: 'Recovering failed requests',
    text: 'The only trouble we have now is that if the request doesn\'t match anything in the cache, and the network is not available, our request will still fail.'
  },
  'mdn-fallback-default': {
    source: 'using-sw',
    section: 'Recovering failed requests',
    text: 'Let\'s provide a default fallback so that whatever happens, the user will at least get something:'
  },

  // ---- skipWaiting and claim
  'sw-skip-waiting': {
    source: 'sw-spec',
    section: '4.1.4. skipWaiting()',
    text: 'The skipWaiting() method allows this service worker to progress from the registration\u2019s waiting position to active even while service worker clients are using the registration.'
  },
  'mdn-skip-waiting': {
    source: 'skip-waiting',
    section: 'ServiceWorkerGlobalScope: skipWaiting() method',
    text: 'The skipWaiting() method of the ServiceWorkerGlobalScope interface forces the waiting service worker to become the active service worker.'
  },
  'mdn-waiting-default': {
    source: 'using-sw',
    section: 'Replacing an existing service worker',
    text: 'When installation completes successfully, the new version waits while the old version is still controlling clients.'
  },
  'mdn-claim': {
    source: 'clients-claim',
    section: 'Clients: claim() method',
    text: 'The claim() method of the Clients interface allows an active service worker to set itself as the controller for all clients within its scope.'
  },
  'mdn-claim-network': {
    source: 'clients-claim',
    section: 'Clients: claim() method',
    text: 'Be aware that this results in your service worker controlling pages that loaded regularly over the network, or possibly via a different service worker.'
  },
  'mdn-claim-reload': {
    source: 'using-sw',
    section: 'Initial installation',
    text: 'Existing documents will have to be reloaded to actually be controlled, because a document starts life with or without a service worker and maintains that for its lifetime.'
  },

  // ---- what is cached: non-GET and opaque responses
  'sw-put-get-only': {
    source: 'sw-spec',
    section: '5.4.5. put(request, response)',
    text: 'If innerRequest\u2019s url\u2019s scheme is not one of "http" and "https", or innerRequest\u2019s method is not `GET`, return a promise rejected with a TypeError.'
  },
  'mdn-put-opaque': {
    source: 'cache-put',
    section: 'Cache: put() method',
    text: 'Cache.add/Cache.addAll do not cache responses with Response.status values that are not in the 200 range, whereas Cache.put lets you store any request/response pair. As a result, Cache.add/Cache.addAll can\'t be used to store opaque responses, whereas Cache.put can.'
  },
  'mdn-opaque-def': {
    source: 'response-type',
    section: 'Value',
    text: 'A response to a cross-origin request whose mode was set to no-cors. The status property is set to 0, body is null, headers are empty and immutable.'
  },

  // ---- Workbox
  'workbox-route': {
    source: 'workbox',
    section: 'Serving Precached Responses',
    text: 'Calling precacheAndRoute() or addRoute() will create a route that matches requests for precached URLs.'
  },
  'workbox-list': {
    source: 'workbox',
    section: 'Explanation of the Precache List',
    text: 'workbox-precaching expects an array of objects with a url and revision property. This array is sometimes referred to as a precache manifest:'
  },
  'workbox-install': {
    source: 'workbox',
    section: 'How workbox-precaching Works',
    text: 'workbox-precaching does all of this during the service worker\'s install event.'
  },
  'workbox-activate': {
    source: 'workbox',
    section: 'How workbox-precaching Works',
    text: 'It\'s in the activate event that workbox-precaching will check for any cached assets that are no longer present in the list of current URLs, and remove those from the cache.'
  },
  'workbox-fallback': {
    source: 'workbox',
    section: 'PrecacheFallbackPlugin',
    text: 'PrecacheFallbackPlugin allows you to specify an "offline fallback" response to be used when a given strategy is unable to generate a response.'
  }
};

// The display values of the manifest that the web.dev install criteria accept: "display - must be one of fullscreen,
// standalone, minimal-ui, or window-controls-overlay".
export const INSTALL_DISPLAY = ['fullscreen', 'standalone', 'minimal-ui', 'window-controls-overlay'];

// The display modes that the specification defines: fullscreen, standalone, minimal-ui and browser (the default).
export const SPEC_DISPLAY = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];

// The icon purposes of the specification: "The icon purposes list is the list monochrome, maskable, any".
export const ICON_PURPOSES = ['monochrome', 'maskable', 'any'];

// The sizes of the icons that the install criteria name: "must include a 192px and a 512px icon".
export const INSTALL_ICON_SIZES = [192, 512];

// The Workbox calls that the saved page documents. A worker that calls precacheAndRoute() or addRoute() has a route for
// the fetch event; the precache list is the array of objects with a url and a revision property.
export const WORKBOX = {
  route: ['precacheAndRoute', 'addRoute'],
  precache: ['precacheAndRoute', 'precache'],
  cleanup: ['cleanupOutdatedCaches'],
  fallback: ['PrecacheFallbackPlugin', 'setCatchHandler']
};
