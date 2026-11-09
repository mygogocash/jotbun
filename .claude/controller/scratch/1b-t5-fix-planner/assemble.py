#!/usr/bin/env python3
"""1B-T5 fix round: applies the exact edits to an apps/edge directory.

Usage: python3 -I assemble.py <apps/edge directory> tests|fix
  tests: the new cases in imports-intake.test.ts and imports-parse.test.ts
  fix:   the checkedParse change in src/background/parse-consumer.ts
Each old text must occur exactly once, or nothing is written and the exit is 1.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
INTAKE_TESTS = open(os.path.join(HERE, 'fragments', 'intake-tests.ts')).read()
PARSE_TESTS = open(os.path.join(HERE, 'fragments', 'parse-tests.ts')).read()

TOTAL = '/** `total` bytes starting with `head`'

TESTS = [
    ('test/workers/imports-intake.test.ts', "import type { ImportJobDto } from '@gogospend/contracts'\n",
     "import type { ImportJobDto, PolicyVersionDto } from '@gogospend/contracts'\n"),
    ('test/workers/imports-intake.test.ts', "import { VAULT_STEP_ROUTES } from '../../src/v1/routes'\n",
     "import type { VaultCall, VaultReply, VaultRouteId } from '../../src/v1/protocol'\nimport { VAULT_STEP_ROUTES } from '../../src/v1/routes'\n"),
    ('test/workers/imports-intake.test.ts', '  MiB,\n  ageSeeds,\n', '  MiB,\n  TINY_JPEG,\n  ageSeeds,\n'),
    ('test/workers/imports-intake.test.ts', '  uploadRowOf,\n  vaultIdOf,\n', '  uploadRowOf,\n  vaultExec,\n  vaultIdOf,\n'),
    ('test/workers/imports-intake.test.ts', "import { member, startV1, vaultOf } from './support/v1-client'\n",
     "import { TEST_POLICIES, member, startV1, vaultOf } from './support/v1-client'\n"),
    ('test/workers/imports-intake.test.ts', '\n})\n\n' + TOTAL, '\n})\n' + INTAKE_TESTS + '\n' + TOTAL),
    ('test/workers/imports-parse.test.ts', '    expect(await candidatesOf(user, jobId)).toHaveLength(6)\n  })\n})\n',
     '    expect(await candidatesOf(user, jobId)).toHaveLength(6)\n  })\n})\n' + PARSE_TESTS),
]

FIX = [
    ('src/background/parse-consumer.ts',
     """/**
 * A `parsed` reply checked again, as the API's worker does: an image comes
 * exactly with an image format, its bytes are that format by their magic,
 * at most the upload cap, and its own header gives the size the parser claimed
 * with no metadata. Anything else is the rejected preview, with no image.
 */
export function checkedParse(format: ParseFormat, reply: Extract<ParseServiceReply, { kind: 'parsed' }>): { record: PreviewRecord; image: { format: ImageFormat; bytes: Buffer; width: number; height: number } | null } {
  const expectsImage = (IMAGE_FORMATS as readonly string[]).includes(format)
""",
     """/**
 * A `parsed` reply checked again, as previewFromOutcome checks a parse
 * (apps/api/src/imports/parse-outcome.ts): a rejected record is kept as it is,
 * with its own issue (image_too_large, parse_timeout, ...), and never stores an
 * image. A readable one has an image exactly for an image format, its bytes
 * are that format by their magic, at most the upload cap, and its own header
 * gives the size the parser claimed with no metadata. Anything else is the
 * rejected preview parse_failed, with no image.
 */
export function checkedParse(format: ParseFormat, reply: Extract<ParseServiceReply, { kind: 'parsed' }>): { record: PreviewRecord; image: { format: ImageFormat; bytes: Buffer; width: number; height: number } | null } {
  // The API rejects before it looks for an image (parse-outcome.ts, recordFor), so a rejection keeps its code.
  if (reply.record.preview.status === 'rejected') return { record: reply.record, image: null }
  const expectsImage = (IMAGE_FORMATS as readonly string[]).includes(format)
"""),
]


def apply(edge, edits):
    texts = {}
    for rel, old, new in edits:
        path = os.path.join(edge, rel)
        text = texts.get(rel, open(path).read())
        if text.count(old) != 1:
            print(f'NOT APPLIED: {rel}: old text occurs {text.count(old)} times: {old[:60]!r}')
            sys.exit(1)
        texts[rel] = text.replace(old, new)
    for rel, text in texts.items():
        open(os.path.join(edge, rel), 'w').write(text)
        print(f'written {rel}')


if __name__ == '__main__':
    apply(sys.argv[1], {'tests': TESTS, 'fix': FIX}[sys.argv[2]])
