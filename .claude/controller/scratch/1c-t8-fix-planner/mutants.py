#!/usr/bin/env python3
"""1C-T8 fix round mutants. Usage: python3 -I mutants.py <app dir> <scratch dir> [--check] [ids...]

<app dir> is a checkout's apps/app (the implementer's: WT/apps/app). For each
mutant: record the file's SHA-256, apply its exact replacements (each must
match exactly once), run the focused tests, restore the file and check the
SHA-256 again. A mutant is KILLED only when the run fails AND every case it
names in `must_fail` is among the failing cases. Logs go to
<scratch dir>/mutant-logs/<id>.log. `--check` only checks that every
pattern matches once and changes nothing. Exit 0 only when every mutant is
KILLED (or, with --check, APPLIES) and every file is restored.
"""
import hashlib
import os
import re
import subprocess
import sys

SIGNIN = 'src/screens/redesign/signin/'
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts']
UNIT = ['node', 'scripts/test-unit.mjs']

ENDED = SIGNIN + 'SessionEndedScreen.tsx'
FRESH = SIGNIN + 'useFreshSignIn.tsx'
GATE = SIGNIN + 'TermsGate.tsx'
TERMS = SIGNIN + 'TermsScreen.tsx'
EMAIL = SIGNIN + 'EmailCodeScreen.tsx'
DEVICES = SIGNIN + 'DevicesScreen.tsx'
DRAFTS = SIGNIN + 'draftCopy.ts'
POLICIES = 'src/spend/v1/policies.ts'
ONBOARDING = 'src/screens/redesign/account/OnboardingScreen.tsx'

ENDED_T = RENDER + [SIGNIN + 'SessionEndedScreen.render.test.tsx']
FRESH_T = RENDER + [SIGNIN + 'useFreshSignIn.render.test.tsx']
GATE_T = RENDER + [SIGNIN + 'TermsGate.render.test.tsx']
EMAIL_T = RENDER + [SIGNIN + 'EmailCodeScreen.render.test.tsx']
DEVICES_T = RENDER + [SIGNIN + 'DevicesScreen.render.test.tsx']
ONBOARDING_T = RENDER + ['src/screens/redesign/account/OnboardingScreen.render.test.tsx']
CATALOGUE_T = RENDER + ['src/dev/catalogue/CatalogueScreen.render.test.tsx', 'src/dev/catalogue/screenReader.render.test.tsx', '-t', 'signin-session-ended-email']
POLICIES_T = UNIT + ['src/spend/v1/policies.test.ts']
CATALOGS_T = UNIT + ['src/i18n/catalogs.test.ts']

R98_EMAIL = 'an email account on a build with only the email code can sign in to another account, which asks keep or erase'
R98_APPLE = 'an Apple account on a build with only the email code: its own address first, and when the account is unavailable another way still shows'

# id: (why, file, [(old, new), ...], command, [cases that must fail])
MUTANTS = {
    # The review's seven unpinned guards (m1), each pinned by its new case.
    'RV1': ("a later fresh sign-in gets the earlier answer (done keeps the waiting promise)", FRESH,
            [("    const current = waiting.current;\n    waiting.current = null;\n    setOpen(null);\n", "    const current = waiting.current;\n    setOpen(null);\n")],
            FRESH_T, ['a later fresh sign-in never reuses an earlier answer: a new sheet and a new sign-in']),
    'RV2': ("TermsGate reads /v1/me several at a time", GATE,
            [("    if (reading.current) {\n      again.current = true;\n      return;\n    }\n    reading.current = true;\n", "    reading.current = true;\n")],
            GATE_T, ['a policy_required answer during a read waits for it, then one more read shows the terms']),
    'RV3': ("a policy_required answer during a read is dropped", GATE,
            [("      again.current = true;\n      return;\n", "      return;\n")],
            GATE_T, ['a policy_required answer during a read waits for it, then one more read shows the terms']),
    'RV4': ("Send the code sends twice on a double tap", EMAIL,
            [("  const send = async (to: string) => {\n    if (busy.current) return;\n", "  const send = async (to: string) => {\n")],
            EMAIL_T, ['a double tap on Send the code sends one code']),
    'RV5': ("the session-ended email button asks for a typed address", ENDED,
            [("setPhase({ kind: 'email', fixedEmail: ownAddress ? endedEmail ?? undefined : undefined });", "setPhase({ kind: 'email', fixedEmail: undefined });")],
            ENDED_T, ["the email button sends the code to the account's own address"]),
    'RV6': ("Link is offered for a method this build cannot run", DEVICES,
            [("const linkable = SOCIAL.filter((method) => port.methods.includes(method) && !linked.includes(method));", "const linkable = SOCIAL.filter((method) => !linked.includes(method));")],
            DEVICES_T, ['linking is offered only for a method this build runs']),
    'RV7': ("published() accepts any array", POLICIES,
            [("return Array.isArray(value) && value.every(isPolicyVersion);", "return Array.isArray(value);")],
            POLICIES_T, ['a malformed published list is invalid_response']),
    # R98: the email code to another address.
    'N1': ("the email code to another address is never offered", ENDED,
           [("    ...(main === 'email' ? [{ key: 'email-other',", "    ...(false ? [{ key: 'email-other',")],
           ENDED_T, [R98_EMAIL, R98_APPLE]),
    'N2': ("the email code to another address is offered beside a main button that is not the email code", ENDED,
           [("    ...(main === 'email' ? [{ key: 'email-other',", "    ...(main !== null ? [{ key: 'email-other',")],
           ENDED_T, ["it lists the unsent records and names the account's method"]),
    'N3': ("every email code goes to the account's own address", ENDED,
           [("setPhase({ kind: 'email', fixedEmail: ownAddress ? endedEmail ?? undefined : undefined });", "setPhase({ kind: 'email', fixedEmail: endedEmail ?? undefined });")],
           ENDED_T, [R98_EMAIL, R98_APPLE]),
    'K1': ("ใช้วิธีอื่น loses the test id the new catalogue section presses", ENDED,
           [("<TextButton testID=\"session-ended-other-ways\" label=", "<TextButton label=")],
           CATALOGUE_T, ['section signin-session-ended-email renders without errors in light and dark, in en, th and vi']),
    # R99: nothing goes to /onboarding/reminder before 1C-T9.
    'Q1': ("a signed-in story end goes to the missing /onboarding/reminder route", ONBOARDING,
           [("    if (isAuthed) setStep('reminder');\n", "    if (isAuthed) router.replace(afterStory(true));\n")],
           ONBOARDING_T, ["with a session, today's reminder step still follows the story until 1C-T9 adds its route"]),
    'Q2': ("a signed-in story end goes to sign-in", ONBOARDING,
           [("    if (isAuthed) setStep('reminder');\n", "    if (false) setStep('reminder');\n")],
           ONBOARDING_T, ["with a session, today's reminder step still follows the story until 1C-T9 adds its route"]),
    # m3 and the new line: copy.
    'C1': ("the terms step's title goes back to the draft hook", TERMS,
           [("title={tc('Our promises')}", "title={sc('Our promises')}")],
           CATALOGS_T, ['every literal the signin folder passes to its copy hook has a Thai draft']),
    'C2': ("the new line has no Thai draft", DRAFTS,
           [("  'Email a code to another address': 'ส่งรหัสไปที่อีเมลอื่น', // DRAFT\n", "")],
           CATALOGS_T, ['every literal the signin folder passes to its copy hook has a Thai draft']),
}

FAILED_LINE = re.compile(r'^\s*(?:×|✖)\s+(.*?)(?:\s+\d+(?:\.\d+)?ms|\s+\(\d+(?:\.\d+)?ms\))?\s*$')


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def failing_cases(output):
    names = set()
    for line in output.splitlines():
        match = FAILED_LINE.match(line)
        if match and match.group(1).strip() != 'failing tests:':
            names.add(match.group(1).strip())
    return names


def main():
    args = sys.argv[1:]
    check = '--check' in args
    args = [arg for arg in args if arg != '--check']
    app = os.path.abspath(args[0])
    logs = os.path.join(os.path.abspath(args[1]), 'mutant-logs')
    wanted = args[2:] or list(MUTANTS)
    os.makedirs(logs, exist_ok=True)
    results = []
    ok = True
    for mid in wanted:
        why, rel, pairs, command, must_fail = MUTANTS[mid]
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
            ok = False
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
        output = run.stdout + run.stderr
        with open(os.path.join(logs, f'{mid}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        failed = failing_cases(output)
        missing = [name for name in must_fail if name not in failed]
        summary = [line.strip() for line in output.splitlines() if line.strip().startswith(('Tests ', 'ℹ fail', 'ℹ pass'))]
        verdict = 'KILLED' if run.returncode != 0 and not missing else 'SURVIVED'
        if verdict != 'KILLED' or not restored:
            ok = False
        detail = f"{why}; failed: {sorted(failed)}; {' | '.join(summary)}; restored={restored}"
        if missing:
            detail += f'; still passing: {missing}'
        results.append((mid, verdict, detail))
        print(f'{mid} {verdict}', file=sys.stderr, flush=True)
        if not restored:
            print(f'{mid}: checksum differs after restore', file=sys.stderr)
            break
    for mid, verdict, detail in results:
        print(f'{mid} {verdict}: {detail}')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
