# SQLCipher device proof (S2)

**Status: SKIPPED.** No native development build has been run in this environment. Everything below must pass on both an iOS and an Android development build before S2's native storage is reported complete. The local logic is tested against a real SQLite engine (`node:sqlite`) in `apps/app/src/storage/*.test.ts`. Those tests don't prove encryption, SecureStore, backups or process death.

## What the build uses

- **Database:** `expo-sqlite` (~58.0.13), built with SQLCipher. The `app.json` plugin entry is `["expo-sqlite", { "useSQLCipher": true }]`. `expo config --type introspect` shows it setting `expo.sqlite.useSQLCipher=true`.
- **Opening a diary** (`apps/app/src/storage/database.ts`):
  - It refuses to open unless `PRAGMA cipher_version` answers, so a diary is never stored unencrypted.
  - It keys with a raw 256-bit key (`PRAGMA key = "x'…'"`) and checks the key with a first read. Only "file is not a database" counts as a wrong key; other errors stay errors.
  - It sets `PRAGMA temp_store = MEMORY`, so no plaintext temporary file is written.
- **One keyed connection** (`serialDatabase.ts`): every statement, read unit and transaction runs on that connection, one at a time, with `BEGIN IMMEDIATE`, COMMIT and ROLLBACK issued directly. `withExclusiveTransactionAsync` is deliberately not used: it opens a second connection that never receives the key. With it, the first migration would write a plaintext database and every later write would fail.
- **Keys:** one random 256-bit key per account, stored in `expo-secure-store` as `gogospend.diary.v1.<account id>` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`. Keys are never in a backup or another device's keychain.
- **Backups:**
  - **Android:** `android.allowBackup: false`. The introspected manifest has `android:allowBackup="false"`.
    - That setting does not cover Android 12+ device-to-device transfer. Today the SQLite folder is excluded only because expo-secure-store's plugin adds data extraction rules that include shared preferences alone.
    - S2 still needs an explicit rule of its own. The device-transfer check below must confirm that no diary moves.
  - **iOS:** not done yet. The SQLite directory lives under the app's Documents/Library area, and no Expo API sets `NSURLIsExcludedFromBackupKey`. A small native step (a config plugin or module that marks the diary directory as excluded) is needed. Until then, iCloud and computer backups can include the encrypted diary file.
    - The key is a this-device-only keychain item. Encrypted backups include it too, but it restores only to the same device.
    - **Restore to the same device:** the diary opens normally.
    - **Restore to another device:** it opens as `key_missing` (locked), never as plaintext.
- **Web:** never keeps a diary. `database.web.ts` refuses with `LocalDiaryUnavailable`, and the web app stays online-only.

## Procedure

Run `runNativeStorageProof` from a developer-only entry point on each build. It uses the synthetic account `0f000000-0000-4000-8000-00000000f00f` and synthetic records, and reports pass, fail or manual per check. Record only those results, never file contents or keys.

1. `runNativeStorageProof('write')` creates the proof diary.
2. Force-quit the app (kill the process), relaunch, then run `runNativeStorageProof('verify-after-restart')`. The data must survive.
3. Run `runNativeStorageProof('write-large')`, which applies 2,000 groups in one transaction, and force-quit while it runs. Relaunch and run `verify-after-restart`: the diary must hold all of the write or none of it.
4. `runNativeStorageProof('checks')` covers:
   - encrypted at rest (the file header is not `SQLite format 3`);
   - a rejected key locks the diary;
   - a missing key locks it and keeps the file;
   - a failed migration rolls back;
   - a stale-epoch write is refused;
   - erase removes the diary and its key.
5. Manual checks:
   - **Android backup:** `adb shell bmgr backupnow co.gogocash.spend` (or Auto Backup) includes no app data.
   - **Android 12+ device-to-device transfer:** the new device gets no diary file.
   - **iOS:** once the exclusion step exists, a device backup has no diary file. Today, record that a backup restored to another device opens locked.
   - **Sign-out and account switch:** sign out, sign in as another account and back. The first account's diary reopens. A save started before the switch is refused, not shown as **Saved on device**.

## Results

| Build | Check | Result |
| --- | --- | --- |
| iOS development build | all of the above | SKIPPED (not run here) |
| Android development build | all of the above | SKIPPED (not run here) |
