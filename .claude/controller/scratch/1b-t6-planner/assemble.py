#!/usr/bin/env python3
"""Assembles the 1B-T6 brief from brief-body.md, the diffs, the two shared-file stubs and SHA256SUMS."""
import pathlib
import sys

PL = pathlib.Path(sys.argv[1])
OUT = pathlib.Path(sys.argv[2])
ORDER = [
    'wrangler.vault.jsonc', 'src/cloudflare-workers.d.ts', 'src/v1/protocol.ts', 'src/v1/routes.ts', 'src/v1/worker-routes.ts',
    'src/v1/files/downloads.ts', 'src/vault/routes.ts', 'src/vault/commands/registry.ts', 'src/vault/user-vault.ts',
    'src/vault/files/work.ts', 'src/roles/vault.ts', 'test/vault-route-coverage.test.ts', 'test/workers/sync.test.ts',
]
parts = []
for rel in ORDER:
    diff = (PL / 'diffs' / (rel.replace('/', '_') + '.diff')).read_text().rstrip('\n')
    parts.append(f'### `{rel}`\n\n```diff\n{diff}\n```\n')
work_stub = (PL / 'stubs/src/vault/files/work.ts').read_text()
start = work_stub.index('export const EXPORT_STARTER: WorkStarter = {')
end = work_stub.index('\n}\n', start) + 2
starter = work_stub[start:end].rstrip('\n')
dl_stub = (PL / 'stubs/src/v1/files/downloads.ts').read_text()
serve = dl_stub[dl_stub.index('export async function serveExportFile('):].rstrip('\n')
body = (PL / 'brief-body.md').read_text()
for token, value in [('{{APPENDIX_A}}', '\n'.join(parts).rstrip('\n')), ('{{STUB_STARTER}}', starter), ('{{STUB_SERVE}}', serve), ('{{SUMS}}', (PL / 'SHA256SUMS').read_text().rstrip('\n'))]:
    assert body.count(token) == 1, token
    body = body.replace(token, value)
OUT.write_text(body)
print(OUT, len(body), 'bytes')
