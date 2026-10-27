# Phase 6A: Outside the app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Jotbun outside the app (spec §6.13, C13, D41): home and lock-screen widgets drawn from a snapshot the app writes, quick actions and app shortcuts, a share target that turns a bank e-slip into a slip draft in the inbox, and a Siri shortcut that queues a record for the outbox, all behind an `outside` redesign area until the owner approves them.

**Architecture:** Pure modules under `apps/app/src/wallet/outside/`, behind ports with fakes, hold every rule: the widget snapshot (display-ready faces, never a raw amount), the entry links and quick actions, the Siri drain into the outbox, and the shared-slip pipeline with its queue. They use installed packages only (`expo-file-system` for the app group, `expo-crypto`, expo-router's `+native-intent`). Each native surface is a thin adapter task waiting on the owner's package answer and the D33 ids; device checks are SKIPPED until both exist.

**Tech stack:** Expo SDK 58 (expo 58.0.12, react-native 0.88.0, expo-router 58.0.21, expo-file-system 58.0.9, expo-crypto 58.0.6, expo-secure-store 58.0.2, expo-constants ~58.0.12, all installed). Candidates for the owner, none in §4 (SDK 58 pins from `node_modules/expo/bundledNativeModules.json` or npm on 25 October 2026; the ranges resolve today to 58.0.23, 0.5.12 and 58.0.20): expo-widgets ~58.0.19 with @expo/ui ~58.0.19, expo-app-intents ~0.5.8 (alpha), expo-sharing ~58.0.18 (receive mode, experimental), expo-share-extension 5.0.6, expo-quick-actions 6.0.2, expo-dev-client ~58.0.13. Node's test runner and Vitest 4.1 with happy-dom through P2-T8's harness.

**Spec:** [docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md](../specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md): §8 phase 6's widgets, share extension, quick actions and Siri, from §6.13, §5.2's "Outside the app" row (boards `ox-widget-home`, `ox-widget-lock`, `ox-quick-actions`, `ox-share-sheet`, `ox-share-extension`, `ox-shortcut`), C13, D29, D35, D37, D41 and §7's `widget_added`, applying the controller's calls B9 and B19 to B21 and amendments A1 to A6, A10, A13, A24 and A32 to A36. It adds no server route, vault table or contract field.

**Shared files** (every edit additive and named in its task): `apps/app/package.json` and the lockfile (P6A-T8 to T12, each after its owner answer, merged one at a time as in P2); 1C-T7's `apps/app/app.config.js` (T7 composes over it; P6B-T18 and P6C also edit it); `apps/app/outsideConfig.js` (new in T7; T8 to T12 append), `apps/app/.gitignore` (T7), `apps/app/tsconfig.json` (T8); `app/_layout.tsx` (T3b), `app/+native-intent.tsx` (new in T4; P4's push taps may add a branch), `app/spend/add.tsx` and `src/wallet/add/AddTrayHost.tsx` (T4), `src/wallet/home/WalletHomeScreen.tsx` (T3a), `src/wallet/home/WalletShell.tsx` (T9), `src/wallet/lock/lockModel.ts` (T3a, only if needed); `src/config/featureFlags.ts` and its test (T3a, T13); `src/spend/v1/DeviceDiaryProvider.tsx`, `src/screens/redesign/account/PrivacyScreen.tsx` and 1C-T8's `src/screens/redesign/signin/SessionEndedScreen.tsx` (T3b); `src/analytics/events.ts` (T3b, T5; 1D's allow-list already holds `widget_added` and `source: siri`, R23); `src/ui/dateStep.ts` (T2); `src/dev/catalogue/wallet/index.ts` (T3a); `src/auth/betterAuthClient.ts` (T10); `en.json`, `th.json`, `catalogs.test.ts`, `src/wallet/copy/allCopy.ts` (T13, and T8, T10 or T12 landing after it); `.github/workflows/backend.yml` (T7); `docs/implementation/premium-progress.md` (receipts under `## P6A: Outside the app`). Paths under `src/` and `app/` are in `apps/app/`.

**Calls made in this plan** (the owner can overturn any; each task cites its own):
- **X1.** One `outside` redesign area gates every surface: while it is off, widgets get only the signed-out snapshot, nothing else is written, the drains wait and `/spend/shared` redirects to `/spend` (approved in P6A-T13).
- **X2.** The snapshot carries P2-T10's display text, never raw amounts; the lock face is masked under private mode or the Face ID lock (B21, D41), the home face under private mode.
- **X3.** Three entries: now; the next Bangkok midnight (nothing logged, that day's figures, none for a new month); the midnight after, asking to open Jotbun. The Android widget, with no timeline, names its day.
- **X4.** Home's ready model (P2-T24) writes the snapshot when it, private mode, the lock setting or the language changes.
- **X5.** The app group's `outside/account-v1.json` holds a marker (the first 16 hex characters of SHA-256 of `jotbun-outside-marker:<account id>`), the language and private mode; a Siri capture or queued share carries the marker, and another account's waits unread for its own account (A5, D37).
- **X6 (A5).** A session ended elsewhere (D37) empties the widgets, the account file and the quick actions and keeps the queues; the sign-out erase, a confirmed deletion and D37's confirmed erase of another account's records (1C-T8) also delete that account's queued captures and shares.
- **X7.** Outside links (`gogospend://outside/<action>`) map through `+native-intent` to `/spend` routes under P2-T33's lock without reading the session, so a link that starts the app keeps its target.
- **X8 (A4).** B20 on expo-app-intents' own queue (at-least-once, 100 kept): ids derive from the invocation, so a redelivery saves once; the record is dated the Bangkok day Siri took it, in the first open baht wallet.
- **X9 (A1, A13, A32, B9).** B19 as one pipeline: P3's QR check on the phone, the signed-in account, the slips area, AI consent (asked only on a read refusal, as P4 asks), then one live read through P4-T14's `sendOneSlip` with origin `share` (never `/v1/ai/slip`); in the iOS extension if P6A-T10's spike passes, else in the app (P6A-T11, Android's only path). A slip that must wait is queued in the app group (Q10).
- **X10.** `widget_added` once per widget size the system first reports, through a small inline native module, since expo-widgets 58.0.23 cannot list installed widgets.
- **X11.** `trackRecordSaved`'s `secondsToSave` becomes optional: Siri's `record_saved` omits a time the app cannot measure.
- **X12 (A2, A3, A10, A24, A32).** The scan quick action and the medium widget's scan link open P4-T19 (P4:scan-route) only while the `outside` area and P4's `useSlipsArea()` are on (P6B-T15's rollout included; the area also needs a QR decoder); `redirectSystemPath` checks `slipsAreaOn()`.

**Owner questions** (defaults the tasks follow, marked "default pending owner Qn"; R26):
- **Q1. Widgets:** expo-widgets ~58.0.19 with @expo/ui ~58.0.19, or @bacons/apple-targets 5.0.0 with react-native-android-widget 0.24.0. Default: nothing installed; P6A-T8 waits.
- **Q2. Siri:** expo-app-intents ~0.5.8 (alpha). Default: nothing installed; P6A-T12 waits.
- **Q3. Share:** expo-sharing ~58.0.18 receive mode (Android, B19's iOS fallback) and expo-share-extension 5.0.6 (iOS in place; SDK 58 UNVERIFIED, its table stops at SDK 54). Default: neither installed; P6A-T10 and P6A-T11 wait. Opening the host app from a share extension (both packages do) is not an API Apple supports: an App Review risk.
- **Q4. Quick actions:** expo-quick-actions 6.0.2. Default: nothing installed; P6A-T9 waits.
- **Q5. expo-dev-client ~58.0.13.** Default: not installed; device checks use `npx expo run:ios --device` and `npx expo run:android` debug builds.
- **Q6. The D33 ids** (bundle id, package, Apple team id, app group, keychain group). Default: `co.gogocash.jotbun.localcheck`, `co.gogocash.spend` (today's `app.json`), `group.co.gogocash.jotbun.localcheck`, no keychain sharing without a team id; nothing native built or signed until D33.
- **Q7. B19.** Default: as B19, decided by P6A-T10's spike.
- **Q8. B20.** Default: as B20, on expo-app-intents' queue (X8).
- **Q9. B21 and A6.** Default: as B21; home widgets follow private mode and mark amounts privacy-sensitive, so a locked phone's StandBy and Today View can redact them; masking home widgets whenever the Face ID lock is on is the owner's choice.
- **Q10. A shared slip waiting on the phone.** Default: in the app group only while it waits, at most 20, deleted once read or unread after 7 days, kept per account (X6).
- **Q11. ox-shortcut's after-state** (บันทึกแล้ว วันนี้ ฿45). Default: dropped, since nothing is saved until Jotbun opens (B20); Siri shows the amount and note, no category or wallet line.
- **Q12. Thai Siri phrases.** Default: Thai and English phrases ship; whether Siri accepts the Thai one is a device check.
- **Q13. The medium widget's two buttons.** Default: two links if @expo/ui's `Link` renders inside a widget (UNVERIFIED), else one tap target to today, a deviation for E2.
- **Q14. Siri on a locked phone.** Default: the intent needs an unlocked phone (`.requiresAuthentication`; Apple's default `.alwaysAllowed` lets anyone holding a locked phone queue records).
- **Q15. A Siri capture with no baht wallet open** (phase 5 allows other currencies). Default: it waits in the queue until one is open.

## Global Constraints

- **Packages (§4, handover §3):** none of this plan's native packages is in §4; a task needing one waits on its owner question, installs exactly the named pin after the answer, then runs `node --test scripts/ci/lockfile-bindings.test.mjs` and `npm run test:ops`, and can be skipped without breaking the plan. No lockfile regeneration with Linux bindings.
- **Platforms (C13):** Android gets the share target, app shortcuts and a home widget; lock-screen widgets and Siri are iOS only.
- **Widgets (§6.13, D41, B21):** a small snapshot the app writes; no amounts in private mode, and none on lock-screen faces while the Face ID lock is on.
- **Slips (D29, D35, B19):** a shared slip is read inside its upload request through P4-T6 (P4:slips-route) as a live read, never stored on a server, kept on the phone only while it waits (Q10), and becomes a slip draft, never a record.
- **Siri (B20):** a capture reaches the outbox only after Siri's confirmation, only for the account that spoke it (X5) and only into a baht wallet (Q15).
- **Money (§4):** satang strings through BigInt and P2-T10's `walletMoneyText`, `perDayText`, `HIDDEN_AMOUNT`; never a JS number.
- **Copy (§4, §5.1):** every new line is a draft in `apps/app/src/wallet/outside/outsideCopy.draft.ts` (`{ th, en }`; Vietnamese shows English) until its E2 approval: P6A-T13 moves the approved lines and keeps the table for the rest; a native task (T8, T10, T12) landing after T13 shows its lines at its own E2 checkpoint, then moves them as T13 does. P2's `common.*` lines come through P2's hook: `useDraftCopy(COMMON_COPY)` (P2-T3) until P2-T38 renames it; a task landing after P2-T38 calls `useWalletCopy()`. Tasks give the Thai (from the boards unless marked draft); each English line is the implementer's draft for E2 (P2's Q3) unless a test fixes it. No emojis, no U+2014 or U+2013, §5.1's voice.
- **Accessibility (§4):** controls at least 44 x 44 pt; text 4.5:1, graphics 3:1; AX5 without truncation; Thai spoken labels on every widget face, ฿ read as บาท.
- **Analytics (R23 to R25):** only `widget_added` and Siri's `record_saved`, through 1D-T1's API, once per action in its rule; never an amount, note, payee or name.
- **Logging:** nothing from the snapshot, the account file, a queue or a capture is logged; adapters swallow native failures and keep the last good state.
- **Process (handover §4):** behavioural RED behind typed stubs, GREEN, a mutation check, the app gate, the receipt, a local commit, an independent review. No cloud resource; hosted, native and device checks are SKIPPED.
- **Runs:** `unit <files>` is `npm run test:unit -w gogospend-app -- <files>` and `render <files>` is `npm run test:render -w gogospend-app -- <files>`; a path that does not start with `src/` is under `src/wallet/outside/`, the others are relative to `apps/app/`. Each Step 2 runs the files it names and expects every new case to fail on its assertion against the typed stubs, none on a missing module; each Step 4 runs them again and expects PASS.
- **The app gate** (repo root): `npm run typecheck:app && npm run typecheck:routes -w gogospend-app && npm run test:app && npm run test:unit && npm run test:render -w gogospend-app && npm run export:web -w gogospend-app -- --max-workers 2 && git diff --check`, plus `npm run check:native -w gogospend-app` from P6A-T7 on.
- **Pure modules stay pure** (P2's rule): a module with a Node test imports by relative path, loads no React, react-native or native package at the top level, and reaches native code through a port or a lazy `import()`.

## Review Focus

1. **An amount on a locked phone.** With the Face ID lock or private mode on, no lock-screen face holds an amount digit, even right after the lock is turned on over a mounted Home; home faces mark amounts privacy-sensitive for StandBy and the Today View (P6A-T2, P6A-T3a; P6A-T8's device check).
2. **Yesterday shown as today.** At 00:00 Bangkok the widget shows a new day with nothing logged, and on the 1st it drops last month's budget figures; the Android face and the today quick action name their day (P6A-T2, P6A-T4).
3. **A Siri capture saved twice, or into someone else.** A redelivery saves once; another account's capture waits unread for its own account; signed out, everything waits (P6A-T5).
4. **A shared picture that should never leave the phone.** No Thai bank slip QR, no decoder, signed out, the slips area off or AI consent refused: nothing is sent (P6A-T6a).
5. **The day a capture belongs to.** Siri at 23:58 Bangkok, drained the next morning, is dated the day it was spoken (P6A-T5).
6. **A cold start.** A widget tap or a share that launches Jotbun keeps its target while the session hydrates, a share keeps its slip while the diary opens, and a cold start never empties the widgets or the account file (P6A-T4, P6A-T6b, P6A-T3b).

## File structure

```
apps/app/src/wallet/outside/   T1 ids, app group, account file; T2 snapshot, draft copy; T3a bridge; T3b erase, widget sizes;
                               T4 routes, quick actions; T5 Siri drain; T6a shared slip, queue; T6b screens; T8 to T12 adapters; T13 copy.ts
apps/app/app/+native-intent.tsx T4; app/spend/shared.tsx T6b; outsideConfig.js, scripts/check-native-config.mjs T7 (over 1C-T7's app.config.js)
apps/app/widgets/, native/widgets/ T8; index.share.js T10; native/intents/ T12; src/dev/catalogue/wallet/outsideSections.tsx T3a, T6b
```

---

### Task P6A-T1: Outside ids, the app group store and the account file

**Starts after:** base

**Delivers:** P6A:native-ids

**Files:**
- Create: `apps/app/src/wallet/outside/outsideIds.ts`, `appGroup.ts`, `deviceAppGroup.ts` (file system injected), `accountFile.ts` (all pure), and `appOutside.ts` (the wiring: expo-constants, react-native's `Platform`, a lazy `expo-file-system`, expo-crypto)
- Test: `apps/app/src/wallet/outside/outsideIds.test.ts`, `appGroup.test.ts`, `deviceAppGroup.test.ts`, `accountFile.test.ts` (Node)

**Interfaces:**
- Consumes: expo-file-system 58.0.9's `File` (`text()`, `write()`, `delete()`, `exists`, `copy()`, `uri`), `Directory` (`create()`, `exists`, `list()`) and `Paths` (`document`, `appleSharedContainers: Record<string, Directory>`), from the installed types; expo-crypto 58.0.6's `digestStringAsync(CryptoDigestAlgorithm.SHA256, text)` (hex by default).
- Produces:
  ```ts
  // outsideIds.ts
  export type OutsideIds = { iosBundleId: string; androidPackage: string; appGroup: string; keychainGroup: string | null; scheme: string };
  export const TEMPORARY_IDS: OutsideIds;   // 'co.gogocash.jotbun.localcheck', 'co.gogocash.spend', 'group.co.gogocash.jotbun.localcheck', null, 'gogospend' (default pending owner Q6)
  export const IOS_BUNDLE_ID_PATTERN: RegExp;   // /^[A-Za-z][A-Za-z0-9-]*(\.[A-Za-z0-9-]+)+$/
  export const ANDROID_PACKAGE_PATTERN: RegExp;   // /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/
  export function outsideIdsFrom(extra: unknown): OutsideIds;   // extra.outside field by field; a missing or malformed field keeps its default
  export type OutsideAction = 'record' | 'today' | 'scan' | 'tell';
  export function outsideLink(scheme: string, action: OutsideAction): string;   // `${scheme}://outside/${action}`
  // appGroup.ts
  export type AppGroupPort = {
    readonly available: boolean;
    readText(name: string): Promise<string | null>;
    writeText(name: string, text: string): Promise<void>;
    remove(name: string): Promise<void>;
    list(folder: string): Promise<readonly string[]>;   // file names directly inside
    copyIn(fromUri: string, name: string): Promise<boolean>;   // false when the source cannot be read
    uriOf(name: string): string | null;
  };
  export const OUTSIDE_FILES: { readonly account: 'outside/account-v1.json'; readonly shares: 'outside/shares-v1.json'; readonly shareFolder: 'outside/shares' };
  export function isSafeName(name: string): boolean;   // /^outside(\/[a-z0-9][a-z0-9-]*)+(\.(json|jpg|png|webp))?$/
  export const noAppGroup: AppGroupPort;   // unavailable: reads null, writes resolve, copyIn false
  export function memoryAppGroup(): AppGroupPort & { files: Map<string, string> };   // tests; copyIn keeps the source uri as the text
  // deviceAppGroup.ts
  export type FileSystemLike = Pick<typeof import('expo-file-system'), 'File' | 'Directory' | 'Paths'>;
  export function deviceAppGroup(ids: OutsideIds, platform: 'ios' | 'android' | 'web', fs: FileSystemLike): AppGroupPort;
  // accountFile.ts
  export type Digest = (text: string) => Promise<string>;   // lower-case hex SHA-256
  export function accountMarker(accountId: string, digest: Digest): Promise<string>;   // first 16 characters of digest('jotbun-outside-marker:' + accountId)
  export type AccountFile = { v: 1; marker: string; locale: 'th' | 'en'; hidden: boolean };
  export function parseAccountFile(text: string | null): AccountFile | null;   // exactly these keys and a /^[0-9a-f]{16}$/ marker, else null
  export function writeAccountFile(group: AppGroupPort, file: AccountFile): Promise<void>;
  export function readAccountFile(group: AppGroupPort): Promise<AccountFile | null>;
  // appOutside.ts
  export function appOutsideIds(): OutsideIds;   // outsideIdsFrom(Constants.expoConfig?.extra), read once
  export function getAppGroup(): AppGroupPort;   // deviceAppGroup(appOutsideIds(), Platform.OS, expo-file-system), made once
  export function setAppGroup(port: AppGroupPort | null): void;   // tests; null restores the device store
  export const appDigest: Digest;
  ```
- `deviceAppGroup`: the iOS root is `fs.Paths.appleSharedContainers[ids.appGroup]` (absent before P6A-T7's entitlement: unavailable, nothing written); Android's is `fs.Paths.document`; the web gets `noAppGroup`. An unsafe name is refused with a `TypeError`; writes create missing folders; a failed read or copy answers `null` or `false`.
- `outsideIdsFrom` accepts a bundle id matching `IOS_BUNDLE_ID_PATTERN`, a package matching `ANDROID_PACKAGE_PATTERN`, an app group of `group.` plus a bundle id, a keychain group `/^[A-Z0-9]{10}\.[A-Za-z0-9.-]+$/` (else `null`) and a scheme `/^[a-z][a-z0-9+.-]*$/`.

- [ ] **Step 1: Write the typed stubs, then the failing tests.**
  - `outsideIds.test.ts`: `with no extra the temporary ids apply`; `each valid field overrides its default and a malformed one keeps it` (`{ outside: { iosBundleId: 'th.co.jotbun.app', appGroup: 'group.th.co.jotbun.app', keychainGroup: 'ABCDE12345.th.co.jotbun.app.shared', scheme: '../x' } }` keeps the first three and gives `scheme: 'gogospend'`); `a keychain group needs a ten-character team id` (`'ABCDE1234.th.co.jotbun'` gives `null`); `the Android package allows _ and refuses -` (`'th.co.jotbun_app'` is kept, `'th.co.jotbun-app'` keeps the default); `outsideLink('gogospend', 'record')` is `'gogospend://outside/record'`.
  - `appGroup.test.ts`: `the memory store reads what it wrote, lists a folder and removes`; `unsafe names are refused` (`writeText('outside/../secret', 'x')` rejects with `TypeError`; `isSafeName('/etc/x')` and `isSafeName('outside/a/../b')` are false; `isSafeName('outside/shares/3f2a-91.jpg')` is true); `noAppGroup reads nothing and accepts writes`.
  - `deviceAppGroup.test.ts` (a fake `FileSystemLike` recording uris): `on iOS the app group container is the root`; `on iOS without the group nothing is available and nothing is written`; `on Android the documents folder is the root`; `on the web nothing is available`; `a missing folder is created before a write`; `a copy that fails answers false`; `an unsafe name is refused before any file call`.
  - `accountFile.test.ts`: `the marker is the first 16 hex characters of SHA-256 over the labelled account id` (expected value from `node:crypto`'s `createHash('sha256')` over `'jotbun-outside-marker:00000000-0000-4000-8000-0000000000aa'`); `two accounts get different markers`; `the file has exactly v, marker, locale and hidden and never the account id` (`parseAccountFile` refuses an extra key, a 15-character marker and `locale: 'vi'`).
- [ ] **Step 2: Run them and see them fail.** unit `outsideIds.test.ts appGroup.test.ts deviceAppGroup.test.ts accountFile.test.ts`. Record the counts.
- [ ] **Step 3: Implement** the five modules.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Skip `isSafeName` in the device store's `writeText`: its unsafe-name test fails. Return the whole digest: the marker test fails. Root iOS at `Paths.document`: the iOS test fails. Check the package with the iOS pattern: the Android test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the outside ids, an app group store over expo-file-system and an account file that names no account"`

---

### Task P6A-T2: The widget snapshot

**Starts after:** P2-T3, P2-T10

**Files:**
- Create: `apps/app/src/wallet/outside/widgetSnapshot.ts` (pure), `outsideCopy.draft.ts` (data), `useOutsideCopy.ts`
- Modify: `apps/app/src/ui/dateStep.ts` (export `monthName` and `shortDayName`)
- Test: `apps/app/src/wallet/outside/widgetSnapshot.test.ts`, `outsideCopy.test.ts` (Node); cases in `apps/app/src/ui/dateStep.test.ts`

**Interfaces:**
- Consumes: `walletMoneyText`, `perDayText`, `HIDDEN_AMOUNT`, `spokenMoney` (P2-T10); `DraftTable`, `WalletT`, `tableT`, `useDraftCopy`, `COMMON_COPY` (P2-T3), or `useWalletCopy` (P2-T38); `BudgetPace`, `budgetPace` (base `src/spend/v1/redesign/budgetPace.ts`); `useActiveLocale` (base `src/i18n/useCopy.ts`).
- Produces:
  ```ts
  // outsideCopy.draft.ts: every P6A line until its E2 approval
  export const OUTSIDE_DRAFT = { 'outside.spentToday': { th: 'ใช้วันนี้', en: 'Spent today' } /* … */ } as const satisfies DraftTable;
  // useOutsideCopy.ts (P6A-T13 switches both to the catalogs)
  export function useOutsideCopy(): WalletT;   // tableT(OUTSIDE_DRAFT, useActiveLocale())
  export function outsideT(locale: 'th' | 'en' | 'vi'): WalletT;   // tableT(OUTSIDE_DRAFT, locale), for code outside React (eraseOutside)
  // dateStep.ts
  export function monthName(month: string, locale: DateLocale, form: 'short' | 'long'): string;   // '2026-10' gives 'ต.ค.' or 'ตุลาคม', 'Oct' or 'October'
  export function shortDayName(date: string, locale: DateLocale): string;   // '2026-10-24' gives 'ส. 24' or 'Sat 24'
  // widgetSnapshot.ts
  export type WidgetFacts = { now: Date; todayCount: number; todayOutMinor: Minor; pace: BudgetPace | null; hidden: boolean; lockOn: boolean; locale: 'th' | 'en' | 'vi' };
  export type WidgetFace = {
    masked: boolean; dayLabel: string; outLabel: string; out: string; count: string; today: string;
    sideLabel: string | null; side: string | null; over: boolean;
    gaugeLabel: string; gaugeText: string | null; gaugeFraction: number | null;   // 0 to 1, three decimals
    spoken: { small: string; inline: string; gauge: string; rectangular: string };
  };
  export type WidgetLinks = { record: string; today: string; scan: string | null };
  export type WidgetLabels = { record: string; scan: string; log: string };   // the link words, since a widget layout cannot read copy (P6A-T8)
  export type WidgetEntry = { from: number; day: string; kind: 'today' | 'stale' | 'signed_out'; home: WidgetFace | null; lock: WidgetFace | null; prompt: string | null };
  export type WidgetSnapshot = { v: 1; links: WidgetLinks; labels: WidgetLabels; entries: WidgetEntry[] };
  export type WidgetFamily = 'systemSmall' | 'systemMedium' | 'accessoryInline' | 'accessoryCircular' | 'accessoryRectangular';
  export function buildWidgetSnapshot(facts: WidgetFacts, links: WidgetLinks, t: WalletT, spoken: (minor: Minor) => string): WidgetSnapshot;
  export function signedOutSnapshot(now: Date, links: WidgetLinks, t: WalletT): WidgetSnapshot;
  export function entryAt(snapshot: WidgetSnapshot, nowMs: number): WidgetEntry;   // the newest entry whose from <= nowMs, else the first
  export function faceFor(entry: WidgetEntry, family: WidgetFamily): WidgetFace | null;   // system families: home; accessory: lock
  export function nextBangkokMidnight(nowMs: number): number;   // the next 00:00 Asia/Bangkok (UTC+7, no daylight saving), strictly after nowMs
  export function sameSnapshot(a: WidgetSnapshot, b: WidgetSnapshot): boolean;   // equal apart from entries[0].from
  ```
  `t` is `useOutsideCopy()`'s; `spoken` is `(minor) => spokenMoney(minor, commonT)` (`132 บาท`), `commonT` being P2's hook (Global Constraints, Copy) for P2-T3's `common.baht`, `common.satang` and `common.minus`.
- The faces (X2; ox-widget-home, ox-widget-lock): `th` reads the Thai lines and words, `en` and `vi` the English ones. `dayLabel` is `shortDayName` of the entry's day. `out` is `walletMoneyText(todayOutMinor)`; with no budget (`pace` null) there is no side line or gauge figure; over budget the side is `outside.overBy` with `walletMoneyText(overByMinor)` and `over: true`; else `outside.leftToday` with `outside.about` around `perDayText(perDayMinor)`, and `spoken` gets that whole baht (`perDayMinor` rounded down to a multiple of 100). The gauge label is `outside.budgetMonth` with the short month, its percent `estimated × 100 ÷ limit` rounded down in BigInt, its fraction that ratio capped at 1. A masked face shows `HIDDEN_AMOUNT` for `out` and any side value, keeps the side labels and drops the gauge figures. Spoken: `small` and `rectangular` join `outside.spokenToday` with `outside.spokenLeft` or `outside.spokenOver`; `inline` is the side's line, else `outside.spokenToday`; `gauge` is `outside.spokenGauge` with the long month, or `outside.noBudget`; masked faces use `outside.spokenHidden` and `outside.spokenGaugeHidden`. `home` is masked when `hidden`, `lock` when `hidden || lockOn` (D41, B21; default pending owner Q9). The money text is P2-T10's baht text; once phase 5's home-currency text exists the faces follow it.
- The entries (X3; each `day` is the Bangkok date it starts on): `[0]` from `now`; `[1]` from `nextBangkokMidnight(now)` with count 0 and out `'0'`, its side line recomputed when that day is in the same month (over stays over by the same amount; else `leftMinor ÷ (daysLeft − 1)` rounded down) and the gauge kept, or, when it starts a new month, no side line and no gauge figure under the new month's name; `[2]` from the midnight after that, `kind: 'stale'`, no faces, `prompt` `outside.stale`. `signedOutSnapshot` has one `signed_out` entry with `outside.signedOut`. Both snapshots carry `labels`: `outside.record`, `outside.scan` and `outside.log` read through `t`.
- Copy: `outside.spentToday` ใช้วันนี้ (en: Spent today); `outside.count` {count} รายการ (en: {count} records); `outside.today` วันนี้ · {count} รายการ; `outside.leftToday` เหลือวันนี้; `outside.about` ≈ {amount}; `outside.overBy` เกินงบไป; `outside.budgetMonth` งบ {month} (en: {month} budget); `outside.percent` {percent}%; `outside.spokenToday` วันนี้ใช้ {amount} {count} รายการ; `outside.spokenLeft` เหลือวันนี้ประมาณ {amount}; `outside.spokenOver` เกินงบไป {amount}; `outside.spokenGauge` งบเดือน{month} ใช้ไป {percent} เปอร์เซ็นต์; `outside.spokenGaugeHidden` งบเดือนนี้ ซ่อนอยู่; `outside.spokenHidden` วันนี้ {count} รายการ ยอดเงินซ่อนอยู่; `outside.noBudget` ยังไม่ได้ตั้งงบ (draft); `outside.record` จดรายจ่าย; `outside.scan` สแกนสลิป; `outside.log` จด; `outside.stale` เปิด Jotbun เพื่อดูยอดวันนี้ (draft); `outside.signedOut` เปิด Jotbun เพื่อเริ่มจด (draft); `outside.widgetName` Jotbun วันนี้ (draft).

- [ ] **Step 1: Write the typed stubs, then the failing tests.** Fixtures: a `BudgetDto` for `2026-10` with `overall_limit_minor` `'1800000'` and no category limits; `budgetPace` on `2026-10-24` (8 days left) with month spending `'1336000'` (left `464000`, per day `58000`, 74 percent); `todayOutMinor: '13200'`, `todayCount: 3`; `now` `2026-10-24T13:00:00Z` (20:00 Bangkok); `spoken` records what it is handed and gives whole baht as `'<n> บาท'`.
  - `the home face reads as ox-widget-home`: ใช้วันนี้, ฿132, 3 รายการ, วันนี้ · 3 รายการ, เหลือวันนี้, ≈ ฿580, งบ ต.ค., 74%; `spoken.rectangular` วันนี้ใช้ 132 บาท 3 รายการ เหลือวันนี้ประมาณ 580 บาท; `spoken.gauge` งบเดือนตุลาคม ใช้ไป 74 เปอร์เซ็นต์.
  - `with the Face ID lock on, the lock face holds no amount, private mode or not` (Review Focus 1, B21): `lockOn: true, hidden: false`; `lock.out` and `lock.side` are `฿••••`, `lock.gaugeText` and `lock.gaugeFraction` null, `home.out` ฿132; `JSON.stringify(snapshot.entries.map((entry) => entry.lock))` contains none of `132`, `580`, `662`, `74`, `13,360`, `4,640`, `18,000`.
  - `private mode masks both faces and keeps the count` (D41): `spoken.rectangular` วันนี้ 3 รายการ ยอดเงินซ่อนอยู่, `spoken.gauge` งบเดือนนี้ ซ่อนอยู่.
  - `over budget says เกินงบไป ฿420 and, masked, keeps the words` (spending `'1842000'`); `no budget has no side line and no gauge figure` (`spoken.gauge` ยังไม่ได้ตั้งงบ).
  - `after midnight the widget shows a new day with nothing logged` (Review Focus 2): `entries[1].from === Date.parse('2026-10-24T17:00:00Z')`, `day` `2026-10-25`, ฿0, 0 รายการ, ≈ ฿662 (464000 ÷ 7), 74%; `spoken` was handed `'66200'`, the whole baht the face shows, never `'66285'`.
  - `each face names its day`: entry 0's faces say ส. 24, entry 1's อา. 25 (`Sat 24`, `Sun 25` in English).
  - `on the month's last evening the next entry drops the budget figures` (`2026-10-31`, `now` `2026-10-31T13:00:00Z`): `entries[1].day` `2026-11-01`, no side line, no gauge figure, `gaugeLabel` งบ พ.ย.
  - `the second midnight asks to open Jotbun` (`entries[2]` from `Date.parse('2026-10-25T17:00:00Z')`, stale, no faces).
  - `nextBangkokMidnight`: `2026-10-24T16:59:59.999Z` gives `2026-10-24T17:00:00.000Z`; `2026-10-24T17:00:00.000Z` gives `2026-10-25T17:00:00.000Z`; `2026-12-31T20:00:00.000Z` gives `2027-01-01T17:00:00.000Z`.
  - `entryAt picks the newest started entry, else the first`; `faceFor gives system families the home face and accessory families the lock face`; `Vietnamese reads the English lines` (Spent today, Oct budget, 3 records); `a signed-out snapshot has no figures`; `sameSnapshot ignores only the first entry's time`; `both snapshots carry the link words in the person's language` (`labels` จดรายจ่าย, สแกนสลิป, จด in `th`, and in `en` and `vi` the draft table's English, signed out too).
  - `outsideCopy.test.ts`: `every outside line has Thai and English with the same placeholders, no emoji and no dash punctuation, under an outside. key` (P2-T3's checks over `OUTSIDE_DRAFT`, with `outside.percent` and `outside.about` as its Latin lines). `dateStep.test.ts`: `monthName gives short and long names in Thai and English`; `shortDayName gives ส. 24 and Sat 24`.
- [ ] **Step 2: Run them and see them fail.** unit `widgetSnapshot.test.ts outsideCopy.test.ts src/ui/dateStep.test.ts`. Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with `dateStep.test.ts` whole.
- [ ] **Step 5: Mutation check.** Mask the lock face only in private mode: the B21 test fails. Compute tomorrow's figure with today's days left: the midnight test fails (฿580). Hand `spoken` the per-day satang: the midnight test fails. Keep the budget figures across a month end: the last-evening test fails. Write `labels` in Thai whatever the language: the link-words test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the widget snapshot: display-ready faces, a lock face without amounts and entries that roll over at Bangkok midnight"`

---

### Task P6A-T3a: The outside bridge: the snapshot and the account file from Home

**Starts after:** P2-T8, P2-T24, P2-T33, P6A-T1, P6A-T2

**Files:**
- Create: `apps/app/src/wallet/outside/widgetPort.ts`, `homeFacts.ts` (pure), `OutsideBridge.tsx`, `WidgetFacesPreview.tsx`
- Modify: `apps/app/src/config/featureFlags.ts` and its test (`'outside'` joins `RedesignArea`, not `APPROVED`); `apps/app/src/wallet/home/WalletHomeScreen.tsx` (P2-T24: one `<OutsideBridge model={…} />` given Home's `homeModel(...)` result when its `kind` is `ready`); `apps/app/src/wallet/lock/lockModel.ts` (only if P2-T33 keeps `LockGate`'s reader of `LOCK_NAME` private: export it, unchanged)
- Catalogue: `apps/app/src/dev/catalogue/wallet/outsideSections.tsx` (`bw-ox-widgets`, `bw-ox-widgets-private`, `bw-ox-widgets-locked`), spread into `index.ts`
- Test: `apps/app/src/wallet/outside/homeFacts.test.ts` (Node); `OutsideBridge.render.test.tsx`; one case in `featureFlags.test.ts`

**Interfaces:**
- Consumes: `HomeModel` (base `homeModel.ts`); `usePrivateMode`, `spokenMoney` (P2-T10); `useDraftCopy`, `COMMON_COPY`, `walletDeviceStore`, `DiaryView.accountId` (P2-T3); `useWalletCopy` (P2-T38); `LOCK_NAME`, `LockGate`'s reader, `LockSetupScreen`, `fakeLocalAuth` (P2-T33); `mountWallet`, `WALLET_SECTIONS` (P2-T8); expo-router's `useFocusEffect`; P6A-T1 and P6A-T2.
- Produces:
  ```ts
  // widgetPort.ts
  export type WidgetSize = 'small' | 'medium' | 'large' | 'lock_screen';   // 1D-T1's widget_size values
  export type WidgetPort = { write(snapshot: WidgetSnapshot): Promise<void>; installedSizes(): Promise<readonly WidgetSize[] | null> };
  export const noWidgets: WidgetPort;   // write resolves; installedSizes answers null
  export function fakeWidgets(sizes?: readonly WidgetSize[] | null): WidgetPort & { written: WidgetSnapshot[] };
  export function getAppWidgets(): WidgetPort;   // noWidgets until P6A-T8
  export function setAppWidgets(port: WidgetPort | null): void;   // tests and P6A-T8
  // homeFacts.ts
  export function widgetFacts(model: Extract<HomeModel, { kind: 'ready' }>, input: { now: Date; hidden: boolean; lockOn: boolean; locale: 'th' | 'en' | 'vi' }): WidgetFacts;
  // OutsideBridge.tsx, WidgetFacesPreview.tsx
  export function OutsideBridge(props: { model: Extract<HomeModel, { kind: 'ready' }>; now?: () => Date }): JSX.Element | null;
  export function WidgetFacesPreview(props: { snapshot: WidgetSnapshot }): JSX.Element;   // catalogue only: entry 0's five families in React Native views, for E2
  ```
- `widgetFacts`: `todayCount` is `model.today.rows.length` (Home's today row: records and drafts); `todayOutMinor` is `model.today.totals.confirmed.outMinor` plus `.waiting.outMinor` (checking drafts never added, as `budgetPace` rules); `pace` is `model.budget.pace`, or null when its state is `no_budget`.
- The bridge (X1, X4, X5), only with the `outside` area on: builds the snapshot from `widgetFacts` (`usePrivateMode().hidden`; the lock read as `LockGate` reads `LOCK_NAME`, never by comparing a raw value; `useActiveLocale()`; `spoken` as P6A-T2 says) with links from `outsideLink(appOutsideIds().scheme, …)` and `scan: null`, and writes it only when `sameSnapshot` says it changed. It reads the lock again when Home regains focus (`useFocusEffect`) and on every `AppState` change, `inactive` and `background` included (B21, Review Focus 1). While the diary names an account it writes the account file (`accountMarker(view.accountId, appDigest)`, `vi` as `en`, `hidden`).

- [ ] **Step 1: Write the typed stubs, then the failing tests.**
  - `homeFacts.test.ts`: `today's money out adds waiting drafts and never checking ones`.
  - `OutsideBridge.render.test.tsx` (`EXPO_PUBLIC_REDESIGN=wallet,outside`, `fakeWidgets`, `memoryAppGroup` through `setAppGroup`, fake resources with three records today worth ฿132 and the October budget; both modes, `th` and `en`): `Home writes one snapshot whose faces match its today and budget` (`home.out` ฿132, `count` 3 รายการ, and through the real `spokenMoney` `home.spoken.rectangular` วันนี้ใช้ 132 บาท 3 รายการ เหลือวันนี้ประมาณ 580 บาท); `a save over Home writes a new snapshot, and an unchanged Home writes nothing more`; `the eye masks both faces, and the Face ID lock masks the lock face only` (the lock turned on through `LockSetupScreen` with `fakeLocalAuth(['success'])`); `turning the lock on in settings masks the lock face without remounting Home` (Review Focus 1: Home mounted once, `/settings/lock` pushed over it, the lock turned on, back: the next snapshot's lock faces hold `฿••••`); `going to the background right after turning the lock on writes the masked snapshot` (an `inactive` through the spied `AppState` listener, before any return to Home); `with the outside area off nothing is written`; `the account file names the account by its marker, the language and private mode, never by its id`.
  - `featureFlags.test.ts`: `outside is off by default and on when named or with all`. The catalogue suite renders the three sections; the private and locked ones show no digit of an amount.
- [ ] **Step 2: Run them and see them fail.** unit `homeFacts.test.ts src/config/featureFlags.test.ts`; render `OutsideBridge.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement**, with the one-line edits.
- [ ] **Step 4: Run them and see them pass,** with `WalletHome.render.test.tsx` whole.
- [ ] **Step 5: Mutation check.** Write on every render: the unchanged-Home test fails. Read the lock at mount only: both lock-change tests fail.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Write the widget snapshot and the account file from Home, masking the lock face as soon as the lock turns on"`

---

### Task P6A-T3b: Emptying the outside when a session ends, and `widget_added`

**Starts after:** 1C-T5, 1C-T8, 1D-T1, P6A-T3a

**Files:**
- Create: `apps/app/src/wallet/outside/widgetSizes.ts` (pure), `eraseOutside.ts`, `OutsideRoot.tsx`
- Modify: `apps/app/app/_layout.tsx` (one `<OutsideRoot />` beside `<LocaleUpkeep />`); `apps/app/src/spend/v1/DeviceDiaryProvider.tsx` (`eraseWithDiary(accountId)` also awaits `eraseOutside({ mode: 'erase', accountId }).catch(() => undefined)`); `apps/app/src/screens/redesign/account/PrivacyScreen.tsx` (beside P2-T3's `eraseAccountKept`, after `settleDeviceCopy` answers `'erased'`, the same call with the account id read before settling); 1C-T8's `apps/app/src/screens/redesign/signin/SessionEndedScreen.tsx` (once `mayEraseOtherAccount` has let `eraseAccount(previousAccountId)` resolve, it also awaits `forgetOutsideQueues(previousAccountId).catch(() => undefined)`); `OutsideBridge.tsx` (`widget_added`); `apps/app/src/analytics/events.ts` (`trackWidgetAdded`)
- Test: `apps/app/src/wallet/outside/widgetSizes.test.ts` (Node); `OutsideRoot.render.test.tsx`; cases in `OutsideBridge.render.test.tsx`, `DeviceDiaryProvider.render.test.tsx`, `PrivacyScreen.render.test.tsx` and `SessionEndedScreen.render.test.tsx`

**Interfaces:**
- Consumes: `getCredentialProvider` (base `src/auth/session.ts`), 1C-T5's `endedReason()`; 1C-T8's `SessionEndedScreen` (its erase passes 1C-T6's `mayEraseOtherAccount`); `trackClientEvent`, `recordAnalytics` (1D-T1); `signedOutSnapshot`, `outsideT` (P6A-T2); P6A-T1 and P6A-T3a.
- Produces:
  ```ts
  // widgetSizes.ts
  export const WIDGET_SIZE_ORDER: readonly WidgetSize[];   // small, medium, large, lock_screen
  export const WIDGETS_SEEN_NAME = 'outside-widgets-seen';   // device store, a JSON array
  export function newWidgetSizes(seen: readonly WidgetSize[], installed: readonly WidgetSize[]): WidgetSize[];   // installed and not seen, in order, each once
  // eraseOutside.ts, OutsideRoot.tsx
  export type EraseMode = { mode: 'ended' } | { mode: 'erase'; accountId: string };
  export type OutsideDeps = { group?: AppGroupPort; widgets?: WidgetPort; now?: Date; locale?: 'th' | 'en' | 'vi'; digest?: Digest };
  export function eraseOutside(input: EraseMode, deps?: OutsideDeps): Promise<void>;   // the prompt in Thai unless a caller knows the language
  export function forgetOutsideQueues(accountId: string, deps?: OutsideDeps): Promise<void>;   // what P6A keeps for that account outside its diary (the queues by its marker); never throws
  export function OutsideRoot(): null;
  // events.ts (1D-T1's file)
  export function trackWidgetAdded(p: { size: WidgetSize }): void;   // widget_added { widget_size }
  ```
- `eraseOutside` (X6): both modes write `signedOutSnapshot` (through `outsideT`) and remove the account file. `erase` (the sign-out erase, a confirmed deletion) also removes `WIDGETS_SEEN_NAME` and runs `forgetOutsideQueues(accountId)`; `ended` keeps the queues for their own account (A5). `forgetOutsideQueues` forgets nothing yet: P6A-T5 adds the account's queued captures, P6A-T6a its shares and P6A-T10 the extension's salt copy. D37's confirmed erase of another account's records (1C-T8) runs it for that account.
- `OutsideRoot` (D37, A5): with no provider installed it does nothing; otherwise it subscribes and calls `eraseOutside({ mode: 'ended' })`, in the active language, only when the snapshot moves into `locked` or `reauth_required` while `endedReason()` is not null. The provider's first `signed_out`, `hydrating`, a `hydrate_empty` start (a background launch with a locked keychain) and a `locked` record without a cookie erase nothing; a sign-out and a deletion erase through `eraseWithDiary` and `PrivacyScreen`.
- The bridge (X10): at mount and each return to `active` it sends one `trackWidgetAdded` per size `newWidgetSizes` returns from `installedSizes()`, then stores the union under `WIDGETS_SEEN_NAME`.

- [ ] **Step 1: Write the typed stubs, then the failing tests.**
  - `widgetSizes.test.ts`: `a size is new once` (`newWidgetSizes(['small'], ['lock_screen', 'small', 'lock_screen'])` is `['lock_screen']`).
  - `OutsideRoot.render.test.tsx` (a fake provider driven through its states, `fakeWidgets`, `memoryAppGroup` holding an account file and `outside/shares-v1.json`): `a cold start that hydrates to active erases nothing` (Review Focus 6: `signed_out`, `hydrating`, then `active`: nothing written, the account file kept); `a launch whose store cannot be read erases nothing` (`hydrate_empty`); `a locked record without an ended reason erases nothing`; `with no provider nothing is erased`; `a session ended elsewhere empties the outside once and keeps the queues` (`reauth_required` with `signed_out_elsewhere`: the last snapshot is signed out, the account file is gone, `outside/shares-v1.json` is untouched; a second notice writes nothing more).
  - `OutsideBridge.render.test.tsx`: `a widget size seen for the first time sends one widget_added, and nothing carries an amount` (`fakeWidgets(['small', 'lock_screen'])`: two events; a remount sends none; `JSON.stringify(sent)` has no `132`).
  - `DeviceDiaryProvider.render.test.tsx`: `the sign-out erase leaves the signed-out snapshot and no account file`. `PrivacyScreen.render.test.tsx`: `a confirmed deletion empties the outside; a refused one keeps it`. `SessionEndedScreen.render.test.tsx`: `a confirmed erase of another account forgets that account's outside queues once, and keep forgets nothing` (`forgetOutsideQueues` mocked).
- [ ] **Step 2: Run them and see them fail.** unit `widgetSizes.test.ts`; render `OutsideRoot.render.test.tsx OutsideBridge.render.test.tsx src/spend/v1/DeviceDiaryProvider.render.test.tsx src/screens/redesign/account/PrivacyScreen.render.test.tsx src/screens/redesign/signin/SessionEndedScreen.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement**, with the edits.
- [ ] **Step 4: Run them and see them pass,** with `DeviceDiaryProvider.render.test.tsx`, `PrivacyScreen.render.test.tsx` and `SessionEndedScreen.render.test.tsx` whole.
- [ ] **Step 5: Mutation check.** Erase on any `signed_out`: the cold-start test fails. Erase on `locked` without a reason: its test fails. Send `widget_added` for every installed size: the first-time test fails. Forget the other account's queues on keep: the session-ended test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Empty the widgets and the account file when a session ends, never on a cold start, and send widget_added once per size"`

---

### Task P6A-T4: Entry links: the routes, `+native-intent`, Tell Bun on request and the quick action list

**Starts after:** P2-T16, P2-T18, P2-T33, P6A-T3a, P6A-T3b

**Files:**
- Create: `apps/app/src/wallet/outside/outsideRoutes.ts` (pure), `quickActions.ts` (pure list, port and fake), `apps/app/app/+native-intent.tsx`
- Modify: `apps/app/src/wallet/add/AddTrayHost.tsx` (P2-T16: `AddRequest.tell`), `apps/app/app/spend/add.tsx` (P2-T18: passes `tell=1`), `OutsideBridge.tsx` (sets the quick actions, and `links.scan` to `outsideLink(scheme, 'scan')` while `useOutsideScanHref()` is set), `eraseOutside.ts` (clears them), `outsideCopy.draft.ts`
- Test: `apps/app/src/wallet/outside/outsideRoutes.test.ts`, `quickActions.test.ts` (Node); `OutsideLinks.render.test.tsx`; cases in `apps/app/src/wallet/add/AddTray.render.test.tsx` and `OutsideBridge.render.test.tsx`

**Interfaces:**
- Consumes: `AddTrayHost`, `useAddTray` (P2-T16); AmountStep's `onTellBun` and `canTellBun` (P2-T14; the host sets `canTellBun` to the `companion` area on and `useAiCompanion().enabled`); `LockGate`, `fakeLocalAuth`, `LockedScreen` (P2-T33); `shortDayName` (P6A-T2); `useAiCompanion` (base); P6A-T1 to P6A-T3b.
- Produces:
  ```ts
  // outsideRoutes.ts
  export function outsideScanHref(): string | null;   // for redirectSystemPath; null until P6A-T13 gives it P4-T19 (P4:scan-route)
  export function useOutsideScanHref(): string | null;   // the bridge's form, a hook so P6B-T15's rollout reaches it; null until P6A-T13
  export type EntryState = { outsideOn: boolean; scanHref: string | null };
  export function outsideHref(path: string, state: EntryState): string | null;   // null: not an outside link
  // quickActions.ts
  export type QuickItem = { id: 'record' | 'scan' | 'today' | 'tell'; title: string; subtitle: string | null; href: string };
  export type QuickState = { signedIn: boolean; outsideOn: boolean; aiOn: boolean; scanHref: string | null; today: { day: string; count: number } | null };
  export function quickItems(state: QuickState, t: WalletT): QuickItem[];
  export type QuickActionsPort = { set(items: readonly QuickItem[]): Promise<void> };
  export const noQuickActions: QuickActionsPort;
  export function fakeQuickActions(): QuickActionsPort & { sets: QuickItem[][] };
  export function getAppQuickActions(): QuickActionsPort;   // noQuickActions until P6A-T9
  export function setAppQuickActions(port: QuickActionsPort | null): void;
  // app/+native-intent.tsx
  export function redirectSystemPath(event: { path: string; initial: boolean }): string;
  // AddTrayHost.tsx (P2-T16)
  export type AddRequest = { type?: AddType; walletId?: string; copyOf?: string; tell?: true };
  // eraseOutside.ts: deps gain quickActions?: QuickActionsPort (default getAppQuickActions())
  ```
- `outsideHref` (X7) reads `path` as a URL or a path (Expo passes either) and maps it as Step 1's table shows, the host `expo-sharing` being B19's hand-off (P6A-T11). `redirectSystemPath` answers `outsideHref(path, { outsideOn: isRedesignEnabled('outside'), scanHref: outsideScanHref() }) ?? path`, read at call time and never from the session (X7); the `/spend` layout's guard (base, kept by 1C-T9) sends a signed-out person to sign in. It never throws, answering `path` on a failure (Expo Router's `NativeIntent` docs).
- `open({ tell: true })` opens the tray and, when `canTellBun`, calls the host's own `onTellBun`, the handler the บอกบัน row calls (P3-T18 redirects it), else stays on the amount step, with the host's one `trackRecordStarted`.
- `quickItems` (ox-quick-actions): `[]` signed out or with the area off; otherwise record (`outside.record`, `/spend/add?type=expense`), scan when `scanHref` is set (`outside.scan`), today (`outside.todayTitle`, subtitle `outside.todaySubtitle` with the day and count it counts, `/spend`), Tell Bun when `aiOn` (the `canTellBun` condition; `outside.tell`, `outside.tellSubtitle`, `/spend/add?tell=1`); at most 4, iOS's limit. The bridge sets them on change (`today.day` is `shortDayName` of Bangkok's today, `scanHref` is `useOutsideScanHref()`); `eraseOutside` sets `[]` in both modes.
- Copy (board): `outside.todayTitle` ดูวันนี้; `outside.todaySubtitle` {day} · จดแล้ว {count} รายการ (the board's line with its day, a deviation for E2: a quick action keeps its subtitle until Jotbun sets it again); `outside.tell` บอกบัน; `outside.tellSubtitle` เล่าสั้น ๆ บันเตรียมร่างให้ตรวจ.

- [ ] **Step 1: Write the typed stubs, then the failing tests.**
  - `outsideRoutes.test.ts`, over `on = { outsideOn: true, scanHref: null }`: `gogospend://outside/record` and `/outside/record` give `/spend/add?type=expense`; today gives `/spend`; scan gives `/spend`, or `'/sample/scan'` with that `scanHref`; tell gives `/spend/add?tell=1`; `gogospend://expo-sharing` gives `/spend/shared`; with the area off `/spend`; `gogospend://dev/catalogue?section=bw-home` and `'%%'` give null.
  - `quickActions.test.ts`: `signed out there are no quick actions`; `the board's four in order, with today's count and its day` (จดรายจ่าย, สแกนสลิป, ดูวันนี้ with ส. 24 · จดแล้ว 3 รายการ, บอกบัน); `no Tell Bun unless the companion area and AI are on, and no scan without a scan route`.
  - `AddTray.render.test.tsx`: `open({ tell: true }) opens what the บอกบัน row opens when AI is on and the amount step when it is off`; `/spend/add?tell=1 opens the tray on Tell Bun`. `OutsideBridge.render.test.tsx`: `the quick actions are set while signed in, and either erase mode clears them`.
  - `OutsideLinks.render.test.tsx`: `a link opened while the app is locked lands behind the lock` (a locked `LockGate` over `fakeLocalAuth(['success'])`, the router sent to `outsideHref('gogospend://outside/record', on)`: `LockedScreen` drawn, the tray's title not; after unlocking the amount tray is open); `a link that starts the app while the session hydrates keeps its target` (Review Focus 6: with the provider `signed_out` at creation, then `hydrating`, `redirectSystemPath({ path, initial: true })` gives `/spend/add?type=expense` for `gogospend://outside/record` and `/spend/shared` for `gogospend://expo-sharing`; once the provider is `active` the amount tray is open behind the lock); `redirectSystemPath never throws and leaves other links alone`.
- [ ] **Step 2: Run them and see them fail.** unit `outsideRoutes.test.ts quickActions.test.ts`; render `OutsideLinks.render.test.tsx src/wallet/add/AddTray.render.test.tsx OutsideBridge.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement**, with the five edits.
- [ ] **Step 4: Run them and see them pass,** with `AddTray.render.test.tsx` and `SpendLayout.render.test.tsx` whole.
- [ ] **Step 5: Mutation check.** Answer `/` while the session hydrates: the cold-start test fails. Offer Tell Bun with AI off: its test fails. Throw in `redirectSystemPath` on a bad URL: the never-throws test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Route outside links through native intents behind the lock, open Tell Bun on request and list the quick actions"`

---

### Task P6A-T5: Siri captures into the outbox

**Starts after:** P3-T2 (P3:source), 1D-T1, P6A-T1, P6A-T3a, P6A-T3b

**Files:**
- Create: `apps/app/src/wallet/outside/siriQueue.ts`, `derivedId.ts` (pure), `siriCapture.ts` (pure), `useSiriDrain.ts`
- Modify: `OutsideBridge.tsx` (calls `useSiriDrain()`); `eraseOutside.ts` (`forgetOutsideQueues` also forgets the account's captures; `OutsideDeps` gains `siri?: SiriQueuePort`, default `getAppSiriQueue()`); `apps/app/src/analytics/events.ts` (`trackRecordSaved`'s `secondsToSave` becomes optional, X11: absent, no `seconds_to_save` is sent; existing callers unchanged)
- Test: `apps/app/src/wallet/outside/siriCapture.test.ts`, `derivedId.test.ts` (Node); cases in `OutsideBridge.render.test.tsx`, `DeviceDiaryProvider.render.test.tsx`, `PrivacyScreen.render.test.tsx` and 1D-T1's events test

**Interfaces:**
- Consumes: `parseAmountInput` (base `src/spend/v1/money.ts`); `parseQuickText`, `normalizeNote`, `NOTE_MAX_CHARS`, `isUuid` (`@gogospend/contracts`); `todayInBangkok` (base `viewModels.ts`); `PendingEntry`, `SpendDiary.saveDraft(entry, commandId)` (base: a repeat with the same command id is a no-op) and `DiaryStore.readState()` (base: the confirmed records); the optional `source` on transaction create and `RecordSource` with `siri` (P3-T2, P3:source); `trackRecordSaved` (1D-T1); `analyticsCategoryKey` (P2-T7); `Digest`, `accountMarker`, `appDigest`, `getAppGroup`, `readAccountFile` (P6A-T1).
- Produces:
  ```ts
  // siriQueue.ts
  export type SiriInvocation = { id: string; name: string; createdAt: number; params: Record<string, unknown> };   // expo-app-intents' AppIntentInvocation
  export type SiriQueuePort = { pending(): Promise<readonly SiriInvocation[]>; remove(id: string): Promise<void> };
  export const SIRI_LOG_EXPENSE = 'logExpense';
  export const noSiriQueue: SiriQueuePort;
  export function fakeSiriQueue(seed: readonly SiriInvocation[]): SiriQueuePort & { removed: string[] };
  export function getAppSiriQueue(): SiriQueuePort;   // noSiriQueue until P6A-T12
  export function setAppSiriQueue(port: SiriQueuePort | null): void;
  export function forgetSiri(queue: SiriQueuePort, marker: string): Promise<number>;   // removes that marker's captures (the erase mode)
  // derivedId.ts
  export function derivedUuid(label: string, value: string, digest: Digest): Promise<string>;   // UUID version 8, RFC 9562 variant, from digest(label + ':' + value)
  // siriCapture.ts
  export type SiriCapture = { invocationId: string; marker: string; amountMinor: Minor; note: string | null; capturedOn: string };
  export type SiriRefusal = 'not_ours' | 'bad_amount' | 'bad_params';
  export function readSiriInvocation(invocation: SiriInvocation): SiriCapture | SiriRefusal;
  export type SiriContext = { wallets: readonly WalletSnapshot[]; categories: readonly CategoryDto[]; known(ids: { recordId: string; commandId: string }): Promise<boolean> };
  export function siriEntry(capture: SiriCapture, ids: { recordId: string; commandId: string }, context: SiriContext): PendingEntry | null;
  export type SiriDrainDeps = { queue: SiriQueuePort; marker: string | null; context(): SiriContext | null; save(entry: PendingEntry, commandId: string): Promise<void>; digest: Digest; saved(entry: PendingEntry): void };
  export type SiriDrainReport = { saved: number; dropped: number; waiting: number };
  export function drainSiri(deps: SiriDrainDeps): Promise<SiriDrainReport>;
  // useSiriDrain.ts
  export function useSiriDrain(): void;   // in OutsideBridge: at mount and each return to 'active', one drain at a time, only with the outside area on
  ```
- `readSiriInvocation`: the name must be `SIRI_LOG_EXPENSE` (else `not_ours`); `params.amount` must pass `parseAmountInput(amount, 'en')` above zero (else `bad_amount`); `params.account` must match `/^[0-9a-f]{16}$/` (else `bad_params`); a string note is cut to `NOTE_MAX_CHARS` code points and passed through `normalizeNote`, a refusal or empty note giving null; `capturedOn` is `todayInBangkok(new Date(createdAt))`.
- `siriEntry` (X8; default pending owner Q8 and Q15): null without an open baht wallet (`currency` `'THB'`) or an open expense category; otherwise an expense with `id: recordId`, the first open baht wallet, the open built-in expense category `parseQuickText(note).category_key` names when that guess is an expense (else the first open expense category), `occurred_on: capturedOn`, the note, `merchant: null`, `source: 'siri'`.
- `drainSiri`, oldest first, in this order:
  1. a refusal is removed (`dropped`);
  2. with `marker` null (signed out, or no diary open) the drain stops and the rest wait;
  3. an invocation of another marker is skipped, never saved or removed, counted `waiting`, and the drain goes on (X5, A5); it leaves with its own account's erase or the queue's limit (the newest 100 kept);
  4. the ids are `derivedUuid('siri-record', id)` and `derivedUuid('siri-command', id)`; with `context()` null, or `siriEntry` null, the drain stops and the rest wait;
  5. when `await known(ids)` is false, `await save(entry, commandId)`, then `saved(entry)`; a rejected save stops the drain, this one waiting;
  6. the invocation is removed (`saved`); a redelivered one finds `known` true and is only removed.
- The app's wiring: `marker` is the account file's when it equals the open diary's `accountMarker(view.accountId)`, else null; `known` is true when the outbox holds the command, or a pending entry or a confirmed record (`readState()`) has the record id; `saved` is the rule's one emitter, `trackRecordSaved({ kind: 'expense', source: 'siri', categoryKey: analyticsCategoryKey(category), offline })`, `offline` as P2-T16 computes it, without `secondsToSave`.

- [ ] **Step 1: Write the typed stubs, then the failing tests.**
  - `siriCapture.test.ts`: `an amount Siri heard becomes satang, and a bad one is refused` (`'45'` gives `'4500'`, `'45.5'` gives `'4550'`; `'0'`, `'45.555'`, `'1e3'`, `'-5'`, `'1000000000'` give `'bad_amount'`); `the note is trimmed and cut to 500 code points, and an empty note is null`; `a capture is dated the Bangkok day Siri took it` (Review Focus 5: `createdAt: Date.parse('2026-10-24T16:58:00Z')` gives `'2026-10-24'`, whatever the drain's clock); `ค่ากาแฟ goes to food, a note the rules cannot place to the first expense category, into the first open baht wallet, with source siri`; `with no baht wallet open the capture waits` (a non-THB wallet, P5's type or a cast until P5); `a redelivered invocation saves once` (Review Focus 3: two drains over one seed, `known` true the second time: one save, the invocation removed); `a capture whose record has already synced is only removed`; `another account's capture waits unread while this account's is saved, and its own account saves it later` (A's capture, then B's: B's drain saves B's only, A's is neither saved nor removed, `waiting: 1`; A's drain then saves it); `signed out everything waits` (`marker: null` removes nothing, `waiting: 2`); `a failed save keeps the capture for the next drain`; `a refused invocation is removed`; `forgetSiri removes one account's captures and keeps another's`.
  - `derivedId.test.ts`: `the same invocation gives the same ids, which contracts accept as UUIDs, and the two labels differ`.
  - `OutsideBridge.render.test.tsx`: `captures waiting at open reach the outbox once, each with one record_saved and no amount` (two captures of `'987.65'`: two expense drafts with `source: 'siri'`; two `record_saved` with `source: 'siri'` and no `seconds_to_save`; `JSON.stringify(sent)` has no `98765` and no `987`). `DeviceDiaryProvider.render.test.tsx` and `PrivacyScreen.render.test.tsx`: `the sign-out erase and a confirmed deletion remove this account's Siri captures and keep another account's`. 1D-T1's events test: `record_saved without seconds sends no seconds_to_save`.
- [ ] **Step 2: Run them and see them fail.** unit `siriCapture.test.ts derivedId.test.ts src/analytics/events.test.ts`; render `OutsideBridge.render.test.tsx src/spend/v1/DeviceDiaryProvider.render.test.tsx src/screens/redesign/account/PrivacyScreen.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with 1D-T1's catalog and events tests whole.
- [ ] **Step 5: Mutation check.** Date by the drain's day: the Review Focus 5 test fails. Skip `known`: the redelivered test fails. Save, or remove, another account's capture: the waits-unread test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Drain Siri's queued captures into the outbox once each, dated when spoken and only for the account that spoke them"`

---

### Task P6A-T6a: A shared slip, read once: the pipeline, its answers and the share queue

**Starts after:** P3-T1 (P3:slip-qr), P4-T6 (P4:slips-route), P4-T7 (P4:slip-drafts), P4-T14 (P4:slip-client), P6A-T1, P6A-T2, P6A-T3b

**Files:**
- Create: `apps/app/src/wallet/outside/sharedSlip.ts` (pure), `shareQueue.ts` (pure, over the port), `incomingShares.ts`
- Modify: `eraseOutside.ts` (`forgetOutsideQueues` also forgets the account's queued shares)
- Test: `apps/app/src/wallet/outside/sharedSlip.test.ts`, `shareQueue.test.ts` (Node); one case each in `DeviceDiaryProvider.render.test.tsx` and `PrivacyScreen.render.test.tsx`

**Interfaces:**
- Consumes: P3-T1 (P3:slip-qr) (`QrDecoder`, `noQrDecoder`, `slipQrIn`, from `qrDecoder.ts` as A13 names them); P4-T1's `SlipDraftDto` (with `SlipParty`), `SlipAccountDto`; P4-T14 (P4:slip-client)'s `OneSlipAnswer` (`apps/app/src/slips/oneSlip.ts`); base `V1Error` (`outcome`, `code`, `retryAfterSeconds`) and `displayYear`; `monthName` (P6A-T2); P6A-T1.
- Produces:
  ```ts
  // sharedSlip.ts
  export type SharedShare = { uri: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' };
  export type SharedDraftView = { amountMinor: Minor | null; direction: 'out' | 'in'; payee: string | null; when: string | null; walletName: string | null; categoryName: string | null };
  export function sharedDraftView(draft: SlipDraftDto, lookups: { accounts: readonly SlipAccountDto[]; wallets: readonly WalletSnapshot[]; categories: readonly CategoryDto[] }, locale: 'th' | 'en' | 'vi'): SharedDraftView;
  export type SharedSlipResult = { kind: 'drafted'; draft: SharedDraftView }
    | { kind: 'duplicate' | 'unreadable' | 'too_large' | 'not_slip' | 'cannot_check' }
    | { kind: 'over_quota' | 'paused' | 'offline' | 'signed_out' | 'needs_consent' | 'update_required' | 'failed'; retryAfterSeconds: number | null };
  export type SharedSlipDeps = { signedIn: boolean; slipsOn: boolean; consentRefused: boolean; check(uri: string): Promise<'slip' | 'not_slip' | 'cannot_check'>; send(share: SharedShare): Promise<OneSlipAnswer>; view(draft: SlipDraftDto): Promise<SharedDraftView> };
  export function checkSharedSlip(decoder: QrDecoder, uri: string): Promise<'slip' | 'not_slip' | 'cannot_check'>;   // cannot_check while the decoder is not available, read again after decode
  export function sharedFailure(error: unknown): SharedSlipResult;   // the table below; never throws
  export function isFinalShare(result: SharedSlipResult): boolean;   // drafted, duplicate, unreadable, too_large, not_slip, cannot_check
  export function readSharedSlip(share: SharedShare, deps: SharedSlipDeps): Promise<SharedSlipResult>;   // never throws
  // shareQueue.ts
  export type QueuedShare = { id: string; file: string; mediaType: SharedShare['mediaType']; receivedAt: number; marker: string; attempts: number; notBefore: number };
  export const SHARE_QUEUE_LIMIT = 20;
  export const SHARE_KEEP_MS = 604_800_000;   // 7 days, default pending owner Q10
  export function readShareQueue(group: AppGroupPort): Promise<QueuedShare[]>;
  export function enqueueShare(group: AppGroupPort, input: { id: string; share: SharedShare; marker: string; nowMs: number; notBefore?: number }): Promise<'queued' | 'full' | 'unreadable'>;
  export function drainShares(group: AppGroupPort, input: { marker: string | null; nowMs: number; read(share: SharedShare): Promise<SharedSlipResult> }): Promise<{ results: SharedSlipResult[]; waiting: number }>;
  export function forgetShares(group: AppGroupPort, marker: string): Promise<number>;   // that account's entries and files (the erase mode)
  // incomingShares.ts
  export type IncomingSharePort = { take(): Promise<readonly SharedShare[]>; clear(): Promise<void> };   // images handed to the app (P6A-T11); clear also deletes any copy the hand-off left
  export const noIncomingShares: IncomingSharePort;
  export function getIncomingShares(): IncomingSharePort;
  export function setIncomingShares(port: IncomingSharePort | null): void;
  ```
- `readSharedSlip` (X9, B19, D29), in order: `check` answers `cannot_check` (no decoder on this phone while P3-T12 waits) or `not_slip`, each with nothing sent (the QR is read on the phone, offline); not signed in gives `signed_out`; the slips area off (`slipsOn` false) gives `paused` with `retryAfterSeconds` null; `consentRefused` gives `needs_consent` (unread preferences and a paused AI send; the table maps the server's answer); then one `send(share)`: `sent` with `read` gives `drafted` (through `view`), `duplicate`, `unreadable` and `over_quota` pass through, `paused` keeps P4's `retryAfterSeconds`; `not_slip` and `too_large` pass through; a throw goes to `sharedFailure`, first match winning:

  | Thrown | Result |
  | --- | --- |
  | `V1Error` outcome `network` | `offline` |
  | outcome `signed_out` (401) | `signed_out` |
  | code `AI_CONSENT_REQUIRED` (403) | `needs_consent` |
  | code `UPLOAD_TOO_LARGE` (413, 422) | `too_large` |
  | outcome `not_found` (404 while P4's `SLIP_IMPORT_ENABLED` is off), `rate_limited` (429) or `unavailable` (503 `AI_PAUSED`, a closed `ai` or `imports` gate, `SERVICE_UNAVAILABLE`) | `paused`, keeping `retryAfterSeconds` |
  | outcome `upgrade_required` (426) | `update_required` |
  | outcome `invalid` (422 `UPLOAD_TYPE_MISMATCH`, `UPLOAD_UNSUPPORTED_TYPE`, `VALIDATION_FAILED`) | `unreadable` |
  | anything else (`policy_required`, `invalid_response`, any other throw) | `failed` |
- `sharedDraftView` (P4's S2, as the vault wrote the draft): the person's side is `from` when `direction` is `out` and `to` when it is `in`; `payee` is the other side's `name`; `walletName` is the name of the wallet whose id is the `wallet_id` of the `SlipAccountDto` matching the person's side by `bank` and `account_last4`, else null; `when` is `occurred_on` with `occurred_time` as `24 ต.ค. 2569 · 18:42` (Buddhist year) or `24 Oct 2026 · 18:42` (`en` for `vi`), the date alone without a time, null without a date; `categoryName` the category `category_id` names, else null.
- The queue (Q10): `enqueueShare` copies the image to `outside/shares/<id>.<jpg|png|webp>` by its media type, or answers `full` with 20 waiting. `drainShares`, oldest first: an entry past `SHARE_KEEP_MS` is deleted unread; another marker's entry is skipped unread, kept for its own account (A5); with `marker` null nothing is read; an entry before its `notBefore` waits; a final result deletes the file and entry; `over_quota` adds an attempt, sets `notBefore` to `nextBangkokMidnight(nowMs)` (P6A-T2) and ends the drain's sending; any other adds an attempt and sets `notBefore` to now plus its `retryAfterSeconds` (null: now). Every entry left counts in `waiting`.

- [ ] **Step 1: Write the typed stubs, then the failing tests.**
  - `sharedSlip.test.ts`: `a picture with no Thai bank slip QR never leaves the phone` (Review Focus 4: `not_slip`, and `send` is never called, signed out or with consent refused too); `without a decoder a slip is cannot_check, nothing is sent and it is never called not a slip` (`checkSharedSlip(noQrDecoder, uri)`, and one whose `available` turns false during `decode`); `signed out, with the slips area off or with consent refused nothing is sent, and the area comes first` (area off and consent refused: `paused`); `a read slip is a draft`; `every answer maps as the table says` (table-driven: P4's five outcomes, `not_slip`, `too_large`, and `V1Error`s for 401, 403 `AI_CONSENT_REQUIRED`, 404, 413 and 422 `UPLOAD_TOO_LARGE`, 422 `UPLOAD_TYPE_MISMATCH`, 426, 429 with retry 5, 503 `AI_PAUSED` with retry 120, 503 `SERVICE_UNAVAILABLE`, 403 `POLICY_ACCEPTANCE_REQUIRED`, a network failure and a `TypeError`); `nothing a send throws escapes readSharedSlip`; `drafted, duplicate, unreadable, too_large, not_slip and cannot_check are final; the rest wait`; `the draft view names the person's wallet and the category, and dates the slip` (`direction: 'out'`, `from` matching a slip account mapped to a wallet; `24 ต.ค. 2569 · 18:42` and `24 Oct 2026 · 18:42`; `amount_minor: null` stays null); `an incoming slip names its sender as the payee and the receiving account's wallet` (`direction: 'in'`: `payee` is `from.name`); `a slip whose own side is no slip account names no wallet`.
  - `shareQueue.test.ts` (`memoryAppGroup`): `a shared image is copied in under its type and listed once` (a PNG becomes `outside/shares/<id>.png`); `the twenty-first is refused and nothing is copied`; `an entry older than seven days is deleted unread`; `another account's entry is kept unread while this account's drains`; `signed out nothing is read`; `a waiting result counts an attempt and waits out its retry; a final one deletes the file and the entry`; `an over-quota slip waits for the next Bangkok midnight and the drain sends nothing after it`; `a share enqueued with a later notBefore waits for it`; `forgetting an account deletes its entries and files and keeps another's`.
  - `DeviceDiaryProvider.render.test.tsx` and `PrivacyScreen.render.test.tsx`: `the sign-out erase and a confirmed deletion delete this account's queued shares with their files and keep another account's`.
- [ ] **Step 2: Run them and see them fail.** unit `sharedSlip.test.ts shareQueue.test.ts`; render `src/spend/v1/DeviceDiaryProvider.render.test.tsx src/screens/redesign/account/PrivacyScreen.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Send before the QR check: the Review Focus 4 test fails. Send with the slips area off, or ask consent before it: the nothing-sent test fails. Take the person's side as `from` whatever the direction: the incoming-slip test fails. Call a slip read without a decoder `not_slip`: the cannot_check test fails. Let a thrown 503 escape: the never-throws test fails. Read, or delete, another account's entry: its test fails. Forget the shares in `ended` mode too: P6A-T3b's session-end test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Read a shared slip once: the QR check on the phone, an answer for each of P4's replies, and a queue for slips that must wait"`

---

### Task P6A-T6b: The shared-slip screen: the card, `/spend/shared` and the waiting tray

**Starts after:** P2-T13, P3-T1 (P3:slip-qr), P3-T14 (P3:ai-area), P4-T6 (P4:slips-route), P4-T7 (P4:slip-drafts), P4-T14 (P4:slip-client), P4-T21 (P4:inbox), P6A-T4, P6A-T6a

**Files:**
- Create: `apps/app/src/wallet/outside/appSharedSlipDeps.ts`, `SharedSlipCard.tsx`, `SharedSlipScreen.tsx`, `SharesWaitingTray.tsx`; `apps/app/app/spend/shared.tsx`
- Modify: `OutsideBridge.tsx` (offers `SharesWaitingTray`), `outsideCopy.draft.ts`, `outsideSections.tsx` (`bw-ox-shared-read`, `bw-ox-shared-private`, `bw-ox-shared-not-slip`, `bw-ox-shared-waiting`, `bw-ox-shares-tray`)
- Test: `apps/app/src/wallet/outside/SharedSlip.render.test.tsx`

**Interfaces:**
- Consumes: P6A-T6a; `getAppQrDecoder`, `installQrDecoder`, `fakeQrDecoder` (P3-T1, P3:slip-qr); P4-T14 (P4:slip-client)'s `useSlipDeps()`, `useSlips()`, `sendOneSlip`, `SlipsProvider` and `fakeSlipEngine`, and `fakeSlipResources` (P4-T12); `SLIP_REVIEW_HREF` (P4-T21, P4:inbox); `AiConsentTray` (`{ visible, onClose, onAgreed }`, P3-T14 (P3:ai-area)); base `useAiCompanion`, `todayInBangkok`, `getCredentialProvider`; `Tray`, `PrimaryButton`, `TextLink` (P2-T13); `WalletAmount`, `HIDDEN_AMOUNT`, `usePrivateMode` (P2-T10); `useDraftCopy`, `COMMON_COPY` (P2-T3) or `useWalletCopy` (P2-T38); `useAddTray` (P2-T16).
- Produces:
  ```ts
  export function useSharedSlipDeps(): SharedSlipDeps;
  export function SharedSlipCard(props: { result: SharedSlipResult; hidden: boolean; onInbox(): void; onLogIt(): void; onDone(): void }): JSX.Element;
  export function SharedSlipScreen(): JSX.Element;
  export function SharesWaitingTray(props: { count: number; onRead(): void; onLater(): void }): JSX.Element;
  ```
- `useSharedSlipDeps` (A1, A32): `deps` is P4-T14's `useSlipDeps()`, the open diary's slip deps (P3's decoder, P4's shrinker, `getSharedSlipResources()` and the salted hasher), so P6A wires none of P4's parts. `check` is `checkSharedSlip(getAppQrDecoder(), uri)`; `send` is `sendOneSlip(deps, { uri, origin: 'share' })`, so P4 posts one `live` batch of one with `last: false`, `album: null` and A1's `origin: 'share'`, and P6A never names a record source; `view` is `sharedDraftView` over `deps.resources.accounts()` (a failure gives none) and the diary's wallets and categories; `signedIn` is true while the open diary names an account and `deps` is not null (so neither `send` nor `view` runs without them); `consentRefused` is `useAiCompanion().preferences?.companion === false` (P4-T18's rule); `slipsOn` is `useSlips() !== null`: P4's engine exists only while `useSlipsArea()` is on (A10, P6B-T15's rollout inside it).
- `/spend/shared` (`<Redirect href="/spend" />` with the area off; P4's one `SlipsProvider` in `WalletShell` already wraps it): once the diary is ready, takes the incoming shares, enqueues each under this account's marker (`accountMarker(view.accountId, appDigest)`), calls `clear()`, drains, and shows one `SharedSlipCard` per result, newest first, with บันกำลังอ่านสลิป (draft) until then; once the session settles signed out first (`hydrating` ending in `signed_out`, or a sign-out), takes and clears them, keeping nothing. `needs_consent` opens `AiConsentTray` first; `onAgreed` drains again.
- `SharedSlipCard` (ox-share-extension under B19: nothing is saved here): `drafted` shows บันอ่านได้, the amount (`WalletAmount`, or `HIDDEN_AMOUNT` and `common.amountHidden` when `hidden`), โอนเงินออก (`outside.directionIn` โอนเงินเข้า, draft, for money in), ผู้รับ (`outside.payer` ผู้โอน, draft, for money in) and วันเวลา rows marked จากสลิป, กระเป๋า and หมวด rows marked บันเดา when known, บันอ่านจากรูปนี้และอาจอ่านผิดได้ with ตรวจให้แน่ใจก่อนบันทึก, อยู่ในกล่องรอตรวจแล้ว ยังไม่บันทึกจนกว่าคุณจะยืนยัน (draft), ไม่เก็บรูปสลิป เก็บแค่ยอด วันเวลา และชื่อ, a `PrimaryButton` `outside.openInbox` ตรวจในกล่อง (draft; P4-T21 (P4:inbox)'s route) and a `TextLink` `outside.done` เสร็จ; a draft without an amount shows `outside.noAmount` บันอ่านยอดไม่ได้ ดูในกล่องรอตรวจ (draft) in its place. Each other result shows one draft line that says the slip or records are safe and offers a way on (§5.2's system states): duplicate `outside.known` Jotbun เคยอ่านสลิปนี้แล้ว (dismissed and expired slips too, C11); unreadable บันอ่านสลิปนี้ไม่ได้ จดเองได้เลย and too_large `outside.tooLarge` รูปนี้ใหญ่เกินกว่าบันจะอ่านได้ จดเองได้เลย, each with a `PrimaryButton` จดเอง opening the add tray; not_slip รูปนี้ไม่ใช่สลิปธนาคาร Jotbun ไม่ได้ส่งรูปนี้ไปไหน; cannot_check `outside.cannotCheck` เครื่องนี้ยังตรวจสลิปไม่ได้ Jotbun ไม่ได้ส่งรูปนี้ไปไหน; over_quota วันนี้บันอ่านสลิปครบแล้ว สลิปนี้รออ่านพรุ่งนี้ในเครื่อง; paused บันพักอยู่ สลิปนี้รออ่านในเครื่อง; offline ยังไม่มีสัญญาณ สลิปนี้รออ่านในเครื่อง; update_required `outside.needsUpdate` อัปเดต Jotbun ก่อน สลิปนี้รออ่านในเครื่อง; failed `outside.failed` ส่งไม่สำเร็จ สลิปยังอยู่ในเครื่อง (§5.1); signed_out `outside.signIn` เข้าสู่ระบบ Jotbun ก่อน แล้วแชร์สลิปอีกครั้ง. A full queue says `outside.full` มีสลิปรออ่านครบ 20 ใบแล้ว ให้บันอ่านใบที่รออยู่ก่อน. The card's title is `outside.shareTitle` จดใน Jotbun.
- The bridge offers `SharesWaitingTray` (สลิปที่แชร์ไว้ {count} ใบรอให้บันอ่าน, a `PrimaryButton` อ่านเลย to `/spend/shared`, a `TextLink` ไว้ทีหลัง; drafts) when this account has waiting shares and `useSlips()` is not null, at most once per Bangkok day (device store `outside-shares-offered`).

- [ ] **Step 1: Write the typed stubs, then the failing tests** in `SharedSlip.render.test.tsx` (`EXPO_PUBLIC_REDESIGN=wallet,outside,slips`; each case calls `installQrDecoder(fakeQrDecoder({...}))` first and `installQrDecoder(null)` after, and P4's `SlipsProvider` gets deps over `fakeSlipResources` and the same fake, with `fakeSlipEngine()`; both modes and languages): `a slip read now shows the draft card, and private mode masks its amount`; `the shared slip is posted once as a live read with origin share, last false and no album, and nothing is saved` (A1: one `read` call with `purpose: 'live'`, `last: false` and one slip with `album: null`, `origin: 'share'` and its media type; no transaction command reaches the diary); `no shared-slip module names a record source` (`readFileSync` of `sharedSlip.ts` and `appSharedSlipDeps.ts`: no `source:` and no `share_extension`); `an incoming slip and a slip without an amount read as they should` (โอนเงินเข้า and ผู้โอน with the sender's name; the no-amount line and no figure); `with the slips area off a shared slip waits, nothing is sent, nothing asks for consent and Home offers none` (`slips` dropped, preferences `companion: false`: `paused`, no `read` call, no tray); `the main button opens the inbox`; `not a slip says the picture stayed on the phone`; `without a decoder the card says this phone cannot check slips and nothing was sent` (`installQrDecoder(null)`); `a picture too large to send says so and offers จดเอง`; `with consent refused the consent tray comes first, and agreeing reads the slip`; `a paused AI or unread preferences send the slip and never open the consent tray`; `offline says it waits and the image stays queued`; `a share opened while the diary is still opening is kept and read once it opens` (Review Focus 6); `signed out keeps nothing`; `with the area off /spend/shared goes to /spend`; `Home offers waiting slips once a day`; `controls are at least 44 pt and nothing truncates at AX5`.
- [ ] **Step 2: Run them and see them fail.** render `SharedSlip.render.test.tsx`. Record the counts.
- [ ] **Step 3: Implement**, with the route and the catalogue sections (fakes only).
- [ ] **Step 4: Run them and see them pass,** with the catalogue suite.
- [ ] **Step 5: Mutation check.** Send without the origin: the live-read test fails. Draw the amount while `hidden`: the private test fails. Set `slipsOn` true without an engine: the slips-off test fails. Refuse consent on `!enabled`: the paused-AI test fails. Take the shares before the diary is ready: the still-opening test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Show a shared slip's draft from /spend/shared and offer the slips still waiting"`

---

### Task P6A-T7: The native base: ids, the app group, keychain groups, privacy manifests and a config check in CI

**Starts after:** 1C-T7, P6A-T1. Its final values wait on owner Q6 (D33): it is built and checked with the temporary ids, and nothing native is built or signed until D33.

**Files:**
- Create: `apps/app/outsideConfig.js` (CommonJS: Node built-ins and `expo/config-plugins`), `apps/app/scripts/check-native-config.mjs`
- Modify: 1C-T7's `apps/app/app.config.js` (its transform becomes the named `withNativeSignIn(config)`, unchanged, and the file exports `({ config }) => withOutside(withNativeSignIn(config), process.env)`); `apps/app/package.json` (script `"check:native": "node scripts/check-native-config.mjs"`); `apps/app/.gitignore` (`/ios`, `/android`: introspection and prebuild write there); `.github/workflows/backend.yml` (one gate-job step after `npm run typecheck:app`: `npm run check:native -w gogospend-app`)
- Test: `check-native-config.mjs` runs `npx expo config --type introspect --json` with no ids set, with `JOTBUN_IOS_BUNDLE_ID=th.co.jotbun.check JOTBUN_ANDROID_PACKAGE=th.co.jotbun_check JOTBUN_APPLE_TEAM_ID=ABCDE12345`, and with `JOTBUN_IOS_BUNDLE_ID='bad id'`, and exits non-zero naming the first mismatch; `apps/app/src/wallet/outside/outsideConfig.test.ts` (Node, loading `outsideConfig.js` through `createRequire`)

**Interfaces:**
- Consumes: Expo's dynamic config (`app.config.js` receives `app.json` as `({ config })`); `npx expo config --type introspect --json` (the evaluated entitlements and `Info.plist` under `_internal.modResults.ios`; only introspective mods run); @expo/config-plugins 58.0.9's `withFinalizedMod` (an iOS mod that runs after every other mod) and `withXcodeProject`; 1C-T7's transform; P6A-T1's id patterns.
- Produces:
  ```js
  // outsideConfig.js
  /** @typedef {{ type: string; reasons: string[] }} PrivacyEntry */
  /** @param {import('expo/config').ExpoConfig} config @param {Record<string, string | undefined>} env @returns {import('expo/config').ExpoConfig} */
  function withOutside(config, env) {}
  function withExtensionFiles(config, target) {}   // target: { name: string; keychainGroups?: string[]; privacy: PrivacyEntry[] }
  function privacyManifestXml(entries) {}   // PrivacyInfo.xcprivacy: no tracking, no tracking domains, no collected data, exactly these API entries
  function extensionEntitlements(existing, keychainGroups) {}   // the package's entitlements plus keychain-access-groups
  const OUTSIDE_PLUGINS = [];   // P6A-T8 to P6A-T12 append, each after its owner answer
  const OUTSIDE_PRIVACY = [];   // the app target's entries; P6A-T8, T10, T11 and T12 append theirs
  module.exports = { withOutside, withExtensionFiles, privacyManifestXml, extensionEntitlements, OUTSIDE_PLUGINS, OUTSIDE_PRIVACY, IOS_BUNDLE_ID_PATTERN, ANDROID_PACKAGE_PATTERN };
  ```
- `withOutside` (default pending owner Q6): `ios.bundleIdentifier` is `JOTBUN_IOS_BUNDLE_ID` or `co.gogocash.jotbun.localcheck`; `android.package` is `JOTBUN_ANDROID_PACKAGE` or `app.json`'s; a value failing its pattern throws, naming the variable. `ios.entitlements` gains `com.apple.security.application-groups: ['group.<bundle>']` and `keychain-access-groups: ['$(AppIdentifierPrefix)<bundle>', '$(AppIdentifierPrefix)<bundle>.shared']`, the app's own group first so an item saved without a group (the diary key, P2's stores) never lands in the shared one. `ios.privacyManifests.NSPrivacyAccessedAPITypes` gains `OUTSIDE_PRIVACY`, merged by type. `extra.outside` is `{ iosBundleId, androidPackage, appGroup: 'group.<bundle>', keychainGroup: '<team id>.<bundle>.shared' or null without JOTBUN_APPLE_TEAM_ID, scheme }`. `plugins` is the incoming config's then `OUTSIDE_PLUGINS`. Nothing else changes; no `aps-environment` (push is P4's).
- `withExtensionFiles` adds a `withFinalizedMod` iOS mod that writes `ios/<name>/PrivacyInfo.xcprivacy` and, with `keychainGroups`, rewrites `ios/<name>/<name>.entitlements` through `extensionEntitlements` after the package's own writer, plus a `withXcodeProject` mod adding the manifest to that target's resources. Introspection never runs them, so their functions are tested in Node. P6A-T8, T10 and T11 name their target's categories, Apple's reasons confirmed at install.

- [ ] **Step 1: Write the check script and the failing tests.** The script checks, in the first two cases: the bundle id, the package, the app group entitlement, the keychain groups in order, `extra.outside` field by field, the `gogospend` scheme in `CFBundleURLTypes`, and `ios.usesAppleSignIn` true with `expo-apple-authentication` in `plugins` (1C-T7's sign-in survives); in the second also `keychainGroup` `ABCDE12345.th.co.jotbun.check.shared` and the package `th.co.jotbun_check`; the third must exit non-zero naming `JOTBUN_IOS_BUNDLE_ID`. `outsideConfig.test.ts`: `the config's id patterns are P6A-T1's` (equal regex sources); `a privacy manifest declares exactly its entries and no tracking`; `an extension's entitlements gain the shared keychain group and keep the app group`.
- [ ] **Step 2: Run them and see them fail.** `npm run check:native -w gogospend-app` (FAIL, no bundle identifier); unit `outsideConfig.test.ts`.
- [ ] **Step 3: Implement** the config file, the composition, the script entry, the ignore lines and the CI step.
- [ ] **Step 4: Run them and see them pass,** then `npm run test:ops` (its `backend-workflow.test.mjs` reads the edited workflow) and the app gate (`export:web` reads the same config).
- [ ] **Step 5: Mutation check.** Export `withOutside(config, process.env)` alone, over `app.json`: the sign-in check fails. Put the shared keychain group first: the order check fails. Drop `extra.outside`: its check fails. Check the package with the iOS pattern: the `th.co.jotbun_check` case fails.
- [ ] **Step 6: Receipt, commit.** SKIPPED until D33: the final ids, `npx expo prebuild` on a Mac, signing. `git commit -m "Add the native base over 1C's sign-in config: ids from the environment, the app group and keychain groups, privacy manifests and an introspected config check in CI"`

---

### Task P6A-T8: Home and lock-screen widgets (waits on owner Q1)

**Starts after:** P6A-T2, P6A-T3a, P6A-T7, and the owner's answer to Q1

**Files:**
- Modify: `apps/app/package.json`, `package-lock.json` (`npx expo install expo-widgets @expo/ui`, pins ~58.0.19); `apps/app/outsideConfig.js` (the widgets entry; `experiments.inlineModules.watchedDirectories` holding `'native'`, added by whichever of T8 and T12 lands first; `withExtensionFiles` for `ExpoWidgetsTarget` with `NSPrivacyAccessedAPICategoryUserDefaults` `1C8F.1`, for the app group defaults expo-widgets keeps, which `OUTSIDE_PRIVACY` also gains); `apps/app/tsconfig.json` (`include` gains `widgets`); `check-native-config.mjs`; `widgetPort.ts` (`getAppWidgets()` answers this port on iOS and Android); `outsideCopy.draft.ts` (drafts: `outside.widgetAbout` ยอดที่ใช้วันนี้ จำนวนรายการ และที่เหลือต่อวัน; `outside.logAbout` แตะเพื่อจดรายจ่าย)
- Create: `apps/app/widgets/JotbunToday.tsx` (iOS), `widgets/JotbunTodayAndroid.tsx`, `widgets/JotbunLog.tsx`; `apps/app/native/widgets/InstalledWidgets.swift` and `InstalledWidgets.kt` (an inline module); `apps/app/src/wallet/outside/expoWidgets.ts`
- Test: `apps/app/src/wallet/outside/expoWidgets.test.ts` (Node, the widget objects and the module injected; source checks on `widgets/`); a case in `outsideConfig.test.ts`

**Interfaces:**
- Consumes (expo-widgets 58.0.23's types and docs): `createWidget(name, layout, initialProps)`, `updateTimeline(entries)` (iOS only), `updateSnapshot(props)`, `WidgetEnvironment.widgetFamily` and `colorScheme`; the `'widget'` directive (an isolated runtime: the layout imports nothing and reaches nothing outside its own function, so every value comes in its props); the plugin's `enableAndroid` (false by default) and each widget's `android` block (`null` keeps it off Android); `@expo/ui/swift-ui` with `widgetURL(url)`, `font` and `privacySensitive` (confirm the last at install), `@expo/ui/jetpack-compose`'s `Column` and `Text`; WidgetKit's `WidgetCenter.shared.getCurrentConfigurations`, Android's `AppWidgetManager.getAppWidgetIds`; P6A-T2's names; `walletLight`, `walletDark` (P2-T1).
- Produces:
  ```ts
  export type WidgetEntryProps = { entry: WidgetEntry; links: WidgetLinks; labels: WidgetLabels };   // iOS, one per timeline entry
  export type AndroidWidgetProps = { entries: readonly WidgetEntry[]; links: WidgetLinks; labels: WidgetLabels };   // the layout picks the entry current when it is drawn
  export type TimelineWidget = { updateTimeline(entries: { date: Date; props: WidgetEntryProps }[]): void; updateSnapshot(props: WidgetEntryProps | AndroidWidgetProps): void };
  export type InstalledWidgetsModule = { families(): Promise<readonly string[]> };   // WidgetKit family names, or 'android' per placed widget
  export function sizesOf(families: readonly string[]): WidgetSize[];   // systemSmall small, systemMedium medium, systemLarge large, accessory* lock_screen, android small; others dropped
  export function createExpoWidgetPort(widgets: { today: TimelineWidget; log: TimelineWidget }, platform: 'ios' | 'android', installed?: () => Promise<InstalledWidgetsModule | null>): WidgetPort;
  ```
- The plugin entry: `["expo-widgets", { "groupIdentifier": "group.<bundle>", "enableAndroid": true, "widgets": [{ "name": "JotbunToday", "displayName": "Jotbun วันนี้", "description": "ยอดที่ใช้วันนี้ จำนวนรายการ และที่เหลือต่อวัน", "ios": { "supportedFamilies": ["systemSmall", "systemMedium", "accessoryInline", "accessoryCircular", "accessoryRectangular"] }, "android": { "minWidth": 110, "minHeight": 110, "targetCellWidth": 2, "targetCellHeight": 2, "resizeMode": "none" } }, { "name": "JotbunLog", "displayName": "จดรายจ่าย", "description": "แตะเพื่อจดรายจ่าย", "ios": { "supportedFamilies": ["accessoryCircular"] }, "android": null }] }]` (one string each, so Thai first; the lines are E2 drafts).
- `JotbunToday` (`'widget'` directive; default pending owner Q9 and Q13) takes the lock face for accessory families and the home face otherwise, with inline code, and draws it as the boards do: small (outLabel, out, count, side line, Jotbun); medium (today, out, side line, and `labels.record` and `labels.scan` as two links, the second only with `links.scan`, if @expo/ui's `Link` renders inside a widget, else one `widgetURL(links.today)`); inline (the side line, else today); circular (the gauge on a ring of `gaugeFraction`; masked, the label and an eye-off glyph); rectangular (today, out, side line); a stale or signed-out entry draws its `prompt`. Taps open `links.today`; `JotbunLog` draws `labels.log` with a plus and opens `links.record`.
- Amount views are privacy-sensitive, so StandBy and the Today View can redact them (Q9); each family's accessibility label is its `spoken` line; text uses the system font (the app loads its fonts at runtime, which an extension cannot; an E2 deviation); colours are literals declared inside each layout for `environment.colorScheme`, tested equal to `walletLight` and `walletDark`.
- Android (C13): `JotbunTodayAndroid` draws the small face with its `dayLabel`, picking with inline code the newest entry whose `from` is at most `Date.now()` (as `entryAt` does), so a redraw after midnight shows the new day; the plugin writes `updatePeriodMillis` 0, so a closed app is not redrawn and the face's day says which day it counts (X3). How `createWidget` takes each platform's layout is confirmed against the installed package and named in the receipt.
- `createExpoWidgetPort`: iOS calls `today.updateTimeline(snapshot.entries.map((entry) => ({ date: new Date(entry.from), props: { entry, links, labels } })))` and `log.updateSnapshot` with the first entry; Android calls `today.updateSnapshot({ entries: snapshot.entries, links, labels })`; `links` and `labels` are the snapshot's; a throw is swallowed. `installedSizes` answers `sizesOf(await module.families())`, or null when the module cannot load (X10).

- [ ] **Step 1: Write the failing tests:** `iOS gets the three entries as a timeline dated by each entry's start, each with the snapshot's links and labels`; `Android gets every entry in one snapshot, with the links and labels`; `a failing widget call leaves the port usable`; `without the inline module the sizes are unknown`; `families map to widget_added sizes`; `the widget layouts import only expo-widgets and @expo/ui, declare nothing outside their functions and hold no Thai letter` (source checks over `widgets/*.tsx`: every word arrives in props); `their colour literals are the wallet tokens`; `the Android layout chooses its entry from the time it is drawn` (a source check that it compares `Date.now()` with each entry's `from`). `outsideConfig.test.ts`: `the widget extension's manifest declares UserDefaults 1C8F.1`. The check script gains the widget group, both widgets' iOS families, `enableAndroid`, the `JotbunTodayProvider` receiver with `android.appwidget.action.APPWIDGET_UPDATE` in the introspected Android manifest, and `native` in `watchedDirectories`.
- [ ] **Step 2: Run them and see them fail.** unit `expoWidgets.test.ts outsideConfig.test.ts`. Record the counts.
- [ ] **Step 3: Install, add the plugin entry and implement.**
- [ ] **Step 4: Run them and see them pass,** then the app gate and `check:native`.
- [ ] **Step 5: Mutation check.** Date every entry `now`: the timeline test fails. Map accessory families to `small`: the sizes test fails. Read a module-level constant in `JotbunToday`: the source test fails.
- [ ] **Step 6: Device checks, recorded SKIPPED** until D33 and a development build: the five families in light, dark and tinted; private and locked faces (B21); StandBy and Today View redaction (Q9); a tap behind the lock; Thai VoiceOver; the Android widget and its day; midnight on a closed phone; the installed sizes. Commit: `git commit -m "Draw the home and lock-screen widgets from the snapshot through expo-widgets"`

---

### Task P6A-T9: Quick actions and app shortcuts (waits on owner Q4)

**Starts after:** P2-T18, P6A-T4, P6A-T7, and the owner's answer to Q4

**Files:**
- Modify: `apps/app/package.json`, `package-lock.json` (`npm install -w gogospend-app --save-exact expo-quick-actions@6.0.2`; not in SDK 58's bundled list); `apps/app/outsideConfig.js` (`["expo-quick-actions", { "androidIcons": { "record": "./assets/icon.png", "scan": "./assets/icon.png", "today": "./assets/icon.png", "tell": "./assets/icon.png" } }]`, the app icon until shortcut icons are drawn for E2); `quickActions.ts` (`getAppQuickActions()` answers the adapter on iOS and Android); P2-T18's `apps/app/src/wallet/home/WalletShell.tsx` (one `<QuickActionRouting />` beside `AddTrayHost`, with the outside area on)
- Create: `apps/app/src/wallet/outside/expoQuickActions.ts`, `QuickActionRouting.tsx` (calls `useQuickActionRouting()` under the guarded `/spend` stack, never in the root layout, as the package requires)
- Test: `apps/app/src/wallet/outside/expoQuickActions.test.ts` (Node, the module injected), `QuickActionRouting.render.test.tsx` (`initial`, `addListener` and the router hook mocked, the hook doing what Consumes says `build/router.js` does, whose `expo-router/build/hooks` import Vitest cannot resolve; a recording router whose `navigate` spy still navigates)

**Interfaces:**
- Consumes (expo-quick-actions 6.0.2's README and types): `setItems(actions)` with `{ id, title, subtitle?, icon?, params? }` (an empty list clears; `subtitle` iOS only; `symbol:` icons on iOS); `maxCount` (4 on iOS); `initial`, the launch action, set for the life of the process; `useQuickActionRouting(callback?)` from `expo-quick-actions/router` (`build/router.js`: on every mount it routes `initial`, then each listener event, to `params.href` in a `setTimeout`, unless `callback`'s answer is truthy, a promise included); the optional plugin's `androidIcons`.
- Produces:
  ```ts
  export type QuickActionsModule = { setItems(actions: readonly { id: string; title: string; subtitle?: string | null; icon?: string | null; params?: { href: string } }[]): Promise<void>; maxCount?: number };
  export function createExpoQuickActions(load: () => Promise<QuickActionsModule>, platform: 'ios' | 'android'): QuickActionsPort;
  export const QUICK_ICONS: Readonly<Record<QuickItem['id'], string>>;   // 'symbol:plus.circle', 'symbol:qrcode.viewfinder', 'symbol:calendar', 'symbol:bubble.left'
  export function QuickActionRouting(): null;
  ```
- `set(items)` sends `items.slice(0, maxCount ?? 4)` as `{ id, title, subtitle, icon: platform === 'ios' ? QUICK_ICONS[id] : id, params: { href } }`; a throw is swallowed. The routing lands behind the lock (P6A-T4 pins the route). `QuickActionRouting` hands the hook a stable module-level callback that answers `true`, synchronously, for `initial` once this process has routed it, so a remount of `WalletShell` never reopens the launch action, while later actions (new listener events) route each time. At install, one `npx expo export --platform ios` (output discarded) confirms Metro resolves the router's import of `expo-router/build/hooks`, a folder in expo-router 58.0.21; if not, `QuickActionRouting` uses `QuickActions.addListener` and the same once-per-process read of `initial` with expo-router's `router.navigate`.

- [ ] **Step 1: Install the pin, then write the failing tests:** `the four items become the package's actions with their routes and symbols`; `an empty list clears them`; `never more than the platform's maxCount` (a five-item fake); `Android names the icons the plugin registers`; `QuickActionRouting.render.test.tsx`: `a launch quick action opens /spend/add?type=expense once, behind the lock` (a locked `LockGate`: `LockedScreen` drawn and one navigation; after unlocking the amount tray is open); `a remount routes the launch action no more, and a later quick action still routes` (unmount and mount again with the mocked `initial` still set: no second navigation; a listener event with the launch action's id, as a new object, then navigates once; the module is imported afresh for each case); on the Metro check's `addListener` fallback both cases drive that path. The check script gains the four `androidIcons` ids.
- [ ] **Step 2: Run them and see them fail.** unit `expoQuickActions.test.ts`; render `QuickActionRouting.render.test.tsx`. Record the counts.
- [ ] **Step 3: Run the Metro check, add the plugin entry and implement.**
- [ ] **Step 4: Run them and see them pass,** then the app gate and `check:native`.
- [ ] **Step 5: Mutation check.** Send Android the SF Symbol names: the Android test fails. Navigate on every render: the launch test fails. Route `initial` on every mount: the remount test fails.
- [ ] **Step 6: Device checks, recorded SKIPPED** until D33: long-press on iOS and Android; a quick action that launches a locked app; none after signing out. Commit: `git commit -m "Set the quick actions and app shortcuts through expo-quick-actions"`

---

### Task P6A-T10: The iOS share extension that reads in place (B19; waits on owner Q3 and Q6)

**Starts after:** 1C-T5, 1D-T6, P3-T1 (P3:slip-qr), P3-T12 (P3:qr-native), P4-T6 (P4:slips-route), P4-T14 (P4:slip-client), P4-T18 (P4:slips-area), P6A-T6a, P6A-T6b, P6A-T7, and the owner's answers to Q3 and Q6 (the team id keychain sharing needs).

**Files:**
- Modify: `apps/app/package.json`, `package-lock.json` (`npm install -w gogospend-app --save-exact expo-share-extension@5.0.6`); `apps/app/outsideConfig.js` (`["expo-share-extension", { "activationRules": [{ "type": "image", "max": 1 }], "excludedPackages": ["expo-dev-client", "expo-splash-screen", "expo-updates", "expo-font"] }]`; `withExtensionFiles` for `JotbunShareExtension` with `keychainGroups: ['$(AppIdentifierPrefix)<bundle>.shared']` (the package writes only the app group and Sign in with Apple there) and `NSPrivacyAccessedAPICategoryFileTimestamp` `C617.1`, which `OUTSIDE_PRIVACY` also gains, as the package's README asks); `apps/app/src/auth/betterAuthClient.ts` (1C-T5's SecureStore storage wrapper spreads `sharedKeychainOptions(...)` into its options); `eraseOutside.ts` (`forgetOutsideQueues` also forgets the extension's salt copy: `OutsideDeps` gains `salt?: SaltStore`, by default `secureSaltStore(sharedKeychainOptions(appOutsideIds(), Platform.OS))` when that names a group, else none); `outsideCopy.draft.ts` (three lines)
- Create: `apps/app/index.share.js` (installs P3-T12's decoder as `app/_layout.tsx` does, then `AppRegistry.registerComponent('shareExtension', () => ShareExtensionRoot)`), `apps/app/src/wallet/outside/keychainGroup.ts` (pure), `share/ShareExtensionRoot.tsx`, `share/extensionDeps.ts`
- Test: `apps/app/src/wallet/outside/keychainGroup.test.ts` (Node, with source checks), `share/ShareExtensionRoot.render.test.tsx`; a case each in `outsideConfig.test.ts` and `OutsideRoot.render.test.tsx`

**Interfaces:**
- Consumes: expo-share-extension 5.0.6's `index.share.js` entry registered as `shareExtension`, `InitialProps.images` (copied into the app group's `sharedData` folder), `close()`, `openHostApp(path)`, `clearAppGroupContainer()`, `activationRules`, `excludedPackages`; expo-secure-store 58.0.2's iOS `accessGroup`; 1C-T5's `createAppAuthPort()`, `accessToken()` and `idTokenSubject` (the token's `sub` names the account, 1C's K4); 1D-T6's transport option `analyticsOff`; P6A-T6a's `readSharedSlip`, `checkSharedSlip`, `enqueueShare`; P6A-T2's `nextBangkokMidnight`; P6A-T6b's `SharedSlipCard`; P4-T14 (P4:slip-client)'s `createSlipResources`, `createSlipHasher`, `secureSaltStore({ accessGroup })` and `expoSha256` (P4-T12), `pickerShrink` (P4-T13) and `sendOneSlip` (P4-T14); `slipsAreaOn` (P4-T18, P4:slips-area); `getAppQrDecoder`, `installQrDecoder` (P3-T1, P3:slip-qr) and `createExpoCameraQrDecoder` (P3-T12, P3:qr-native); P6A-T1's account file; base `LanguageProvider`, `ThemeProvider`, `todayInBangkok`.
- Produces:
  ```ts
  export function sharedKeychainOptions(ids: OutsideIds, platform: 'ios' | 'android' | 'web'): { accessGroup?: string };   // iOS with a keychain group only
  export function extensionAccount(token: string | null, file: AccountFile | null, digest: Digest): Promise<string | null>;   // the token's sub when accountMarker(sub) is the file's marker, else null
  export function extensionSharedSlipDeps(): Promise<SharedSlipDeps & { marker: string | null; hidden: boolean }>;
  export type ShareExtensionApi = { close(): void; openHostApp(path: string): void; clearShared(): Promise<void> };   // clearShared: the package's clearAppGroupContainer(), which empties only its own sharedData folder
  export function ShareExtensionRoot(props: { images?: readonly string[]; api?: ShareExtensionApi; deps?: () => Promise<SharedSlipDeps & { marker: string | null; hidden: boolean }> }): JSX.Element;
  ```
- Keychain sharing (default pending owner Q7): Better Auth's session items live in `<team id>.<bundle>.shared`, and so does the extension's own copy of the slip salt (`secureSaltStore({ accessGroup })`, the option P4-T12 keeps for this extension): the account's one salt, fetched once by the extension, so its hashes match the app's. The app's salt (P4-T14's store), the diary key and every other item stay in the app's own group (P6A-T7's order). Earlier items stay put: nothing is live (§1), so a development build signs in once more.
- `extensionSharedSlipDeps` reads the account file, gets a token from 1C-T5's port over the shared items, takes the account from `extensionAccount` before anything reads the salt (none, or another account's token: `signedIn` false), reads AI preferences once (`consentRefused` only when they say `companion: false`; a failed read is no refusal), binds `check` as `useSharedSlipDeps` does, and `send` as `sendOneSlip` (`origin: 'share'`) over its own parts: `getAppQrDecoder()`, `pickerShrink()`, `today: () => todayInBangkok()`, `locale` the file's language, `createSlipResources` over a transport whose `analyticsOff` is always true, and `createSlipHasher` with that account id, those resources, `secureSaltStore({ accessGroup })` and `expoSha256()`. `slipsOn` is `slipsAreaOn()`, which sees neither P4's kept release nor P6B-T15's rollout: before the server releases slip import a share is sent once, meets the 404 and waits `paused`, and the app then holds it unsent. `view` names no wallet or category (no diary there; an E2 deviation). An image's media type comes from its file name; another type (HEIC) is `unreadable`, nothing sent.
- The sheet (ox-share-extension under B19) runs `readSharedSlip` on the one image and shows `SharedSlipCard` under `outside.shareTitle`; it never saves a record or sends a transaction command. `outside.done` closes; `outside.openInbox` calls `openHostApp` with P4-T21 (P4:inbox)'s route; จดเอง (`onLogIt`) calls `openHostApp` with `outside/record`. A waiting result is enqueued under the marker (`over_quota` with `notBefore: nextBangkokMidnight(nowMs)`) and says `outside.readsWhenOpen` unless its card line names a time, as `over_quota`'s does; `needs_consent` adds a `PrimaryButton` `outside.openJotbun` opening `spend/shared`, where consent comes first; `signed_out` keeps nothing; a full queue says `outside.full`. Every way out calls `clearShared()` before `close()` or `openHostApp`, so a waiting slip lives only in P6A-T6a's queue. The root wraps the card in `LanguageProvider` (its `device` the file's language) and `ThemeProvider`; the file's `hidden` masks the amount through the card's prop; text uses the system font, an E2 deviation.
- Copy (drafts): `outside.readsWhenOpen` บันจะอ่านสลิปนี้เมื่อเปิด Jotbun; `outside.needsBun` เปิดให้บันช่วยอ่านก่อน; `outside.openJotbun` เปิด Jotbun.

- [ ] **Step 1: The spike** (a development build with D33's team id), before any code: (1) the extension builds on SDK 58; (2) inside it, expo-secure-store reads Better Auth's session item through the shared group (with `withExtensionFiles`' entitlement) and `/api/auth/token` answers a token; (3) P3-T12's decoder reads a slip still image; (4) peak memory stays under the share extension's limit reading a 1170 x 2532 slip (Xcode's memory gauge); (5) `/v1/slips` answers a live read against local `wrangler dev`; (6) Thai text draws with `WalletText` (else the extension's text sets `allowFontScaling={false}`, an accessibility deviation for E2). Record each. If any of (1) to (5) fails, stop: B19's fallback applies and P6A-T11 turns on expo-sharing's iOS extension. Until D33 exists this spike, and so this task, is SKIPPED.
- [ ] **Step 2: Write the failing tests.** `keychainGroup.test.ts`: `iOS with a keychain group shares; without one, or on Android, nothing is shared`; `the Better Auth storage and the extension's salt store use the shared group, and the diary key never does` (`readFileSync` checks on `betterAuthClient.ts`, `share/extensionDeps.ts`, whose `secureSaltStore` call passes `accessGroup`, and `src/storage/deviceDiary.ts`); `the extension takes its account from the token and refuses another account's token` (`extensionAccount` with a `sub` whose marker differs is null, and the fake salt store is never read). `ShareExtensionRoot.render.test.tsx` (fakes): `a slip read in the extension is posted as a live read with origin share and saves nothing`; `every request says X-GoGoSpend-Analytics: off`; `offline, the image is queued and the sheet says Bun reads it when Jotbun opens`; `over quota, the image is queued until the next Bangkok midnight and the sheet never says Bun reads it when Jotbun opens`; `not a slip sends and keeps nothing`; `signed out keeps nothing and asks to sign in`; `with consent refused the image waits and the button opens Jotbun, and unread preferences send it`; `with the slips area off the image waits and nothing is sent`; `before the server releases slip import one send meets the 404 and the image waits`; `จดเอง opens Jotbun's record link`; `private mode masks the amount`; `every way out clears the package's copy`. `outsideConfig.test.ts`: `the share extension's entitlements carry the shared keychain group, and its manifest FileTimestamp C617.1`. `OutsideRoot.render.test.tsx`: `forgetting an account also forgets the extension's copy of its salt and keeps another account's` (a fake `SaltStore` through `OutsideDeps`). P6A-T6b's source check gains `share/extensionDeps.ts`.
- [ ] **Step 3: Run them and see them fail.** unit `keychainGroup.test.ts outsideConfig.test.ts`; render `share/ShareExtensionRoot.render.test.tsx SharedSlip.render.test.tsx OutsideRoot.render.test.tsx`. Record the counts.
- [ ] **Step 4: Install, add the plugin entry and implement.**
- [ ] **Step 5: Run them and see them pass,** then the app gate and `check:native`.
- [ ] **Step 6: Mutation check.** Drop `accessGroup` from the Better Auth storage: the source check fails. Skip the marker check: the other-account test fails. Skip the enqueue when offline: the queue test fails. Leave the salt out of `forgetOutsideQueues`: the forget test fails.
- [ ] **Step 7: Device checks, recorded SKIPPED** until D33: a bank app's e-slip shared on an iPhone; the draft in the inbox; a non-slip refused offline; offline then the next open; Thai VoiceOver. Commit: `git commit -m "Read a shared slip inside the iOS share extension through keychain sharing, leaving a draft in the inbox"`

---

### Task P6A-T11: The Android share target and B19's iOS hand-off (waits on owner Q3)

**Starts after:** P3-T12 (P3:qr-native), P6A-T3b, P6A-T4, P6A-T6a, P6A-T7, and the owner's answer to Q3.

**Files:**
- Modify: `apps/app/package.json`, `package-lock.json` (`npx expo install expo-sharing`, pin ~58.0.18); `apps/app/outsideConfig.js` (`["expo-sharing", { "android": { "enabled": true, "singleShareMimeTypes": ["image/jpeg", "image/png", "image/webp"] }, "ios": { "enabled": false, "activationRule": { "supportsImageWithMaxCount": 1 } } }]`, `ios.enabled` true only when P6A-T10's spike chose B19's fallback, and then `withExtensionFiles` for its extension target (named at install) with UserDefaults `1C8F.1` and FileTimestamp `C617.1`, `OUTSIDE_PRIVACY` gaining the first); `incomingShares.ts` (`getIncomingShares()` answers this source on Android, and on iOS when enabled); `OutsideRoot.tsx` (mounts `ExpoSharingSource`, and clears the incoming shares when the session settles signed out); `check-native-config.mjs` (Android's `SEND` filter for the three types)
- Create: `apps/app/src/wallet/outside/expoSharing.tsx`
- Test: `apps/app/src/wallet/outside/expoSharing.render.test.tsx` (the module mocked); a case in `OutsideRoot.render.test.tsx`

**Interfaces:**
- Consumes (expo-sharing 58.0.20's docs and sources): the plugin options above; `useIncomingShare()` answering `{ resolvedSharedPayloads, isResolving, clearSharedPayloads, error }`, payloads carrying `contentType`, `contentUri`, `contentMimeType`; the app opened at the `expo-sharing` host, which P6A-T4 routes to `/spend/shared`. Its iOS extension copies each file into the app group container's root, and `clearSharedPayloads()` removes only a defaults key.
- Produces:
  ```ts
  export type SharingHook = () => { resolvedSharedPayloads: readonly { contentType: string | null; contentUri: string | null; contentMimeType: string | null }[]; isResolving: boolean; clearSharedPayloads(): void };
  export function ExpoSharingSource(props: { useShare?: SharingHook; groupRoot?: string | null; remove?: (uri: string) => Promise<void> }): null;   // feeds the buffer behind getIncomingShares()
  ```
- `ExpoSharingSource` (default pending owner Q7) keeps the `image` payloads whose `contentMimeType` is JPEG, PNG or WebP (§4), as `{ uri: contentUri, mediaType }`; `take()` waits until `isResolving` is false, then answers and empties the buffer; `clear()` deletes each payload's `file://` copy under `groupRoot` (default: the app group container's uri; nothing outside it), then calls `clearSharedPayloads()`. `/spend/shared` calls `clear()` after enqueueing (P6A-T6b); `OutsideRoot` calls it when the session settles signed out (`hydrating` ending in `signed_out`, or a sign-out), so a slip shared to nobody leaves nothing in the group.

- [ ] **Step 1: Write the failing tests:** `shared images become typed shares once resolved, and other types are dropped` (a JPEG, a PNG, a GIF and a text payload give two, typed `image/jpeg` and `image/png`); `take waits while the share resolves`; `clear deletes each copy inside the app group, and nothing outside it, then clears the payloads`; `an error resolves to nothing`; `OutsideRoot.render.test.tsx`: `a share that arrives signed out leaves no copy behind`. The check script gains Android's intent filter.
- [ ] **Step 2: Run them and see them fail.** render `expoSharing.render.test.tsx OutsideRoot.render.test.tsx`. Record the counts.
- [ ] **Step 3: Install, add the plugin entry and implement.**
- [ ] **Step 4: Run them and see them pass,** then the app gate and `check:native`.
- [ ] **Step 5: Mutation check.** Accept every content type: the type test fails. Skip the copy deletion: the clear test fails.
- [ ] **Step 6: Device checks, recorded SKIPPED** until D33: Android's share sheet from a bank app into Jotbun and the shared-slip screen; the iOS hand-off only when the fallback is on. Commit: `git commit -m "Receive shared slip images on Android, and on iOS through B19's fallback, with expo-sharing"`

---

### Task P6A-T12: Siri through App Intents (waits on owner Q2)

**Starts after:** P6A-T5, P6A-T7, and the owner's answer to Q2

**Files:**
- Modify: `apps/app/package.json`, `package-lock.json` (`npx expo install expo-app-intents`, pin ~0.5.8); `apps/app/outsideConfig.js` (`["expo-app-intents", { "directory": "native/intents" }]`, since the plugin throws unless `experiments.inlineModules.watchedDirectories` covers its directory, `app-intents` by default; `watchedDirectories` holding `'native'`, added by whichever of T8 and T12 lands first; `OUTSIDE_PRIVACY` gains UserDefaults `CA92.1` for the package's `UserDefaults.standard` queue: the intent runs in the app's process and target (A4), so the app's manifest covers it); `siriQueue.ts` (`getAppSiriQueue()` answers the adapter on iOS); `useSiriDrain.ts` (also drains on each new invocation, through `useAppIntents`); `outsideCopy.draft.ts` (the Siri lines); `check-native-config.mjs` (the plugin's `directory`, `native` in `watchedDirectories`)
- Create: `apps/app/native/intents/LogExpenseIntent.swift`, `apps/app/native/intents/JotbunShortcuts.swift`, `apps/app/src/wallet/outside/expoAppIntents.ts`
- Test: `apps/app/src/wallet/outside/expoAppIntents.test.ts`, `siriSource.test.ts` (Node; the second reads the Swift files)

**Interfaces:**
- Consumes (context7): expo-app-intents' `getPendingInvocationsAsync()` (oldest first, 100 kept; it rejects when the stored queue is unreadable, which then starts empty), `removePendingInvocationAsync(id)`, `useAppIntents(handler)`, Swift's `AppIntentDispatcher.shared.dispatch(name:params:)`; Apple's `IntentCurrencyAmount` (`amount: Decimal`), a parameter's `currencyCodes` and `requestValueDialog`, `requestConfirmation(for:dialog:) -> Bool`, `authenticationPolicy` (`.alwaysAllowed` by default), `AppShortcutsProvider` and `AppShortcut(intent:phrases:shortTitle:systemImageName:)`.
- Produces:
  ```ts
  export type AppIntentsModule = { getPendingInvocationsAsync(): Promise<{ id: string; name: string; createdAt: number; params: Record<string, unknown> }[]>; removePendingInvocationAsync(id: string): Promise<void> };
  export function createExpoSiriQueue(load: () => Promise<AppIntentsModule>): SiriQueuePort;   // a rejected read answers []
  ```
- `LogExpenseIntent` (B20, X5, X8; default pending owner Q8, Q11 and Q14): `openAppWhenRun = false`; `authenticationPolicy = .requiresAuthentication`; an `IntentCurrencyAmount` limited to `["THB"]` asked with `outside.siriAskAmount`, an optional `String` note asked with `outside.siriAskNote`, and `outside.siriPromise` as its description. `perform()` reads `outside/account-v1.json` from `FileManager.default.containerURL(forSecurityApplicationGroupIdentifier:)`; without a marker it answers `outside.siriSignIn` and dispatches nothing; it confirms with `outside.siriConfirm` (the amount in P2-T10's compact form, `฿45` or `฿45.50`, and the note), a refusal answering `outside.siriCancelled`; then it dispatches `logExpense` with `amount` (a plain decimal string, "." and no grouping), `note` (or `""`) and `account` (the marker), and answers `outside.siriQueued`, in the file's language.
- `JotbunShortcuts` (default pending owner Q12): one `AppShortcut` with the phrases `"จดรายจ่ายใน \(.applicationName)"` and `"Log spending in \(.applicationName)"`, the short title `outside.record` and the symbol `plus.circle`.
- Copy: `outside.siriAskAmount` จดกี่บาท (draft); `outside.siriAskNote` ค่าอะไร (draft); `outside.siriConfirm` จดรายจ่ายนี้ไหม {amount} {note}; `outside.siriQueued` เก็บไว้แล้ว จะเข้า Jotbun เมื่อเปิดแอป (draft); `outside.siriPromise` Siri ส่งแค่ยอด โน้ต และคำสั่งให้ Jotbun ไม่ใช้ AI ของบัน แก้ต่อได้ในแอปทุกเมื่อ; `outside.siriSignIn` เข้าสู่ระบบใน Jotbun ก่อน (draft); `outside.siriCancelled` ไม่ได้จด (draft).

- [ ] **Step 1: Write the failing tests.** `expoAppIntents.test.ts`: `pending invocations become Siri invocations, oldest first`; `remove removes`; `a queue that cannot be read answers empty`. `siriSource.test.ts`: `the intent dispatches logExpense with exactly amount, note and account`; `it never opens the app to run`; `it asks for an unlocked phone`; `without the account file's marker it dispatches nothing`; `every Siri line in outsideCopy.draft.ts appears in the Swift files in both languages` (the text around each placeholder, verbatim); `both phrases name the app through applicationName`.
- [ ] **Step 2: Run them and see them fail.** unit `expoAppIntents.test.ts siriSource.test.ts`. Record the counts.
- [ ] **Step 3: Install, add the plugin entry and implement** the adapter, the drain trigger and the two Swift files.
- [ ] **Step 4: Run them and see them pass,** then the app gate and `check:native`.
- [ ] **Step 5: Mutation check.** Set `openAppWhenRun = true`: its source test fails. Leave `authenticationPolicy` at Apple's default: the unlocked-phone test fails. Drop the `account` parameter: the dispatch test fails.
- [ ] **Step 6: Device checks, recorded SKIPPED** until D33: Siri in Thai and English; the asked amount and note; the confirmation; the record in the outbox at the next open, dated the day it was spoken; signed out, Siri asks to sign in; a locked phone asks to unlock first. Commit: `git commit -m "Log spending with Siri through App Intents, queued natively until Jotbun opens"`

---

### Task P6A-T13: After E2: route outside the app

**Starts after:** P2-T38, P4-T21 (P4:inbox), P4-T19 (P4:scan-route), P4-T18 (P4:slips-area), P6A-T3a, P6A-T3b, P6A-T4, P6A-T6b, and the owner's approval of the E2 checkpoint below

**The E2 checkpoint** (a controller step before this task), as P2's: with `EXPO_PUBLIC_REDESIGN=catalogue,wallet,outside` on the iOS simulator, the eight `bw-ox-*` sections of P6A-T3a and P6A-T6b (`gogospend://dev/catalogue?section=<id>&theme=<light|dark>&locale=<th|en>&chrome=off`, after 8 s) in light and dark Thai and light English, and the shared screen at AX5; a copy sheet of every `outside.*` line; X1 to X12; and the deviations: Q11, Q13, the quick action's day, the system font outside the app, ox-share-extension's แก้ไข, บันทึก and "· บันทึกเมื่อคุณกดเท่านั้น" replaced under B19, §6.13's one-sentence Siri example asked in turns (App Shortcut phrases carry no amount), and widget faces approved as React Native previews (SwiftUI screenshots once P6A-T8 has a build; SKIPPED until then). No simulator: SKIPPED, and the owner gets the section ids (1D-T8's Pattern B).

**Files:**
- Modify: `apps/app/src/config/featureFlags.ts` (`'outside'` joins `APPROVED`) and its test; `en.json`, `th.json` (each approved line under a camelCase `outside…` key); `catalogs.test.ts`; `apps/app/src/wallet/copy/allCopy.ts` (P2-T38's `ALL_COPY` gains the table); `useOutsideCopy.ts` (an approved line reads through `useWalletCopy()`, and in `outsideT(locale)` through `translateCopy(OUTSIDE_COPY[key], locale, values)`; other lines still read the draft table); `outsideRoutes.ts` (P4-T19 (P4:scan-route)'s `SLIP_SCAN_HREF`, else null: `outsideScanHref()` while P4-T18 (P4:slips-area)'s `slipsAreaOn()`, `useOutsideScanHref()` while its `useSlipsArea()`, so P6B-T15's rollout reaches the quick action and the snapshot's link); `outsideCopy.draft.ts` (keeps only unapproved lines); P6A-T8's gallery strings and P6A-T12's Swift lines, when landed, take the approved wording (T12's source test then reads the catalogs); `premium-progress.md` (the owner's words)
- Create: `apps/app/src/wallet/outside/copy.ts` (`OUTSIDE_COPY = { 'outside.<name>': '<English>' }`, P2-T38's form; `tc()` lets the first key with an English value win, so no other `en.json` key may hold a line's English with other Thai: `outside.done` is not "Done", which `redesignDone` holds with เสร็จสิ้น)

**Interfaces:**
- Consumes: `useWalletCopy`, `ALL_COPY` (P2-T38); base `translateCopy`; `SLIP_SCAN_HREF` (P4-T19, P4:scan-route); `slipsAreaOn`, `useSlipsArea` (P4-T18, P4:slips-area); `installQrDecoder`, `fakeQrDecoder` (P3-T1, P3:slip-qr).
- Produces: the `outside` area approved; `outsideScanHref()` and `useOutsideScanHref()` set, which turn on the scan quick action and the medium widget's scan link while P4's slips area is on (X12).

- [ ] **Step 1: Write the failing tests:** `outside is on by default and -outside turns it off`; `every outside line in use is in en.json and th.json with the same placeholders`; `every outside line reads its approved Thai in th` (through `translateCopy`, as `useWalletCopy` reads it; `outside.done` is เสร็จ, never เสร็จสิ้น); `no approved outside line stays in the draft table`; `OutsideBridge.render.test.tsx`: `with the slips area on, the scan quick action and the snapshot's scan link open P4-T19 (P4:scan-route)` (`slips` named; `installQrDecoder(fakeQrDecoder({}))` first and `installQrDecoder(null)` after) and `with the slips area off, neither shows` (A3); `the bridge follows the slips hook and the link map follows the pure switch` (`useSlipsArea` mocked off while `slipsAreaOn` answers true: no scan action and `links.scan` null, while `redirectSystemPath` still gives `SLIP_SCAN_HREF` for `gogospend://outside/scan`).
- [ ] **Step 2: Run them and see them fail.** unit `src/config/featureFlags.test.ts src/i18n/catalogs.test.ts outsideCopy.test.ts`; render `OutsideBridge.render.test.tsx`. Record the counts.
- [ ] **Step 3: Move the copy** with the owner's E2 edits (a short Node script under the scratchpad writes the entries from the draft table; review its output by hand), switch the hooks, set the scan route and approve the area.
- [ ] **Step 4: Run them and see them pass,** then the app gate and `check:native`.
- [ ] **Step 5: Mutation check.** Remove one Thai entry: `catalogs.test.ts` fails. Give `outside.done` the English "Done": the own-Thai test fails. Answer the scan route with the slips area off: the scan test fails. Read `slipsAreaOn()` in `useOutsideScanHref`: the hook test fails.
- [ ] **Step 6: Receipt, commit.** `git commit -m "Switch on the outside surfaces after the owner's E2 approval, and move their copy into the catalogs"`

---

### Task P6A-T14: The proof on real phones (recorded SKIPPED until D33)

**Starts after:** P6A-T13, and each of P6A-T8 to P6A-T12 that was built; a surface whose task was skipped because the owner declined its package is recorded SKIPPED (owner declined Qn)

**Files:**
- Modify: `docs/implementation/premium-progress.md` (the phase 6A proof receipt)

**Interfaces:** none; this task runs checks and records them. Every check is recorded **SKIPPED**, with its reason, until the D33 ids (Q6), the owner's package answers (Q1 to Q4) and development builds on an iPhone and an Android phone exist, against local `wrangler dev` as phase 1's proof is.

- [ ] **Step 1: Widgets.** Every family shows Home's figures; the eye masks every amount (D41); the Face ID lock masks the lock screen (B21); StandBy and the Today View redact on a locked phone (Q9); a closed phone shows a new day at Bangkok midnight and no budget figures on the 1st (X3); a tap opens Jotbun behind the lock; Thai VoiceOver reads each face.
- [ ] **Step 2: Quick actions and shortcuts.** The board's four with today's count; no Tell Bun with AI off; none signed out; Android the same without subtitles.
- [ ] **Step 3: Share.** A bank app's e-slip shared on an iPhone (in the extension, or the app after B19's fallback) leaves a slip draft in the inbox and saves nothing, and confirming it makes a `share_extension` record (A1); a picture without a slip QR is refused offline; a slip shared offline is read at the next open; Android's share target does the same.
- [ ] **Step 4: Siri.** Both phrases ask for the amount and note and confirm; the record reaches the outbox at the next open, dated the day it was spoken; signed out, Siri asks to sign in and queues nothing.
- [ ] **Step 5: Analytics.** With consent and the PostHog project (D33), one `widget_added` per new size and Siri's `record_saved` with `source: siri` arrive with no amount, note or name.
- [ ] **Step 6: Receipt, commit.** Each check with its expected result and SKIPPED reason. `git commit -m "Record the phase 6A proof on real phones as SKIPPED until the D33 accounts and development builds exist"`

---

## Self-review notes (for the executor)

- **Names other plans use:** `forgetOutsideQueues` (1C-T8's other-account erase; later data kept outside the app joins it); `OutsideBridge`'s quick actions and `useOutsideScanHref` (P6B-T15); `withOutside` and the `JOTBUN_*` ids (P6C-T12); the id patterns (P6A-T1 (P6A:native-ids), P6C-T2).
