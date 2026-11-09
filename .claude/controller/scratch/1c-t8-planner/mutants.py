#!/usr/bin/env python3
"""1C-T8 mutants. Usage: python3 -I mutants.py <app dir> [--check] [mutant ids...]

<app dir> is a checkout's apps/app (the implementer's: WT/apps/app). For each
mutant: record the file's SHA-256, apply its exact replacements (each must
match once), run the focused tests, restore the file and check the SHA-256
again. A mutant is killed when the focused run fails. `--check` only checks
that every pattern matches once and changes nothing. Logs go next to this
script, under mutant-logs/ (or MUTANT_LOGS when set).
"""
import hashlib
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOGS = os.environ.get('MUTANT_LOGS', os.path.join(HERE, 'mutant-logs'))

SIGNIN = 'src/screens/redesign/signin/'
EMAIL = SIGNIN + 'EmailCodeScreen.tsx'
PARTS = SIGNIN + 'SigninParts.tsx'
EXISTS = SIGNIN + 'AccountExistsScreen.tsx'
ENDED = SIGNIN + 'SessionEndedScreen.tsx'
OTHER = SIGNIN + 'OtherAccountRecords.tsx'
DEVICES = SIGNIN + 'DevicesScreen.tsx'
CONFIRM = SIGNIN + 'ConfirmItsYouSheet.tsx'
FRESH = SIGNIN + 'useFreshSignIn.tsx'
REMINDER = SIGNIN + 'ReminderQuestionScreen.tsx'
TERMS = SIGNIN + 'TermsScreen.tsx'
GATE = SIGNIN + 'TermsGate.tsx'
DRAFTS = SIGNIN + 'draftCopy.ts'
POLICIES = 'src/spend/v1/policies.ts'
MODEL = 'src/spend/v1/redesign/account/onboardingModel.ts'
ONBOARDING = 'src/screens/redesign/account/OnboardingScreen.tsx'
FLAGS = 'src/config/featureFlags.ts'

UNIT = ['node', 'scripts/test-unit.mjs']
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts']
EMAIL_T = RENDER + [SIGNIN + 'EmailCodeScreen.render.test.tsx']
EXISTS_T = RENDER + [SIGNIN + 'AccountExistsScreen.render.test.tsx']
ENDED_T = RENDER + [SIGNIN + 'SessionEndedScreen.render.test.tsx']
DEVICES_T = RENDER + [SIGNIN + 'DevicesScreen.render.test.tsx']
FRESH_T = RENDER + [SIGNIN + 'useFreshSignIn.render.test.tsx']
REMINDER_T = RENDER + [SIGNIN + 'ReminderQuestionScreen.render.test.tsx']
GATE_T = RENDER + [SIGNIN + 'TermsGate.render.test.tsx']
ONBOARDING_T = RENDER + ['src/screens/redesign/account/OnboardingScreen.render.test.tsx']
POLICIES_T = UNIT + ['src/spend/v1/policies.test.ts']
MODEL_T = UNIT + ['src/spend/v1/redesign/account/onboardingModel.test.ts']
FLAGS_T = UNIT + ['src/config/featureFlags.test.ts']
CATALOGS_T = UNIT + ['src/i18n/catalogs.test.ts']

# id: (why, file, [(old, new), ...], command)
MUTANTS = {
    # The plan's seven (Task 8, Step 6).
    'M1': ("plan: five digits start a sign-in", EMAIL,
           [("if (digits.length === CODE_LENGTH && sentTo !== null)", "if (digits.length >= CODE_LENGTH - 1 && sentTo !== null)")], EMAIL_T),
    'M2': ("plan: erase runs without the confirmation", OTHER,
           [("disabled={working} onPress={() => setConfirming(true)} />", "disabled={working} onPress={() => void choose({ kind: 'erase', confirmed: true })} />")], ENDED_T),
    'M3': ("plan: linking skips the fresh sign-in", DEVICES,
           [("    const outcome = await freshSignIn();\n", "    const outcome: FreshOutcome = change === 'link' ? 'fresh' : await freshSignIn();\n")], DEVICES_T),
    'M4': ("plan: the acceptance sends { kind, version, accepted: true }", POLICIES,
           [("body: { kind: policy.kind, version: policy.version },", "body: { kind: policy.kind, version: policy.version, accepted: true },")], POLICIES_T),
    'M5': ("plan: a policy_required answer reads nothing", GATE,
           [("return subscribe(() => { void read(); });", "return subscribe(() => undefined);")], GATE_T),
    'M6': ("plan: accepting does not retry the diary", GATE,
           [("    void diary?.retry().catch(() => undefined);\n", "")], GATE_T),
    'M7': ("plan: the screens wait for the first read", GATE,
           [("const [pending, setPending] = useState<readonly PendingPolicy[]>(NONE);", "const [pending, setPending] = useState<readonly PendingPolicy[] | null>(null);"),
            ("  if (pending.length === 0) return <>{children}</>;", "  if (pending === null) return null;\n  if (pending.length === 0) return <>{children}</>;")], GATE_T),
    # The email code.
    'E1': ("a wrong code keeps the digits", EMAIL,
           [("    setCode('');\n    setProblem(kept);\n", "    setProblem(kept);\n")], EMAIL_T),
    'E2': ("the resend waits 59 seconds", EMAIL, [("export const RESEND_SECONDS = 60;", "export const RESEND_SECONDS = 59;")], EMAIL_T),
    'E3': ("the resend works during the wait", EMAIL, [("disabled={wait > 0 || sending || checking}", "disabled={sending || checking}")], EMAIL_T),
    'E4': ("the address shows whole", PARTS, [("return `${Array.from(normal)[0]}•••${normal.slice(at)}`;", "return normal;")], EMAIL_T),
    'E5': ("the fresh mode signs in instead", EMAIL,
           [("        ? await provider.freshSignIn({ method: 'email', email: to, code: digits })\n", "        ? await provider.signIn({ method: 'email', email: to, code: digits })\n")], EMAIL_T),
    'E6': ("two sign-ins run at once", EMAIL,
           [("  const check = async (to: string, digits: string) => {\n    if (busy.current) return;\n", "  const check = async (to: string, digits: string) => {\n")], EMAIL_T),
    'E7': ("the typed address is sent as typed", EMAIL, [("  const address = typed.trim().toLowerCase();", "  const address = typed;")], EMAIL_T),
    'E8': ("letters count as digits", EMAIL, [("const digits = text.replace(/\\D/g, '').slice(0, CODE_LENGTH);", "const digits = text.slice(0, CODE_LENGTH);")], EMAIL_T),
    # Account exists.
    'A1': ("the email code is offered only when named", EXISTS, [("return named.includes('email') ? named : [...named, 'email'];", "return named;")], EXISTS_T),
    'A2': ("the methods in another order", EXISTS,
           [("const named = methods.filter((method, index) => KNOWN.includes(method) && methods.indexOf(method) === index);",
             "const named = methods.filter((method, index) => KNOWN.includes(method) && methods.indexOf(method) === index).sort();")], EXISTS_T),
    'A3': ("a choice is reported more than once", EXISTS, [("    if (reported.current) return;\n", "")], EXISTS_T),
    'A4': ("a named method twice is offered twice", EXISTS,
           [("KNOWN.includes(method) && methods.indexOf(method) === index", "KNOWN.includes(method)")], EXISTS_T),
    # Session ended.
    'S1': ("the account's method even when this build cannot run it", ENDED,
           [("view.method !== null && offered.includes(view.method) ? view.method", "view.method !== null ? view.method")], ENDED_T),
    'S2': ("another account asks even with nothing waiting", ENDED, [("if (after.kind === 'other_account' && after.unsent > 0) {", "if (after.kind === 'other_account') {")], ENDED_T),
    'S3': ("another account resumes as if it were the same", ENDED, [("if (after.kind === 'other_account' && after.unsent > 0) {", "if (after.kind === 'other_account' && after.unsent < 0) {")], ENDED_T),
    'S4': ("the sign-in asks to sign up", ENDED, [("result = await provider.signIn({ method, signUp: false });", "result = await provider.signIn({ method, signUp: true });")], ENDED_T),
    'S5': ("erasing takes the account just signed in", ENDED,
           [("if (mayEraseOtherAccount(choice)) await eraseAccount(phase.previousAccountId);", "if (mayEraseOtherAccount(choice)) await eraseAccount(provider.account()?.accountId ?? '');")], ENDED_T),
    'S6': ("keeping erases", ENDED,
           [("if (mayEraseOtherAccount(choice)) await eraseAccount(phase.previousAccountId);", "if (choice.kind === 'keep' || mayEraseOtherAccount(choice)) await eraseAccount(phase.previousAccountId);")], ENDED_T),
    # Devices.
    'D1': ("this phone can be signed out here", DEVICES, [("                      {device.current ? null : (\n", "                      {false ? null : (\n")], DEVICES_T),
    'D2': ("another device is signed out without asking", DEVICES,
           [("onPress={() => setAsking({ kind: 'device', device, name })}", "onPress={() => void signOutDevice(device)}")], DEVICES_T),
    'D3': ("a signed-out device keeps its row", DEVICES,
           [("    if (mounted.current) setLoaded((current) => (current ? { ...current, devices: current.devices.filter((item) => item.id !== device.id) } : current));\n", "")], DEVICES_T),
    'D4': ("the other devices are signed out without asking", DEVICES, [("onPress={() => setAsking({ kind: 'others' })}", "onPress={() => void signOutOthers()}")], DEVICES_T),
    'D5': ("removing skips the fresh sign-in", DEVICES,
           [("    const outcome = await freshSignIn();\n", "    const outcome: FreshOutcome = change === 'remove' ? 'fresh' : await freshSignIn();\n")], DEVICES_T),
    'D6': ("the last Apple or Google method can be removed", DEVICES, [("linkedSocial.length > 1", "linkedSocial.length >= 1")], DEVICES_T),
    'D7': ("a fresh sign-in that did not go through still links", DEVICES, [("    if (outcome !== 'fresh') {\n", "    if (outcome === 'cancelled') {\n")], DEVICES_T),
    # The fresh sign-in and its sheet.
    'F1': ("the Apple fresh sign-in asks to sign up", CONFIRM, [("outcome = await provider.freshSignIn({ method, signUp: false });", "outcome = await provider.freshSignIn({ method, signUp: true });")], FRESH_T),
    'F2': ("closing the sheet answers nothing", CONFIRM, [("    if (!busy.current) onDone('cancelled');\n", "")], FRESH_T),
    'F3': ("unavailable stays in the sheet", CONFIRM, [("if (outcome === 'fresh' || outcome === 'unavailable') {", "if (outcome === 'fresh') {")], FRESH_T),
    'F4': ("the email code goes to a typed address", CONFIRM,
           [("          mode=\"fresh\"\n          fixedEmail={email}\n", "          mode=\"fresh\"\n")], FRESH_T),
    'F5': ("a dismissed native sheet closes ours", CONFIRM, [("    if (outcome === 'cancelled') return;\n", "    if (outcome === 'cancelled') {\n      onDone(outcome);\n      return;\n    }\n")], FRESH_T),
    'F6': ("a second fresh sign-in opens a second sheet", FRESH, [("    if (waiting.current) return waiting.current.promise;\n", "")], FRESH_T),
    # The reminder question.
    'R1': ("Turn on asks twice", REMINDER, [("    if (asked.current) return;\n", "")], REMINDER_T),
    'R2': ("Turn on asks for another time", REMINDER, [("setPreference({ ...FIRST_REMINDER })", "setPreference({ ...FIRST_REMINDER, localTime: '21:00' })")], REMINDER_T),
    'R3': ("Not now asks the reminder service", REMINDER,
           [("secondary={<PillButton kind=\"secondary\" label={tc('Not now')} onPress={goOn}", "secondary={<PillButton kind=\"secondary\" label={tc('Not now')} onPress={() => { void turnOn(); goOn(); }}")], REMINDER_T),
    'R4': ("the screen goes on twice", REMINDER, [("    if (left.current) return;\n", "")], REMINDER_T),
    # The terms step.
    'T1': ("Continue works before the tick", TERMS,
           [("    if (!ticked || running.current) return;\n", "    if (running.current) return;\n"), ("          disabled={!ticked}\n", "          disabled={false}\n")], GATE_T),
    'T2': ("a double tap accepts twice", TERMS, [("    if (!ticked || running.current) return;\n", "    if (!ticked) return;\n")], GATE_T),
    'T3': ("a failed acceptance says nothing", TERMS, [("      setFailed(true);\n", "")], GATE_T),
    'T4': ("the policy text is always English", TERMS, [("text: found ? (locale === 'th' ? found.text.th : found.text.en) : null", "text: found ? found.text.en : null")], GATE_T),
    'T5': ("Settings opens another screen", TERMS, [("router.push('/settings')", "router.push('/spend')")], GATE_T),
    'T6': ("a read begun before the acceptance brings the terms back", GATE,
           [("if (mounted.current && asked === generation.current) setPending(next.length === 0 ? NONE : next);", "if (mounted.current) setPending(next.length === 0 ? NONE : next);")], GATE_T),
    # The terms client.
    'P1': ("acceptPending goes on after a refusal", POLICIES,
           [("  for (const policy of pending) await client.accept(policy);", "  for (const policy of pending) await client.accept(policy).catch(() => undefined);")], POLICIES_T),
    'P2': ("acceptPending in reverse order", POLICIES, [("  for (const policy of pending) await client.accept(policy);", "  for (const policy of [...pending].reverse()) await client.accept(policy);")], POLICIES_T),
    'P3': ("a pending version 0 passes", POLICIES, [("Number.isSafeInteger(value) && value >= 1;", "Number.isSafeInteger(value) && value >= 0;")], POLICIES_T),
    'P4': ("any pending kind passes", POLICIES, [("return typeof value === 'string' && (POLICY_KINDS as readonly string[]).includes(value);", "return typeof value === 'string';")], POLICIES_T),
    'P5': ("/v1/me may not grow", POLICIES,
           [("return isRecord(value) && Array.isArray(value.pending_policies) && value.pending_policies.every(isPendingPolicy);",
             "return isRecord(value) && Object.keys(value).length === 4 && Array.isArray(value.pending_policies) && value.pending_policies.every(isPendingPolicy);")], POLICIES_T),
    'P6': ("every V1Error is reported as policy_required", POLICIES,
           [("if (error instanceof V1Error && error.outcome === 'policy_required') onRequired();", "if (error instanceof V1Error) onRequired();")], POLICIES_T),
    'P7': ("a policy_required answer is swallowed", POLICIES,
           [("        if (error instanceof V1Error && error.outcome === 'policy_required') onRequired();\n        throw error;\n",
             "        if (error instanceof V1Error && error.outcome === 'policy_required') {\n          onRequired();\n          return undefined as T;\n        }\n        throw error;\n")], POLICIES_T),
    'P8': ("the rethrow is a new error", POLICIES,
           [("        if (error instanceof V1Error && error.outcome === 'policy_required') onRequired();\n        throw error;\n",
             "        if (error instanceof V1Error && error.outcome === 'policy_required') {\n          onRequired();\n          throw new V1Error(error.outcome, error.status, error.code);\n        }\n        throw error;\n")], POLICIES_T),
    'P9': ("the empty 204 is refused", POLICIES, [("validate: (value): value is null => value === null,", "validate: (value): value is null => value === undefined,")], POLICIES_T),
    # Onboarding and its model.
    'O1': ("the welcome link on every story step", ONBOARDING, [("{signin && step === 'coffee' ? <WelcomeSignInLink /> : null}", "{signin ? <WelcomeSignInLink /> : null}")], ONBOARDING_T),
    'O2': ("the signin area is always on", ONBOARDING, [("const signin = signinArea ?? isRedesignEnabled('signin');", "const signin = signinArea ?? true;")], ONBOARDING_T),
    'O3': ("Skip still goes to the reminder question", ONBOARDING, [("const skip = () => (signin ? endStory() : setStep(SKIP_TO));", "const skip = () => setStep(SKIP_TO);")], ONBOARDING_T),
    'O4': ("the story ends at plain sign-in", MODEL, [("  return signedIn ? '/onboarding/reminder' : '/login?from=onboarding';\n", "  return signedIn ? '/onboarding/reminder' : ('/login' as '/login?from=onboarding');\n")], MODEL_T),
    'O5': ("a sign-in from onboarding goes to the diary", MODEL,
           [("go: from === 'onboarding' ? '/onboarding/reminder' : '/spend' };", "go: '/spend' };")], MODEL_T),
    'O6': ("with a session the story ends at Quick add", MODEL,
           [("  return signedIn ? '/onboarding/reminder' : '/login?from=onboarding';\n", "  return signedIn ? ('/spend/add' as '/onboarding/reminder') : '/login?from=onboarding';\n")], MODEL_T),
    # The flag and the drafts' copy.
    'C1': ("the signin area is approved", FLAGS,
           [("const APPROVED: readonly RedesignArea[] = ['core', 'planning', 'insights', 'account', 'import', 'companion'];",
             "const APPROVED: readonly RedesignArea[] = ['core', 'planning', 'insights', 'account', 'import', 'companion', 'signin'];")], FLAGS_T),
    'C2': ("a line with no Thai draft", DRAFTS, [("  'Change email': 'เปลี่ยนอีเมล',\n", "")], CATALOGS_T),
    'C3': ("a Thai draft that drops its placeholder", DRAFTS,
           [("'Records still on this phone: {count}': 'ยังอยู่ในเครื่องนี้ {count} รายการ',", "'Records still on this phone: {count}': 'ยังอยู่ในเครื่องนี้ รายการ',")], CATALOGS_T),
    'C4': ("a tc() line that is not approved copy", TERMS, [("label={tc('Settings')}", "label={tc('Settings page')}")], CATALOGS_T),
}


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def main():
    args = sys.argv[1:]
    check = '--check' in args
    args = [arg for arg in args if arg != '--check']
    app = os.path.abspath(args[0])
    wanted = args[1:] or list(MUTANTS)
    os.makedirs(LOGS, exist_ok=True)
    results = []
    for mid in wanted:
        why, rel, pairs, command = MUTANTS[mid]
        path = os.path.join(app, rel)
        before = sha(path)
        with open(path, encoding='utf-8') as handle:
            original = handle.read()
        mutated = original
        problem = None
        for old, new in pairs:
            if mutated.count(old) != 1:
                problem = f'pattern matches {mutated.count(old)} times: {old[:60]!r}'
                break
            mutated = mutated.replace(old, new)
        if problem:
            results.append((mid, 'NOT APPLIED', problem))
            continue
        if check:
            results.append((mid, 'APPLIES', why))
            continue
        try:
            with open(path, 'w', encoding='utf-8') as handle:
                handle.write(mutated)
            run = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=900)
        finally:
            with open(path, 'w', encoding='utf-8') as handle:
                handle.write(original)
        restored = sha(path) == before
        with open(os.path.join(LOGS, f'{mid}.log'), 'w', encoding='utf-8') as handle:
            handle.write(run.stdout + run.stderr)
        summary = [line.strip() for line in (run.stdout + run.stderr).splitlines() if line.strip().startswith(('Tests ', 'ℹ fail', 'ℹ pass'))]
        verdict = 'KILLED' if run.returncode != 0 else 'SURVIVED'
        results.append((mid, verdict, f"{why}; {' | '.join(summary)}; restored={restored}"))
        print(f'{mid} {verdict}', file=sys.stderr, flush=True)
        if not restored:
            print(f'{mid}: checksum differs after restore', file=sys.stderr)
            sys.exit(2)
    for mid, verdict, detail in results:
        print(f'{mid} {verdict}: {detail}')
    ok = ('APPLIES',) if check else ('KILLED',)
    sys.exit(0 if all(verdict in ok for _, verdict, _ in results) else 1)


if __name__ == '__main__':
    main()
