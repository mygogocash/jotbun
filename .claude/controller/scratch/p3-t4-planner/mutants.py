#!/usr/bin/env python3
"""
Mutation tester for P3-T4: The gateway transport, one deadline per request and the call trace.
Applies each mutant to tree/, runs the focused tests, verifies that the expected test fails,
then restores the file byte-for-byte.
"""
import argparse
import os
import subprocess
import sys

MUTANTS = [
    {
        "id": "M1_drop_collect_log",
        "file": "apps/edge/src/v1/ai/transport.ts",
        "find": "'cf-aig-collect-log': 'false',",
        "replace": "// 'cf-aig-collect-log': 'false',",
        "test": "test/ai-transport.test.ts",
        "expected_fail": "every request goes to the gateway with logging and caching off",
    },
    {
        "id": "M2_ignore_deadline",
        "file": "apps/edge/src/v1/ai/transport.ts",
        "find": "if (callTime < MIN_CALL_MS) {",
        "replace": "if (false && callTime < MIN_CALL_MS) {",
        "test": "test/ai-transport.test.ts",
        "expected_fail": "a request with less than 2 s left makes no call",
    },
    {
        "id": "M3_529_as_rejected",
        "file": "apps/edge/src/v1/ai/transport.ts",
        "find": "if (typeof error.status === 'number' && error.status >= 500) return 'server_error'",
        "replace": "if (typeof error.status === 'number' && error.status >= 500 && error.status !== 529) return 'server_error'",
        "test": "test/ai-transport.test.ts",
        "expected_fail": "callFailure names each failure",
    },
    {
        "id": "M4_max_retries_1",
        "file": "apps/edge/src/v1/ai/transport.ts",
        "find": "maxRetries: 0,",
        "replace": "maxRetries: 1,",
        "test": "test/ai-transport.test.ts",
        "expected_fail": "a rate limit fails at once as rate_limited with its wait",
    },
    {
        "id": "M5_drop_skip_cache",
        "file": "apps/edge/src/v1/ai/transport.ts",
        "find": "'cf-aig-skip-cache': 'true'",
        "replace": "// 'cf-aig-skip-cache': 'true'",
        "test": "test/ai-transport.test.ts",
        "expected_fail": "every request goes to the gateway with logging and caching off",
    },
    {
        "id": "M6_drop_gateway_auth",
        "file": "apps/edge/src/v1/ai/transport.ts",
        "find": "...(config.gatewayToken ? { 'cf-aig-authorization': `Bearer ${config.gatewayToken}` } : {}),",
        "replace": "// dropped gateway auth",
        "test": "test/ai-transport.test.ts",
        "expected_fail": "the gateway token is sent only when set",
    },
    {
        "id": "M7_child_deadline_no_min",
        "file": "apps/edge/src/v1/ai/transport.ts",
        "find": "return new AiDeadline(Math.min(this.remainingMs(), capMs), this.now)",
        "replace": "return new AiDeadline(capMs, this.now)",
        "test": "test/ai-transport.test.ts",
        "expected_fail": "a child deadline ends at the earlier of its cap and its parent",
    },
    {
        "id": "M8_env_ignores_ai_enabled",
        "file": "apps/edge/src/v1/ai/transport.ts",
        "find": "if (!flag(env.AI_ENABLED) || !env.ANTHROPIC_API_KEY) return null",
        "replace": "if (!env.ANTHROPIC_API_KEY) return null",
        "test": "test/ai-transport.test.ts",
        "expected_fail": "transportFromEnv is null unless AI is on and keyed",
    },
]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tree", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    os.makedirs(args.out, exist_ok=True)
    edge_dir = os.path.join(args.tree, "apps/edge")

    killed = 0
    total = len(MUTANTS)

    for m in MUTANTS:
        m_id = m["id"]
        filepath = os.path.join(args.tree, m["file"])
        with open(filepath, "r", encoding="utf-8") as f:
            original_content = f.read()

        if m["find"] not in original_content:
            print(f"ERROR: mutant {m_id} pattern not found in {m['file']}", file=sys.stderr)
            sys.exit(1)

        mutated_content = original_content.replace(m["find"], m["replace"], 1)
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(mutated_content)

        log_path = os.path.join(args.out, f"{m_id}.log")
        cmd = ["npx", "vitest", "run", "--reporter=verbose", m["test"]]
        with open(log_path, "w", encoding="utf-8") as log_file:
            res = subprocess.run(cmd, cwd=edge_dir, stdout=log_file, stderr=subprocess.STDOUT)

        # Restore immediately
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(original_content)

        # Verify restoration
        with open(filepath, "r", encoding="utf-8") as f:
            restored = f.read()
        assert restored == original_content, f"Failed to restore {filepath} after {m_id}"

        with open(log_path, "r", encoding="utf-8") as log_file:
            log_text = log_file.read()

        if res.returncode != 0 and m["expected_fail"] in log_text:
            print(f"KILLED: {m_id} (expected failure '{m['expected_fail']}')")
            killed += 1
        else:
            print(f"SURVIVED / UNEXPECTED: {m_id} (returncode {res.returncode})", file=sys.stderr)
            print(log_text[:500], file=sys.stderr)
            sys.exit(1)

    print(f"Summary: {killed}/{total} mutants killed.")

if __name__ == "__main__":
    main()
