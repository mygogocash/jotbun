#!/usr/bin/env python3
"""1B-T5 fix round: the mutation check. Applies each mutant (one or more exact
edits, each old text exactly once), runs the two focused workers files,
restores every file byte for byte, and reports the failing tests.

Usage (take the heavy lock first, release it after):
  python3 -I mutants.py <apps/edge directory> <scratch directory> [LABEL ...]

The scratch directory receives the backups (keep.<label>.<n>) and one log per
mutant. Exit status 1 if a mutant fails to apply, a restore differs from its
backup, or a mutant leaves any of its REQUIRED tests passing.
"""
import os
import re
import shutil
import subprocess
import sys

CONSUMER = 'src/background/parse-consumer.ts'
VAULT = 'src/vault/user-vault.ts'
SESSION = 'src/vault/session.ts'
INTAKE = 'src/vault/files/intake.ts'
UPLOADS = 'src/v1/files/uploads.ts'

I = 'imports-intake.test.ts'
P = 'imports-parse.test.ts'
CODES = [
    f'{P}: a photo over 20 MP is stored with its own issue, never parse_failed',
    f'{P}: a photo that is not the format it claims is stored with its own issue, never parse_failed',
    f'{P}: a photo the image child cannot decode is stored with its own issue, never parse_failed',
    f'{P}: a photo whose child was killed at its deadline is stored with its own issue, never parse_failed',
    f'{P}: a photo whose child went past its memory budget is stored with its own issue, never parse_failed',
]
NO_IMAGE = f'{P}: a readable photo reply without its image is still the rejected preview parse_failed'
SIGNED_OUT = f'{I}: after sign-out the four cleanup steps still run; begin, finish and the status read are refused'
POLICY = f'{I}: a terms version the account has not accepted refuses begin and finish; reservePart still runs'
DELETING = f'{I}: in a deleting account reservePart gives no key, begin and finish are refused, and abort still cleans up'
OTHER = f"{I}: another account's session reaches no upload step of this vault"
ERASED = f'{I}: an erased vault refuses every upload step, anySession or not'
HTTP_SIGNED_OUT = f'{I}: after sign-out an upload is refused at begin and records nothing'
OCR = f'{I}: while ocr is paused an image upload is 503 with nothing recorded, and a CSV is still accepted'
STREAMED = f'{I}: an upload whose session ended while it streamed is not accepted and leaves nothing'

ANY_SESSION = "const anySession = stepRouteOf(call.route)?.anySession === true"
POLICY_LINE = "if (call.access === 'current_policy' && !anySession) assertPolicyAccepted(c)"
OCR_LINE = "if (format === 'jpeg' || format === 'png' || format === 'webp') w.gates.assertOpen('ocr')"

# (label, description, [(file, old, new), ...], tests that must fail)
MUTANTS = [
    ('F1', 'the old checkedParse: a rejected photo becomes parse_failed (the line at parse-consumer.ts:88 decides alone)',
     [(CONSUMER, "  if (reply.record.preview.status === 'rejected') return { record: reply.record, image: null }\n", '')], set(CODES)),
    ('F2', 'the presence check runs only for an image on a table format',
     [(CONSUMER, 'if (expectsImage !== (image !== null)) return { record: REJECTED, image: null }', 'if (!expectsImage && image !== null) return { record: REJECTED, image: null }')], {NO_IMAGE}),
    ('G1', 'begin alone skips the session check',
     [(VAULT, ANY_SESSION, ANY_SESSION + " || call.route === 'imports.begin'")], {SIGNED_OUT, HTTP_SIGNED_OUT}),
    ('G2', 'the upload steps skip the policy check (begin and finish too)',
     [(VAULT, POLICY_LINE, "if (call.access === 'current_policy' && !anySession && !call.route.startsWith('imports.')) assertPolicyAccepted(c)")], {POLICY}),
    ('G3', 'the policy is checked on every step',
     [(VAULT, POLICY_LINE, "if (call.access === 'current_policy') assertPolicyAccepted(c)")], {POLICY}),
    ('G4', 'the session is checked on every step',
     [(VAULT, 'if (!anySession) assertSession(c)', 'assertSession(c)')], {SIGNED_OUT, STREAMED}),
    ('G5', 'reservePart ignores the account status',
     [(INTAKE, "if (account?.status !== 'active') return null", "if (account?.status === 'never') return null")], {DELETING}),
    ('G6', 'the anySession steps skip ensureAccount (the owner check)',
     [(VAULT, "        ensureAccount(c)\n        if (call.charge !== 'step') this.rates.charge('principal', call.claims.accountId)",
       "        if (!anySession) ensureAccount(c)\n        if (call.charge !== 'step') this.rates.charge('principal', call.claims.accountId)")], {OTHER}),
    ('G7', "an erased vault's two refusals both ignored (the erased flag in call() and the deleted marker in ensureAccount)",
     [(VAULT, "if (this.erased) return { ok: false, status: 403, code: 'ACCOUNT_UNAVAILABLE', problem: {} }", "if (this.erased && false) return { ok: false, status: 403, code: 'ACCOUNT_UNAVAILABLE', problem: {} }"),
      (SESSION, "if (account.status === 'deleted') throw new ProblemException(403, 'ACCOUNT_UNAVAILABLE')", "if (account.status === 'deleted' && false) throw new ProblemException(403, 'ACCOUNT_UNAVAILABLE')")], {ERASED}),
    ('G8', 'an image upload skips the ocr gate', [(UPLOADS, OCR_LINE, '')], {OCR}),
    ('G9', 'the ocr gate holds every format', [(UPLOADS, OCR_LINE, "w.gates.assertOpen('ocr')")], {OCR}),
]

TESTS = ['test/workers/imports-intake.test.ts', 'test/workers/imports-parse.test.ts']


def run_focused(edge, log_path):
    cmd = ['npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', *TESTS]
    out = subprocess.run(cmd, cwd=edge, capture_output=True, text=True, timeout=900)
    text = out.stdout + out.stderr
    with open(log_path, 'w') as handle:
        handle.write(text)
    failed = set()
    for file, title in re.findall(r'^\s*×\s+(?:test/workers/)?(\S+\.test\.ts) > (?:.+ > )?(.+?)(?: \d+ms)?$', text, re.M):
        failed.add(f'{file}: {title}')
    summary = re.search(r'Tests\s+(.+)', text)
    return failed, summary.group(1).strip() if summary else '?'


def main():
    edge, scratch = sys.argv[1], sys.argv[2]
    only = set(sys.argv[3:])
    os.makedirs(os.path.join(scratch, 'mutant-logs'), exist_ok=True)
    bad = 0
    for label, desc, edits, required in MUTANTS:
        if only and label not in only:
            continue
        files = sorted({rel for rel, _, _ in edits})
        keeps = {}
        for n, rel in enumerate(files):
            keeps[rel] = os.path.join(scratch, f'keep.{label}.{n}')
            shutil.copyfile(os.path.join(edge, rel), keeps[rel])
        texts = {rel: open(os.path.join(edge, rel)).read() for rel in files}
        applied = True
        for rel, old, new in edits:
            if texts[rel].count(old) != 1:
                print(f'{label} NOT APPLIED ({rel}: {texts[rel].count(old)} matches): {desc}', flush=True)
                applied = False
                break
            texts[rel] = texts[rel].replace(old, new)
        if not applied:
            bad += 1
            continue
        try:
            for rel in files:
                open(os.path.join(edge, rel), 'w').write(texts[rel])
            failed, summary = run_focused(edge, os.path.join(scratch, 'mutant-logs', f'{label}.log'))
        finally:
            for rel in files:
                shutil.copyfile(keeps[rel], os.path.join(edge, rel))
        restored = all(open(os.path.join(edge, rel), 'rb').read() == open(keeps[rel], 'rb').read() for rel in files)
        missing = sorted(required - failed)
        verdict = 'KILLED' if not missing else 'SURVIVED'
        print(f'{label} {verdict} ({desc}) [{summary}] restored={restored}', flush=True)
        for test in sorted(failed):
            print(f'    failed: {test}', flush=True)
        for test in missing:
            print(f'    STILL PASSING (required): {test}', flush=True)
        if missing or not restored:
            bad += 1
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
