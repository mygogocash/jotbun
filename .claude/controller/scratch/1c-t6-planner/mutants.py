#!/usr/bin/env python3
"""1C-T6 mutants. Usage: python3 -I mutants.py <app dir> [mutant ids...]

<app dir> is a checkout's apps/app (the implementer's: WT/apps/app). For each
mutant: record the file's SHA-256, apply one exact replacement (it must match
once), run the focused tests, restore the file and check the SHA-256 again.
A mutant is killed when the focused run fails. Logs go next to this script,
under mutant-logs/ (or MUTANT_LOGS when set).
"""
import hashlib
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOGS = os.environ.get('MUTANT_LOGS', os.path.join(HERE, 'mutant-logs'))

OUTBOX = 'src/sync/outbox.ts'
ENDED = 'src/auth/sessionEnded.ts'
GUARD = 'src/auth/useAuthGuardSession.ts'
CLIENT = 'src/api/client.ts'
GLOBAL = 'src/auth/globalLogout.ts'
DELETION = 'src/spend/v1/deletion.ts'
PRIVACY = 'src/spend/v1/privacy.ts'
PARTS = 'src/screens/redesign/account/SettingsParts.tsx'
SETTINGS = 'src/screens/redesign/account/SettingsScreen.tsx'
PRIVACY_SCREEN = 'src/screens/redesign/account/PrivacyScreen.tsx'

UNIT = ['node', 'scripts/test-unit.mjs']
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts']
RESUME = UNIT + ['src/spend/v1/sessionResume.test.ts']
ENDED_T = UNIT + ['src/auth/sessionEnded.test.ts']
GLOBAL_T = UNIT + ['src/auth/globalLogout.test.ts']
DELETION_T = UNIT + ['src/spend/v1/deletion.test.ts']
PRIVACY_T = UNIT + ['src/spend/v1/privacy.test.ts']
CLIENT_T = UNIT + ['src/api/client.test.ts']
GUARD_T = RENDER + ['src/auth/useAuthGuardSession.render.test.tsx']
SETTINGS_T = RENDER + ['src/screens/redesign/account/SettingsScreen.render.test.tsx']
PRIVACY_SCREEN_T = RENDER + ['src/screens/redesign/account/PrivacyScreen.render.test.tsx']

# id: (why, file, old, new, command)
MUTANTS = {
    # The plan's four (Task 6, Step 5).
    'M1': ("plan: the outbox treats signed_out as needs_review (verdictFor)", OUTBOX,
           "    case 'rate_limited':\n    case 'upgrade_required':\n    case 'signed_out':\n",
           "    case 'signed_out':\n      return REFUSED;\n    case 'rate_limited':\n    case 'upgrade_required':\n", RESUME),
    'M2': ("plan: mayEraseOtherAccount accepts an unconfirmed erase", ENDED,
           "return choice.kind === 'erase' && choice.confirmed === true;", "return choice.kind === 'erase';", ENDED_T),
    'M3': ("plan: the receipt goes with the session's current token, not the request's own", DELETION,
           "        tokenOnly: true,\n        credentials: { accessToken },\n", "        tokenOnly: true,\n", DELETION_T),
    'M4': ("plan: a resend draws a new proof_id", DELETION,
           "accepted = await deps.resources.requestDeletion({ commandId: request.commandId, proofId: request.proofId, language: request.language }, request.credentials);",
           "accepted = await deps.resources.requestDeletion({ commandId: request.commandId, proofId: globalThis.crypto.randomUUID(), language: request.language }, request.credentials);",
           DELETION_T),
    # The D37 model.
    'E1': ("a session-ended view for any state", ENDED,
           "  if (snapshot.state !== 'locked' && snapshot.state !== 'reauth_required') return null;\n", "", ENDED_T),
    'E2': ("a record of another account still makes a view", ENDED,
           "if (!record || record.accountId !== snapshot.accountId) return null;", "if (!record) return null;", ENDED_T),
    'E3': ("the reason is ignored", ENDED,
           "kind: reason ?? 'signed_out_elsewhere',", "kind: 'signed_out_elsewhere',", ENDED_T),
    'E4': ("the same account never resumes", ENDED,
           "  if (signedInAccountId === previous.accountId) return { kind: 'resumed' };\n", "", ENDED_T),
    'E5': ("another account's waiting count is lost", ENDED,
           "previousAccountId: previous.accountId, unsent: previous.unsent };", "previousAccountId: previous.accountId, unsent: 0 };", ENDED_T),
    'E6': ("keep erases", ENDED,
           "return choice.kind === 'erase' && choice.confirmed === true;", "return choice.kind === 'keep' || choice.confirmed === true;", ENDED_T),
    # The guard's `ended`.
    'U1': ("never ended", GUARD, "ended: view === 'ended' };", "ended: false };", GUARD_T),
    'U2': ("an ended session reads as signed out", GUARD, "isAuthed: view === 'authed' || view === 'ended',", "isAuthed: view === 'authed',", GUARD_T),
    'U3': ("reauth_required is not ended", GUARD,
           "if (state === 'locked' || state === 'reauth_required') return 'ended';", "if (state === 'locked') return 'ended';", GUARD_T),
    # The transport's Accept-Language.
    'L1': ("acceptLanguage is not sent", CLIENT, "      if (request.acceptLanguage) headers['Accept-Language'] = request.acceptLanguage;\n", "", CLIENT_T),
    'L2': ("Accept-Language is always Thai", CLIENT,
           "if (request.acceptLanguage) headers['Accept-Language'] = request.acceptLanguage;", "if (request.acceptLanguage) headers['Accept-Language'] = 'th';", CLIENT_T),
    # Sign out everywhere.
    'G1': ("SIGNED_OUT reads as unconfirmed", GLOBAL,
           "if (error.code === 'SIGNED_OUT') return { state: 'signed_out' };", "if (error.code === 'SIGNED_OUT') return { state: 'unconfirmed', request };", GLOBAL_T),
    'G2': ("a rate limit is a refusal", GLOBAL, "    if (error.code === 'RATE_LIMITED') return { state: 'unconfirmed', request };\n", "", GLOBAL_T),
    'G3': ("a failed fresh sign-in still sends", GLOBAL, "  if (outcome !== 'fresh') return { state: 'refused', code: FRESH_SIGN_IN_FAILED };\n", "", GLOBAL_T),
    'G4': ("an unreachable server is not unconfirmed", GLOBAL, "    if (error instanceof AuthUnavailable) return { state: 'unconfirmed', request };\n", "", GLOBAL_T),
    'G5': ("REAUTH_REQUIRED is a refusal", GLOBAL, "    if (error.code === 'REAUTH_REQUIRED') return { state: 'reauth_required' };\n", "", GLOBAL_T),
    'G6': ("a cancelled fresh sign-in is a refusal", GLOBAL,
           "  if (outcome === 'cancelled') return { state: 'cancelled' };\n", "", GLOBAL_T),
    # Deletion.
    'D1': ("a failed fresh sign-in still sends", DELETION, "  if (outcome !== 'fresh') return { state: 'denied', code: FRESH_SIGN_IN_FAILED };\n", "", DELETION_T),
    'D2': ("no usable session still sends", DELETION, "  if (!credentials) return { state: 'reauth_required' };\n", "", DELETION_T),
    'D3': ("the request goes on the shared session's credentials", DELETION,
           "        credentials: { accessToken: credentials.accessToken, binding: credentials.sessionId },\n        acceptLanguage: input.language,\n",
           "        acceptLanguage: input.language,\n", DELETION_T),
    'D4': ("no Accept-Language on the deletion", DELETION, "        acceptLanguage: input.language,\n", "", DELETION_T),
    'D5': ("one id as both the command id and the proof id", DELETION,
           "return submitDeletionRequest({ commandId: deps.newId(), proofId: deps.newId(), language: deps.language, credentials }, deps);",
           "const id = deps.newId();\n  return submitDeletionRequest({ commandId: id, proofId: id, language: deps.language, credentials }, deps);", DELETION_T),
    'D6': ("a cancelled fresh sign-in is denied", DELETION,
           "  if (outcome === 'cancelled') return { state: 'cancelled' };\n", "", DELETION_T),
    # Export.
    'X1': ("the export goes on the shared session's credentials", PRIVACY,
           "        credentials: { accessToken: credentials.accessToken, binding: credentials.sessionId },\n", "", PRIVACY_T),
    'X2': ("a failed fresh sign-in still sends", PRIVACY, "  if (outcome !== 'fresh') return { state: 'reauth_required' };\n", "", PRIVACY_T),
    'X3': ("no usable session still sends", PRIVACY, "  if (!credentials) return { state: 'reauth_required' };\n", "", PRIVACY_T),
    'X4': ("a cancelled fresh sign-in is reauth_required", PRIVACY, "  if (outcome === 'cancelled') return { state: 'cancelled' };\n", "", PRIVACY_T),
    'X5': ("a resend draws a new proof_id", PRIVACY,
           "{ commandId: request.commandId, proofId: request.proofId }, request.credentials);",
           "{ commandId: request.commandId, proofId: globalThis.crypto.randomUUID() }, request.credentials);", PRIVACY_T),
    # The services' fresh sign-in.
    'S1': ("email is offered a fresh sign-in", PARTS, "if (!provider || !method || method === 'email' || !provider.methods().includes(method)) return null;",
           "if (!provider || !method || !provider.methods().includes(method)) return null;", SETTINGS_T + ['-t', 'offers a fresh sign-in']),
    'S2': ("a method this build cannot run is offered", PARTS, "if (!provider || !method || method === 'email' || !provider.methods().includes(method)) return null;",
           "if (!provider || !method || method === 'email') return null;", SETTINGS_T + ['-t', 'offers a fresh sign-in']),
    # (Asking to sign up here would be equivalent: the port's freshSignIn always sends requestSignUp false, 1C-T5.)
    'S3': ("the fresh sign-in uses another method than the account's", PARTS, "return () => provider.freshSignIn({ method, signUp: false });",
           "return () => provider.freshSignIn({ method: method === 'google' ? 'apple' : 'google', signUp: false });", SETTINGS_T + ['-t', 'offers a fresh sign-in']),
    # The screens.
    'V1': ("Settings: a failed fresh sign-in reads as a refusal", SETTINGS, "      return state.code === FRESH_SIGN_IN_FAILED\n", "      return false\n",
           SETTINGS_T + ['-t', 'does not go through']),
    'V2': ("Settings: a sign-in that throws reads as unconfirmed", SETTINGS, "setNote(seen.sent ? everywhereNote(", "setNote(true ? everywhereNote(",
           SETTINGS_T + ['-t', 'cannot be reached: nothing']),
    'V3': ("Privacy: a failed fresh sign-in settles (locks) the copy", PRIVACY_SCREEN,
           "    if (result.state === 'denied' && result.code === FRESH_SIGN_IN_FAILED) {\n", "    if (false) {\n",
           PRIVACY_SCREEN_T + ['-t', 'does not go through']),
    'V4': ("Privacy: the deletion is always in Thai", PRIVACY_SCREEN, "const language = locale === 'th' ? 'th' : 'en';", "const language = 'th';",
           PRIVACY_SCREEN_T + ['-t', "app's language"]),
    'V5': ("Privacy: the export's request is not kept after a failure", PRIVACY_SCREEN,
           "        seen.request = { filter: period, ...ids, credentials };\n", "", PRIVACY_SCREEN_T + ['-t', 'rate limit after the request']),
    'V6': ("Privacy: the deletion's request is not kept after a failure", PRIVACY_SCREEN,
           "        seen.request = { ...input, credentials };\n", "", PRIVACY_SCREEN_T + ['-t', 'not Jotbun']),
}


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def main():
    app = os.path.abspath(sys.argv[1])
    wanted = sys.argv[2:] or list(MUTANTS)
    os.makedirs(LOGS, exist_ok=True)
    results = []
    for mid in wanted:
        why, rel, old, new, command = MUTANTS[mid]
        path = os.path.join(app, rel)
        before = sha(path)
        with open(path, encoding='utf-8') as handle:
            original = handle.read()
        if original.count(old) != 1:
            results.append((mid, 'NOT APPLIED', f'pattern matches {original.count(old)} times'))
            continue
        try:
            with open(path, 'w', encoding='utf-8') as handle:
                handle.write(original.replace(old, new))
            run = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=900)
        finally:
            with open(path, 'w', encoding='utf-8') as handle:
                handle.write(original)
        restored = sha(path) == before
        log = os.path.join(LOGS, f'{mid}.log')
        with open(log, 'w', encoding='utf-8') as handle:
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
    sys.exit(0 if all(verdict == 'KILLED' for _, verdict, _ in results) else 1)


if __name__ == '__main__':
    main()
