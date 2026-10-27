# Phase 6B: The beta's in-app extras Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the closed beta its in-app extras: the cashback tab; Settings, Privacy, sign-in and account in the Bun Wallet look; the restore and generic error states; the month recap as an image; passkeys; choice-only surveys; remote flags with rollouts and experiments; and the store link on update required, behind the unapproved `extras` area until the owner's E2 approval.

**Architecture:** Screens live in `apps/app/src/wallet/<area>/` on P2's kit, routed only while the `extras` redesign area is on, as P2 did with `wallet`. Rules move into hooks shared by the old and new screens, each proven by the old suite unchanged. Analytics stays 1D's: survey events and flag exposure pass 1D-T1's gate, choice-only and after yes; remote flags reach the client through `updateFlags`; everyone else gets build defaults, and KV kill switches stay the server's (C12). Only restore progress touches the server: a ready snapshot gains an entity count (additive).

**Tech Stack:** Expo SDK 58 (expo 58.0.12, React Native 0.88.0, expo-router 58.0.21) with P2's wallet kit; `@shopify/react-native-skia` 2.14.0 (approved in §4; the SDK 58 pin) for the recap image only; expo-file-system 58.0.9, expo-clipboard 58.0.3, expo-crypto 58.0.6, React Native's `Linking` and `Share` (installed); posthog-react-native 4.83.0 on `@posthog/core` 1.60.1 behind 1D's wrapper and `@better-auth/passkey` 1.6.33's routes through 1C's client (both read in the published builds); Vitest 4.1 and Node's test runner; edge: `@cloudflare/vitest-plugin` 1.4.7.

**Spec:** [docs/superpowers/specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md](../specs/2026-10-25-jotbun-bun-wallet-cloudflare-design.md). This plan implements the controller's boundaries section 2, "P6B: The beta's in-app extras" (§8 phase 6): §5.2 (cb-*, st-*, sa-*, es-restore, es-error-generic, ox-share-card), §7 (surveys, flags, experiments, `cashback_card_tapped`, `recap_shared`, `passkey_created`), C9, C12, D16, D34, D41, D42, the controller's calls B22 to B25 and amendments A10 to A12. The boards (`docs/design/bun-wallet/<board>.dc.html`) are the visual spec.

## Shared files

Every P6B edit to these is additive and named in its task (app paths are relative to `apps/app/`):
- `src/config/featureFlags.ts` (T1 adds `extras`, T20 approves it); `src/dev/catalogue/registry.tsx` (T1); `en.json`, `th.json`, `catalogs.test.ts` (T20 only); `app.json` (T10); `docs/implementation/premium-progress.md` (receipts under "## P6B: The beta's in-app extras").
- P2's wallet files: the tab bar, Home's pill, the wallet tile and the recap card (T2, T12), `screens/redesign/insights/recapData.ts` (T12), `WalletShell.tsx` (T12, T13), `WalletHomeScreen.tsx` (T9, T11, T19), `BudgetQuestion.tsx`, `SaveFlight.tsx` (T16), `SetupScreen.tsx` (T4), `LockSettingsRow.tsx` (T3), `AddTrayHost.tsx` (T15), `sweep.render.test.tsx` (T1), the screens T9 names, `allCopy.ts` (T20).
- Today's screens whose rules move into hooks (X2): `PrivacyScreen.tsx`, `CompanionSettings.tsx` (T5, T15), `SignInScreen.tsx` (T7), `SettingsScreen.tsx` (T8), `RemindersScreen.tsx` (T4), `CashbackCard.tsx` (T2), and 1C-T8's `EmailCodeScreen.tsx`, `TermsScreen.tsx`, `TermsGate.tsx` (T7), `SessionEndedScreen.tsx`, `DevicesScreen.tsx`, `useFreshSignIn.tsx` (T8, T17).
- Other plans' files: P4-T21's `NotificationsOffScreen.tsx` (T4); P3's `aiArea.ts`, P4's `slipsArea.ts`, P5's `travelArea.ts` and P6A-T4's `OutsideBridge.tsx` (T15). P6B files others join: `WalletSettingsScreen.tsx` (P3-T14, P4-T21, P4-T22 and P5-T26, once T3 lands); `WalletPrivacyScreen.tsx` and `companionSwitches.ts` (P3-T14, if T5 lands first); the amounts of T3, T8 and T12 (P5-T18d, if they land first).
- 1D's analytics: `events.ts` (T2, T17), `gate.ts`, `controller.ts`, `bus.ts`, `appAnalytics.ts`, `testing/recordAnalytics.ts`, `neverSent.test.ts` (T13, T14); `catalog.ts` is unchanged, as every name P6B sends is allowed. 1C's auth: `betterAuthPort.ts`, `betterAuthClient.ts`, `credentialProvider.ts`, `sessionStore.ts`, `fakeAuthServer.ts` (T17); `app.config.js` (T18).
- Plumbing: `src/api/client.ts`, `client.test.ts` (T9; 1D-T6 also edits the test), `src/testing/renderSetup.ts` (T15), `src/config/env.ts` (T5, T9, T13, T18, T19), `src/sync/*`, `spendDiary.ts`, `fakeDiary.ts`, `fakeServer.ts` (T10, T11), `resources.test.ts` (T10); the routes `app/settings/index.tsx`, `privacy.tsx`, `app/login.tsx`, `login/email.tsx`, `login/account-exists.tsx`, `app/session-ended.tsx`, `app/spend/reminders.tsx` (one task each); `package.json` and the root lockfile (T12 Skia, T18 the passkey package; one install per merge, then `npm run test:ops`).
- Contracts and edge: in `packages/contracts/src/`, `index.ts` (T0, T10), `v1/privacy.ts` (T0), `v1/sync.ts` and `v1/auth.ts` (T10); in `apps/edge/`, 1B-T8's `src/vault/files/snapshots.ts` and `test/workers/snapshots.test.ts`, `src/vault/schema.ts`, the vault migrations and journal, `test/workers/vault-schema.test.ts`, and P6C-T6's `scripts/release/kv-seed.mjs` if it landed first (T10).

## Calls made in this plan

The builder's calls; the owner can overturn any.
- **X1. One unapproved area, `extras`** (P2's W1); drafts in `src/wallet/<area>/copy.draft.ts`, read through T1's `useExtrasCopy` (P2's `tableT`), never P2's own `copy.ts` (English only after P2-T38).
- **X2. Rules move, never fork** (P2's W2); each moved hook is named in its task.
- **X3. The cashback tab** is bw-home's fourth tab (B23, D16, D42), opened by the pill, tile and recap card (ending R73's "opens nothing"); cb-merchant's category is left out, as a brand's records can sit in several.
- **X4. Surveys are our own trays over PostHog's API surveys** (B24), as PostHog's widget takes no font family; the leaving answer goes anonymously once the deletion is accepted; "after Ask Bun" is P3's `ask_bun_rated`.
- **X5. Remote flags only after yes** (B25): 1D-T6's `disableRemoteFeatureFlags: true` stays; the controller asks `/flags/?v=2` after yes, calls `updateFlags` and keeps the last answer per account.
- **X6. Restore progress:** a ready snapshot gains `entity_count`; no time estimate or "this month first" lines (the snapshot is ordered by entity and id).
- **X7. The support code** is the request id's first 8 hex digits (`7F2A-91C0`), not the board's 4, which could match several requests a day.
- **X8. The deletion short code** is `DEL-` and the Crockford base32 of the request id's first 40 bits (`DEL-1CZJ-R7KA`).
- **X9. The recap image:** a 1080 x 1920 Skia card; iOS shares the PNG; Android, whose `Share` drops `url`, shares P2-T32's text; amounts start hidden even with private mode off.
- **X10. Terms:** plan 1C's terms step accepts the required policies after sign-in (A11); P6B-T7 only draws it as sa-terms.
- **X11. Passkeys** run on a `PasskeyAuthenticator` port over Better Auth's routes, as the published client's ceremony needs the browser's `navigator.credentials`.
- **X12. Language:** Thai and English only; no Buddhist-year switch (§5.1 keeps it in Thai).
- **X13. No display name** on sa-account, sa-passkey's card or es-session-ended (W32), no times on rows (W12), no required version on update required (W37).
- **X14. The email code stays 1C's one `TextInput`** drawn as six boxes; the board's keypad would hide the system's code suggestion.
- **X15. Our side only:** es-error-generic replaces a load problem only for a 500, 502, 504 or unreadable answer.

## Owner questions

Each has a default the plan follows, marked "default pending owner Qn" where used (R26).
- **Q1. The native passkey package** (`react-native-passkey` 3.6.2, `react-native-passkeys` 0.4.2 or `expo-passkey` 0.3.15; npm metadata only, SDK 58 behaviour UNVERIFIED) and the D33 domain. Default: none; passkeys stay hidden; P6B-T18 waits.
- **Q2. Android image shares and saving to Photos** (`expo-sharing` ~58.0.18, `expo-media-library` ~58.0.9). Default: neither; Android shares text; no "บันทึกรูป".
- **Q3. Vietnamese on st-language.** Default: not offered. **Q4. The Buddhist-year switch** (D18: พ.ศ. dates are a display option; st-settings and st-language draw "วันที่แบบ พ.ศ."). Default: not built, so Thai keeps today's Buddhist years.
- **Q5. The deletion short code.** Default: X8. **Q6. The support code.** Default: X7. **Q7. Restore counts.** Default: X6 with C5's version bump (P6B-T10); a header on the status reply would need no forced update.
- **Q8. B23.** Default: the bridge catalogue, not §6.3's `merchants`.
- **Q9. B24 and the survey words** (P6B-T13), once per survey per account, one per launch; "after Ask Bun" as X4 says. Default: as written.
- **Q10. B25's rollout defaults** (the controller's, with counsel). Without remote flags (a no, never asked, offline before any load) a feature shows only if its build default is on, so all-off defaults withhold Bun AI, slip import and travel from people who said no (D34's answer may then not be free under the PDPA) and from everyone until the owner's flags exist. Options: (a) defaults on through the closed beta, flags narrowing exposure after yes; (b) a KV rollout percentage (C12) bucketed by a hash of the account id, alike for everyone. Default until decided: off; P6B-T15 lands once the owner's flags exist, set to everyone for the beta.
- **Q11. The experiments:** the budget question `control` or `no_presets`; the save `control` or `still` (no flying chip); the first reminder 20:00 or `later` 20:30; judged on activation and logging days, never spending. Default: as written.
- **Q12. The C9 address and the privacy policy page** (`EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_PRIVACY_URL`). Default: empty, so Contact us and the policy row stay hidden.

**Owner-side configuration** (P6C's owner checklist; SKIPPED until done): P6B-T13's three surveys, P6B-T14's flags, the store URLs, and `EXPO_PUBLIC_PASSKEY_DOMAIN` with 1C-T1's `PASSKEY_RP_ID`.

## Global Constraints

- **P2's Global Constraints hold;** P6B adds or narrows:
- **Paths:** app paths are relative to `apps/app/`; others start at the repository root.
- **Packages (§4):** P6B-T12 installs `@shopify/react-native-skia` (2.14.0) with `npx expo install`; P6B-T18 only the passkey package the owner approves (Q1). No other package, and no lockfile regeneration with Linux bindings.
- **E2 (handover §3):** P2's rule, with drafts per X1: board lines verbatim, other Thai lines marked draft; no U+2013 either, and no exclamation marks.
- **Kit and accessibility:** one `PrimaryButton` per screen, other actions `TextLink`, trays P2-T13's `Tray`; P6B-T1 puts every `EXTRAS_SECTIONS` entry under P2-T37's sweep. Each screen task adds `src/dev/catalogue/extras/<name>Sections.tsx`, a `bw-` section per state it draws, titled `Bun Wallet: …` (P2-T8).
- **Money:** amounts only through `WalletAmount` or `hiddenAmount(currency)` (D41; `HIDDEN_AMOUNT` before P5-T16), in a record's `currency ?? 'THB'` or, for totals and budgets, `DiaryView.homeCurrency` (P5-T18a); a task landing before P5-T18d stays THB, and P5-T18d converts it; cashback is a count, never baht (D42).
- **Analytics (R23 to R25, B24, B25):** P2's rule, and survey events and `$feature_flag_called` only after yes; nothing on §7's never-sent list in any event, survey answer, flag request, mail or share; no free text.
- **Gates (C12):** no client code stands in for a server gate.
- **Contracts and migrations:** only P6B-T0 (a pure helper) and P6B-T10 (an additive DTO field, both shapes accepted, C5's version bump) change `packages/contracts`; T10's vault migration is `NNNN_snapshot_entity_count.sql`, numbered by the integrator.
- **Native code** sits behind a port or a lazy `import()`; Skia and the passkey adapter live in `.native` files.
- **Steps:** P2's standard steps; "see them fail" means assertion failures against typed stubs, never a missing module; "Implement" means the Produces block in the task's Files; store and hosted checks are **SKIPPED** until run, as device and owner ones are.
- **The gates:** P2's app gate, whose `typecheck:routes` checks every `href` against `app/`, so the first task that links to a route creates its file; T10 adds the edge gate (`npm run typecheck:edge && npm run test:edge && npm run test:edge:workers && npm run build:edge`, plus `npm run test:edge:db` while it exists).
- **E2 checkpoints** (controller): E2-X1 once T2 to T4 land, E2-X2 after T12, E2-X3 after T17, captured as P2's are (with `extras` in `EXPO_PUBLIC_REDESIGN`; the web catalogue without a development build) at 320 and 390 pt, the cashback tab and Settings also at AX5; the owner's words go in the receipts.
- **Routes:** a new route file shows its screen while `extras` is on and otherwise redirects to the route it names.

## Review Focus

1. **A person who said no, never answered, or signed out** gets no survey, no `/flags` request and no `$feature_flag_called`; a no from another phone empties the flags at the next foreground (P6B-T13 `no survey shows for a person who said no, never answered or signed out, or while a tray is open`; P6B-T14 `no flags are asked for unless the answer is yes`).
2. **Free text in a survey or flag:** an answer outside its choices, an unknown survey id, a flag payload or a typed note never leaves (P6B-T13 `an answer that is not one of the choices drops the event`; P6B-T14 `$feature_flag_called passes only after yes, without payloads`).
3. **The share card with private mode off** starts hidden, and its PNG never outlives the sheet, even when sharing throws (P6B-T12 `the PNG is deleted after the sheet closes, also when sharing throws`).
4. **A deletion that was not accepted** never shows a DEL code, erases or signs out (P6B-T6 `a refused or unconfirmed request keeps the account and shows no code`).
5. **A restore cut short** leaves no card behind, and the count never passes the total (P6B-T11 `a failed chunk ends the report with null`, `fetched never passes the total`).

## File structure

**Lanes:** First T0, T10 and T14 (each needs only earlier plans), then T1. Screens: T2, T3 and T4; T3 then T5; T5 then T6 and T7; T7 then T8. States: T9; T10 then T11; T12. Analytics: T13 after T6; T14 then T16; T15 once its Starts after has landed and the owner's flags exist (Q10). Passkeys: T17 after T8, then T18 after Q1 and P6C. T19 after T1. T20 after E2; T15, T18 and T19 may land after it; T21 last.

---

### Task P6B-T0: The deletion short code

**Starts after:** base

**Delivers:** P6B:deletion-code

**Files:**
- Modify: `packages/contracts/src/v1/privacy.ts`, `packages/contracts/src/index.ts`
- Test: `src/wallet/settings/deletionCode.test.ts` (Node)

**Interfaces:**
- Produces, exported from `@gogospend/contracts` under A12's name:
  ```ts
  export function deletionShortCode(requestId: string): string   // X8: 'DEL-' + 8 Crockford base32 digits of the first 40 bits, as XXXX-XXXX
  ```
- The first 10 hex digits of the id (dashes removed, any case) as one 40-bit number, written as 8 base32 digits most significant first in the alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ`. Default pending owner Q5.

- [ ] **Step 1: Write the failing test.**
  ```ts
  test('the short code is DEL and eight Crockford digits of the request id', () => {
    assert.equal(deletionShortCode('0b3f2c1e-6a4d-4f6e-9a51-2f3c4d5e6f70'), 'DEL-1CZJ-R7KA');
    assert.equal(deletionShortCode('0B3F2C1E-6A4D-4F6E-9A51-2F3C4D5E6F70'), 'DEL-1CZJ-R7KA');
    assert.equal(deletionShortCode('ffffffff-ffff-4fff-bfff-ffffffffffff'), 'DEL-ZZZZ-ZZZZ');
    assert.equal(deletionShortCode('00000000-0000-4000-8000-000000000000'), 'DEL-0000-0000');
  });
  ```
- [ ] **Step 2: Run it and see it fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run it and see it pass.**
- [ ] **Step 5: Mutation check.** Use the RFC 4648 alphabet: the test fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the deletion short code to the contracts"`

---

### Task P6B-T1: The extras area, its draft copy, sweep and rows, and the cashback model

**Starts after:** P2-T3, P2-T8, P2-T10, P2-T37

**Files:**
- Modify: `src/config/featureFlags.ts` (`RedesignArea` gains `'extras'`, not in `APPROVED`), `featureFlags.test.ts`; `src/dev/catalogue/registry.tsx` (`...EXTRAS_SECTIONS` last in `CATALOGUE_SECTIONS`)
- Create: `src/wallet/extras/useExtrasCopy.ts`; `src/wallet/settings/SettingsRows.tsx`; `src/dev/catalogue/extras/index.ts`, `rowsSections.tsx` (`bw-settings-rows`: each row, a busy and a disabled switch); `src/wallet/cashback/cashbackHub.ts` (pure)
- Test: `src/wallet/extras/draftLines.test.ts` (Node, over every `src/wallet/**/copy.draft.ts`), P2-T37's `src/wallet/sweep.render.test.tsx` (`EXTRAS_SECTIONS` beside `WALLET_SECTIONS`), `src/wallet/settings/SettingsRows.render.test.tsx`, `src/wallet/cashback/cashbackHub.test.ts` (Node)

**Interfaces:**
- Consumes: `DraftTable`, `WalletT`, `tableT` (P2-T3, kept by P2-T38); `WalletText` (P2-T1); `mountWallet`, `AX5` (P2-T8); `PrivateModeProvider` (P2-T10); `countCashbackPurchases`, `CASHBACK_MIN_DAYS_LOGGED` (`cashbackModel.ts`).
- Produces:
  ```ts
  export function useExtrasCopy(table: DraftTable): WalletT   // tableT(table, useActiveLocale())
  export function SegmentRow<T extends string>(props: { label: string; value: T; choices: readonly { value: T; label: string }[]; onChange(value: T): void }): JSX.Element   // radios, each 44 pt
  export function LinkRow(props: { label: string; detail?: ReactNode; onPress(): void; testID?: string }): JSX.Element                    // 44 pt, detail, chevron
  export function SwitchRow(props: { label: string; caption?: string; value: boolean; busy?: boolean; disabled?: boolean; onChange(next: boolean): void }): JSX.Element
  export const EXTRAS_SECTIONS: readonly CatalogueSection[]
  export type CashbackShop = { readonly key: string; readonly name: string; readonly count: number; readonly href: string }
  export type CashbackHub =
    | { state: 'unavailable' } | { state: 'waiting'; logged: number } | { state: 'unknown' } | { state: 'ask' } | { state: 'off' }
    | { state: 'hub'; count: number; shops: readonly CashbackShop[]; homeHref: string }
  export function daysLoggedIn(month: string, days: readonly string[]): number   // distinct dates within the month
  export function cashbackHub(input: { catalogue: CashbackCatalogue | null; records: readonly TransactionDto[]; daysLogged: number; tipsOn: boolean | null; declined: boolean }): CashbackHub
  ```
- `cashbackHub` decides in order: no catalogue (404), `unavailable`; under 7 days, `waiting` (D16); `tipsOn` null, `unknown`; `tipsOn` true, `hub` from `countCashbackPurchases` in its order, each shop's `href` its brand's; `declined`, `off`; else `ask`.
- **The draft rule (X1):** each area keeps `src/wallet/<area>/copy.draft.ts` exporting `DRAFT = { '<prefix>.<name>': { th, en } } as const satisfies DraftTable`, read with `useExtrasCopy(DRAFT)`; prefixes are lowercase, keys unique across every draft and P2 `copy.ts` table, and the first task to write a file creates it. A task's Copy line lists only its draft lines; every other line is its board's, verbatim. Every English line, and each Thai line marked draft, waits for the task's E2 checkpoint.
- **The sweep:** P2-T37's `sweep.render.test.tsx` also runs over every `EXTRAS_SECTIONS` entry, so its three checks, the private one as P5-T16 widens it to every currency, cover P6B's screens.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  const catalogue: CashbackCatalogue = { source: 'builtin', updated_at: null, home_href: GOGOCASH_HOME, brands: [...BUILTIN_CASHBACK_BRANDS] };
  const input = (over = {}) => ({ catalogue, records: monthRecords, daysLogged: 7, tipsOn: true, declined: false, ...over });
  test('the tab waits until seven days of this month are logged', () => {
    assert.deepEqual(cashbackHub(input({ daysLogged: 6 })), { state: 'waiting', logged: 6 });
    assert.equal(cashbackHub(input()).state, 'hub');
  });
  test("days logged count this month's distinct dates only", () => {
    assert.equal(daysLoggedIn('2026-10', ['2026-09-30', '2026-10-01', '2026-10-01', '2026-10-24']), 2);
  });
  test("tips on: a count and its shops with each brand's link, and no amount", () => {
    const hub = cashbackHub(input());
    assert.ok(hub.state === 'hub' && hub.count === 14);
    assert.deepEqual(hub.shops.map((s) => [s.key, s.count]), [['shopee', 9], ['lazada', 4], ['agoda', 1]]);
    assert.deepEqual(Object.keys(hub.shops[0]).sort(), ['count', 'href', 'key', 'name']);
  });
  test('undecided asks, a later stays off, unread preferences wait, a switched-off bridge is unavailable', () => {
    assert.deepEqual([input({ tipsOn: false }), input({ tipsOn: false, declined: true }), input({ tipsOn: null }), input({ catalogue: null })]
      .map((i) => cashbackHub(i).state), ['ask', 'off', 'unknown', 'unavailable']);
  });
  ```
  `monthRecords`: expenses from `src/spend/v1/redesign/testing/fixtures.ts`, nine with merchant `Shopee`, four `Lazada`, one `Agoda`, two with no brand. Also: `the extras area is off unless named` (`'extras'` and `'all'` on; `'extras,-extras'`, `'off'` and no value off); P2-T3's three draft checks over `copy.draft.ts` (same placeholders; no emoji or dash; unique prefixed keys); the sweep over `EXTRAS_SECTIONS`; `SettingsRows.render.test.tsx`: `each row is one control named by its label; a radio or switch reports its state, and a busy or disabled switch ignores a press`.
- [ ] **Step 2: Run them and see them fail,** with a temporary probe section (a 36 pt `Pressable` and the text `฿1,234`) failing the 44 pt and private cases. Remove the probe. Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with `CatalogueScreen.render.test.tsx` unchanged.
- [ ] **Step 5: Mutation check.** Show the hub at 6 days: the waiting case fails. Count repeated dates: the days case fails. Put `'extras'` in `APPROVED`: the flag case fails. Let a busy switch call `onChange`: the rows case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the extras area, its draft copy, sweep and rows, and the cashback tab's model"`

---

### Task P6B-T2: The cashback tab (cb-intro, cb-hub, cb-merchant, cb-waiting; B23)

**Starts after:** P6B-T1, P2-T4, P2-T13, P2-T16, P2-T18, P2-T22, P2-T24, P2-T32, 1D-T1

**Files:**
- Create: `src/wallet/cashback/useCashbackHub.ts`, `useOpenCashback.ts`, `CashbackScreen.tsx`, `CashbackIntroTray.tsx`, `MerchantTray.tsx`, `WhyTray.tsx`, `copy.draft.ts`; `src/screens/redesign/insights/cashbackCatalogue.ts` (`CashbackCard.tsx`'s private `useCatalogue`, moved); `app/spend/cashback.tsx` (`CashbackScreen`, with `wallet` on too; else `/spend`)
- Modify: `CashbackCard.tsx` (`undefined` reads as today's null); with `extras` on, P2-T18's `src/wallet/home/WalletTabBar.tsx` and `walletTab`, P2-T24's `home/CashbackPill.tsx`, P2-T22's tile in `wallets/WalletDetailScreen.tsx`, P2-T32's card in `recap/WalletRecapScreen.tsx`; 1D-T1's `src/analytics/events.ts`, `events.test.ts`
- Test: `src/wallet/cashback/Cashback.render.test.tsx`; `CashbackCard.render.test.tsx` and P2-T18's, T22's, T24's and T32's suites run unchanged

**Interfaces:**
- Consumes: `cashbackHub`, `daysLoggedIn`, `SwitchRow` (P6B-T1); `SpendDiary.loggedDays()` (P2-T4); `useAiCompanion()`; `readCashbackDeclined`, `writeCashbackDeclined`; `readAllPages` (`insightsModel.ts`); `useAddTray` (P2-T16); `Tray`, `PrimaryButton`, `TextLink` (P2-T13).
- Produces:
  ```ts
  export function trackCashbackCardTapped(p: { eligibleRecords: number }): void   // events.ts: 'cashback_card_tapped' { eligible_records }
  export function useCashbackCatalogue(): CashbackCatalogue | null | undefined      // moved: undefined until answered, null on 404, the built-in list on other failures
  export function useCashbackHub(now?: Date): { hub: CashbackHub | 'loading'; turnOn(): Promise<void>; turnOff(): Promise<void>; later(): Promise<void>; retry(): void }   // 'loading' until the catalogue and the reads answer
  export function useOpenCashback(): (eligibleRecords: number) => void   // one cashback_card_tapped, then router.push('/spend/cashback')
  export function CashbackScreen(props: { now?: Date }): JSX.Element
  export function walletTab(pathname: string): { visible: boolean; active: 'wallets' | 'insights' | 'cashback' | null }   // widened
  ```
- Reads: the catalogue; this month's expenses through `readAllPages` over `resources.history({ from: month start, through: today, type: 'expense', sort: 'date_desc' }, cursor, HISTORY_MAX_LIMIT)`, a failed read giving `unknown`; `daysLoggedIn(month, await diary.loggedDays())`, or those expenses' dates with no diary; `preferences?.cashback_tips ?? null`; the decline. `turnOn` is `update({ cashback_tips: true })`; `turnOff` is `update({ cashback_tips: false })` then the decline; `later` writes the decline; each plays `saveLanded` or `saveFailed`, a failure saying `cashback.saveFailed`.
- Bindings: with `extras` on, the bar (bw-home; st-dark in dark) has กระเป๋า, สรุป and แคชแบ็ก as tabs saying `cashback.tabPlace` and ฉัน as the link, and the + shows on `/spend/cashback`; off, P2-T18's three. `waiting` (cb-waiting): this month's logged days as seven dots, "อีก…" only while today is unlogged (else `cashback.toGoLogged`), จดรายการวันนี้ opening `useAddTray().open()`. `ask` is `off` under `CashbackIntroTray` (cb-intro), opened at most once a launch: เปิดคำแนะนำ calls `turnOn`, ไว้ทีหลัง `later`, and a swipe or back close writes nothing. `hub` (cb-hub): the count large in `WalletText` (D42), a 44 pt row per shop opening `MerchantTray`, ดูอัตราใน GoGoCash to `homeHref`, `cashback.hubEmpty` at zero, แคชแบ็กได้มาอย่างไร opening `WhyTray` (cb-intro's how and privacy lines), and เคล็ดลับแคชแบ็ก as a `SwitchRow` with the board's caption, calling `turnOff`; `off` is `cashback.offTitle` with that switch, calling `turnOn`. `MerchantTray`: cb-merchant without the category (X3), its `PrimaryButton` opening `shop.href` with nothing added. `unavailable` and `unknown` show their line, the last with `cashback.tryAgain`. Each state, the intro and the merchant tray carry "GoGoCash เป็นบริการในเครือของ Jotbun" (D16).
- Copy (drafts): `cashback.tabPlace` {n} จาก {total}, `cashback.toGoLogged` อีก {n} วัน, `cashback.hubEmpty` เดือนนี้ยังไม่มีร้านที่อาจได้แคชแบ็ก, `cashback.offTitle` คำแนะนำแคชแบ็กปิดอยู่, `cashback.unavailable` ตอนนี้แคชแบ็กยังไม่เปิดให้ใช้, `cashback.unknown` ยังเช็กแคชแบ็กไม่ได้ ลองอีกครั้งเมื่อออนไลน์, `cashback.tryAgain` ลองอีกครั้ง, `cashback.saveFailed` เปลี่ยนไม่สำเร็จ ลองอีกครั้งเมื่อออนไลน์. E2-X1 asks the owner about the four with แคชแบ็ก in a sentence, as the boards have them (D42). Default pending owner Q8.

- [ ] **Step 1: Write the failing tests** (`EXPO_PUBLIC_REDESIGN=wallet,extras` unless a case says otherwise): `the bar has four items in the extras area, แคชแบ็ก a tab saying 3 จาก 4 and ฉัน a link saying 4 จาก 4; without the area it is P2's three`; `walletTab shows the bar on /spend/cashback with cashback active`; `waiting shows this month's logged days out of seven and logs today through the add tray` (four dates this month, not today: `4`, `/ 7`, `อีก 3 วัน · จดวันนี้ก็นับเป็นวันที่ 5`); `the intro opens once a launch: เปิดคำแนะนำ turns tips on, ไว้ทีหลัง keeps them off for good, a swipe keeps it shut until the next launch` (`update` gets exactly `{ cashback_tips: true }`; a swipe writes no decline); `the hub counts this month's matching records by shop, never baht` (14, Shopee 9; no ฿ or บาท); `เปิด GoGoCash opens exactly the brand's link`; `the hub's switch turns tips off, and the off state's turns them on`; `every cashback state names GoGoCash as Jotbun's sister service` (waiting, the intro, hub, the merchant tray, off and unavailable, in `th` and `en`); `while the catalogue is unanswered the tab shows loading, never cashback.unavailable`; `a switched-off bridge is calm, and unread preferences or a failed history read offer Try again`; `Home's pill, the wallet tile and the recap card each open the tab and send one cashback_card_tapped with the count` (three `{ eligible_records: 14 }`, no brand in `sent`); `with the extras area off the pill opens nothing and sends nothing`; `trackCashbackCardTapped sends eligible_records only`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement,** moving `useCatalogue` first.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Send the event from the pill's render: the one-event case fails. Show the hub at six days: the waiting case fails. Add `?ref=jotbun` to the link: the link case fails. Draw four tabs without the area: the bar case fails. Drop the sister line from the hub: its case fails. Read `undefined` as null: the loading case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the cashback tab: wait for seven logged days, ask once, count shops on the phone, open GoGoCash with nothing attached"`

---

### Task P6B-T3: Settings and language in the Bun Wallet look (st-settings, st-language)

**Starts after:** P6B-T1, P2-T10, P2-T13, P2-T30, P2-T33, 1C-T5

**Files:**
- Create: `src/wallet/settings/WalletSettingsScreen.tsx`, `LanguageScreen.tsx`, `copy.draft.ts`; `src/wallet/account/accountWords.ts` (pure), `account/copy.draft.ts`; `app/settings/language.tsx` (`LanguageScreen`; else `/settings`), `app/settings/account.tsx` (`/settings` only, until P6B-T8)
- Modify: P2-T33's `src/wallet/lock/LockSettingsRow.tsx` (its rule exported as `useLockSetting`, unchanged); `app/settings/index.tsx` (`extras` on: `WalletSettingsScreen`)
- Test: `src/wallet/settings/WalletSettings.render.test.tsx`, `src/wallet/account/accountWords.test.ts` (Node); `SettingsScreen.render.test.tsx` and P2-T33's suite run unchanged

**Interfaces:**
- Consumes: P6B-T1's rows; `APPEARANCES`, `BUN_CHOICES`, `HAPTIC_CHOICES`, `diaryLinks`, `SettingsAreas` (`settingsModel.ts`); `AccountServices` (`SettingsParts.tsx`); `daysSummary`, `weekdayNames` (`remindersModel.ts`); the theme, bun, haptics and language providers; `WalletAmount` (P2-T10); `loadMonth` (P2-T30); `createAppReminderService(locale).getPreference()`; `account()` of 1C-T5's `CredentialProvider` (`src/auth/credentialProvider.ts`, through `getCredentialProvider()`); `SignInMethod` (1C-T5, `src/auth/betterAuthPort.ts`).
- Produces:
  ```ts
  export function useLockSetting(): { on: boolean; method: LockMethod | null }
  export function maskEmail(address: string): string                     // the first character, •••, then @ and the domain
  export function methodName(method: SignInMethod, t: WalletT): string   // Apple, Google, or account.methodEmail
  export function WalletSettingsScreen(props: { services: AccountServices; areas?: Partial<SettingsAreas> }): JSX.Element
  export function LanguageScreen(): JSX.Element
  ```
- Bindings (st-settings, in order): close to `/spend`; ลักษณะ (`APPEARANCES`), ภาษา (ไทย or English) to `/settings/language`; บัน, การสั่น; การแจ้งเตือน (from `daysSummary`, ทุกวัน only when every day is on, and the time, or `settings.off`) to `/spend/reminders`, กระเป๋า (`settings.walletCount`, unarchived) to `/spend/wallets`, หมวดหมู่ to `/spend/categories`, งบประมาณ (this month's amount through `WalletAmount` in `view.homeCurrency` (Money) with /เดือน, or `settings.notSet`) to `/spend/budget`, นำเข้าไฟล์ only when `diaryLinks(areas)` holds `import`; the lock row (`useLockSetting`) to `/settings/lock`; ความเป็นส่วนตัวและข้อมูล to `/settings/privacy`; บัญชี (`methodName`) to `/settings/account`. No "วันที่แบบ พ.ศ." row (default pending owner Q4).
- Rows other plans add to today's Settings show here under the same switch: P3-T14's บันและ AI to `/settings/ai` (`useBunAiArea()`), P4-T21's สลิปอัตโนมัติ to `/spend/slips` (`useSlipsArea()`), P4-T22's นำเข้า statement to `/spend/import` (P4's `statements` area), P5-T26's home currency to `/settings/home-currency` (`useTravelArea()`); one landing after this task meets the parity test and adds its row here too.
- `LanguageScreen` (st-language): ไทย and English as 44 pt radios through `useLanguage().setPreference`, applying at once, the resolved language checked, no Tiếng Việt (default pending owner Q3); the board's date example built from today through `dateStep.ts`, then `settings.yearNote`.
- Copy (drafts): `settings.walletCount` {n} ใบ, `settings.notSet` ยังไม่ตั้ง, `settings.off` ปิด, `settings.yearNote` ภาษาอังกฤษแสดงปีเป็น ค.ศ. เสมอ เช่น 24 Oct 2026, `account.methodEmail` อีเมล.

- [ ] **Step 1: Write the failing tests.** `accountWords.test.ts`: `maskEmail('kan@gmail.com')` is `k•••@gmail.com` and `maskEmail('K@icloud.com')` is `K•••@icloud.com`; `methodName` gives Apple, Google and อีเมล. `WalletSettings.render.test.tsx`: `Settings draws st-settings' sections in order, every row 44 pt`; `appearance, the bun and haptics change at once` (after มืด the ground is `#0E0D12`); `import shows only with its flag`; `the reminders row says ทุกวัน only when every day is on`; `the budget row hides its amount in private mode and says ยังไม่ตั้ง without a budget`; `the lock row says เปิด or ปิด and opens /settings/lock`; `the account row names the method`; `every link today's Settings offers is offered here too` (both screens under `EXPO_PUBLIC_REDESIGN=all`, so every `RedesignArea`, a later plan's included, is on at run time; each link row pressed; `/settings/devices` counts through `/settings/account`; `useSlipsArea()` also needs a decoder, so whichever of this task and P4-T21 lands second makes the case call P3-T1's `installQrDecoder(fakeQrDecoder({}))` first and `installQrDecoder(null)` after); `the language screen offers ไทย and English only and switches at once`; `the date example is Buddhist in Thai and Gregorian in English`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement,** moving `useLockSetting` first.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Offer Tiếng Việt: the language case fails. Draw the budget without `WalletAmount`: the private case fails. Show import without its flag: its case fails. Mask with the whole local part: the mask case fails. Drop the privacy row: the parity case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add Settings and language in the Bun Wallet look, behind the extras area"`

---

### Task P6B-T4: Reminders, the priming step and notifications off (st-reminders, st-reminder-prime, es-notifications-off)

**Starts after:** P6B-T1, P2-T35, P2-T36, P4-T21 (P4:inbox)

**Files:**
- Create: `src/screens/redesign/insights/reminderSettings.ts` (today's `RemindersScreen` rules, as P2-T36 leaves them, moved unchanged); `src/wallet/settings/WalletRemindersScreen.tsx`, `ReminderPrimeScreen.tsx`
- Modify: `RemindersScreen.tsx`; `settings/copy.draft.ts`; `app/spend/reminders.tsx` (`extras` on: `WalletRemindersScreen`, or `ReminderPrimeScreen` with `?prime=1`); P2-T35's `src/wallet/setup/SetupScreen.tsx` (`extras` on: the reminder step's ทำต่อ opens `/spend/reminders?prime=1&setup=1`); P4-T21's `src/wallet/slips/NotificationsOffScreen.tsx` (`sample` widened, additively)
- Test: `src/wallet/settings/WalletReminders.render.test.tsx`; `RemindersScreen.render.test.tsx` and P2-T35's, T36's and P4-T21's suites run unchanged

**Interfaces:**
- Consumes: `LocalReminderService`, `ReminderPreference`, `ReminderPreferenceInput`; `reminderContent(locale, weekday)` (the other session's `src/notifications/useReminderUpkeep.ts`, which P2-T36 consumes); `withHour`, `withMinute`, `toggleDay`, `WEEK`, `daysSummary`, `weekdayNames` (`remindersModel.ts`); `FIRST_REMINDER`, `FIRST_REMINDER_TIME`, `primingAnswer`, `PrimingAnswer` (`onboardingModel.ts`); P6B-T1's rows; `NotificationsOffScreen` (P4-T21, which delivers P4-T21 (P4:inbox)).
- Produces:
  ```ts
  export function useReminderSettings(service: LocalReminderService): { preference: ReminderPreference | null; saving: boolean; answer: PrimingAnswer | null; save(next: ReminderPreferenceInput): Promise<void> }   // moved; save's setPreference sends trackReminderSet (P2-T36)
  export function WalletRemindersScreen(props: { service?: LocalReminderService }): JSX.Element
  export function ReminderPrimeScreen(props: { setup: boolean; firstTime?: string; service?: LocalReminderService; onDone(answer: PrimingAnswer | 'later'): void }): JSX.Element   // firstTime: FIRST_REMINDER_TIME by default
  export function NotificationsOffScreen(props: { sample: 'slips' } | { sample: 'reminders'; time: string; days: string }): JSX.Element   // P4-T21's, widened
  ```
- Bindings (st-reminders): the preview with today's date, the time and today's weekday wording; เตือนให้บันทึก (`SwitchRow`: reminders never on yet opens `ReminderPrimeScreen`, else `save`); เวลา (one 44 pt row opening hour and minute choices); ทุกวัน and seven 44 pt weekday chips named in full; the line "เตือนวันละครั้ง ถ้าวันนั้นยังไม่ได้จด", true under D38 (R73's Q8); บันทึก as the `PrimaryButton`. `denied` is es-notifications-off: `NotificationsOffScreen` with `sample: 'reminders'` (the board's preview and reminder row from the saved time and `daysSummary`) and เปิดการตั้งค่า as the `PrimaryButton` calling `Linking.openSettings()`; `unsupported` keeps today's words. st-reminder-prime: with `setup`, ตั้งค่า · ขั้นที่ 4 จาก 5; the preview at `firstTime` (the board's 20:30 is P6B-T16's `later`; `control` offers `FIRST_REMINDER_TIME`, 20:00); the board's lines, its iPhone permission line on iOS and `reminders.androidPermission` on Android; เปิดการแจ้งเตือน calls `setPreference({ ...FIRST_REMINDER, localTime: firstTime })` then `onDone(primingAnswer(outcome))`; ไว้ทีหลัง calls `onDone('later')`. In setup, `scheduled` makes the step done and anything else answered (P2-T35's rules).
- Copy (draft): `reminders.androidPermission` ถัดไป Android จะขออนุญาตส่งการแจ้งเตือน แตะ “อนุญาต” แล้วเปลี่ยนเวลาหรือปิดได้ทุกเมื่อ.

- [ ] **Step 1: Write the failing tests** (a fake service): `the screen shows the saved time and days and says reminders come only on days with nothing logged`; `changing the time and days saves once and sends one reminder_set`; `turning reminders on the first time opens the priming step; later it saves at once`; `the priming step asks for the offered time and reports the answer` (`scheduled` or `denied`); `with notifications denied the reminders screen shows es-notifications-off and เปิดการตั้งค่า opens the phone's settings`; `in setup it says ขั้นที่ 4 จาก 5 and returns with the step done or answered`; `every chip and the time row are 44 pt`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement,** moving the hook first.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Open the priming step when reminders were on: the first-time case fails. Ask for 20:00 whatever `firstTime` says: the offered-time case fails. Keep today's words when denied: the notifications-off case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add reminders, their priming step and notifications off in the Bun Wallet look"`

**Checkpoint E2-X1** (controller): the cashback tab, Settings, language, reminders and notifications off.

---

### Task P6B-T5: Privacy and export in the Bun Wallet look (st-privacy, st-export)

**Starts after:** P6B-T3, P2-T3, 1C-T9, 1D-T8

**Files:**
- Create: `src/screens/redesign/account/privacyFlows.ts` (`PrivacyScreen.tsx`'s export and delete rules moved unchanged, with 1C's fresh sign-in and every erase beside P2-T3's, P6A's included if landed), `account/companionSwitches.ts` (`CompanionSettings.tsx`'s switches moved unchanged); `src/wallet/settings/WalletPrivacyScreen.tsx`, `ExportScreen.tsx`; `app/settings/export.tsx` (`ExportScreen`; else `/settings/privacy`), `app/settings/delete.tsx` (`/settings/privacy` only, until P6B-T6)
- Modify: `PrivacyScreen.tsx`, `CompanionSettings.tsx`; `settings/copy.draft.ts`; `src/config/env.ts` (`privacyPolicyUrl` from `EXPO_PUBLIC_PRIVACY_URL`, `''` by default); `app/settings/privacy.tsx` (`extras` on: `WalletPrivacyScreen`)
- Test: `src/screens/redesign/account/privacyFlows.render.test.tsx`, `src/wallet/settings/WalletPrivacy.render.test.tsx`; `PrivacyScreen.render.test.tsx` and `CompanionSettings.render.test.tsx` run unchanged

**Interfaces:**
- Consumes: `PrivacyServices` (as 1C-T6 and 1C-T9 leave it); `ExportPhase`, `DeletionPhase`, `ExportScope`, `bangkokClock` (`privacyModel.ts`); `useFreshSignIn` (1C-T8); `useAnalyticsConsent` (1D-T8); `AiConsentSheet`; P6B-T1's rows; P6B-T3's `maskEmail` and `methodName`; `account()` (1C-T5); `useBunAiArea()` (`P3-T14 (P3:ai-area)`), once it exists.
- Produces:
  ```ts
  export function useExportFlow(services: PrivacyServices, now?: Date): { phase: ExportPhase; request(scope?: ExportScope): Promise<void>; retry(): Promise<void>; check(): Promise<void>; download(): Promise<void>; sheet: ReactNode }
  export function useDeleteFlow(services: PrivacyServices, options?: { onAccepted?(): void }): { phase: DeletionPhase; unsynced: number; start(): Promise<void>; retry(): Promise<void>; done(): Promise<void>; sheet: ReactNode }   // sheet: the fresh sign-in's; onAccepted: once, when a request is confirmed accepted
  export function useCompanionSwitches(): { ai: boolean; tips: boolean; consenting: boolean; problem: string | null; setAi(next: boolean): void; setTips(next: boolean): void; closeConsent(): void }
  export function WalletPrivacyScreen(props: { services: PrivacyServices }): JSX.Element
  export function ExportScreen(props: { services: PrivacyServices; now?: Date }): JSX.Element
  ```
- Bindings (st-privacy): the board's four promises, never a claim that Jotbun cannot read records (§5.2); ส่งออกข้อมูล to `/settings/export` and ลบบัญชี to `/settings/delete` (no ready-until detail: the export's state lives on its own screen); 1D-T8's ช่วยพัฒนา Jotbun as a `SwitchRow` with 1D-T8's own lines and rules, only while its `analytics` area is on; cashback tips as a `SwitchRow` on `useCompanionSwitches`; Bun's AI help as a `LinkRow` to `/settings/ai` while `useBunAiArea()` (whichever of this task and P3-T14 lands second wires it), else a `SwitchRow` on `useCompanionSwitches` (on through `AiConsentSheet`, whose rule P3-T14 moves onto `useAiConsentChange`; off at once); นโยบายความเป็นส่วนตัว opening `privacyPolicyUrl`, hidden while empty (default pending owner Q12); the account line with `methodName` and `maskEmail`.
- `ExportScreen` (st-export), by `phase`: idle, `export.request` as the `PrimaryButton`; requesting and preparing, the preparing lines and ตรวจอีกครั้ง; ready, `row_count`, `requested_at` and `expires_at` through `bangkokClock` and `dayLabel`, ดาวน์โหลด as the `PrimaryButton`, ขอส่งออกใหม่ as a `TextLink`; expired, ขอใหม่; other states keep today's words. The fresh sign-in sheet renders inside.
- Copy (draft): `export.request` ขอไฟล์ส่งออก.

- [ ] **Step 1: Write the failing tests.** `privacyFlows.render.test.tsx` (probes over the moved hooks): `the export flow asks for a fresh sign-in, then the request, and a lost answer resends the same request`; `the delete flow erases this account's kept looks only after an accepted deletion` (P2-T3's case through the hook); `onAccepted runs once for an accepted deletion, never for a refused or unconfirmed one`. `WalletPrivacy.render.test.tsx`: `the promises are st-privacy's four and none says Jotbun cannot read your records` (no อ่านไม่ได้, cannot read or can't read); `export and delete open their screens`; `the analytics switch turns off at once and waits for the server to turn on`; `AI help on goes through the consent sheet; off is immediate`; `with P3's area on, the AI row opens /settings/ai` (written by whichever of this task and P3-T14 lands second); `the policy row shows only with its URL and opens it`; `the account line names the method and masks the address`; `a ready export shows its count, when it was asked for and until when it lasts, and downloads`; `an expired export offers a new request`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement,** moving the hooks first with the two old suites unchanged.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Add "even Jotbun cannot read your diary" to the promises: the promises case fails. Show the policy row without a URL: its case fails. Call `onAccepted` for an unconfirmed request: its case fails. Keep the AI switch with P3's area on: the `/settings/ai` case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add privacy and export in the Bun Wallet look on hooks moved out of today's Privacy screen"`

---

### Task P6B-T6: Delete and the deletion receipt (st-delete, st-delete-done)

**Starts after:** P6B-T5, P6B-T0, P2-T13

**Files:**
- Create: `src/wallet/settings/DeleteScreen.tsx`, `DeletionDoneScreen.tsx`
- Modify: `settings/copy.draft.ts`; `app/settings/delete.tsx` (`DeleteScreen` with the app's privacy services; else `/settings/privacy`)
- Test: `src/wallet/settings/Delete.render.test.tsx`

**Interfaces:**
- Consumes: `deletionShortCode` (P6B-T0); `DELETION_TARGET_HOURS` (contracts); `useDeleteFlow` (P6B-T5); `LinkRow` (P6B-T1); `maskEmail`, `methodName` (P6B-T3); `SignInMethod` (1C-T5); `bangkokClock`; `Clipboard.setStringAsync` (expo-clipboard 58.0.3).
- Produces:
  ```ts
  export function DeleteScreen(props: { services: PrivacyServices; leaving?: { slot: ReactNode; onAccepted(): void }; now?: () => Date }): JSX.Element   // leaving: P6B-T13's; onAccepted goes to useDeleteFlow
  export function DeletionDoneScreen(props: { requestId: string; requestedAt: Date; account: { method: SignInMethod; email: string } | null; device: DeviceCopyOutcome; busy: boolean; onClose(): void }): JSX.Element
  ```
- Bindings (st-delete): the board's list, its last item naming the account's method; ดาวน์โหลดข้อมูลก่อน as a `LinkRow` to `/settings/export`; the `leaving` slot above the confirm button; today's unsynced-entries line when `unsynced` is above 0; the final-step line with `methodName` and `maskEmail`; ยืนยันด้วย {method} แล้วลบบัญชี as the `PrimaryButton` calling `start()` (the fresh sign-in, then the request); เก็บบัญชีไว้ as a `TextLink` back. Idle notes, refusals and an unconfirmed request keep today's words; Try again calls `retry()`. When `phase` is `accepted`, `DeletionDoneScreen` takes the screen, `requestedAt` being `now()` read once.
- `DeletionDoneScreen` (st-delete-done in days, never the board's times: `DeletionAccepted` has no `requested_at`, and the phone's clock could contradict the email): หมายเลขคำขอ with `deletionShortCode(requestId)` and a 44 pt copy `IconButton` named คัดลอกหมายเลขคำขอ (copies, then announces `delete.copied`); ส่งคำขอเมื่อ with the Bangkok day; บัญชี with `methodName` and `maskEmail`; ต่อจากนี้: ส่งคำขอแล้ว with its day; ลบบันทึกในเครื่องนี้แล้ว when `device` is `erased` or `none`, `delete.eraseFailed` when `erase_failed`; Jotbun ลบข้อมูลทั้งหมด with the deadline's day, `DELETION_TARGET_HOURS` after `requestedAt`; ปิด as the `PrimaryButton` calling `onClose` (`done()`: a failed erase is tried again, then the phone signs out).
- Copy (drafts): `delete.copied` คัดลอกแล้ว, `delete.eraseFailed` ยังลบบันทึกในเครื่องนี้ไม่ได้ แตะปิดเพื่อลองอีกครั้ง.

- [ ] **Step 1: Write the failing tests** (fake services): `the screen lists what goes and names the account's method and masked address`; `confirming runs the fresh sign-in, then one request; a cancelled sign-in sends nothing`; `an accepted request shows DEL-1CZJ-R7KA, the request day, the 24-hour deadline and the erased phone copy`; `the receipt shows days and no time`; `the copy button puts exactly the code on the clipboard`; `ปิด signs out only after an accepted request`; `a refused or unconfirmed request keeps the account and shows no code` (Review Focus 4: no `DEL-` text, no sign-out, Try again resends the same command key); `a failed erase is said on the receipt and ปิด tries it again before signing out`; `the leaving slot sits above the confirm button, and its onAccepted runs once as the receipt replaces the form`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Show the receipt for an unconfirmed request: the Review Focus case fails. Sign out on a refusal: the same case fails. Call `onAccepted` from the slot's render: the leaving case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add account deletion and its receipt in the Bun Wallet look, with a short request code"`

---

### Task P6B-T7: Sign-in, the email code and the terms step in the Bun Wallet look (sa-signin, sa-email-code, sa-terms; B22)

**Starts after:** P6B-T5, P2-T13, 1C-T9

**Files:**
- Create: `src/screens/redesign/account/signInFlow.ts` (`SignInScreen`'s attempt rule as 1C-T9 leaves it), `screens/redesign/signin/emailCodeFlow.ts` and `termsFlow.ts` (1C-T8's `EmailCodeScreen` and `TermsScreen` rules), all moved unchanged (X2); `src/wallet/account/OutlineButton.tsx`, `WalletSignInScreen.tsx`, `WalletEmailCodeScreen.tsx`, `WalletAccountExistsScreen.tsx`, `WalletTermsScreen.tsx`, `PolicyTray.tsx`
- Modify: `SignInScreen.tsx`, `signin/EmailCodeScreen.tsx`, `signin/TermsScreen.tsx`; `account/copy.draft.ts`; `app/login.tsx`, `app/login/email.tsx`, `app/login/account-exists.tsx` (`extras` on: the wallet screens); for the terms step, 1C-T8's `signin/TermsGate.tsx` only (`extras` on: `WalletTermsScreen` with the same props), so `app/spend/_layout.tsx` and `app/onboarding/reminder.tsx` keep 1C-T9's `TermsGate` unchanged; P6B-T5's `WalletPrivacyScreen.tsx` (one `LinkRow`, `terms.read`, opening `PolicyTray` over `getSharedPolicyClient()`)
- Test: `src/wallet/account/SignIn.render.test.tsx`; `SignInScreen.render.test.tsx`, `EmailCodeScreen.render.test.tsx` and `TermsGate.render.test.tsx` run unchanged

**Interfaces:**
- Consumes: `PolicyKind` (contracts); `CredentialProvider`, `SignInResult`, `FreshOutcome`, `SignInMethod` (1C-T5); `PendingPolicy`, `PolicyClient`, `acceptPending` (`src/spend/v1/policies.ts`) and `TermsGate` (1C-T8); `getSharedPolicyClient` (`src/api/sharedV1.ts`, 1C-T9); `afterSignInAttempt`, `canChooseProvider`, `SignInState` (`onboardingModel.ts`); `maskEmail`, `methodName` (P6B-T3); P2-T13's kit.
- Produces:
  ```ts
  export function useSignInAttempt(options?: { requireTerms?: boolean }): { state: SignInState; termsAccepted: boolean; setTermsAccepted(value: boolean): void; choose(method: SignInMethod): Promise<void> }   // moved; requireTerms false reads canChooseProvider(true, state)
  export function OutlineButton(props: { label: string; onPress(): void; icon?: ReactNode; disabled?: boolean }): JSX.Element   // 54 pt, radius 16, card with hairline
  export function WalletSignInScreen(): JSX.Element   // useSignInAttempt({ requireTerms: false }): the 1C terms step follows sign-in (A11)
  export function WalletEmailCodeScreen(props: { mode: 'sign_in' | 'fresh'; fixedEmail?: string; onDone?(outcome: SignInResult | FreshOutcome): void; onBack?(): void }): JSX.Element   // the route passes none and navigates as today
  export function WalletAccountExistsScreen(props: { methods: readonly SignInMethod[] }): JSX.Element   // C14: each method an action, 1C-T8's lines
  export function WalletTermsScreen(props: { pending: readonly PendingPolicy[]; client: PolicyClient; onAccepted(): void }): JSX.Element   // 1C-T8's TermsScreen props, in sa-terms' look
  export function PolicyTray(props: { kind: PolicyKind | null; client: PolicyClient; onClose(): void }): JSX.Element   // client.published()'s text in the active language (English for vi)
  ```
  `useEmailCode` and `useTermsAcceptance` return what 1C-T8's screens hold today.
- Bindings: sa-signin: the decorative cards, the title, ดำเนินการต่อด้วย Apple (iOS, when `methods()` holds it) as the `PrimaryButton`, Google (when configured) and อีเมล as `OutlineButton`s, the footer line; no tick. sa-email-code: the board's lines with `maskEmail`, six boxes over 1C's `TextInput` (X14), the resend countdown, เปลี่ยนอีเมล; 1C's wrong-code and limit lines stay. The account-exists screen has no board: sa-signin's buttons, one per method in 1C-T8's order. sa-terms (`WalletTermsScreen`): a 44 pt checkbox row whose two policy names are `TextLink`s opening `PolicyTray` with the gate's `client`, the "อ่านฉบับเต็ม…" line (true through Privacy's `terms.read` row), ดำเนินการต่อ as the `PrimaryButton`, disabled until ticked, running `acceptPending(client, pending)` once, then `onAccepted()`, and 1C's Settings action as a `TextLink` to `/settings`, with 1C-T9's approved line; a failure says `terms.failed`.
- Copy (drafts): `terms.failed` ยังบันทึกการยอมรับไม่ได้ ลองอีกครั้งเมื่อออนไลน์, `terms.read` ข้อกำหนดและนโยบายความเป็นส่วนตัว.

- [ ] **Step 1: Write the failing tests.** `SignIn.render.test.tsx`: `sign-in offers Apple on iOS only, Google only when configured, and email always`; `the wallet sign-in offers its methods without a tick`; `six digits start exactly one sign-in, and the address is masked`; `the fresh mode codes the fixed address and hands its outcome to onDone`; `the account-exists screen offers each named method once, Apple first when named first`; `with extras on, TermsGate draws sa-terms: three promises, a 44 pt tick row with both policy links, and ดำเนินการต่อ disabled until ticked`; `ดำเนินการต่อ accepts each pending policy once, then the gate shows the screens`; `with extras on, the terms step still opens /settings without accepting`; `a failed acceptance keeps the screen with a calm line`; `each policy opens its full text in the active language`; `Privacy's terms row opens the published text`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement,** moving the hooks first.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Enable ดำเนินการต่อ before the tick: the disabled case fails. Accept on both taps of a double tap: the once case fails. Require the tick on the wallet sign-in: the no-tick case fails. Drop the Settings link: its case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add sign-in, the email code and the terms step in the Bun Wallet look"`

---

### Task P6B-T8: Account, devices and the sign-outs in the Bun Wallet look (sa-account, sa-signout-tray, es-session-ended; B22)

**Starts after:** P6B-T7, P6B-T3, 1C-T9

**Files:**
- Create: `src/screens/redesign/account/signOutFlows.ts` (`SettingsScreen.tsx`'s two sign-out rules), `screens/redesign/signin/devicesFlow.ts` and `sessionEndedFlow.ts` (1C-T8's `DevicesScreen` and `SessionEndedScreen` rules), all moved unchanged; `src/wallet/account/AccountScreen.tsx`, `SignOutEverywhereTray.tsx`, `WalletSessionEndedScreen.tsx`, `ConfirmItsYouTray.tsx`
- Modify: `SettingsScreen.tsx`, `DevicesScreen.tsx`, `SessionEndedScreen.tsx`, `useFreshSignIn.tsx` (with `extras` on, its sheet is `ConfirmItsYouTray`); `account/copy.draft.ts`; `app/settings/account.tsx` (`AccountScreen`; else `/settings`), `app/session-ended.tsx` (`extras` on: `WalletSessionEndedScreen`)
- Test: `src/wallet/account/Account.render.test.tsx`; `SettingsScreen.render.test.tsx` and 1C-T8's three suites run unchanged

**Interfaces:**
- Consumes: `AccountServices`; `GlobalLogoutState`, `SessionEndedView`, `mayEraseOtherAccount` (1C-T6); `FreshOutcome`, `SignInMethod` (1C-T5); `WalletEmailCodeScreen` (P6B-T7, with `mode: 'fresh'`, `fixedEmail`, `onDone`, `onBack`); `LinkRow` (P6B-T1); `maskEmail`, `methodName` (P6B-T3); `WalletAmount` (P2-T10).
- Produces:
  ```ts
  export function useSignOut(services: AccountServices): { confirming: boolean; unsynced: number; busy: boolean; problem: string | null; ask(): void; cancel(): void; signOut(): Promise<void> }
  export function useSignOutEverywhere(services: AccountServices): { state: GlobalLogoutState; start(): Promise<void>; retry(): Promise<void>; sheet: ReactNode }
  export function AccountScreen(props: { services: AccountServices; passkeys?: ReactNode }): JSX.Element   // passkeys: P6B-T17's slot
  export function WalletSessionEndedScreen(): JSX.Element
  export function ConfirmItsYouTray(props: { method: SignInMethod; email: string; onDone(outcome: FreshOutcome): void }): JSX.Element
  ```
  `useDevices` and `useSessionEnded` return what their screens hold today.
- Bindings: sa-account: วิธีเข้าสู่ระบบ (`methodName` with `maskEmail`, the board's note naming it, 1C's link and unlink rows with their fresh sign-in, never removing the last method), the `passkeys` slot, `account.devices` with 1C's list, which can sign out the others, ข้อมูลของฉัน (export, privacy, delete), ออกจากระบบ (a confirm `Tray` with the board's consequence line and today's unsynced count, then `signOut`) and ออกจากระบบทุกเครื่อง; no name row (X13). sa-signout-tray: the board's synced line when nothing is unsynced, else `account.unsyncedLost`, and its method line; ออกจากระบบทุกเครื่อง (`PrimaryButton`, `start()`) and อยู่ในระบบต่อ. es-session-ended: the unsent rows (title, day, `WalletAmount` in the record's currency (Money); no time), `account.sameAccount`, ดำเนินการต่อด้วย {method} and ใช้วิธีอื่น; 1C's keep-or-erase choice opens in a `Tray`, erasing only after its confirmation. `ConfirmItsYouTray`: the native sheet for Apple and Google; `WalletEmailCodeScreen` in `fresh` mode with the account's address, handing its outcome to `onDone`.
- Copy (drafts): `account.devices` เครื่องที่เข้าสู่ระบบ, `account.unsyncedLost` {n} รายการที่ยังไม่ได้ซิงก์จะหายไป, `account.sameAccount` ใช้บัญชี {method} เดิม รายการจึงจะส่งเข้าที่เดิม.

- [ ] **Step 1: Write the failing tests**: `Account draws sa-account's rows, names the method with the masked address, and has no name row`; `signing out asks first, says what is lost, then erases and signs out once`; `sign out everywhere runs the fresh sign-in, then one call; a lost answer keeps the tray with Try again`; `the tray says everything is synced, or how many entries would be lost`; `devices mark this device and sign another out after a confirm`; `session ended lists the unsent records without times and resumes with the account's method`; `another account with unsent records asks keep or erase, and erase needs the confirmation`; `in the extras area the fresh sign-in opens the wallet tray, whose email step codes the account's address`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement,** moving the four hooks first.
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Sign out without the confirm: the asks-first case fails. Draw a time on an unsent row: the session-ended case fails. Erase without the confirmation: the keep-or-erase case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the account, devices, sign-outs and the session-ended screen in the Bun Wallet look"`

---

### Task P6B-T9: The generic error state with a support code and Contact us (es-error-generic)

**Starts after:** P6B-T1, P2-T13, P2-T22, P2-T24, P2-T28, P2-T30, P2-T31, P2-T32

**Files:**
- Modify: `src/api/client.ts` (`V1Error.requestId`), `client.test.ts`; `src/config/env.ts` (`supportEmail` from `EXPO_PUBLIC_SUPPORT_EMAIL`, `''` by default); with `extras` on, the load-problem branch of P2's `src/wallet/home/WalletHomeScreen.tsx`, `insights/WalletInsightsScreen.tsx`, `wallets/WalletDetailScreen.tsx`, `history/WalletHistoryScreen.tsx`, `budget/WalletBudgetScreen.tsx`, `recap/WalletRecapScreen.tsx`: where a `load_failed` problem shows its words and Try again, `GenericErrorState` shows instead when `isOurSide(error)`
- Create: `src/wallet/support/supportCode.ts` (pure), `GenericErrorState.tsx`, `copy.draft.ts`
- Test: `src/wallet/support/supportCode.test.ts` (Node), `support/GenericError.render.test.tsx`; the six screens' suites run unchanged

**Interfaces:**
- Consumes: `V1Error` and the problem body's `request_id` (`src/api/client.ts`); `useDiaryView`; `Clipboard.setStringAsync` (expo-clipboard 58.0.3); `Linking`; `PrimaryButton`, `TextLink` (P2-T13); `tableT` (P2-T3).
- Produces:
  ```ts
  readonly requestId?: string   // on V1Error: the problem body's request_id when it is a UUID
  export function supportCode(requestId: string | null | undefined): string | null   // X7: 'XXXX-XXXX', null unless a UUID
  export function isOurSide(error: unknown): boolean   // a V1Error with status 500, 502 or 504, or outcome 'invalid_response' (X15)
  export function contactUsUrl(input: { address: string; code: string | null; t: WalletT }): string | null   // mailto; each value through encodeURIComponent (RFC 6068: a space is %20); null without an address
  export function GenericErrorState(props: { error: unknown; onRetry(): void; onHome?: () => void; open?: (url: string) => Promise<void> }): JSX.Element
  ```
- Bindings (es-error-generic): the board's title and cause line; its safety line while a diary is open, else `support.safeServer`; ลองอีกครั้ง as the `PrimaryButton`; กลับหน้าแรก as a `TextLink` only with `onHome`; the code lines with คัดลอก (copies, then announces `support.copied`) only when `supportCode` is not null; ติดต่อทีม Jotbun opening `contactUsUrl`, hidden without an address (default pending owner Q12), and when no mail app opens, `support.mailFallback` with a คัดลอก that copies the address. The mail holds `support.mailSubject` and `support.mailBody` and nothing else; without a code, the subject is `Jotbun` and there is no body.
- Copy (drafts): `support.safeServer` บันทึกที่ส่งแล้วอยู่ในบัญชีของคุณครบ, `support.copied` คัดลอกแล้ว, `support.mailSubject` Jotbun {code}, `support.mailBody` รหัสสำหรับทีม Jotbun: {code}, `support.mailFallback` ส่งอีเมลถึงทีม Jotbun ได้ที่ {address}. Default pending owner Q6.

- [ ] **Step 1: Write the failing tests.**
  ```ts
  test("the support code is the request id's first eight hex digits", () => {
    assert.equal(supportCode('7f2a91c0-1234-4abc-9def-0123456789ab'), '7F2A-91C0');
    assert.equal(supportCode('7f2a91c0'), null);
  });
  test('our side is a 500, 502, 504 or an unreadable answer, never a paused gate or a refusal', () => {
    for (const status of [500, 502, 504]) assert.equal(isOurSide(new V1Error('unavailable', status, 'INTERNAL_ERROR')), true);
    assert.equal(isOurSide(new V1Error('invalid_response', 200, 'INVALID_RESPONSE')), true);
    assert.equal(isOurSide(new V1Error('unavailable', 503, 'SERVICE_UNAVAILABLE')), false);
    assert.equal(isOurSide(new V1Error('invalid', 422, 'VALIDATION_FAILED')), false);
  });
  test('the mail carries the code and nothing else, a space as %20', () => {
    const t = tableT(DRAFT, 'en');
    const url = contactUsUrl({ address: 'help@example.com', code: '7F2A-91C0', t }) ?? '';
    assert.ok(url.startsWith('mailto:help@example.com?subject=Jotbun%207F2A-91C0&body=') && !url.includes('+'));
    assert.equal(contactUsUrl({ address: 'help@example.com', code: null, t }), 'mailto:help@example.com?subject=Jotbun');
    assert.equal(contactUsUrl({ address: '', code: '7F2A-91C0', t }), null);
  });
  ```
  `client.test.ts`: `a problem's request_id reaches the error; a malformed one does not`. `GenericError.render.test.tsx`: `a 500 on Insights shows the state with its code, copy and Contact us`; `Try again reloads, and Home has no กลับหน้าแรก`; `without a request id the code lines are hidden, and without an address Contact us is hidden`; `when no mail app opens, the address shows with a copy button`; `a paused gate keeps today's words`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Count a 503 as our side: the paused case fails. Drop 504: the our-side case fails. Put the error code into the mail body: the mail case fails. Build the query with `URLSearchParams`: the `%20` case fails. Keep four digits: the code case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the generic error state with a support code and Contact us"`

---

### Task P6B-T10: Restore counts on the server: a ready snapshot's entity count

**Starts after:** 1B-T8

**Files:**
- Modify: `packages/contracts/src/v1/sync.ts` (`SnapshotDto`'s ready variant gains `entity_count?: number`; `isSnapshotDto` accepts the exact old key list, or it plus `entity_count`), `packages/contracts/src/v1/auth.ts` and `packages/contracts/src/index.ts` (`SNAPSHOT_COUNT_MIN_CLIENT_VERSION`, beside P5-T2's `CURRENCY_MIN_CLIENT_VERSION`); `apps/app/app.json` (`expo.version` one minor above the highest client minimum in contracts at integration: `0.4.0` after P5-T2's `0.3.0`)
- Create: `apps/edge/src/vault/migrations/NNNN_snapshot_entity_count.sql` (the integrator numbers it and adds the journal entry): `ALTER TABLE snapshots ADD COLUMN entity_count INTEGER CHECK (entity_count IS NULL OR entity_count >= 0)`
- Modify: `apps/edge/src/vault/schema.ts`; 1B-T8's `apps/edge/src/vault/files/snapshots.ts` (`buildSnapshot` counts the entity lines it writes and records the count with the ready row; `snapshotStatus` sends it when the row has one); `apps/edge/test/workers/vault-schema.test.ts`; `src/sync/testing/fakeServer.ts` (ready snapshots carry `entity_count` unless built with `{ snapshotCount: false }`); P6C-T6's `apps/edge/scripts/release/kv-seed.mjs`, if it landed first
- Test: `apps/edge/test/workers/snapshots.test.ts` (new cases), `src/spend/v1/resources.test.ts`, `src/api/clientVersion.test.ts` (P5-T2's; created here if P5-T2 has not landed)

**Interfaces:**
- Consumes: `buildSnapshot` (with `chunkBytes`), `snapshotStatus`, the `snapshots` table (1B-T8); `SnapshotDto`, `isSnapshotDto`, `compareVersions` (contracts).
- Produces: `SnapshotDto` ready `entity_count?: number` (a non-negative safe integer: every entity line across the chunks); vault column `snapshots.entity_count` (NULL on rows built before it); `SNAPSHOT_COUNT_MIN_CLIENT_VERSION`, the version this task's `app.json` carries.
- **Release step (C5):** older builds refuse an unknown key, so this release's builds carry the raised version, and the receipt names the `config:v1.client_versions` value P6C-T6's seed (`RELEASE_CLIENT_MINIMUMS`) writes before a server serves `entity_count`; if P6C-T6 landed first, this commit also raises `RELEASE_CLIENT_MINIMUMS`, as its floor test in the edge gate asks. Nothing is deployed now. Default pending owner Q7.

- [ ] **Step 1: Write the failing tests.** `snapshots.test.ts`: `a ready snapshot says how many entities its chunks hold` (150 records with `chunkBytes: 256`: `entity_count` equals the entities read back from every chunk); `a snapshot recorded before the column answers without entity_count` (the column set NULL through `runInDurableObject`: exactly the old keys). `vault-schema.test.ts`: the pinned `snapshots` columns gain `entity_count`. `resources.test.ts`: `a ready snapshot validates with or without entity_count, and refuses a negative or fractional count or any other new key`. `clientVersion.test.ts`: `this build is at least the snapshot-count minimum` (`compareVersions(appJson.expo.version, SNAPSHOT_COUNT_MIN_CLIENT_VERSION) >= 0`).
- [ ] **Step 2: Run them and see them fail.** Run: `npm run test:edge:workers -- test/workers/snapshots.test.ts test/workers/vault-schema.test.ts` and `npm run test:unit -w gogospend-app -- src/spend/v1/resources.test.ts src/api/clientVersion.test.ts`. Record the counts.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** then the whole Workers suite (1B-T8's cases unchanged).
- [ ] **Step 5: Mutation check.** Count chunks instead of entities: the count case fails. Send `entity_count: null` for an old row: the old-row case fails. Leave `app.json` at the old version: the version case fails.
- [ ] **Step 6: Gate, receipt, commit.** The edge gate and the app gate. `git commit -m "Say how many entities a ready snapshot holds, additively, and raise the minimum client version"`

---

### Task P6B-T11: Restore progress on the phone and the card on Home (es-restore)

**Starts after:** P6B-T10, P6B-T1, P2-T9, P2-T16, P2-T24, P2-T35

**Files:**
- Modify: `src/sync/types.ts` (`RestoreProgress`), `sync/reconcile.ts`, `sync/syncEngine.ts`, `sync/deviceSync.ts`, `src/spend/v1/spendDiary.ts`, `spend/v1/testing/fakeDiary.ts` (`restore: null` by default); P2-T24's `src/wallet/home/WalletHomeScreen.tsx` (`extras` on: `RestoreCard` directly under the greeting, above P2-T35's `SetupCard`, P3-T21's note and P4-T21's inbox card, while `view.restore` is not null)
- Create: `src/wallet/restore/restoreWords.ts` (pure), `RestoreCard.tsx`, `copy.draft.ts`
- Test: `src/sync/reconcile.test.ts` (new cases), `src/wallet/restore/restoreWords.test.ts` (Node), `restore/Restore.render.test.tsx`

**Interfaces:**
- Consumes: `entity_count` (P6B-T10); `ReconcileOptions`, `DeviceSyncReport`, `SyncReport`, `DiaryView`; `GrowBar` (P2-T9); `useAddTray` (P2-T16); `WalletHomeScreen` (P2-T24).
- Produces:
  ```ts
  export type RestoreProgress = { fetched: number; total: number | null }   // sync/types.ts; fetched: entities downloaded so far
  ReconcileOptions.onRestore?: (progress: RestoreProgress | null) => void   // the engine passes it on
  DeviceSyncReport.restore(progress: RestoreProgress | null): void            // and SyncReport.restore
  DiaryView.restore: RestoreProgress | null
  export function restoreWords(progress: RestoreProgress, t: WalletT): { headline: string; line: string | null; spoken: string; ratio: number | null }
  export function RestoreCard(props: { progress: RestoreProgress }): JSX.Element
  ```
- Rules: progress is reported only during a restore: a snapshot resync (after each chunk `fetched` grows by its entities, `total` is `entity_count ?? null`, `fetched` never above `total`; the base `resync` swaps every chunk in at the end, so the count is what has arrived, not yet shown) or a pull from no cursor whose first page has changes or `has_more` (after each page `fetched` grows by its changes, `total` null); `null` once the run ends, whatever its outcome. An ordinary pull, and a new account's empty first pull, report nothing.
- Bindings (es-restore): the heading with the total (`restore.headingNoTotal` without one), the usable-now line, a `progressbar` (P2-T9's `GrowBar`, value `ratio`; none without a total) with the "ดึงแล้ว … จาก …" line, and the close-the-app line; no time estimate and no this-month lines (X6). Counts use thousands separators.
- Copy (draft): `restore.headingNoTotal` กำลังดึงบันทึก.

- [ ] **Step 1: Write the failing tests.** `reconcile.test.ts` (a 410, then three chunks of 2, 2 and 1 entities with `entity_count: 5`): `a resync reports each chunk against the count, then null` (`[{ fetched: 2, total: 5 }, { fetched: 4, total: 5 }, { fetched: 5, total: 5 }, null]`); `a server without the count reports fetched with no total`; `a first pull from no cursor reports each page, then null`; `a new account's empty first pull shows no card` (no report at all); `an ordinary pull reports nothing`; `a failed chunk ends the report with null`; `fetched never passes the total` (a count of 4 over 5 entities ends at 4 of 4). `restoreWords.test.ts`: 486 of 1284 reads `ดึงแล้ว 486 จาก 1,284`. `Restore.render.test.tsx`: `Home shows the card directly under the greeting, above the setup card, while a restore runs, with no amount in it`; `while a restore runs, the + opens the add tray and a saved record waits in the outbox` (a fake diary whose `view.restore` is `{ fetched: 2, total: 5 }`); `the card leaves when the restore ends`; `at AX5 nothing truncates`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with `syncEngine.test.ts` and `engineHardening.test.ts` unchanged.
- [ ] **Step 5: Mutation check.** Report during an ordinary pull: its case fails. Report an empty first pull: the new-account case fails. Skip the closing null: the failed-chunk case fails. Let `fetched` pass `total`: its case fails. Block the tray while `restore` is set: the usable case fails. Draw the card under the setup card: the Home case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Show restore progress on a new phone's Home, usable while it restores"`

---

### Task P6B-T12: The month recap shared as an image (ox-share-card)

**Starts after:** P6B-T1, P2-T10, P2-T13, P2-T18, P2-T32

**Files:**
- Modify: `package.json`, root lockfile (`npx expo install @shopify/react-native-skia`); P2-T32's `recap/WalletRecapScreen.tsx` (`extras` on: the share button opens `ShareCardTray`, labelled แชร์การ์ดสรุป where an image can be shared and `recap.share` otherwise; its `trackRecapShared()` call moves into `shareRecap`) and `src/screens/redesign/insights/recapData.ts` (`shareText` resolves whether the sheet answered `Share.sharedAction`; its callers ignore it); P2-T18's `home/WalletShell.tsx` (`extras` on: one `sweepRecapImages()` at mount)
- Create: `src/wallet/recap/recapCard.ts` (pure), `recapImage.ts` (the port: unsupported on the web and in tests), `recapImage.native.tsx` (Skia), `shareImageFile.ts`, `shareRecap.ts`, `ShareCardTray.tsx`, `copy.draft.ts`
- Test: `src/wallet/recap/recapCard.test.ts`, `shareImageFile.test.ts`, `recapImageSource.test.ts` (Node), `ShareCard.render.test.tsx`; P2-T32's suite runs unchanged

**Interfaces:**
- Consumes: `recapShareText`, `shareText` (P2-T32); `walletMoneyText`, `HIDDEN_AMOUNT`, `usePrivateMode` (P2-T10); `hiddenAmount` and the `currency` options (P5-T16), `DiaryView.homeCurrency` (P5-T18a); `materialPaint` (P2-T1); `SwitchRow` (P6B-T1); expo-file-system 58.0.9's `File` (`create({ overwrite })`, `write(bytes): Promise<void>`, `delete()`, `uri`, `name`) and `Paths.cache` (`list()`), through a lazy `import()`.
- Produces:
  ```ts
  export type RecapCardInput = { month: string; currency: CurrencyCode; daysLogged: number; daysInMonth: number; spentMinor: Minor; budgetMinor: Minor | null; top: readonly { name: string; minor: Minor; own: boolean }[] }   // currency: DiaryView.homeCurrency; own: named by the person, neither built in nor a pack item
  export type RecapCardModel = { monthLabel: string; title: string; days: string; spentLabel: string; spent: string; budgetWord: string | null; topLabel: string; top: readonly { name: string; amount: string }[]; footer: string; spoken: string; mask: string }
  export function recapCardModel(input: RecapCardInput, hidden: boolean, t: WalletT, locale: 'th' | 'en' | 'vi'): RecapCardModel   // amounts walletMoneyText(minor, { currency }); mask hiddenAmount(currency), every amount while hidden; budgetWord อยู่ในงบ or เกินงบ, never a figure; an own category reads share.otherCategory
  export type RecapImagePort = { readonly supported: boolean; render(card: RecapCardModel): Promise<Uint8Array | null> }   // a 1080 x 1920 PNG; null when Skia draws nothing
  export function useRecapImage(): RecapImagePort
  export type RecapFiles = { open(name: string): Promise<{ uri: string; write(bytes: Uint8Array): Promise<void>; delete(): void }>; sweep(): Promise<void> }   // sweep: deletes every jotbun-recap-*.png in the cache
  export function shareRecapImage(bytes: Uint8Array, month: string, deps?: { files?: RecapFiles; share?: (content: { url: string }) => Promise<{ action: string }> }): Promise<boolean>   // true only for Share.sharedAction
  export function sweepRecapImages(files?: RecapFiles): Promise<void>
  export function shareRecap(input: { card: RecapCardInput; hidden: boolean; port: RecapImagePort; platform: 'ios' | 'android' | 'web'; t: WalletT; locale: 'th' | 'en' | 'vi' }): Promise<void>   // the one share rule
  export function ShareCardTray(props: { visible: boolean; onClose(): void; card: RecapCardInput }): JSX.Element
  ```
- The Skia adapter (X9): `useFonts({ Anuphan: [Anuphan_400Regular, Anuphan_500Medium, Anuphan_700Bold], 'DM Sans': [DMSans_700Bold] })` with the font assets `src/theme/appFonts.ts` imports; `supported` only once the font manager exists; `render` builds each line with `Skia.ParagraphBuilder.Make(style, fontMgr)` (amounts in DM Sans 700) over silk's light gradient in one `Group`, then `await drawAsImage(group, { width: 1080, height: 1920 })` (Skia 2.14.0 resolves `SkImage | null`) and `image.encodeToBytes()`.
- The default `files`: `open` is `new File(Paths.cache, name)` with `create({ overwrite: true })`; `sweep` deletes each `Paths.cache.list()` file named `jotbun-recap-*.png`. `shareRecapImage` sweeps, writes `jotbun-recap-<month>.png`, shares `{ url: file.uri }` through `Share.share` and deletes the file in a `finally`. `shareRecap`: on iOS with `port.supported` and a rendered image, the image; otherwise `recapShareText(…, hidden, t, currency)` through `shareText`; both name own categories `share.otherCategory`, as the card promises no names; one `trackRecapShared()` only when the sheet answered `Share.sharedAction`, so a dismissed iOS sheet sends none.
- Currency (Money): `currency`, the P5 calls and the yen case come with whichever of this task and P5-T18d lands second.
- `ShareCardTray` (ox-share-card): a 9:16 preview drawn with views from `recapCardModel`, one element named by its `spoken`; ซ่อนยอดเงิน as a `SwitchRow` that starts on even when private mode is off, disabled with `share.privateLocked` while private mode is on (`share.hideNote` otherwise, `{hidden}` the model's `mask`); แชร์ as the `PrimaryButton`. No บันทึกรูป (default pending owner Q2).
- Copy (drafts): `share.hideNote` เปิดไว้ก่อนเสมอ การ์ดจะแสดงยอดเป็น {hidden}, `share.privateLocked` ปิดโหมดส่วนตัวก่อน จึงจะแสดงยอดเงินบนการ์ดได้, `share.otherCategory` หมวดอื่น.

- [ ] **Step 1: Install and read the types.** `node -e "console.log(require('./node_modules/expo/bundledNativeModules.json')['@shopify/react-native-skia'])"` prints 2.14.0; `(cd apps/app && npx expo install @shopify/react-native-skia)`; `npm ls @shopify/react-native-skia && npm run test:ops`. Confirm `drawAsImage`, `useFonts`, `Skia.ParagraphBuilder.Make` and `encodeToBytes` in the installed types; record them.
- [ ] **Step 2: Write the failing tests.** `recapCard.test.ts`: `a hidden card holds no digit in any amount and keeps the month, the days and the budget word`; `a shown card uses P2's money text`; `over budget says เกินงบ, never the amount over`; `a category the person named reads หมวดอื่น`; `a yen home's card shows ¥ amounts, and ¥•••• while hidden` (with P5-T18d). `shareImageFile.test.ts` (a fake `files` and `share`): `iOS writes one PNG to the cache, shares its file URL and deletes it`; `the PNG is deleted after the sheet closes, also when sharing throws` (Review Focus 3); `earlier recap PNGs are swept before a write and at launch`. `recapImageSource.test.ts`: `only recapImage.native.tsx imports @shopify/react-native-skia`. `ShareCard.render.test.tsx` (a fake port): `the switch starts on even with private mode off`; `with private mode on it cannot be turned off`; `on iOS share renders and shares the image, sending one recap_shared`; `a renderer that draws nothing shares the text`; `on Android, or without a renderer, it shares P2's text, hidden while the switch is on, and sends one recap_shared`; `a dismissed sheet sends no recap_shared`; `there is no บันทึกรูป button`.
- [ ] **Step 3: Run them and see them fail.**
- [ ] **Step 4: Implement.**
- [ ] **Step 5: Run them and see them pass,** with P2-T32's and the catalogue suites unchanged (the web draws no Skia).
- [ ] **Step 6: Mutation check.** Start the switch from private mode: its case fails. Delete the file only after a successful share: the throw case fails. Send `recap_shared` from the tray too: the one-event case fails. Skip the sweep: its case fails.
- [ ] **Step 7: Device checks SKIPPED** (Skia's card on an iPhone, Thai shaping in its paragraph UNVERIFIED; the iOS sheet with the PNG; Android's text share). Gate, receipt (the installed version and the lockfile change), commit. `git commit -m "Share the month recap as an image on iOS, with amounts hidden until the person shows them"`

**Checkpoint E2-X2** (controller): privacy, export, deletion, sign-in, terms, account and sign-outs, session ended, the error and restore states, and the share card.

---

### Task P6B-T13: Surveys, choice-only and after yes (B24)

**Starts after:** P6B-T6, P2-T3, P2-T4, P2-T16, P2-T18, P2-T30, 1D-T6

**Files:**
- Create: `src/analytics/surveys.ts` (pure), `anonymousCapture.ts`; `src/wallet/surveys/surveyTriggers.ts` (pure), `SurveyTray.tsx`, `SurveyHost.tsx`, `useLeavingSurvey.tsx`, `copy.draft.ts`
- Modify: 1D's `gate.ts`, `controller.ts`, `bus.ts`, `appAnalytics.ts` (passes the ids), `testing/recordAnalytics.ts`; `src/config/env.ts` (`posthogSurveys` from `EXPO_PUBLIC_POSTHOG_SURVEYS`); P2-T18's `WalletShell.tsx` (`extras` on: one `<SurveyHost />`); `app/settings/delete.tsx` (`leaving={useLeavingSurvey()}`)
- Test: `src/analytics/surveys.test.ts`, `gate.test.ts`, `controller.test.ts`, `neverSent.test.ts`, `src/wallet/surveys/surveyTriggers.test.ts` (Node), `Survey.render.test.tsx`; 1D-T1's `after yes, allow-listed events…` case changes one expectation, as survey events follow the survey rule

**Interfaces:**
- Consumes: `GatePolicy`, `OutgoingEvent`, `PostHogLike`, `Analytics`, `getAnalytics`, `trackClientEvent`, `recordAnalytics` (1D-T1); `posthogHost`, `posthogKey` (1D-T6); `streakCount` (P2-T4); `useAddTray` (P2-T16); `walletAccountStore` (P2-T3); `Tray` (P2-T13); `DeleteScreen`'s `leaving` (P6B-T6); `randomUUID` (expo-crypto 58.0.6).
- Produces:
  ```ts
  export type SurveyKey = 'pmf' | 'slip_accuracy' | 'leaving' | 'ask_bun'
  export const SURVEYS: Readonly<Record<SurveyKey, { readonly question: string; readonly choices: readonly string[]; readonly active: boolean }>>   // English question; ask_bun inactive (X4), so the owner creates three single-choice API surveys
  export type SurveyIds = Readonly<Partial<Record<SurveyKey, { survey: string; question: string }>>>   // PostHog UUIDs
  export function parseSurveyIds(raw: string | undefined): SurveyIds   // bad JSON, unknown keys and non-UUID ids dropped
  export type SurveyEventName = 'survey shown' | 'survey sent' | 'survey dismissed'
  export type SurveyProps = { $survey_id: string; $survey_questions?: readonly { id: string; question: string }[] } & { [response: `$survey_response_${string}`]: string }
  export function surveyProps(key: SurveyKey, ids: SurveyIds, event: SurveyEventName, choice?: string): SurveyProps | null   // null without ids or with a choice not listed
  export function allowSurveyEvent<E extends OutgoingEvent>(event: E, ids: SurveyIds): E | null   // the gate's rule; GatePolicy gains surveys?: SurveyIds
  survey(name: SurveyEventName, properties: SurveyProps): void   // on Analytics: captured only in yes, never held; PostHogLike.capture takes CleanProps | SurveyProps
  export function subscribeAppEvents(listener: (name: AppEventName) => void): () => void   // bus.ts: after cleanEvent, the name only
  export function sendAnonymousSurvey(input: { props: SurveyProps; host: string; apiKey: string; fetchImpl?: typeof fetch; newId?: () => string }): Promise<void>
  export type SurveyMemory = { seen: Readonly<Partial<Record<SurveyKey, 'shown' | 'answered' | 'dismissed'>>>; eligible: readonly SurveyKey[] }
  export const SURVEY_MEMORY_NAME = 'surveys'   // P2-T3's account store
  export function surveyDue(input: { memory: SurveyMemory; loggedDays: number; ids: SurveyIds; shownThisLaunch: boolean }): SurveyKey | null
  export function markEligible(memory: SurveyMemory, key: SurveyKey): SurveyMemory
  export function useLeavingSurvey(): { slot: ReactNode; onAccepted(): void } | undefined   // undefined unless yes with ids; the choice lives in the route, so the send outlives the form
  ```
- The survey rule: without consent nothing passes; with consent an event passes only with a configured `$survey_id`, its `$survey_questions` replaced by that survey's own; a `$survey_response_<question>` outside the choices drops the event; other `$survey_*` properties go; 1D-T1's removals still apply.
- `sendAnonymousSurvey` posts once to `${host}/i/v0/e/` (PostHog's capture API, through 1D-T2's proxy) `{ api_key, event: 'survey sent', distinct_id: newId(), properties: { ...props, $process_person_profile: false } }`, `newId` being expo-crypto's `randomUUID`; failures are swallowed.
- Triggers (X4): `pmf` once `streakCount(days, today)` (P2-T4) reaches 7; `slip_accuracy` after `markEligible` on a `slip_review_confirmed` heard through `subscribeAppEvents`; one per launch; never again once shown. `SurveyHost` decides once a launch, when Home (`/spend`) first shows in `yes`, with ids and no setup step, and opens a due survey through `useAddTray().whenClosed(...)` (R69); one made due later (a save on the seventh logged day) waits for the next launch, and one still waiting when the tray closes on a save (`record_saved` heard through `subscribeAppEvents`) is dropped for the launch, as that save may open P2-T30's `OverBudgetMoment` the same way. It sends `survey shown`, then `survey sent` (the choice key) or `survey dismissed`. `SurveyTray`: the question, 44 pt radios, ส่งคำตอบ (disabled until a choice), ไม่ตอบ, then a polite `survey.thanks`. `useLeavingSurvey` draws the leaving question in `DeleteScreen`'s slot; its `onAccepted`, run by `useDeleteFlow` once the request is confirmed accepted, sends the chosen key once through `sendAnonymousSurvey`; no shown or dismissed event.
- Copy (drafts, default pending owner Q9; the bracketed key is what PostHog receives): `survey.pmfQuestion` ถ้าวันหนึ่งใช้ Jotbun ไม่ได้แล้ว คุณจะรู้สึกอย่างไร: ผิดหวังมาก (`very_disappointed`), ผิดหวังนิดหน่อย (`somewhat_disappointed`), ไม่ผิดหวัง (`not_disappointed`); `survey.slipQuestion` บันอ่านสลิปให้ถูกแค่ไหน: ถูกทุกใบ (`all_right`), ถูกเกือบทั้งหมด (`mostly_right`), ผิดหลายใบ (`many_wrong`); `survey.leavingQuestion` ถ้าไม่ว่าอะไร ช่วยบอกหน่อยว่าทำไมถึงลบบัญชี: ไม่ได้ใช้แล้ว (`not_needed`), จดแล้วเหนื่อยเกินไป (`too_much_effort`), กังวลเรื่องความเป็นส่วนตัว (`privacy`), ใช้แอปอื่นแทน (`other_app`), เหตุผลอื่น (`other`); `survey.send` ส่งคำตอบ, `survey.skip` ไม่ตอบ, `survey.thanks` ขอบคุณที่ช่วยบอก.

- [ ] **Step 1: Write the failing tests.** `surveys.test.ts`: `survey ids are parsed strictly`; `surveyProps carries the id, its own question and a listed choice only`. `gate.test.ts`: `before yes no survey event leaves`; `an answer that is not one of the choices drops the event` (`'ค่าเช่าเดือนตุลา ฿4,500'`); `an unknown survey id is dropped`. `neverSent.test.ts`: a `survey sent` holding every sentinel. `controller.test.ts`: `survey events are captured only in yes and never held`. `surveyTriggers.test.ts`: `pmf is due from seven logged days`; `a confirmed slip review makes slip_accuracy due`; `one survey a launch, each once per account, none without ids, never ask_bun or leaving`. `Survey.render.test.tsx`: `after yes the due survey opens on Home and sends survey sent with the choice key, or survey dismissed`; `no survey shows for a person who said no, never answered or signed out, or while a tray is open` (Review Focus 1: `recordAnalytics({ consent: 'no' })`, `{ consent: 'unasked' }` and `setAccount(null)`); `a save that reaches the seventh logged day opens no survey until the next launch`; `the survey opens only after the add tray's onClosed, and none that launch when the tray closes on a save, so the over-budget moment shows alone` (an expense over its category's limit: one `Tray` open); `the chosen leaving answer is sent once when the deletion is accepted, after the receipt replaces the form; a refused or unconfirmed request sends nothing, nor does a person who said no` (through `app/settings/delete.tsx`; the body's `distinct_id` is a UUID that is not the analytics id; `$process_person_profile: false`); `every choice is a 44 pt radio and grows to AX5`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** then `src/analytics` whole.
- [ ] **Step 5: Mutation check.** Let any answer through: the choices case and `neverSent` fail. Hold survey events before yes: the controller case fails. Send the leaving answer before acceptance, or under the analytics id: its case fails. Open the survey once `pmf` becomes due: the next-launch case fails. Open a waiting survey after a save: the tray case fails.
- [ ] **Step 6: Gate, receipt, commit.** Real surveys are SKIPPED until the owner creates them. `git commit -m "Add choice-only surveys after yes, with an anonymous on-leaving answer"`

---

### Task P6B-T14: Remote flags after yes, flag exposure and the rollout layer (B25)

**Starts after:** 1D-T6, P2-T3, P2-T8

**Files:**
- Create: `src/analytics/remoteFlags.ts` (pure), `src/rollout/rollout.ts` (pure), `rollout/experiments.ts` (pure), `rollout/useRollout.ts`
- Modify: `src/analytics/controller.ts`, `gate.ts`, `appAnalytics.ts` (wires `fetchRemoteFlags` with `posthogHost` and `posthogKey`, and the kept flags over `walletAccountStore`), `testing/recordAnalytics.ts` (its fake client records `updateFlags` and answers `getFeatureFlag`)
- Test: `src/analytics/remoteFlags.test.ts`, `controller.test.ts`, `gate.test.ts`, `src/rollout/rollout.test.ts` (Node), `rollout/useRollout.render.test.tsx`. 1D-T1's `after yes, allow-listed events…` case changes its `$feature_flag_called` expectation; 1D-T6's `posthogOptions.test.ts` runs unchanged (`disableRemoteFeatureFlags: true`, `preloadFeatureFlags: false`).

**Interfaces:**
- Consumes: `AnalyticsDeps`, `PostHogLike`, `Analytics`, `createAnalytics`, `getAnalytics` (1D-T1); `installAppAnalytics`, `posthogHost`, `posthogKey` (1D-T6); `walletAccountStore`, `KeyValueStore` (P2-T3); `mountWallet` (P2-T8).
- Produces:
  ```ts
  export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
  export type RemoteFlags = { flags: Record<string, boolean | string>; payloads: Record<string, JsonValue> }
  export function fetchRemoteFlags(input: { host: string; apiKey: string; distinctId: string; fetchImpl?: typeof fetch; timeoutMs?: number }): Promise<RemoteFlags | null>
    // POST `${host}/flags/?v=2` (as @posthog/core 1.60.1) with { api_key, distinct_id } and redirect: 'error', so no redirect takes the phone to PostHog itself;
    // each flag is its variant when it has one, else `enabled`; `metadata.payload` JSON-parsed; null on any failure, timeout (default 5000 ms) or malformed answer
  export const REMOTE_FLAGS_NAME = 'remote-flags'   // P2-T3's account store: the last loaded RemoteFlags, values only
  AnalyticsDeps.flags?: { load(distinctId: string): Promise<RemoteFlags | null>; kept(accountId: string): KeyValueStore }
  PostHogLike.updateFlags(flags: Record<string, boolean | string>, payloads?: Record<string, JsonValue>): void
  PostHogLike.getFeatureFlag(key: string): boolean | string | undefined
  Analytics.flag(key: string): boolean | string | undefined   // undefined unless status() is 'yes' and flags were pushed
  export type RolloutKey = 'bun_ai' | 'slip_import' | 'travel'
  export const ROLLOUT_FLAGS: Readonly<Record<RolloutKey, string>>     // 'rollout-bun-ai', 'rollout-slip-import', 'rollout-travel' (§7: 5%, 25%, everyone)
  export const ROLLOUT_DEFAULTS: Readonly<Record<RolloutKey, boolean>>  // all false (default pending owner Q10)
  export function rolloutOn(key: RolloutKey, value: boolean | string | undefined): boolean   // undefined: the default; true or a variant but 'control': on
  export function useRollout(key: RolloutKey): boolean                  // re-renders when the flags or the consent change
  export type ExperimentKey = 'budget_question' | 'save_celebration' | 'reminder_time'
  export const EXPERIMENTS: Readonly<Record<ExperimentKey, { flag: string; variants: readonly ['control', string] }>>
    // exp-budget-question: no_presets; exp-save-celebration: still; exp-reminder-time: later (default pending owner Q11)
  export function variantOf(key: ExperimentKey, value: boolean | string | undefined): string   // a listed variant, else 'control'
  export function readExperiment(key: ExperimentKey): string   // variantOf over getAnalytics()?.flag; the read is the exposure
  ```
- Rules (X5): entering yes for an account first pushes its kept flags with `client.updateFlags`, so any launch, offline included, shows the last rollouts at once; then, with an analytics id, it loads, pushing and keeping an answer (a failure keeps the old); each `refresh()` in yes loads again; subscribers hear every push. Applying no, entering `unanswered` or signing out erases the kept flags, and 1D-T1's `reset()` empties the client's; `loading` and the launch's account change keep them; a confirmed deletion erases them with the account's other kept data (P2-T3). `flag` reads `client.getFeatureFlag` only in yes, so `$feature_flag_called` is only made after yes; the gate passes `$feature_flag_called` only with consent and removes `$feature_flag_payload` and `$feature_flag_bootstrapped_payload`.

- [ ] **Step 1: Write the failing tests.** `remoteFlags.test.ts` (a fake fetch): `it posts api_key and distinct_id to /flags/?v=2 without following a redirect, and reads flags and variants` (PostHog's documented v2 answer gives `{ 'my-awesome-flag': true, 'my-multivariate-flag': 'some-string-value', 'flag-thats-not-on': false }` and the parsed payload; `redirect` is `'error'`); `a 5xx, a timeout or a malformed answer is null`. `controller.test.ts`: `flags are asked for once yes is entered, with the analytics id, and pushed with updateFlags`; `no flags are asked for unless the answer is yes` (Review Focus 1: signed out, unanswered and no never call `load`); `a launch shows the kept rollouts before the network answers`; `an offline launch in yes keeps the last loaded rollouts`; `a no, an unanswered question or a sign-out clears the kept flags`; `a no from another phone empties the flags at the next foreground`; `flag reads nothing before yes`. `gate.test.ts`: `$feature_flag_called passes only after yes, without payloads` (Review Focus 2). `rollout.test.ts`: `undefined reads the default; true or a variant reads on; false or control reads off`; `an unknown experiment variant reads control`. `useRollout.render.test.tsx`: `useRollout follows the flags once they load after yes, and the default after a no`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** then `npm run test:unit -w gogospend-app -- src/analytics` whole.
- [ ] **Step 5: Mutation check.** Load flags while unanswered: the yes-only case fails. Let `$feature_flag_called` through before yes: the gate case fails. Read `'control'` as on: the rollout case fails. Keep the flags after a no: the clear case fails. Push nothing until the load answers, or erase the flags on `loading`: the launch and offline cases fail.
- [ ] **Step 6: Gate, receipt, commit.** Real flags are SKIPPED until the owner creates them. `git commit -m "Fetch remote flags only after yes and push them into PostHog, with rollouts and experiments that default safely"`

---

### Task P6B-T15: Rollout wrappers on Bun AI, slip import and travel (B25)

**Starts after:** P6B-T14, P6B-T5, P2-T16, P3-T14 (P3:ai-area), P3-T3 (P3:ai-gate), P3-T15, P4-T18 (P4:slips-area), P5-T21 (P5:travel-area), P5-T23 (P5:trips), P5-T26, P6A-T13. It lands only once the owner's rollout flags exist and are set to everyone for the beta (default pending owner Q10).

**Files:**
- Modify: the three switch hooks, each with `useRollout(key)` inside: P3-T14's `useBunAiArea()` in `src/wallet/bunai/aiArea.ts`, P4-T18's `useSlipsArea()` in `src/slips/slipsArea.ts`, P5-T21's `useTravelArea()` in `src/wallet/travel/travelArea.ts`; `useRollout('bun_ai')` also in P2-T16's `canTellBun` (`src/wallet/add/AddTrayHost.tsx`) and in P6A-T4's `src/wallet/outside/OutsideBridge.tsx`, whose Tell Bun `aiOn` is that condition; P6B-T5's `src/screens/redesign/account/companionSwitches.ts` (`aiOffered`) and `WalletPrivacyScreen.tsx`, today's `CompanionSettings.tsx`; `src/rollout/useRollout.ts` and `src/testing/renderSetup.ts` (before each render test every rollout is on, so other plans' suites run unchanged; this task's cases and P6B-T14's `useRollout.render.test.tsx` clear it)
- Test: `src/rollout/rolloutWrappers.render.test.tsx`

**Interfaces:**
- Consumes: `useBunAiArea`, `usePhotosArea` (P3-T14), `useSlipsArea` (P4-T18), `useTravelArea` (P5-T21); `useRollout` (P6B-T14); `canTellBun` (P2-T16); `AI_PAUSED` (`P3-T3 (P3:ai-gate)`); `useCompanionSwitches` (P6B-T5); `OutsideBridge`, `fakeQuickActions` (P6A-T4), with P6A-T13's scan route.
- Produces: `setRolloutOverride(values: Partial<Record<RolloutKey, boolean>> | null): void` (tests only: an overridden key answers without reading a flag); `aiOffered: boolean` on `useCompanionSwitches()` (`useRollout('bun_ai')`, or AI already on); each hook answers its area and `useRollout(key)`.
- Rules: the rollout sits inside each hook, so every in-app entry point that reads one follows, T3's Settings rows and T5's AI row included; the tray's บอกบัน and P6A's quick actions follow the same keys. P3-T14's `usePhotosArea()` stays unwrapped: a receipt photo needs no AI (B3). Pure forms such as `bunAiAreaOn()` and `slipsAreaOn()` cannot read `useRollout`, so P6A's `redirectSystemPath` and P4's daily-reading upkeep stay outside; a stale scan link meets P4's routes, which read the hook. `useAiCompanion().enabled` stays consent and service (P4's slip consent and P6A's share path read `preferences.companion`; today's `AskBunScreen` and `BunNote` have no wallet entry point). The native share extension cannot read flags; only the server's gates cover it, a known gap. A rollout hides entry points only: nothing saved changes (AI preferences, slip drafts, trips and foreign records stay; foreign records show), and the server's gates and release switches still answer for everyone (C12). With `bun_ai` not offered, today's `CompanionSettings` choice and Privacy's AI switch show only while `aiOffered`, so AI that is on can still be turned off; slip import's own consent step (P4) and cashback tips stay.

- [ ] **Step 1: Write the failing tests** (`recordAnalytics()` with flags supplied through its fake client): `with bun_ai off, the add tray has no Tell Bun row, and nothing in Settings or Privacy turns AI on` (`canTellBun` false while the preferences say on); `with bun_ai off, Privacy keeps the AI row only for someone with AI on, and keeps cashback tips` (P3's area on and off); `with bun_ai off a receipt photo can still be attached, with no read toggle`; `with slip_import off, Home has no inbox card and no slip-import entry`; `with slip_import off, neither the scan quick action nor the snapshot's scan link is offered, and with bun_ai off no Tell Bun action is` (P6A-T4's `fakeQuickActions()`); `with travel off, there is no trip start and no home-currency row, and saved foreign records still show their currencies`; `a rolled-out feature still meets the server's gate: AI_PAUSED shows Bun resting`; `without loaded flags every feature reads its default`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement** each hook's rollout, `canTellBun`, the bridge, `aiOffered` and the test override.
- [ ] **Step 4: Run them and see them pass,** with the P3, P4, P5 and P6A suites named in their tasks unchanged.
- [ ] **Step 5: Mutation check.** Leave `canTellBun` without the rollout: the Bun AI case fails. Leave `useSlipsArea()` or `useTravelArea()` unwrapped: the slip or travel case fails. Leave `useBunAiArea()` unwrapped: the Privacy case fails. Leave the bridge's `aiOn` without the rollout: the quick-action case fails. Wrap `usePhotosArea()` too: the photo case fails. Hide Privacy's AI row while AI is on: the Privacy case fails. Hide saved foreign records with travel off: the travel case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Wrap Bun AI, slip import and travel in their rollouts, leaving saved data and server gates alone"`

---

### Task P6B-T16: Experiments: the budget question, the save celebration and the reminder time (B25)

**Starts after:** P6B-T14, P6B-T4, P2-T17, P2-T30

**Files:**
- Modify: `src/wallet/budget/BudgetQuestion.tsx` (P2-T30: `no_presets` draws no preset chips; ยังไม่ตั้ง stays), `src/wallet/saved/SaveFlight.tsx` (P2-T17: `still` draws no chip; the toast is unchanged), `src/wallet/settings/ReminderPrimeScreen.tsx` (P6B-T4: `later` offers `'20:30'`, `control` `FIRST_REMINDER_TIME`)
- Test: `src/rollout/experiments.render.test.tsx`; P2-T17's and P2-T30's suites run unchanged

**Interfaces:**
- Consumes: `readExperiment` (P6B-T14); `isRedesignEnabled` (`featureFlags.ts`).
- Rules: each screen reads its variant with `readExperiment` once per showing (the question and the priming step at mount, the flight when a notice arrives), so each exposure counts once; while the `extras` area is off it is `control` with no read, so no variant reaches P2's routed screens before E2-X3 and P6B-T20; a `firstTime` prop on `ReminderPrimeScreen` wins over its read; without flags every screen is today's. No experiment reads, sends or changes an amount (default pending owner Q11).

- [ ] **Step 1: Write the failing tests:** `no_presets draws no preset chips and keeps ยังไม่ตั้ง; control and people without flags see the presets`; `still shows the toast without the flying chip`; `later offers 20:30, and turning reminders on asks for 20:30`; `each showing reads its flag once` (a `getFeatureFlag` spy); `with the extras area off every screen is control and reads no flag`; `no experiment sends an amount` (`JSON.stringify(sent)` holds none).
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass.**
- [ ] **Step 5: Mutation check.** Read the variant on every render: the once case fails. Fly the chip in `still`: its case fails. Read the flag with the area off: the area case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add the budget question, save celebration and reminder time experiments, control by default"`

---

### Task P6B-T17: Passkeys on a port: the offer, the list and passkey sign-in (sa-passkey; B22)

**Starts after:** P6B-T7, P6B-T8, 1D-T14, 1C-T9

**Files:**
- Create: `src/auth/passkeyAuthenticator.ts`; `src/wallet/account/passkeyOffer.ts` (pure), `useCreatePasskey.tsx`, `PasskeyOfferScreen.tsx`, `PasskeyList.tsx`; `app/login/passkey.tsx` (`PasskeyOfferScreen` inside `TermsGate` while the offer is due)
- Modify: 1C-T5's `src/auth/betterAuthPort.ts`, `betterAuthClient.ts` (a `passkeyRoutesClient()` plugin whose `getActions($fetch)` calls the six routes, as `jotbunAccountClient` does), `credentialProvider.ts`, `sessionStore.ts` (accepts `'passkey'`), `testing/fakeAuthServer.ts` (the routes, a list and a stale-session answer); 1C-T8's `useFreshSignIn.tsx`; 1D-T1's `src/analytics/events.ts` (`trackPasskeyCreated`); P6B-T3's `account/accountWords.ts`, `account/copy.draft.ts`; P6B-T7's `WalletEmailCodeScreen.tsx` (after a sign-in, `/login/passkey`, keeping `from`, when the offer is due) and `WalletSignInScreen.tsx` (`passkey.signIn` while supported); P6B-T8's `ConfirmItsYouTray.tsx`; `app/settings/account.tsx` (`passkeys={<PasskeyList />}`)
- Catalogue: `passkeySections.tsx` (on `fakePasskeys()`, so every section draws)
- Test: `src/auth/betterAuthPort.test.ts`, `credentialProvider.test.ts` (new cases), `src/wallet/account/Passkey.render.test.tsx`, `accountWords.test.ts`

**Interfaces:**
- Consumes: `createBetterAuthPort`, `BetterAuthClientLike`, `BetterAuthPort`, `CredentialProvider`, `SignInRequest`, `SignInMethod`, `ClientResult`, `AuthCancelled`, `AuthRefused` (1C-T5); `useFreshSignIn` (1C-T8); `trackClientEvent` (1D-T1); `walletAccountStore` (P2-T3); `maskEmail`, `methodName` (P6B-T3); `WalletEmailCodeScreen`, `WalletSignInScreen` (P6B-T7); `TermsGate` (1C-T8), `getSharedPolicyClient`, `onPolicyRequired` (1C-T9); `AccountScreen`'s `passkeys`, `ConfirmItsYouTray` (P6B-T8).
- Produces:
  ```ts
  export type PasskeyAuthenticator = { readonly supported: boolean; create(options: unknown): Promise<unknown>; get(options: unknown): Promise<unknown> }   // WebAuthn JSON in and out; AuthCancelled on a cancel
  export const NO_PASSKEYS: PasskeyAuthenticator          // supported false until P6B-T18
  export function fakePasskeys(options?: { cancel?: boolean }): PasskeyAuthenticator
  export type PasskeyDto = { id: string; name: string | null; createdAt: string }
  // BetterAuthClientLike gains, over @better-auth/passkey 1.6.33's routes:
  //   passkeyRegisterOptions() GET /passkey/generate-register-options; passkeyVerifyRegistration(response, name) POST /passkey/verify-registration;
  //   passkeyAuthenticateOptions() GET /passkey/generate-authenticate-options; passkeyVerifyAuthentication(response) POST /passkey/verify-authentication (a SignInAnswer);
  //   passkeys() GET /passkey/list-user-passkeys (PasskeyDto[]); deletePasskey(id) POST /passkey/delete-passkey { id }; each a ClientResult
  // BetterAuthPort gains: readonly passkeys: boolean; createPasskey(name: string): Promise<void>; passkeyList(): Promise<PasskeyDto[]>; deletePasskey(id: string): Promise<void>   // a 403 SESSION_NOT_FRESH is AuthRefused('REAUTH_REQUIRED')
  // CredentialProvider gains createPasskey(name: string): Promise<void>   // the port's, then one trackPasskeyCreated() once verify lands
  // 1C-T5's SignInMethod becomes 'apple' | 'google' | 'email' | 'passkey'; SignInRequest gains { method: 'passkey' }
  export function trackPasskeyCreated(): void          // events.ts: 'passkey_created' { method: 'passkey' }
  export const PASSKEY_OFFER_NAME = 'passkey-offer'    // walletAccountStore(provider.account().accountId)
  export function passkeyOfferDue(input: { supported: boolean; signedInBy: SignInMethod; existing: number; answered: boolean }): boolean   // email sign-ins only, no passkey yet, never answered
  export function useCreatePasskey(): { create(name: string): Promise<'created' | 'cancelled' | 'failed'>; sheet: ReactNode }   // the one rule the offer and Account's add call
  ```
- Rules (X11): `createBetterAuthPort` takes `passkeys` (default `NO_PASSKEYS`) and maps failures as 1C-T5 does; `methods` holds `'passkey'` only while supported. Sign-in is authenticate options, `get`, verify, then 1C-T5's `session()`; 1D-T14's rule then sends `signed_in` with `method: 'passkey'`. A fresh sign-in by passkey is the same ceremony; one whose session belongs to another user signs it out and is `OTHER_ACCOUNT` (K14). `createPasskey` is register options, `create`, then verify with `name`. `@better-auth/passkey` 1.6.33 guards both registration routes with `freshSessionMiddleware`, and 1C's `freshAge` is 300 s, so `create` runs `useFreshSignIn` first from Account (as linking does, R43), and from the offer runs it after a `REAUTH_REQUIRED`, then tries once more. `useFreshSignIn` and `ConfirmItsYouTray` gain the passkey branch (`freshSignIn({ method: 'passkey' })`); `methodName('passkey')` says `passkey.listTitle`, which st-delete's "ยืนยันด้วย {method}" shows.
- Bindings: sa-passkey: `app/login/passkey.tsx` renders `PasskeyOfferScreen` inside 1C-T9's `TermsGate` with `getSharedPolicyClient()` and `onPolicyRequired`, as `app/onboarding/reminder.tsx` does, so pending terms, once read, come first; it reads `from` and sends a signed-out person to `/spend`, and one not due to `afterSignInAttempt`'s destination for that `from`; the signed-in line with `maskEmail`, the board's lines and the keychain card with the masked address, never a name (X13); สร้างพาสคีย์ (`PrimaryButton`) calls `create(passkey.defaultName)`, then goes on to `afterSignInAttempt`'s destination for that `from`; ไว้ทีหลัง keeps `answered`, then goes on there too; a failure says `passkey.failed`. `PasskeyList`: `passkey.listTitle`, one row per passkey (name, created day) with a 44 pt `passkey.remove` that asks `passkey.removeAsk` in a `Tray` first, and `passkey.add` (through `create`) while there is none. Nothing renders while unsupported, so the offer reaches people only once P6B-T18 lands (default pending owner Q1).
- Copy (drafts): `passkey.defaultName` Jotbun {date}, `passkey.failed` สร้างพาสคีย์ไม่สำเร็จ ลองใหม่ได้ที่การตั้งค่า › บัญชี, `passkey.listTitle` พาสคีย์, `passkey.add` สร้างพาสคีย์, `passkey.remove` ลบพาสคีย์, `passkey.removeAsk` ลบพาสคีย์นี้ไหม เข้าสู่ระบบด้วยวิธีอื่นได้เสมอ, `passkey.signIn` เข้าสู่ระบบด้วยพาสคีย์.

- [ ] **Step 1: Write the failing tests.** `betterAuthPort.test.ts` (1C-T5's fake server with `fakePasskeys()`): `registering runs the options, the ceremony, then verify with the name`; `a cancelled ceremony is AuthCancelled and verifies nothing`; `a stale session's registration is REAUTH_REQUIRED, never a failure`; `a passkey sign-in signs in and names the session's method passkey`; `a passkey fresh sign-in into another account signs it out and is OTHER_ACCOUNT`; `the list and the delete use the passkey routes`; `with NO_PASSKEYS, methods holds no passkey`. `credentialProvider.test.ts`: `a stored passkey session hydrates`; `createPasskey sends one passkey_created once verify lands, and none on a cancel or a failure`. `accountWords.test.ts`: `methodName('passkey')` says พาสคีย์. `Passkey.render.test.tsx`: `the offer shows once after an email-code sign-in on a phone with passkeys, and creating one sends one passkey_created`; `pending terms come before the passkey offer` (a pending policy: once the gate's first `pending()` read answers, `/login/passkey` shows the terms step, and accepting shows the offer); `from onboarding, the offer goes on to /onboarding/reminder`; `adding a passkey from Account runs the fresh sign-in first, then creates it and sends one passkey_created`; `a cancelled fresh sign-in or passkey ceremony creates, requests and sends nothing`; `a failed verification sends no passkey_created and says passkey.failed`; `ไว้ทีหลัง never offers it again for this account`; `Apple and Google sign-ins get no offer`; `/login/passkey sends a signed-out person to /spend, and one not due to /spend, or from onboarding to /onboarding/reminder`; `the list removes a passkey only after the confirm`; `a passkey account's deletion runs the passkey fresh sign-in, then one request`; `with NO_PASSKEYS nothing passkey-related shows`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with 1C-T5's and 1D-T14's suites unchanged.
- [ ] **Step 5: Mutation check.** Offer after an Apple sign-in: its case fails. Render the offer outside `TermsGate`: the terms case fails. Drop `from`: the onboarding case fails. Send `passkey_created` before verify lands: the failed-verification case fails. Skip the account check on a fresh sign-in: its case fails. Skip the fresh sign-in from Account: its case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Add passkeys on a port: the offer after an email sign-in, the list in Account and passkey sign-in"`

**Checkpoint E2-X3** (controller): surveys, the experiment variants and passkeys.

---

### Task P6B-T18: The native passkey adapter and the associated domain

**Starts after:** P6B-T17, P6C-T2 (P6C:association-files). Waits on owner Q1 and the D33 domain; nothing else here needs it.

**Files:**
- Modify: `package.json`, root lockfile (the approved package, through the dependency gate); 1C-T7's `app.config.js` (with `EXPO_PUBLIC_PASSKEY_DOMAIN` set, `ios.associatedDomains` gains `webcredentials:<domain>`); `src/config/env.ts` (`passkeyDomain`)
- Create: `src/auth/passkeyAuthenticator.native.ts` (`createNativePasskeys`, the package through a lazy `import()`)
- Test: `src/auth/passkeyAdapter.test.ts` (Node, the module injected)

**Interfaces:**
- Consumes: `PasskeyAuthenticator`, `AuthCancelled` (P6B-T17); `createBetterAuthPort` (1C-T5); `app.config.js` (1C-T7).
- Produces: `createNativePasskeys(load: () => Promise<PasskeyModuleLike>, platform: 'ios' | 'android' | 'web'): PasskeyAuthenticator`, `PasskeyModuleLike` being the package's support check, create and get, typed from its declarations.

- [ ] **Step 1: Install and read the package** the owner approves; record the names of its support check, create and get, and that they take Better Auth's option JSON and return response JSON. If they do not, stop and report.
- [ ] **Step 2: Write the failing tests:** `supported follows the package's check and is never true on the web`; `create and get hand the options through and return the response JSON`; `a cancel is AuthCancelled`; and `npx expo config --type public` lists `webcredentials:<domain>` only when the domain is set.
- [ ] **Step 3: Run them and see them fail.**
- [ ] **Step 4: Implement,** passing `createNativePasskeys` to `createBetterAuthPort` in `betterAuthClient.ts`.
- [ ] **Step 5: Run them and see them pass.** Mutation check: report `supported` on the web: its case fails.
- [ ] **Step 6: Device checks SKIPPED** (a passkey created and used on an iPhone and an Android phone against the D33 domain, the Android ceremony's `android:apk-key-hash:` origin accepted through P6C-T2's `passkeyOrigins`, UNVERIFIED until then). Gate, receipt, commit. `git commit -m "Create and use passkeys natively through the approved package"`

---

### Task P6B-T19: The store link on update required

**Starts after:** P6B-T1, P2-T24

**Files:**
- Create: `src/wallet/home/storeLink.ts` (pure), `home/copy.draft.ts`
- Modify: `src/config/env.ts` (`appStoreUrl`, `playStoreUrl` from `EXPO_PUBLIC_APP_STORE_URL`, `EXPO_PUBLIC_PLAY_STORE_URL`, `''` by default), P2-T24's `src/wallet/home/WalletHomeScreen.tsx`
- Test: `src/wallet/home/storeLink.test.ts` (Node), `home/StoreLink.render.test.tsx`

**Interfaces:**
- Consumes: P2-T24's update-required state and `home.browseLocal`; `PrimaryButton`, `TextLink` (P2-T13); `Linking`, `Platform`.
- Produces: `storeLink(platform: 'ios' | 'android' | 'web', urls: { appStoreUrl: string; playStoreUrl: string }): string | null` (this platform's `https:` URL, else null).
- Bindings (es-update-required, W37): while a link exists, the state's `PrimaryButton` is อัปเดตใน App Store on iOS or `update.playStore` on Android, and P2-T24's `home.browseLocal` becomes a `TextLink`; no required version is shown.
- Copy (draft): `update.playStore` อัปเดตใน Google Play.

- [ ] **Step 1: Write the failing tests:** `storeLink picks this platform's https URL, and nothing on the web or while unset`; `update required offers the store once its link is set, and opens it`; `without a link the state is P2-T24's`.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and see them pass,** with P2-T24's suite unchanged.
- [ ] **Step 5: Mutation check.** Accept an `http:` link: the platform case fails.
- [ ] **Step 6: Gate, receipt, commit.** `git commit -m "Link update required to the store once the listings exist"`
- [ ] **After the owner approves its screenshot (a later commit with the owner's words):** move `update.playStore` into the catalogs as P6B-T20 moves the rest.

---

### Task P6B-T20: After E2: approve the extras area, move the copy into the catalogs and route

**Starts after:** P6B-T1 to P6B-T9, P6B-T11 to P6B-T13, P6B-T16, P6B-T17, P2-T38, and the owner's approval of E2-X1, E2-X2 and E2-X3

**Files:**
- Modify: `src/config/featureFlags.ts` (`'extras'` joins `APPROVED`), `featureFlags.test.ts`
- Modify: `src/messages/en.json`, `th.json` (each approved draft line under a camelCase `extras…` key), `src/i18n/catalogs.test.ts`
- Modify: each `src/wallet/**/copy.draft.ts` merges into its area's `copy.ts` in the form P2-T38 landed with (into P2's own `home/copy.ts` and `recap/copy.ts`), joined into `ALL_COPY` in `src/wallet/copy/allCopy.ts`; components swap `useExtrasCopy(DRAFT)` for P2-T38's `useWalletCopy()`; `useExtrasCopy.ts` and `draftLines.test.ts` go once unused
- Modify: `docs/implementation/premium-progress.md` (the closing P6B receipt with the owner's words)

**Interfaces:**
- The catalogs keep the app's one lookup, `tc(english)`, as P2-T38 does.

- [ ] **Step 1: Write the failing tests:** `the extras area is on by default and -extras turns it off`; `every extras line in use is in en.json and th.json with the same placeholders`; in each P6B route suite, `the route shows its new screen by default`. Joining P6B's tables to `ALL_COPY` puts them under P2-T38's `no approved English line takes another key's Thai` and `no table ALL_COPY merges holds Thai text any more`, which run unchanged in Step 4.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Move the copy** with the owner's E2 edits (a scratchpad Node script writes the entries from the drafts; review its output by hand), switch the hooks and approve the area. A line whose English already has a key with other Thai gets distinct English, approved with the owner.
- [ ] **Step 4: Run them and see them pass,** then the app gate.
- [ ] **Step 5: Mutation check.** Remove one Thai entry: `catalogs.test.ts` fails. Reuse an English line that has other Thai: P2-T38's distinct-English case fails.
- [ ] **Step 6: Receipt, commit.** The receipt lists each SKIPPED item and what it waits for (D33, Q1, Q2, Q12, the PostHog surveys and flags, T15 (its Starts after and Q10), P6C for T18 and T19's URLs, device checks). `git commit -m "Switch the beta's extras on after the owner's E2 approval, and move their copy into the catalogs"`

---

### Task P6B-T21: The phase 6B proof on real phones (recorded SKIPPED until D33)

**Starts after:** P6B-T20

**Files:**
- Modify: `docs/implementation/premium-progress.md` only

- [ ] **Step 1: Record each check** with its expected result, on development builds against local `wrangler dev`, as phase 1's proof does:
  1. On an iPhone, the cashback tab appears on the seventh logged day of the month and counts the fixture's matching records.
  2. A deletion's receipt shows `deletionShortCode` of the `reference` in the local `jotbun-local-deletion-email` log line, the code P6C-T4's email prints.
  3. On iOS the recap shares a 1080 x 1920 PNG with Thai shaped and every amount hidden by default; Android shares the text.
  4. After yes, one `/ingest/flags/?v=2` request and one `$feature_flag_called` reach a PostHog test project; after no, none.
  5. A survey answer arrives with only its choice key, and the leaving answer under a random `distinct_id`.
  6. On a second phone, es-restore shows the count, the app stays usable, and the card leaves when done.
  7. A passkey is created and used on an iPhone and an Android phone (after Q1, D33 and `P6C-T2 (P6C:association-files)`).
- [ ] **Step 2: Record each as SKIPPED** with its reason (the D33 accounts and development builds; 1D's PostHog project; Q1 for check 7), then commit. `git commit -m "Record the phase 6B proof, skipped until the D33 accounts exist"`

---

## Self-review notes (for the executor)

- **Coverage:** each item of boundaries section 2 for P6B is a task named in its heading (T0 to T21); §7's surveys, rollouts and experiments are T13 to T16; C12 is T15's gate case; D41 is T12 and T1's sweep; §5.2's privacy promise is T5 and notifications off T4.
- **Amendments and rulings:** A10 (T15), A11 (T7), A12 (T0); R23 to R25 (Analytics), R26 (Q1 to Q12 marked where used), R43 (T17), R57 (no id-list query), R69 (T13's host), R73's Q8 and Q9 (T4, T9, T11).
- **Not in P6B:** push (P4); widgets, quick actions, the share extension and Siri (P6A); environments, release builds, emails, the break-glass tool, store listings and the beta (P6C); the features T15 wraps (P3 to P5).
- **For the controller:** decide Q10 with counsel.
