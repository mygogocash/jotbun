#!/usr/bin/env python3
"""1D-T8 mutants. Usage: python3 -I mutants.py <app dir> [--check] [mutant ids...]

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

CONTROLLER = 'src/analytics/controller.ts'
HOOK = 'src/analytics/useAnalyticsConsent.ts'
FLAGS = 'src/config/featureFlags.ts'
ACCOUNT = 'src/screens/redesign/account/'
SCREEN = ACCOUNT + 'AnalyticsConsentScreen.tsx'
DRAFT = ACCOUNT + 'analyticsConsentCopy.draft.ts'
PRIVACY = ACCOUNT + 'PrivacyScreen.tsx'
SERVICES = ACCOUNT + 'privacyServices.ts'
LAYOUT = 'app/spend/_layout.tsx'
SECTIONS = 'src/dev/catalogue/account/analyticsSections.tsx'

UNIT = ['node', 'scripts/test-unit.mjs']
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts']
CONTROLLER_T = UNIT + ['src/analytics/controller.test.ts']
FLAGS_T = UNIT + ['src/config/featureFlags.test.ts']
SCREEN_T = RENDER + [ACCOUNT + 'AnalyticsConsentScreen.render.test.tsx']
PRIVACY_T = RENDER + [ACCOUNT + 'PrivacyScreen.render.test.tsx']
SERVICES_T = RENDER + [ACCOUNT + 'privacyServices.render.test.tsx']
LAYOUT_T = RENDER + [ACCOUNT + 'AnalyticsConsentScreen.render.test.tsx', 'src/screens/redesign/SpendLayout.render.test.tsx']
HOOK_T = RENDER + [ACCOUNT + 'AnalyticsConsentScreen.render.test.tsx', ACCOUNT + 'PrivacyScreen.render.test.tsx']
CATALOGUE_T = RENDER + ['src/dev/catalogue/CatalogueScreen.render.test.tsx', '-t', 'analytics']

AT_CALL_NO = "        applyNo(true);\n        const storedAtCall"
QUEUED_NO_LANDS = "            if (stale(token, account)) return;\n            // The server has it: the no is no longer pending.\n            setStatus('no');\n"
DELIVERED_NO_LANDS = "      if (stale(token, account)) return;\n      // The server has it: the no is no longer pending.\n      setStatus('no');\n      await deps.store.write"
NO_SWITCH_VALUE = "<ReminderSwitch label={cc('switchLabel')} value={status === 'yes'}"

# id: (why, file, [(old, new), ...], command)
MUTANTS = {
    # The plan's six (Task 8, Step 6); the seventh, P2-T18's WalletShell, waits for P2-T18.
    'M1': ("plan: yes pre-selected (the main ink button)", SCREEN,
           [('<PillButton testID="analytics-consent-yes" kind="secondary"', '<PillButton testID="analytics-consent-yes" kind="primary"')], SCREEN_T),
    'M2': ("plan: no waits for the server (the layout keeps the question while the no is pending)", LAYOUT,
           [("  const { status } = useAnalyticsConsent();\n", "  const consent = useAnalyticsConsent();\n  const status = consent.pendingNo ? 'unanswered' : consent.status;\n")], LAYOUT_T),
    'M3': ("plan: installed with nothing installed", HOOK,
           [("installed: analytics !== null,", "installed: true,")], SCREEN_T),
    'M4': ("plan: the switch with the area off", PRIVACY,
           [("analyticsArea = isRedesignEnabled('analytics') }", "analyticsArea = true }")], PRIVACY_T),
    'M5': ("plan: the question with the area off", LAYOUT,
           [("const ask = isRedesignEnabled('analytics') && status === 'unanswered';", "const ask = status === 'unanswered';")], LAYOUT_T),
    'M6': ("plan: yes answered for the person as the question opens", SCREEN,
           [("    trackOnboardingStepViewed({ step: 'analytics_consent' });\n", "    trackOnboardingStepViewed({ step: 'analytics_consent' });\n    void answer('yes');\n")], SCREEN_T),
    # The controller's pending no.
    'C1': ("a no given here is not pending at the call", CONTROLLER, [(AT_CALL_NO, AT_CALL_NO.replace('applyNo(true)', 'applyNo(false)'))], CONTROLLER_T),
    'C2': ("a no the server took stays pending", CONTROLLER, [(QUEUED_NO_LANDS, "            if (stale(token, account)) return;\n")], CONTROLLER_T),
    'C3': ("a stored undelivered no is not pending at a load", CONTROLLER, [("    applyNo(true);\n    try {", "    applyNo(false);\n    try {")], CONTROLLER_T),
    'C4': ("a delivered stored no stays pending", CONTROLLER, [(DELIVERED_NO_LANDS, "      if (stale(token, account)) return;\n      await deps.store.write")], CONTROLLER_T),
    'C5': ("an earlier delivered no, offline, is pending", CONTROLLER,
           [("      else if (mine?.answer === 'no') {\n        applyNo(false);", "      else if (mine?.answer === 'no') {\n        applyNo(true);")], CONTROLLER_T),
    'C6': ("the server's own no is pending", CONTROLLER,
           [("    if (remote.consent === 'no') {\n      applyNo(false);", "    if (remote.consent === 'no') {\n      applyNo(true);")], CONTROLLER_T),
    'C7': ("a change in the pending no alone is never heard", CONTROLLER,
           [("if (current === next && undelivered === pendingNo) return;", "if (current === next) return;")], CONTROLLER_T),
    'C8': ("a yes or a sign-out keeps the pending no", CONTROLLER,
           [("    undelivered = pendingNo;\n", "    undelivered = next === 'no' ? pendingNo : undelivered;\n")], CONTROLLER_T),
    'C9': ("pendingNo never true", CONTROLLER, [("    pendingNo: () => undelivered,", "    pendingNo: () => false,")], CONTROLLER_T),
    # The flag.
    'F1': ("the analytics area is approved", FLAGS,
           [("const APPROVED: readonly RedesignArea[] = ['core', 'planning', 'insights', 'account', 'import', 'companion'];",
             "const APPROVED: readonly RedesignArea[] = ['core', 'planning', 'insights', 'account', 'import', 'companion', 'analytics'];")], FLAGS_T),
    # The hook.
    'H1': ("the hook never subscribes", HOOK,
           [("(analytics ? analytics.subscribe(listener) : () => undefined)", "(listener ? () => undefined : () => undefined)")], HOOK_T),
    'H2': ("the hook's status ignores the controller", HOOK, [("() => analytics?.status() ?? 'signed_out',", "() => 'signed_out' as const,")], HOOK_T),
    'H3': ("the hook's pending no ignores the controller", HOOK, [("() => analytics?.pendingNo() ?? false,", "() => false,")], PRIVACY_T),
    'H4': ("the catalogue's own controller is ignored", HOOK,
           [("const analytics = scoped === undefined ? getAnalytics() : scoped;", "const analytics = scoped === undefined ? getAnalytics() : getAnalytics();")], CATALOGUE_T),
    'H5': ("answering with nothing installed resolves", HOOK, [("(analytics ? analytics.answer(value) : notInstalled())", "(analytics ? analytics.answer(value) : Promise.resolve())")], SCREEN_T),
    # The question.
    'S1': ("two yeses at once", SCREEN, [("  const yes = async () => {\n    if (sending.current) return;\n", "  const yes = async () => {\n")], SCREEN_T),
    'S2': ("an account change is a failure", SCREEN, [("      failure = !(error instanceof AccountChangedError);", "      failure = true;")], SCREEN_T),
    'S3': ("a failed yes says nothing", SCREEN, [("    setSaving(false);\n    setFailed(failure);\n", "    setSaving(false);\n    setFailed(false);\n")], SCREEN_T),
    'S4': ("Yes stays busy after a failure", SCREEN, [("    setSaving(false);\n    setFailed(failure);\n", "    setFailed(failure);\n")], SCREEN_T),
    'S5': ("the step is not tracked", SCREEN, [("    trackOnboardingStepViewed({ step: 'analytics_consent' });\n", "")], SCREEN_T),
    'S6': ("what is never sent is not said", SCREEN, [("          <BunText style={{ fontWeight: '700' }}>{cc('never')}</BunText>\n", "")], SCREEN_T),
    'S7': ("No is closed while a yes is on its way", SCREEN, [("label={cc('no')} onPress={no} />", "label={cc('no')} onPress={no} disabled={saving} />")], SCREEN_T),
    'S8': ("a refused no is not caught", SCREEN, [("    answer('no').catch(() => undefined);\n", "    void answer('no');\n")], SCREEN_T),
    # The draft copy.
    'D1': ("English in Thai", DRAFT, [("return locale === 'th' ? line.th : line.en;", "return line.en;")], SCREEN_T),
    'D2': ("the never line's Thai drops the email", DRAFT,
           [("'เราไม่เคยส่งยอดเงิน ชื่อร้าน ชื่อกระเป๋า โน้ต อีเมล หรือรูปสลิป'", "'เราไม่เคยส่งยอดเงิน ชื่อร้าน ชื่อกระเป๋า โน้ต หรือรูปสลิป'")], SCREEN_T),
    # The layout.
    'L1': ("loading blocks the screens", LAYOUT,
           [("const ask = isRedesignEnabled('analytics') && status === 'unanswered';", "const ask = isRedesignEnabled('analytics') && (status === 'unanswered' || status === 'loading');")], LAYOUT_T),
    # Privacy's switch.
    'P1': ("off waits for the server", PRIVACY, [(NO_SWITCH_VALUE, NO_SWITCH_VALUE.replace("status === 'yes'", "status === 'yes' || pendingNo"))], PRIVACY_T),
    'P2': ("on does not wait for the server", PRIVACY, [(NO_SWITCH_VALUE, NO_SWITCH_VALUE.replace("status === 'yes'", "status === 'yes' || saving"))], PRIVACY_T),
    'P3': ("two yeses at once", PRIVACY, [("    if (sending.current) return;\n", "")], PRIVACY_T),
    'P4': ("the switch stays open while a yes is on its way", PRIVACY, [("disabled={saving}", "disabled={false}")], PRIVACY_T),
    'P5': ("an account change is a failure", PRIVACY, [("      failure = !(error instanceof AccountChangedError);", "      failure = true;")], PRIVACY_T),
    'P6': ("a failed yes says nothing", PRIVACY, [("{failed ? <Notice message={cc('saveFailed')} /> : null}", "{null}")], PRIVACY_T),
    'P7': ("a pending no says nothing", PRIVACY, [('{pendingNo ? <BunText testID="privacy-analytics-pending"', '{false ? <BunText testID="privacy-analytics-pending"')], PRIVACY_T),
    'P8': ("every no says it stopped on this phone", PRIVACY, [('{pendingNo ? <BunText testID="privacy-analytics-pending"', '{status === \'no\' ? <BunText testID="privacy-analytics-pending"')], PRIVACY_T),
    'P9': ("the switch stays held after the yes", PRIVACY, [("    setSaving(false);\n    setFailed(failure);\n", "    setFailed(failure);\n")], PRIVACY_T),
    'P10': ("a refused no is not caught", PRIVACY, [("      answer('no').catch(() => undefined);\n", "      void answer('no');\n")], PRIVACY_T),
    # Privacy's transport.
    'V1': ("the transport refuses a LAN Worker in a development build", SERVICES, [("      allowLanHttp: __DEV__,\n", "")], SERVICES_T),
    'V2': ("no analytics header", SERVICES, [("      analyticsOff: () => getAnalytics()?.allowsAnalytics() !== true,\n", "")], SERVICES_T),
    'V3': ("server events always off", SERVICES, [("analyticsOff: () => getAnalytics()?.allowsAnalytics() !== true,", "analyticsOff: () => true,")], SERVICES_T),
    # The catalogue's sections.
    'K1': ("Privacy's sections drawn with the area off", SECTIONS, [("now={CATALOGUE_NOW} analyticsArea />", "now={CATALOGUE_NOW} />")], CATALOGUE_T),
    'K2': ("the pending section's no already delivered", SECTIONS, [("storedNo: 'pending', send: 'fails'", "storedNo: 'delivered', send: 'fails'")], CATALOGUE_T),
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
        summary = [line.strip() for line in (run.stdout + run.stderr).splitlines() if line.strip().startswith(('Tests ', 'ℹ fail', 'ℹ pass', 'Unhandled'))]
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
