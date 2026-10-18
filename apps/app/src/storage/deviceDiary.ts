// The device's account diaries: SQLCipher files (database.ts; database.web.ts
// refuses on web), per-account keys in SecureStore (this device only, never
// backed up) and the session epoch from the auth seam.
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

import { getV1SessionSnapshot } from '../auth/session.ts';
import { AccountDatabase } from './accountDatabase.ts';
import { deviceDiaryFiles } from './database';
import { createSecureKeyStore } from './keyStore.ts';

export function createDeviceAccountDatabase(): AccountDatabase {
  return new AccountDatabase({
    files: deviceDiaryFiles(),
    keys: createSecureKeyStore(SecureStore, Crypto.getRandomBytes, SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY),
    epoch: () => getV1SessionSnapshot().epoch,
  });
}
