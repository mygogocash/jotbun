#!/usr/bin/env python3
"""Mutation check for 1C-T5 review round 3 (brief 1C-T5-round3.md, Step 4; ruling R86).

Run from the worktree's apps/app directory, after Step 3 (GREEN):
  cd /Users/kunanonjarat/Developer/jotbun/.claude/worktrees/p1-1c-t5/apps/app && python3 -I <this file>

Round 2's 22 mutants come first, rerun: M1, M2, M4 to M6 and M9 to M13 with their
patterns unchanged; M3's pattern now carries round 3's `sid` check on the same line
(the swap it makes is the same). N1 to N9, R14 and R15 are round 2's. N10 to N15
cover round 3's guards (R86).
Each mutant replaces one exact string (it must occur exactly once), runs the focused
tests, records the failing count and names, and restores the file from a byte copy
kept OUTSIDE the repository; at the end every file's sha256 is compared with its
value before the run. Exit code 1 if a mutant survives, a pattern is not found
exactly once, or a file does not restore. Set MUTANT_BACKUP to move the copies.
"""
import hashlib
import os
import re
import shutil
import subprocess
import sys

BACKUP = os.environ.get('MUTANT_BACKUP', '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/1c-t5-round3-impl/mutant-backup')
UNIT = ['node', 'scripts/test-unit.mjs', 'src/auth/betterAuthPort.test.ts', 'src/auth/credentialProvider.test.ts',
        'src/auth/jotbunAccountClient.test.ts', 'src/api/client.test.ts', 'src/api/sessionEpoch.test.ts']
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', 'src/screens/redesign/RootLayout.render.test.tsx']
P = 'src/auth/betterAuthPort.ts'
C = 'src/auth/credentialProvider.ts'
S = 'src/auth/sessionStore.ts'
J = 'src/auth/jotbunAccountClient.ts'
L = 'app/_layout.tsx'

MUTANTS = [
    ('M1 a 5xx is not AuthUnavailable', P,
     "if (error.status === 0 || error.status >= 500) throw new AuthUnavailable()",
     "if (error.status === 0) throw new AuthUnavailable()", UNIT),
    ('M2 skip the subject pre-check', P,
     "      if (!links.some((item) => item.providerId === request.method && item.accountId === sub)) throw new AuthRefused('OTHER_ACCOUNT')\n",
     "", UNIT),
    ('M3 port.signOut() before logoutVault', C,
     "    if (token && sessionId && sessionOf(token) === sessionId) await deps.logoutVault?.({ accessToken: token, sessionId }).catch(noop);\n    await deps.port.signOut().catch(noop);",
     "    await deps.port.signOut().catch(noop);\n    if (token && sessionId && sessionOf(token) === sessionId) await deps.logoutVault?.({ accessToken: token, sessionId }).catch(noop);", UNIT),
    ('M4 store a record before port.signIn resolves', C,
     "      const session = await deps.port.signIn(request);\n      if (superseded(mine)) {",
     "      await deps.sessions.save({ accountId: '0a000000-0000-4000-8000-00000000000a', sessionId: '0b000000-0000-4000-8000-00000000000b', email: 'early@example.test', method: request.method });\n      const session = await deps.port.signIn(request);\n      if (superseded(mine)) {", UNIT),
    ('M5 drop methods from ACCOUNT_EXISTS', P,
     "throw new AuthRefused('ACCOUNT_EXISTS', error.methods ?? ['email'])",
     "throw new AuthRefused('ACCOUNT_EXISTS')", UNIT),
    ('M6 created: true for every sign-in', P,
     "method, created: createdOf(answer) }",
     "method, created: true }", UNIT),
    ('M9 no superseded check before the fresh sign-in saves', C,
     "      await deps.port.signOutDevice(oldSessionId).catch(noop);\n      if (superseded(mine)) {\n        await forgetLateSession();\n        return 'cancelled';\n      }\n",
     "      await deps.port.signOutDevice(oldSessionId).catch(noop);\n", UNIT),
    ('M10 requestCredentials ignores a session change', C,
     "if (!token || snapshot.state !== 'active' || snapshot.epoch !== epoch || !snapshot.binding) return null;",
     "if (!token || snapshot.state !== 'active' || !snapshot.binding) return null;", UNIT),
    ('M11 the old binding item is deleted on every load', S,
     "      if (!oldItemRemoved) {\n        oldItemRemoved = true;\n        await secure.deleteItemAsync(OLD_BINDING_ITEM, options).catch(() => undefined);\n      }",
     "      await secure.deleteItemAsync(OLD_BINDING_ITEM, options).catch(() => undefined);", UNIT),
    ('M12 the vault is told the wrong session id', C,
     "await deps.logoutVault?.({ accessToken: token, sessionId }).catch(noop);",
     "await deps.logoutVault?.({ accessToken: token, sessionId: snapshot.binding ?? '' }).catch(noop);", UNIT),
    ('N1 accessToken caches an answer that was in flight across a change', P,
     "      if (asked === generation) cached = { token, exp: expiry(token) }\n      return token\n",
     "      cached = { token, exp: expiry(token) }\n      return token\n", UNIT),
    ('N2 refresh caches an answer that was in flight across a change', P,
     "      if (asked === generation) cached = { token, exp: expiry(token) }\n      return true\n",
     "      cached = { token, exp: expiry(token) }\n      return true\n", UNIT),
    ('N3 an email sign-in does not move the generation', P,
     "    if (result.error) mapCode(result.error)\n    forgetToken()\n",
     "    if (result.error) mapCode(result.error)\n    cached = null\n", UNIT),
    ('N4 an Apple or Google sign-in does not move the generation', P,
     "    if (result.error) mapIdToken(result.error)\n    forgetToken()\n",
     "    if (result.error) mapIdToken(result.error)\n    cached = null\n", UNIT),
    ('N5 a sign-out does not move the generation', P,
     "      // The server's answer does not decide whether this device is signed out.\n    }\n    forgetToken()\n",
     "      // The server's answer does not decide whether this device is signed out.\n    }\n    cached = null\n", UNIT),
    ('N6 signing out a device reads a 204 as an outage', P,
     "      mapNoContent(await call(() => deps.client.signOutDevice(id)))",
     "      mapSensitive(await call(() => deps.client.signOutDevice(id)))", UNIT),
    ('N7 signing out everywhere reads a 204 as an outage', P,
     "      mapNoContent(await call(() => deps.client.signOutEverywhere()))",
     "      mapSensitive(await call(() => deps.client.signOutEverywhere()))", UNIT),
    ('N8 sign-out-others is sent without a body', J,
     "'/jotbun/devices/sign-out-others', { method: 'POST', body: {} })",
     "'/jotbun/devices/sign-out-others', { method: 'POST' })", UNIT),
    ('N9 sign-out-everywhere is sent without a body', J,
     "'/jotbun/sign-out-everywhere', { method: 'POST', body: {} })",
     "'/jotbun/sign-out-everywhere', { method: 'POST' })", UNIT),
    ('R14 freshFlow saves outside committing', C,
     "        return 'cancelled';\n      }\n      const next: StoredSession = { accountId: session.accountId, sessionId: session.sessionId, email: session.email, method: session.method };\n      const write = deps.sessions.save(next).then(() => { record = next; });\n      committing = write;\n",
     "        return 'cancelled';\n      }\n      const next: StoredSession = { accountId: session.accountId, sessionId: session.sessionId, email: session.email, method: session.method };\n      const write = deps.sessions.save(next).then(() => { record = next; });\n", UNIT),
    ('R15 freshFlow has no superseded check after its save', C,
     "      if (superseded(mine)) {\n        await forgetLateSession();\n        return 'cancelled';\n      }\n      dispatch({ type: 'bootstrapped', accountId: next.accountId, binding: next.sessionId });\n      await reservation;\n      return 'fresh';",
     "      dispatch({ type: 'bootstrapped', accountId: next.accountId, binding: next.sessionId });\n      await reservation;\n      return 'fresh';", UNIT),
    ('N10 a sign-in whose session read fails keeps the accepted session', P,
     "    } catch (error) {\n      await signOut()\n      throw error\n    }",
     "    } catch (error) {\n      throw error\n    }", UNIT),
    ('N11 getAccessToken hands out a token for any session', C,
     "        const sid = sessionOf(token);\n        return sid !== null && sid === binding ? token : null;",
     "        return token;", UNIT),
    ('N12 a token whose session cannot be read is handed out', C,
     "return sid !== null && sid === binding ? token : null;",
     "return sid === null || sid === binding ? token : null;", UNIT),
    ('N13 a token for another session locks the session', C,
     "        return sid !== null && sid === binding ? token : null;",
     "        if (sid !== null && sid === binding) return token;\n        if (snapshot.epoch === epoch) dispatch({ type: 'auth_denied' });\n        return null;", UNIT),
    ('N14 a refused token no longer locks', C,
     "        if (token === null) {\n          if (snapshot.epoch === epoch) dispatch({ type: 'auth_denied' });\n          return null;\n        }",
     "        if (token === null) {\n          return null;\n        }", UNIT),
    ('N15 sign-out tells the vault with a token for another session', C,
     "if (token && sessionId && sessionOf(token) === sessionId) await deps.logoutVault",
     "if (token && sessionId) await deps.logoutVault", UNIT),
    ('M13 the root layout does not install sign-in', L,
     "installAppAuth();\n",
     "", RENDER),
]


def digest(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def run(cmd):
    result = subprocess.run(cmd, capture_output=True, text=True)
    out = result.stdout + result.stderr
    match = re.search(r'ℹ fail (\d+)', out) or re.search(r'Tests\s+(\d+) failed', out)
    failed = int(match.group(1)) if match else (0 if result.returncode == 0 else -1)
    names = sorted(set(re.findall(r'^✖ (.+?) \(\d', out, re.M)))
    if cmd is RENDER:
        names = sorted(set(re.findall(r'(?:×|✗|FAIL)\s+(.+)', out)))[:3]
    return failed, names


def main():
    if not os.path.isfile('scripts/test-unit.mjs'):
        sys.exit("Run this from the worktree's apps/app directory.")
    os.makedirs(BACKUP, exist_ok=True)
    files = sorted({m[1] for m in MUTANTS})
    before = {path: digest(path) for path in files}
    problems = 0
    for name, path, old, new, cmd in MUTANTS:
        with open(path, encoding='utf-8') as handle:
            source = handle.read()
        if source.count(old) != 1:
            print(f'{name}: PATTERN FOUND {source.count(old)} TIMES, NOT RUN')
            problems += 1
            continue
        copy = os.path.join(BACKUP, path.replace('/', '__'))
        shutil.copyfile(path, copy)
        try:
            with open(path, 'w', encoding='utf-8') as handle:
                handle.write(source.replace(old, new))
            failed, names = run(cmd)
        finally:
            shutil.copyfile(copy, path)
        verdict = 'killed' if failed > 0 else ('LOAD ERROR' if failed < 0 else 'SURVIVED')
        if failed <= 0:
            problems += 1
        print(f'{name}: {verdict}, {failed} failed: ' + ' | '.join(names[:4]))
    for path in files:
        same = digest(path) == before[path]
        print(f'restored {path}: {"OK" if same else "CHANGED"}')
        if not same:
            problems += 1
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
