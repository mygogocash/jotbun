# Review P2-T25 (second review: money and privacy): Recently deleted

**PR:** #412 (branch `p2/t25-recently-deleted` at commit `b840c195`, base `origin/claude/p1a-vault-core`)
**Reviewer:** Gemini 3.8 Flash (independent second reviewer)
**Scratch copy:** `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t25-second/`
**Receipt:** `docs/implementation/receipts/P2-T25.md`

---

## Focus Area Findings

### 1. Restores are exact and once only
- **Command slot and idempotency key (`deletedData.ts:27, 122-124`):**
  - `restoreSlot(row.recordId)` maps uniquely to `restore:${row.recordId}`.
  - The payload target `{ id: row.recordId, version: row.version }` is tracked through `keys.keyFor(slot, target)`.
  - On retry or unconfirmed freeze, `useCommandKeys()` returns the identical command key for the same payload, preventing duplicate commits on network loss or retry.
  - Verified by planner mutant M10 (killed): generating a new key on retry causes the test to fail.
- **Concurrency guard (`deletedData.ts:70, 119-121, 147-150`):**
  - `acting.current` flag locks execution during in-flight restores, preventing double restore calls from rapid presses.
  - In `WalletDeletedScreen.tsx:189-195`, buttons are disabled when `disabled={disabled || restoring}`.
  - Verified in test 1 and test 5: only one restore command is issued.
- **Row version tracking (`deletedData.ts:121, 126`):**
  - `resources.restoreTransaction(row.recordId, row.version, key)` passes the exact `row.version` seen from the deleted model.
  - Verified by planner mutant M13 (killed): forcing version `1` fails assertion against fake call arguments.
- **Unconfirmed freeze behavior (`deletedData.ts:140-144`, `WalletDeletedScreen.tsx:187-195`):**
  - When an unconfirmed error occurs (`saved.unconfirmed === true`), `keys.settle(slot)` is NOT called, preserving the key.
  - The entry becomes `held` (`frozen === true`).
  - Only the held item exposes "Try again" (`tc('Try again')`), and all other restore buttons have `disabled={true}` and `aria-disabled="true"`.
  - Resending "Try again" re-uses the exact same command key (verified in test 5).
  - Once committed and re-read from server, `useEffect` in `deletedData.ts:157-161` automatically settles the slot and clears the notice.

### 2. Private Mode
- **Row amounts:**
  - `<WalletAmount minor={row.amountMinor} size={13} tone="ink" />` properly delegates to `WalletAmount`, which consumes `usePrivateMode()`. Under private mode (`hidden: true`), the row amount is rendered as `฿••••` (`HIDDEN_AMOUNT`).
- **Button accessibility labels (`WalletDeletedScreen.tsx:107-108`):**
  - `spoken = hidden ? t('common.amountHidden') : spokenMoney(row.amountMinor, t)` correctly masks spoken amounts in `records.restoreLabel` to `กู้คืน {title} ซ่อนยอดเงินอยู่` / `Restore {title} Amount hidden`.
  - Verified by test 3 and planner mutant M3 (killed).
- **Post-restore confirmation notice leak (`deletedData.ts:131`, `WalletDeletedScreen.tsx:142`):**
  - **FINDING (Major):** When a record is restored in `WalletDeletedScreen` while Private Mode is active, `restoredText(row, locale, tc)` constructs `Bills ฿12,268.00 is back in History.` / `ค่าบิล ฿12,268.00 กลับมาอยู่ในประวัติแล้ว`.
  - This unmasked string is stored in `shownNotice.message` and passed to `<Notice tone={shownNotice.tone} message={shownNotice.message} />`.
  - `<Notice>` renders the unmasked amount directly in the DOM and immediately invokes `useAnnouncement(message)`, speaking the unmasked baht figure aloud to assistive tech even though Private Mode is active.
  - Verified via failing reviewer probe: `mounted.container.textContent` matches `/12,268|182/` following a restore under `device: { 'private-mode': '1' }`.

### 3. Refusals
- **Plain domain words (`deletedData.ts:141`, `apps/app/src/spend/v1/redesign/historyModel.ts:246-260`):**
  - `restoreRefusalText(outcome, fields, tc)` translates API error outcomes into plain domain copy:
    - `deleted` / `purged` / `not_found`: `"This entry can no longer be restored."` / `"กู้คืนรายการนี้ไม่ได้แล้ว"`
    - `conflict`: `"This entry changed on another device."` / `"รายการนี้ถูกแก้ไขจากอุปกรณ์อื่น"`
    - `invalid` with `category_archived` or `wallet_archived`: `"This entry's wallet or category is archived. Unarchive it, then restore the entry."`
    - `wallet_not_found`: `"This entry can't be restored: its wallet no longer exists."`
    - Fallback: `classifyLoadProblem` / `saveProblem` domain copy.
  - No internal IDs, database column names, raw JSON payloads, or stack traces are displayed to the user.
  - Verified in test 6 across both Thai and English.

### 4. Logging
- Zero calls to `console.log`, `console.warn`, `console.info`, or `console.error` are introduced in the PR commit `b840c195`.
- `trackRecordRestored({ kind: row.type })` in `deletedData.ts:127` carries only `{ kind: 'expense' | 'income' | 'transfer' }`. No amount, transaction ID, wallet ID, category ID, merchant, or note is passed to analytics or logged.

---

## Probes and Independent Mutants

Executed in scratch copy `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p2-t25-second/`:

1. **Sampled Planner Mutants (10/10 killed):**
   - `M1`: killed (count days left from delete day plus 31)
   - `M2`: killed (last day not highlighted in bold 700)
   - `M3`: killed (private mode does not mask spoken restore label)
   - `M4`: killed (private mode does not hide amounts)
   - `M5`: killed (restore button height 40 pt instead of 44 pt)
   - `M7`: killed (unconfirmed restore does not disable other restores)
   - `M10`: killed (frozen entry generates new command key instead of resending same key)
   - `M11`: killed (restore refusal does not show plain domain reason)
   - `M13`: killed (restore sends wrong row version to API)
   - `M14`: killed (carry rule: omit trackRecordRestored on restore)

2. **Custom Reviewer Probe (`PROBE: restore in private mode does not leak amount in notice`):**
   - Mounted `WalletDeletedScreen` with `device: { 'private-mode': '1' }`.
   - Clicked restore on `กู้คืน ค่าบิล ซ่อนยอดเงินอยู่`.
   - Result: **FAILED** (demonstrates the leak).
   - Received DOM content:
     `"รายการที่เพิ่งลบรายการที่ลบแล้วกู้คืนได้ภายใน 30 วัน หลังจากนั้นจะถูกลบถาวร กู้คืนแล้วรายการจะกลับไปอยู่ในวันเดิมของมันค่าบิล ฿12,268.00 กลับมาอยู่ในประวัติแล้วอาหาร฿•••• · Cash · 26 ก.ย.เหลือ 21 วันกู้คืนเรียงจากที่ลบล่าสุด · ยอดในงบและกระเป๋าไม่นับรายการที่ลบ"`
   - `12,268.00` appeared in plain text in the status notice and was announced to VoiceOver.

---

## Test Suites & Gate Verification

- `npx vitest run src/wallet/records/WalletDeleted.render.test.tsx`: 9 passed, 0 failed.
- `npx vitest run src/screens/redesign/RecentlyDeletedScreen.render.test.tsx`: 17 passed, 0 failed.
- `npm run test:unit -w gogospend-app`: 974 passed, 0 failed (including `draftText.test.ts`).
- `npm run typecheck:app`: exit 0 (0 errors).
- `npm run typecheck:routes -w gogospend-app`: exit 0 (0 errors).
- `/usr/bin/git diff --check origin/claude/p1a-vault-core...b840c195`: exit 0 (clean).

### CI Status on PR #412
- CI: cancelled by the controller (fix round pending)

---

## Findings

### Blocker
None.

### Major
1. **Unmasked amount displayed and announced upon restore in Private Mode (`apps/app/src/screens/redesign/deleted/deletedData.ts:131`, `apps/app/src/wallet/records/WalletDeletedScreen.tsx:142`):**
   - **Evidence:** `deletedData.ts:131`: `setNotice({ tone: 'status', message: restoredText(row, locale, tc) });` formats raw unmasked money text via `restoredText` (`{entry} {amount} is back in History.`).
   - In `WalletDeletedScreen.tsx:142`, `{shownNotice ? <Notice tone={shownNotice.tone} message={shownNotice.message} /> : null}` renders this message directly without checking `hidden` from `usePrivateMode()`.
   - `<Notice>` announces `message` via `useAnnouncement(message)` to VoiceOver and renders it in the live region DOM.
   - When a user restores an item while Private Mode is turned on, the exact amount (e.g. `฿12,268.00`) is both visually displayed on screen and spoken by the screen reader.
   - Violates the controller focus rule: *"No amount reaches the screen, a spoken or accessibility label, a test id or a log while private mode is on."* as well as R65 / P2-T10 notes for later tasks (*"Text that carries an amount outside WalletAmount ... reads usePrivateMode().hidden and uses HIDDEN_AMOUNT or drops the amount"*).

### Minor
1. **Missing test coverage for restore action in Private Mode (`apps/app/src/wallet/records/WalletDeleted.render.test.tsx:180-204`):**
   - Test `private mode hides every amount and masks the restore label` validates the initial render of rows and the button label, but does not click restore while in private mode to assert that post-restore notices and announcements remain masked.

### Nit
1. **`usePrivateMode()` consumed only in child row view (`apps/app/src/wallet/records/WalletDeletedScreen.tsx:103`):**
   - `const { hidden } = usePrivateMode();` is currently called in `DeletedRowView`, but `WalletDeletedScreen` itself does not read `usePrivateMode()`. Subscribing to `usePrivateMode()` at the screen level (or having `useRecentlyDeleted` accept a masking parameter) will allow `WalletDeletedScreen` to mask `shownNotice.message` when `hidden` is true.

---

## Notes for later tasks
- Future tasks interacting with `useRecentlyDeleted` or notification banners in Bun Wallet (e.g., P2-T26 Record detail/Undo) must ensure that any toast or banner carrying amount text checks `usePrivateMode().hidden` and masks amounts with `HIDDEN_AMOUNT` or `common.amountHidden` / omits the numeric figure.

VERDICT: Needs fixes
