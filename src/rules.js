// The checks: every finding id, its severity and the sentences of the saved sources that it quotes. docs/method.md gives
// the rule of each one, and docs/rules-and-sources.md lists every sentence. An id, once released, keeps its meaning,
// because pipelines read it from the JSON and CSV reports.
//
// facts: the keys of FACTS in data.js that the finding always quotes. optional: keys that a finding can add, depending
// on what the file shows. A finding without facts is about the file itself, or is a conclusion that no source states.

export const SEVERITIES = ['error', 'warning', 'info'];
export const RANK = { error: 3, warning: 2, info: 1 };

export const FINDINGS = [
  // ---- errors
  { id: 'manifest-link-missing', severity: 'error', facts: ['installable-needs-manifest', 'installable-link-element', 'manifest-link-type'], optional: ['installable-every-page'] },
  { id: 'manifest-file-missing', severity: 'error', facts: ['installable-needs-manifest'] },
  { id: 'manifest-invalid-json', severity: 'error', facts: ['manifest-json-ignored', 'installable-needs-manifest'] },
  { id: 'name-missing', severity: 'error', facts: ['criteria-intro', 'criteria-name', 'manifest-members-optional'] },
  { id: 'start-url-missing', severity: 'error', facts: ['criteria-intro', 'criteria-start-url', 'start-url-default', 'mdn-start-url-required', 'mdn-start-url-fallback'] },
  { id: 'display-missing', severity: 'error', facts: ['criteria-intro', 'criteria-display', 'installable-display', 'display-default'] },
  { id: 'display-not-installable', severity: 'error', facts: ['criteria-intro', 'criteria-display'], optional: ['display-list', 'display-default', 'mdn-display-default'] },
  { id: 'prefer-related-applications', severity: 'error', facts: ['criteria-intro', 'criteria-related', 'installable-related'] },
  { id: 'icons-missing', severity: 'error', facts: ['criteria-intro', 'criteria-icons', 'installable-icons'], optional: ['mdn-icons-src'] },
  { id: 'icons-missing-install-sizes', severity: 'error', facts: ['criteria-intro', 'criteria-icons', 'installable-icons'], optional: ['mdn-icons-sizes'] },
  { id: 'icon-file-missing', severity: 'error', facts: ['mdn-icons-src'] },
  { id: 'insecure-url', severity: 'error', facts: ['sw-secure-context', 'sw-secure-https', 'installable-https', 'criteria-https'], optional: ['sw-secure-localhost', 'mdn-secure-origins', 'mdn-sw-https'] },
  { id: 'sw-script-missing', severity: 'error', facts: ['mdn-register-path'], optional: ['mdn-sw-origin'] },
  { id: 'sw-import-missing', severity: 'error', facts: [] },
  { id: 'precache-file-missing', severity: 'error', facts: ['sw-add-all-reject', 'sw-install-fails', 'mdn-install-fails'], optional: ['mdn-url-relative'] },
  { id: 'file-not-read', severity: 'error', facts: [] },
  { id: 'unterminated-token', severity: 'error', facts: [] },
  { id: 'limit-reached', severity: 'error', facts: [] },

  // ---- warnings
  { id: 'start-url-not-found', severity: 'warning', facts: ['criteria-intro', 'criteria-start-url', 'start-url-advisory'] },
  { id: 'icon-sizes-missing', severity: 'warning', facts: ['mdn-icons-sizes'] },
  { id: 'icon-size-mismatch', severity: 'warning', facts: ['mdn-icons-sizes-raster'] },
  { id: 'icon-purpose-ignored', severity: 'warning', facts: ['icon-purpose-unrecognized', 'mdn-icons-purpose-unrecognized'] },
  { id: 'id-ignored', severity: 'warning', facts: ['id-same-origin', 'mdn-id-fallback'] },
  { id: 'scope-excludes-start-url', severity: 'warning', facts: ['scope-start-url', 'scope-prefix', 'mdn-scope-invalid'] },
  { id: 'viewport-missing', severity: 'warning', facts: ['viewport-virtual', 'viewport-recommended'] },
  { id: 'sw-register-missing', severity: 'warning', facts: ['installable-no-sw', 'mdn-install-offline'] },
  { id: 'sw-scope-too-wide', severity: 'warning', facts: ['sw-path-restriction', 'sw-path-header', 'mdn-register-scope', 'mdn-allowed-fails'] },
  { id: 'sw-scope-misses-page', severity: 'warning', facts: ['mdn-default-scope', 'mdn-default-scope-example', 'sw-scope-default'] },
  { id: 'sw-scope-misses-start-url', severity: 'warning', facts: ['mdn-default-scope', 'mdn-default-scope-example'], optional: ['sw-scope-default'] },
  { id: 'sw-no-fetch-handler', severity: 'warning', facts: ['mdn-fetch-event', 'mdn-respond-with', 'mdn-install-offline'] },
  { id: 'sw-fetch-no-respondwith', severity: 'warning', facts: ['mdn-respond-with'] },
  { id: 'sw-cache-unversioned', severity: 'warning', facts: ['mdn-cache-kept', 'mdn-delete-old', 'mdn-new-version-name'], optional: ['mdn-keep-both'] },
  { id: 'sw-cache-non-get', severity: 'warning', facts: ['sw-put-get-only'] },
  { id: 'sw-cache-opaque', severity: 'warning', facts: ['mdn-opaque-def', 'mdn-put-opaque', 'mdn-add-all-status'] },
  { id: 'sw-no-offline-fallback', severity: 'warning', facts: ['mdn-fallback', 'mdn-fallback-default'] },

  // ---- info: never fails the run
  { id: 'maskable-icon-missing', severity: 'info', facts: ['icon-maskable'] },
  { id: 'icon-type-missing', severity: 'info', facts: ['mdn-icons-type-omitted', 'mdn-icons-type-speed'] },
  { id: 'id-missing', severity: 'info', facts: ['id-default', 'id-identity', 'mdn-id-distinct'] },
  { id: 'scope-missing', severity: 'info', facts: ['scope-default', 'scope-explicit'] },
  { id: 'scope-no-trailing-slash', severity: 'info', facts: ['mdn-scope-slash'] },
  { id: 'theme-color-missing', severity: 'info', facts: ['theme-color-meta', 'theme-color-member'] },
  { id: 'sw-skip-waiting', severity: 'info', facts: ['sw-skip-waiting', 'mdn-skip-waiting', 'mdn-waiting-default'] },
  { id: 'sw-clients-claim', severity: 'info', facts: ['mdn-claim', 'mdn-claim-network'], optional: ['mdn-claim-reload'] },
  { id: 'sw-old-caches-kept', severity: 'info', facts: ['mdn-activate-cleanup', 'sw-activate-cleanup'] },
  { id: 'workbox-precache-read', severity: 'info', facts: ['workbox-list', 'workbox-route', 'workbox-install', 'workbox-activate'], optional: ['workbox-fallback'] },
  { id: 'workbox-not-read', severity: 'info', facts: [] },
  { id: 'worker-dynamic', severity: 'info', facts: [] },
  { id: 'sw-register-dynamic', severity: 'info', facts: [] },
  { id: 'remote-not-read', severity: 'info', facts: [] }
];

export const ORDER = Object.fromEntries(FINDINGS.map((f, i) => [f.id, i]));

export const meetsThreshold = (severity, failOn) => RANK[severity] >= RANK[failOn];

// C0 and C1 control characters, line and paragraph separators, and the Unicode direction controls.
const UNSAFE = new RegExp(`[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]`, 'g');

// Text that comes from a file goes through this before it reaches a message: control, line separator and direction
// characters become a space, and the length is cut.
export function safeText(value, max = 200) {
  const text = String(value).replace(UNSAFE, ' ');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}
