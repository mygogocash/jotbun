// The ids that code outside the app needs (P6A-T1): the iOS bundle id, the
// Android package, the app group, the keychain group the share extension
// reads the session through, and the URL scheme. P6A-T7's config writes them
// to `extra.outside`; until the owner's D33 ids exist, the temporary ones
// apply (default pending owner Q6). Pure: no React, React Native or native module.

export type OutsideIds = { iosBundleId: string; androidPackage: string; appGroup: string; keychainGroup: string | null; scheme: string };

/** Default pending owner Q6 (D33): a local-only bundle id and its app group, today's app.json package and scheme, no keychain sharing without a team id. */
export const TEMPORARY_IDS: OutsideIds = Object.freeze({
  iosBundleId: 'co.gogocash.jotbun.localcheck',
  androidPackage: 'co.gogocash.spend',
  appGroup: 'group.co.gogocash.jotbun.localcheck',
  keychainGroup: null,
  scheme: 'gogospend',
});

/** Apple's bundle id rule. P6A-T7 and P6C compare this source (A36). */
export const IOS_BUNDLE_ID_PATTERN = /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/;

/** Android's application id rule: every segment starts with a letter; `_` is allowed, `-` is not. */
export const ANDROID_PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/;

const APP_GROUP_PREFIX = 'group.';
/** A ten-character Apple team id, a dot, then the group. */
const KEYCHAIN_GROUP_PATTERN = /^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/;
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/;

function field(source: unknown, key: string): unknown {
  return typeof source === 'object' && source !== null ? (source as Record<string, unknown>)[key] : undefined;
}

function matches(value: unknown, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value);
}

function isAppGroup(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(APP_GROUP_PREFIX) && IOS_BUNDLE_ID_PATTERN.test(value.slice(APP_GROUP_PREFIX.length));
}

/** Reads `extra.outside` field by field; a missing or malformed field keeps its default. */
export function outsideIdsFrom(extra: unknown): OutsideIds {
  const outside = field(extra, 'outside');
  const iosBundleId = field(outside, 'iosBundleId');
  const androidPackage = field(outside, 'androidPackage');
  const appGroup = field(outside, 'appGroup');
  const keychainGroup = field(outside, 'keychainGroup');
  const scheme = field(outside, 'scheme');
  return {
    iosBundleId: matches(iosBundleId, IOS_BUNDLE_ID_PATTERN) ? iosBundleId : TEMPORARY_IDS.iosBundleId,
    androidPackage: matches(androidPackage, ANDROID_PACKAGE_PATTERN) ? androidPackage : TEMPORARY_IDS.androidPackage,
    appGroup: isAppGroup(appGroup) ? appGroup : TEMPORARY_IDS.appGroup,
    keychainGroup: matches(keychainGroup, KEYCHAIN_GROUP_PATTERN) ? keychainGroup : null,
    scheme: matches(scheme, SCHEME_PATTERN) ? scheme : TEMPORARY_IDS.scheme,
  };
}

export type OutsideAction = 'record' | 'today' | 'scan' | 'tell';

export function outsideLink(scheme: string, action: OutsideAction): string {
  return `${scheme}://outside/${action}`;
}
