// The app's outside wiring (P6A-T1): the ids from the evaluated config
// (`extra.outside`, which P6A-T7 writes), the app group store over
// expo-file-system, and SHA-256 through expo-crypto. expo-constants loads on
// the first appOutsideIds() and expo-file-system on the first getAppGroup() on
// a phone, never at import: a render test that reaches this file needs only
// the usual expo-crypto mock (expo-constants cannot load there, so the
// temporary ids apply), and expo-file-system never loads on the web or in a
// test that installs a store with setAppGroup first.
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import type { Digest } from './accountFile.ts';
import { noAppGroup } from './appGroup.ts';
import type { AppGroupPort } from './appGroup.ts';
import { deviceAppGroup } from './deviceAppGroup.ts';
import { outsideIdsFrom } from './outsideIds.ts';
import type { OutsideIds } from './outsideIds.ts';

let ids: OutsideIds | null = null;
let device: AppGroupPort | null = null;
let installed: AppGroupPort | null = null;

/** The evaluated config's `extra`, or undefined when expo-constants cannot load (a render test), so the temporary ids apply. */
function configExtra(): unknown {
  try {
    // A lazy require, as for expo-file-system below: expo-constants loads here, on first use.
    const constants: typeof import('expo-constants') = require('expo-constants');
    return constants.default.expoConfig?.extra;
  } catch {
    return undefined;
  }
}

/** outsideIdsFrom(Constants.expoConfig?.extra), read once. */
export function appOutsideIds(): OutsideIds {
  ids ??= outsideIdsFrom(configExtra());
  return ids;
}

function deviceGroup(): AppGroupPort {
  const os = Platform.OS;
  if (os !== 'ios' && os !== 'android') return noAppGroup;
  try {
    // A lazy require: the native module loads here, on first use, on a phone only.
    const fs: typeof import('expo-file-system') = require('expo-file-system');
    return deviceAppGroup(appOutsideIds(), os, fs);
  } catch {
    return noAppGroup;
  }
}

/** The device store, made once; a store installed with setAppGroup wins. */
export function getAppGroup(): AppGroupPort {
  if (installed) return installed;
  device ??= deviceGroup();
  return device;
}

/** Tests. Pass null to use the device store again. */
export function setAppGroup(port: AppGroupPort | null): void {
  installed = port;
}

export const appDigest: Digest = (text) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
