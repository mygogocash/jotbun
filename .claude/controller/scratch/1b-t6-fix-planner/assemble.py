#!/usr/bin/env python3
"""How real/ was made from orig/ (1B-T6 fix round). For reference only: the
implementer copies real/ and never runs this.

Usage: python3 -I assemble.py <kit directory>
"""
import os
import sys

OLD_HEAD_OF = """/** A HEAD request gets the status and headers of its GET, and no body. */
function headOf(response: Response, method: string): Response {
  return method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response
}
"""


def main() -> int:
    kit = sys.argv[1]
    read = lambda rel: open(os.path.join(kit, rel), encoding='utf-8').read()

    def write(rel: str, text: str) -> None:
        path = os.path.join(kit, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, 'w', encoding='utf-8').write(text)

    handler = read('orig/src/v1/handler.ts')
    if handler.count(OLD_HEAD_OF) != 1:
        print('headOf not found exactly once')
        return 1
    write('real/src/v1/handler.ts', handler.replace(OLD_HEAD_OF, read('fragments/headOf.ts')))

    tests = read('orig/test/workers/exports.test.ts')
    if not tests.endswith('\n  })\n})\n'):
        print('exports.test.ts does not end as expected')
        return 1
    write('real/test/workers/exports.test.ts', tests + read('fragments/exports-tests.ts'))
    print('assembled')
    return 0


if __name__ == '__main__':
    sys.exit(main())
