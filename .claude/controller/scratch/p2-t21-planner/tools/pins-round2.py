#!/usr/bin/env python3
"""The planner's second round of pins (applied once to real/ after the first mutant run): the field refusals use the
terms' refusal, whose own words differ (N11, E21); the entries note waits until the entries are known (E23)."""
import sys
root = sys.argv[1]
def edit(rel, reps):
    p = f'{root}/{rel}'
    s = open(p, encoding='utf-8').read()
    for old, new in reps:
        assert s.count(old) == 1, (rel, old)
        s = s.replace(old, new)
    open(p, 'w', encoding='utf-8').write(s)
edit('apps/app/src/wallet/wallets/NewWallet.render.test.tsx', [
("""    // A refusal that names fields says so on each field, and each clears as it is changed.
    const field = createFakeResources();
    field.fail('createWallet', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { name: 'errors.name_taken', opening_minor: 'MINOR_OUT_OF_RANGE' } });""",
"""    // A refusal that names fields says so on each field, whatever else it says (here the terms' refusal, whose own
    // words differ), and each clears as it is changed.
    const field = createFakeResources();
    field.fail('createWallet', 'policy_required', { status: 403, code: 'POLICY_REQUIRED', fields: { name: 'POLICY_REQUIRED', opening_minor: 'MINOR_OUT_OF_RANGE' } });"""),
])
edit('apps/app/src/wallet/wallets/WalletEdit.render.test.tsx', [
("""  // A refusal that names a field says so on it; one that waits on an update holds บันทึก.
  const field = board();
  field.fail('updateWallet', 'invalid', { status: 422, code: 'VALIDATION_FAILED', fields: { name: 'errors.name_taken' } });""",
"""  // A refusal that names a field says so on it, whatever else it says (here the terms' refusal); one that waits on an update holds บันทึก.
  const field = board();
  field.fail('updateWallet', 'policy_required', { status: 403, code: 'POLICY_REQUIRED', fields: { name: 'POLICY_REQUIRED' } });"""),
])
edit('apps/app/src/wallet/wallets/WalletEdit.render.test.tsx', [
("""  unknown.hold('history');
  mountWallet(<WalletEditScreen walletId={W.jar} now={NOW} />, { resources: unknown.resources, account: KEPT });
  await settle();
  press('5');""", """  unknown.hold('history');
  mountWallet(<WalletEditScreen walletId={W.jar} now={NOW} />, { resources: unknown.resources, account: KEPT });
  await settle();
  // The note says the wallet has entries only once that is known.
  expect(screen.queryByTestId('wallet-has-records')).toBeNull();
  press('5');"""),
])
print('applied')
