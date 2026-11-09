#!/usr/bin/env python3
"""1D-T6's mutants: each applied alone, its focused tests run, the file restored and its SHA-256 checked.

Usage: python3 -I mutants.py <repo-root> <log-dir> [mutant-id ...]
Every Find (or each of a list of Finds) must occur exactly once. A mutant is killed when the run fails and the named test is
among the failures (node: a '✖ <name>' line; vitest: a '× <name>' or 'FAIL ... > <name>' line).
Prints one line per mutant and exits 1 if any survives, is not applied, or a file is not restored.
"""
import hashlib
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(sys.argv[1])
LOGS = Path(sys.argv[2])
ONLY = set(sys.argv[3:])
APP = ROOT / 'apps/app'

UNIT = ['npm', 'run', 'test:unit', '-w', 'gogospend-app', '--']
RENDER = ['npm', 'run', 'test:render', '-w', 'gogospend-app', '--']
APPT = ['npm', 'run', 'test:app']

O = 'src/analytics/posthogOptions.ts'
S = 'src/analytics/analyticsServer.ts'
C = 'src/analytics/controller.ts'
U = 'src/analytics/AnalyticsUpkeep.tsx'
ST = 'src/analytics/consentStorage.ts'
AA = 'src/analytics/appAnalytics.ts'
OPT_T = 'src/analytics/posthogOptions.test.ts'
SRV_T = 'src/analytics/analyticsServer.test.ts'
CTL_T = 'src/analytics/controller.test.ts'
ENV_T = 'src/config/env.test.ts'
UPK_T = 'src/analytics/AnalyticsUpkeep.render.test.tsx'
STO_T = 'src/analytics/consentStorage.render.test.tsx'
SV1_T = 'src/api/sharedV1.render.test.tsx'
ERA_T = 'src/mascot/bunSettingsErase.render.test.tsx'
ROOT_T = 'src/screens/redesign/RootLayout.render.test.tsx'

OPTIONS_TEST = 'the client is built with replay masked'

MUTANTS = [
    # The plan's six (Step 6).
    ('M1', O, "    captureLog: false,\n", "    captureLog: true,\n", UNIT + [OPT_T], OPTIONS_TEST),
    ('M2', O, "      nativeCrashes: input.crashReportsWithoutConsent,\n", "      nativeCrashes: true,\n", UNIT + [OPT_T], OPTIONS_TEST),
    ('M3', 'src/api/client.ts', "if (options.analyticsOff?.() === true) headers['X-GoGoSpend-Analytics'] = 'off';",
     "if (options.analyticsOff !== undefined) headers['X-GoGoSpend-Analytics'] = 'off';", APPT, 'requests carry X-GoGoSpend-Analytics: off'),
    ('M4', U, "follow().catch(ignore).then(() => analytics.refresh()).catch(ignore);", "follow().catch(ignore);", RENDER + [UPK_T], 'coming to the foreground reads the answer again'),
    ('M5', U, ["import { useSegments } from 'expo-router';\n", "  const segments = useSegments();\n"],
     ["import { usePathname } from 'expo-router';\n", "  const segments = usePathname().split('/').filter(Boolean);\n"], RENDER + [UPK_T], 'screens are sent as route patterns'),
    ('M6', U, "    // A session restored before this subscribed sends no notification.\n    follow().catch(ignore);\n", "", RENDER + [UPK_T], 'a session already restored at start sets the account'),
    # Options beyond the plan's six.
    ('M7', O, "  const rageClickConfig = { enabled: false } satisfies RageClickConfig;", "  const rageClickConfig = { enabled: true } satisfies RageClickConfig;", UNIT + [OPT_T], OPTIONS_TEST),
    ('M8', O, "  delete kept.$device_name;\n", "", UNIT + [OPT_T], OPTIONS_TEST),
    ('M9', O, "    ...(input.replayTouchesCanBeOff ? TOUCHES_OFF : {}),\n", "    ...TOUCHES_OFF,\n", UNIT + [OPT_T], OPTIONS_TEST),
    ('M10', O, "export const REPLAY_TOUCHES_CAN_BE_OFF: boolean = true;", "export const REPLAY_TOUCHES_CAN_BE_OFF: boolean = false;", UNIT + [OPT_T], 'replay can start after a yes'),
    # The server calls.
    ('M11', S, "        if (!routeMissing(error)) throw error;\n", "", UNIT + [SRV_T], 'a server without the route falls back to /v1/me'),
    ('M12', S, "weeks >= 0 && weeks <= MAX_WEEKS", "weeks >= 0", UNIT + [SRV_T], 'a null analytics id is accepted, a malformed one is invalid_response'),
    ('M13', S, " && value.analytics === analytics,", ",", UNIT + [SRV_T], 'setConsent sends exactly { analytics } and checks the answer'),
    ('M14', S, "return { consent: me.privacy.analytics ? 'yes' : 'unasked',", "return { consent: me.privacy.analytics ? 'yes' : 'no',", UNIT + [SRV_T], 'a server without the route falls back to /v1/me'),
    # The controller (1D-T1's follow-ups).
    ('M15', C, "        const storedAtCall = deps.store.write({ accountId: account, answer: 'no', pendingServer: true }).catch(() => undefined);\n",
     "        const storedAtCall = Promise.resolve();\n", UNIT + [CTL_T], 'a no given while a refresh is on its way is stored at once'),
    ('M16', C, "          await storedAtCall;\n", "", UNIT + [CTL_T], 'the no stored at the call lands before the queue writes and sends it'),
    ('M17', C, "          await storedAtCall;\n          await deps.store.write({ accountId: account, answer: 'no', pendingServer: true });\n",
     "          await storedAtCall;\n", UNIT + [CTL_T], 'a yes being stored when the person says no cannot replace the no'),
    ('M18', C, "        if (accountId !== account) throw new AccountChangedError();\n", "        if (accountId !== account) throw new Error('The account changed before the yes was sent');\n",
     UNIT + [CTL_T], 'a yes waiting behind another call is refused once another account has signed in'),
    ('M19', C, "        if (accountId !== account) throw new AccountChangedError();\n", "        if (stale(token, account)) throw new AccountChangedError();\n",
     UNIT + [CTL_T], 'a yes waiting while the same account signs out and in again is still sent for it'),
    # The session follower.
    ('M20', U, "    if (seenEpoch !== null && seenEpoch !== epoch) {\n      heldEpoch = null;\n      await analytics.setAccount(null);\n    }\n", "",
     RENDER + [UPK_T], 'another session clears the account at once, before the new account is read'),
    ('M21', U, "    seenEpoch = epoch;\n    const accountId = await fetchAccountId();\n", "    seenEpoch = epoch;\n    heldEpoch = epoch;\n    const accountId = await fetchAccountId();\n",
     RENDER + [UPK_T], 'a failed account read is tried again at the next foreground'),
    ('M22', U, "    analytics?.setCommon({ language: locale });\n", "", RENDER + [UPK_T], 'the language and the AI switch reach every event'),
    # Wiring.
    ('M23', 'src/spend/v1/ai/AiCompanionProvider.tsx', "    getAnalytics()?.setCommon({ ai_enabled: value.enabled });\n", "", RENDER + [UPK_T], 'the language and the AI switch reach every event'),
    ('M24', 'src/spend/v1/DeviceDiaryProvider.tsx', ", eraseStoredConsent().catch(() => undefined)]);", "]);", RENDER + [ERA_T], 'the sign-out erase hook forgets the bun settings'),
    ('M25', 'src/api/sharedV1.ts', "    analyticsOff: () => getAnalytics()?.allowsAnalytics() !== true,\n", "    analyticsOff: () => getAnalytics()?.allowsAnalytics() === false,\n",
     RENDER + [SV1_T], "requests from the app carry X-GoGoSpend-Analytics: off"),
    ('M26', AA, "  if ((Platform.OS === 'ios' || Platform.OS === 'android') && env.posthogKey !== '') {", "  if (env.posthogKey !== '') {",
     RENDER + [ROOT_T], 'the web build installs analytics with no PostHog client'),
    # This phone's stored answer and the switches.
    ('M27', ST, "  return { store, options: { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY } };", "  return { store, options: {} };",
     RENDER + [STO_T], 'on native the answer is kept on this device only'),
    ('M28', ST, "  if (Object.keys(value).sort().join(',') !== 'accountId,answer,pendingServer') return null;\n", "",
     RENDER + [STO_T], 'anything that is not exactly a stored answer reads as none'),
    ('M29', ST, "  } catch {\n    return null;\n  }\n}\n\nexport async function writeStoredConsent", "  } finally {\n    // no catch\n  }\n}\n\nexport async function writeStoredConsent",
     RENDER + [STO_T], 'anything that is not exactly a stored answer reads as none'),
    ('M30', 'src/config/env.ts', "EXPO_PUBLIC_CRASH_REPORTS_WITHOUT_CONSENT?.trim() !== '0'", "EXPO_PUBLIC_CRASH_REPORTS_WITHOUT_CONSENT?.trim() === '1'",
     UNIT + [ENV_T], 'scrubbed crash reports are sent without consent unless the switch says 0'),
    ('M31', 'src/config/env.ts', "`${v1ApiUrl.replace(/\\/+$/, '')}/ingest`", "`${v1ApiUrl}/ingest`",
     UNIT + [ENV_T], 'PostHog stays off until its project key is set'),
]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def failed_names(log):
    names = []
    for line in log.splitlines():
        stripped = line.strip()
        if stripped.startswith('✖ ') or stripped.startswith('× '):
            names.append(stripped[2:])
        elif stripped.startswith('FAIL ') and ' > ' in stripped:
            names.append(stripped.split(' > ', 1)[1])
    return names


def main():
    LOGS.mkdir(parents=True, exist_ok=True)
    bad = []
    for mutant_id, rel, find, replace, command, expected in MUTANTS:
        if ONLY and mutant_id not in ONLY:
            continue
        path = APP / rel
        original = path.read_bytes()
        digest = sha(path)
        text = original.decode()
        pairs = list(zip(find, replace)) if isinstance(find, list) else [(find, replace)]
        counts = [text.count(one) for one, _ in pairs]
        if counts != [1] * len(pairs):
            print(f'{mutant_id}: NOT APPLIED (Find occurs {counts} times in {rel})')
            bad.append(mutant_id)
            continue
        for one, other in pairs:
            text = text.replace(one, other, 1)
        path.write_text(text)
        try:
            run = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=900)
            log = run.stdout + run.stderr
        finally:
            path.write_bytes(original)
        (LOGS / f'{mutant_id}.log').write_text(log)
        restored = sha(path) == digest
        names = failed_names(log)
        hit = [name for name in names if expected in name]
        unique = sorted(set(re.sub(r' (\([0-9.]+ms\)|[0-9]+ms)$', '', name) for name in names if not name.startswith('failing tests')))
        if run.returncode != 0 and hit and restored:
            print(f'{mutant_id}: killed ({len(unique)} failed: {" | ".join(unique)}); {rel} restored, sha256 OK')
        else:
            print(f'{mutant_id}: SURVIVED or wrong failure (exit {run.returncode}, expected "{expected}", failed {unique}, restored {restored})')
            bad.append(mutant_id)
    sys.exit(1 if bad else 0)


main()
