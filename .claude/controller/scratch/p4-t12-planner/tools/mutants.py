#!/usr/bin/env python3
"""P4-T12 mutants. Usage: python3 -I mutants.py <app dir> [--check] [mutant ids...]

<app dir> is a checkout's apps/app (the implementer's: WT/apps/app). For each
mutant: record the file's SHA-256, apply its exact replacements (each must
match once), run its focused tests, restore the file and check the SHA-256
again. A mutant is killed when that run fails; the line names the cases that
failed (or the tsc errors, for the typed links). `--check` only checks that
every pattern matches once and changes nothing. Logs go next to this script,
under mutant-logs/ (or MUTANT_LOGS when set).
"""
import hashlib
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOGS = os.environ.get('MUTANT_LOGS', os.path.join(HERE, 'mutant-logs'))

RES = 'src/slips/slipResources.ts'
REFS = 'src/slips/slipRefs.ts'
FAKE = 'src/slips/testing/fakeSlipResources.ts'
ROUTES = 'src/slips/slipRoutes.ts'
SHARED = 'src/api/sharedV1.ts'
DIARY = 'src/spend/v1/DeviceDiaryProvider.tsx'

UNIT = ['node', 'scripts/test-unit.mjs']
RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts']
RES_T = UNIT + ['src/slips/slipResources.test.ts']
REFS_T = UNIT + ['src/slips/slipRefs.test.ts']
SHARED_T = RENDER + ['src/slips/sharedSlipResources.render.test.tsx']
ERASE_T = RENDER + ['src/spend/v1/DeviceDiaryProvider.render.test.tsx', 'src/mascot/bunSettingsErase.render.test.tsx']
ROUTES_T = ['node', 'scripts/typecheck-with-routes.mjs']

ANY = "(value): value is {t} => typeof value === 'object' && value !== null"
UPDATE_COMMAND = "        command: { id: await newId(), schemaVersion: V1_COMMAND_SCHEMA, ifMatch: version },\n"
FAKE_SALT = "'AQIDBAUGBwgJCgsMDQ4PEBESExQVFhcYGRobHB0eHyA'"

# id: (why, file, [(old, new), ...], command)
MUTANTS = {
    # The plan's four (P4-T12 Step 5).
    'M1': ("plan: the salt fetched per hash (nothing kept or held)", REFS,
           [("    const kept = await deps.store.read(deps.accountId);\n    if (kept !== null) return kept;\n", ""),
            ("const pending = (salt ??= load()", "const pending = (salt = load()")], REFS_T),
    'M2': ("plan: the reference hashed without the bank code", REFS,
           [("return slipRefHash(await pending, normalized, deps.sha256);", "return slipRefHash(await pending, normalized.slice(4), deps.sha256);")], REFS_T),
    'M3': ("plan: keychainAccessible omitted", REFS,
           [("const secret = { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY, ...(", "const secret = { ...(")], REFS_T),
    'M4': ("plan: the account update sent without a command", RES, [(UPDATE_COMMAND, "")], RES_T),
    # The slip calls.
    'R1': ("the batch sent as a JSON body (parsed by the dispatcher at 2 MiB; the route gets no stream)", RES,
           [("        raw: { bytes: new TextEncoder().encode(JSON.stringify(request)), contentType: SLIP_BATCH_TYPE },\n", "        body: request,\n")], RES_T),
    'R2': ("the batch's bytes typed application/json", RES,
           [("const SLIP_BATCH_TYPE = 'application/octet-stream';", "const SLIP_BATCH_TYPE = 'application/json';")], RES_T),
    'R3': ("the read waits the transport's 20 s", RES, [("        timeoutMs: SLIP_LIMITS.clientTimeoutMs,\n", "")], RES_T),
    'R4': ("the read is a command, so the transport resends it", RES,
           [("        timeoutMs: SLIP_LIMITS.clientTimeoutMs,\n",
             "        timeoutMs: SLIP_LIMITS.clientTimeoutMs,\n        command: { id: '00000000-0000-4000-8000-000000000000', schemaVersion: V1_COMMAND_SCHEMA },\n")], RES_T),
    'R5': ("any salt answer", RES, [("{ validate: isSlipSaltDto }", "{ validate: " + ANY.format(t='SlipSaltDto') + " }")], RES_T),
    'R6': ("any batch answer", RES, [("        validate: isSlipBatchResult,\n", "        validate: " + ANY.format(t='SlipBatchResult') + ",\n")], RES_T),
    'R7': ("any drafts page", RES, [("{ validate: isSlipDraftsPage }", "{ validate: " + ANY.format(t='SlipDraftsPage') + " }")], RES_T),
    'R8': ("a later page without its limit", RES, [("      if (limit !== undefined) query.set('limit', String(limit));\n", "")], RES_T),
    'R9': ("a later page without its cursor", RES, [("      if (cursor !== undefined) query.set('cursor', cursor);\n", "")], RES_T),
    'R10': ("an ack for another entity", RES, [(" && value.entity_id === SLIP_INBOX_ID;", ";")], RES_T),
    'R11': ("an ack for another command", RES,
            [("isCommandAck(value) && value.command_id === commandId && value.entity_id", "isCommandAck(value) && value.entity_id")], RES_T),
    'R12': ("confirm without its command", RES,
            [("{ body: { drafts }, command: { id: commandId, schemaVersion: V1_COMMAND_SCHEMA }, validate", "{ body: { drafts }, validate")], RES_T),
    'R13': ("dismiss without its command", RES,
            [("{ body: {}, command: { id: commandId, schemaVersion: V1_COMMAND_SCHEMA }, validate", "{ body: {}, validate")], RES_T),
    'R14': ("dismiss without a body", RES,
            [("{ body: {}, command: { id: commandId, schemaVersion: V1_COMMAND_SCHEMA }, validate", "{ command: { id: commandId, schemaVersion: V1_COMMAND_SCHEMA }, validate")], RES_T),
    'R15': ("a draft id that is no UUID is sent", RES, [("`/v1/drafts/${segment(draftId)}/dismiss`", "`/v1/drafts/${draftId}/dismiss`")], RES_T),
    'R16': ("an account id that is no UUID is sent", RES, [("const path = `/v1/slip-accounts/${segment(id)}`;", "const path = `/v1/slip-accounts/${id}`;")], RES_T),
    'R17': ("the account update without If-Match", RES, [(", ifMatch: version }", " }")], RES_T),
    'R18': ("the account update's command id is the account's", RES,
            [("command: { id: await newId(), schemaVersion", "command: { id: id, schemaVersion")], RES_T),
    'R19': ("another account's answer accepted", RES, [("isSlipAccountDto(value) && value.id === id,", "isSlipAccountDto(value),")], RES_T),
    'R20': ("any accounts answer", RES, [("{ validate: isSlipAccountsDto }", "{ validate: " + ANY.format(t='{ accounts: SlipAccountDto[] }') + " }")], RES_T),
    'R21': ("any 204 answer", RES, [("const isNoContent = (value: unknown): value is null => value === null;", "const isNoContent = (value: unknown): value is null => true;")], RES_T),
    'R22': ("any albums answer", RES, [("{ validate: isBankAlbumsDto }", "{ validate: " + ANY.format(t='{ albums: BankAlbumDto[] }') + " }")], RES_T),
    'R23': ("the device registered with POST", RES, [("await transport.request('PUT', '/v1/devices'", "await transport.request('POST', '/v1/devices'")], RES_T),
    'R24': ("the update's default id is not expo-crypto's", RES,
            [("const expoUuid = async (): Promise<string> => (await import('expo-crypto')).randomUUID();",
              "const expoUuid = async (): Promise<string> => '00000000-0000-4000-8000-000000000000';")], SHARED_T),
    # The salt store and the hasher.
    'H1': ("keychainAccessible WHEN_UNLOCKED (an iCloud backup may restore it to another device)", REFS,
           [("keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY,", "keychainAccessible: store.WHEN_UNLOCKED,")], REFS_T),
    'H2': ("the access group ignored", REFS,
           [("...(options.accessGroup === undefined ? {} : { accessGroup: options.accessGroup }) };", "...({}) };")], REFS_T),
    'H3': ("another key prefix", REFS, [("export const SALT_KEY_PREFIX = 'jotbun.slip-salt.';", "export const SALT_KEY_PREFIX = 'jotbun.slip.salt.';")], REFS_T),
    'H4': ("a kept value read without its check", REFS,
           [("return text !== null && HEX_SALT.test(text) ? fromHex(text) : null;", "return text !== null ? fromHex(text) : null;")], REFS_T),
    'H5': ("the read without its options", REFS,
           [("await store.getItemAsync(`${SALT_KEY_PREFIX}${accountId}`, secret);", "await store.getItemAsync(`${SALT_KEY_PREFIX}${accountId}`);")], REFS_T),
    'H6': ("the write without its options", REFS, [("toHex(salt), secret);", "toHex(salt));")], REFS_T),
    'H7': ("forget deletes nothing", REFS, [("      await store.deleteItemAsync(`${SALT_KEY_PREFIX}${accountId}`, secret);\n", "")], REFS_T),
    'H8': ("forget without its options", REFS,
           [("await store.deleteItemAsync(`${SALT_KEY_PREFIX}${accountId}`, secret);", "await store.deleteItemAsync(`${SALT_KEY_PREFIX}${accountId}`);")], REFS_T),
    'H9': ("an unnormalizable reference is hashed", REFS, [("    if (normalized === null) return null;\n", "")], REFS_T),
    'H10': ("a failed salt load is kept, so it fails for good", REFS, [("      salt = null;\n", "")], REFS_T),
    'H11': ("the kept salt ignored", REFS, [("    if (kept !== null) return kept;\n", "")], REFS_T),
    'H12': ("the fetched salt not kept", REFS, [("    await deps.store.write(deps.accountId, fetched);\n", "")], REFS_T),
    'H13': ("a locked keychain falls back to the server", REFS,
            [("const kept = await deps.store.read(deps.accountId);", "const kept = await deps.store.read(deps.accountId).catch(() => null);")], REFS_T),
    'H14': ("base64url read as base64", REFS, [("const base64 = dto.salt.replace(/-/g, '+').replace(/_/g, '/');", "const base64 = dto.salt;")], REFS_T),
    'H15': ("hex without leading zeros", REFS, [("byte.toString(16).padStart(2, '0')", "byte.toString(16)")], REFS_T),
    'H16': ("SHA-512 for SHA-256", REFS, [("expoCrypto.CryptoDigestAlgorithm.SHA256", "expoCrypto.CryptoDigestAlgorithm.SHA512")], REFS_T),
    # The fake slip server.
    'F1': ("slip import closed is ignored", FAKE, [("if (options.slipImportOn === false && RELEASED.has(method))", "if (false && RELEASED.has(method))")], RES_T),
    'F2': ("the salt behind the release", FAKE, [("new Set<keyof SlipResources>(['read',", "new Set<keyof SlipResources>(['salt', 'read',")], RES_T),
    'F3': ("slip refs behind the release", FAKE, [("'accounts', 'updateAccount']);", "'accounts', 'updateAccount', 'recordRef']);")], RES_T),
    'F4': ("a confirm naming a gone draft is accepted", FAKE,
           [("      if (!items.every((item) => drafts.some((draft) => draft.id === item.draft_id))) throw new V1Error('conflict', 409, 'VERSION_CONFLICT');\n", "")], RES_T),
    'F5': ("a dismiss of a gone draft is accepted", FAKE,
           [("      if (!drafts.some((draft) => draft.id === draftId)) throw new V1Error('not_found', 404, 'NOT_FOUND');\n", "")], RES_T),
    'F6': ("confirm takes nothing out", FAKE,
           [("      drafts = drafts.filter((draft) => !items.some((item) => item.draft_id === draft.id));\n", "")], RES_T),
    'F7': ("a stale account update is accepted", FAKE, [("      if (current.version !== version) throw", "      if (false) throw")], RES_T),
    'F8': ("an unknown account is updated", FAKE, [("      if (!current) throw new V1Error('not_found', 404, 'NOT_FOUND');\n", "")], RES_T),
    'F9': ("an update keeps the version", FAKE,
           [("const updated = { ...current, version: version + 1, wallet_id: walletId };", "const updated = { ...current, wallet_id: walletId };")], RES_T),
    'F10': ("pages ignore the limit", FAKE, [("const end = start + (limit ?? DRAFTS_PAGE);", "const end = start + DRAFTS_PAGE;")], RES_T),
    'F11': ("an unscripted slip is read", FAKE,
            [("?? { ref_hash: item.ref_hash, outcome: 'unreadable', draft: null }", "?? { ref_hash: item.ref_hash, outcome: 'read', draft: null }")], RES_T),
    'F12': ("the fake salt is not a salt", FAKE, [(FAKE_SALT, FAKE_SALT[:-2] + "'")], RES_T),
    'F13': ("calls are not recorded", FAKE, [("    calls.push(body === undefined ? { method } : { method, body });\n", "")], RES_T),
    # The sign-out erase.
    'D1': ("the erase forgets no slip salt", DIARY, [(", eraseSlipSalt(accountId).catch(() => undefined)]);", "]);")], ERASE_T),
    'D2': ("a keychain that refuses stops the erase", DIARY, [("eraseSlipSalt(accountId).catch(() => undefined)", "eraseSlipSalt(accountId)")], ERASE_T),
    'D3': ("the web's erase reaches the keychain", DIARY,
           [("  if (Platform.OS !== 'web') await slipSalts.forget(accountId);\n", "  await slipSalts.forget(accountId);\n")], ERASE_T),
    # The shared slip client (1D-T6's m4).
    'V1': ("slip calls over a transport without the analytics header", SHARED,
           [("slips ??= createSlipResources(sharedTransport());",
             "slips ??= createSlipResources(createV1Transport({ baseUrl: getMobileEnv().v1ApiUrl, client: v1ClientVersion(), credentials: v1SessionCredentials, allowLanHttp: __DEV__ }));")], SHARED_T),
    'V2': ("a new slip client per call", SHARED, [("slips ??= createSlipResources(sharedTransport());", "slips = createSlipResources(sharedTransport());")], SHARED_T),
    # The typed links (typecheck:routes).
    'T1': ("a link to a route that does not exist", ROUTES,
           [("export const SLIP_REVIEW_HREF: Href = '/spend/slips/review';", "export const SLIP_REVIEW_HREF: Href = '/spend/slips/reviews';")], ROUTES_T),
    'T2': ("the manual run's link to a route that does not exist", ROUTES,
           [("{ pathname: '/spend/slips/scan', params: { run: 'manual' } }", "{ pathname: '/spend/slips/scanning', params: { run: 'manual' } }")], ROUTES_T),
}

NODE_FAILED = re.compile(r'^✖ (.+?) \([\d.]+ms\)$', re.M)
VITEST_FAILED = re.compile(r'^ FAIL  (\S+ > .+?)\s*$', re.M)
TSC_ERROR = re.compile(r'^(\S+\(\d+,\d+\): error TS\d+)', re.M)


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def failed_cases(output):
    names = [name for name in NODE_FAILED.findall(output)]
    names += VITEST_FAILED.findall(output)
    names += TSC_ERROR.findall(output)
    seen = []
    for name in names:
        if name not in seen:
            seen.append(name)
    return seen


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
        output = run.stdout + run.stderr
        with open(os.path.join(LOGS, f'{mid}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        verdict = 'KILLED' if run.returncode != 0 else 'SURVIVED'
        cases = failed_cases(output)
        detail = f"{why}; failed: {' | '.join(cases) if cases else '(none named)'}; restored={restored}"
        results.append((mid, verdict, detail))
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
