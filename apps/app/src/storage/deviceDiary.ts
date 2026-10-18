// The device's account diaries: SQLCipher files (database.ts; database.web.ts
// refuses on web), per-account keys in SecureStore (this device only, never
// backed up) and the session epoch from the auth seam.
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { getV1SessionSnapshot } from '../auth/session.ts';
import { AccountDatabase } from './accountDatabase.ts';
import { deviceDiaryFiles } from './database';
import { createSecureKeyStore } from './keyStore.ts';

// TODO(S2, needs owner authorization: native code or a new package): iOS backup
// exclusion. Nothing here sets NSURLIsExcludedFromBackupKey, and no Expo API
// does; a config plugin or small native module must mark the diary directory
// (and the AsyncStorage directory that holds the import draft,
// spend/v1/importDraftStore.ts) as excluded. Until then iCloud and computer
// backups can include the encrypted diary file (never its key: restores open
// locked). Android is covered by `android.allowBackup: false` in app.json.
// See docs/implementation/sqlcipher-device-proof.md.
export function createDeviceAccountDatabase(): AccountDatabase {
  return new AccountDatabase({
    files: deviceDiaryFiles(),
    keys: createSecureKeyStore(SecureStore, Crypto.getRandomBytes, SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY),
    epoch: () => getV1SessionSnapshot().epoch,
  });
}
