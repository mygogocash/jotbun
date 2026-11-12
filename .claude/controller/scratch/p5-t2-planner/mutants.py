"""P5-T2 mutation check: one mutant per new guard, each applied alone, run, restored.

  python3 -I mutants.py --tree <repo tree> --out <log folder>          run every mutant
  python3 -I mutants.py --tree <repo tree> --out <log folder> --check  only check each applies
  python3 -I mutants.py ... --only W1,R2                               run some

A mutant is killed when its suite fails and the case it names is among the
failures. Each touched file is restored from memory and checked by SHA-256.
The last line is "<k> of <n> killed; survivors [...]; not as expected [...];
not restored [...]".
"""
import argparse
import hashlib
import pathlib
import re
import subprocess
import sys

WALLETS = "packages/contracts/src/v1/wallets.ts"
CATEGORIES = "packages/contracts/src/v1/categories.ts"
TRANSACTIONS = "packages/contracts/src/v1/transactions.ts"
HISTORY = "packages/contracts/src/v1/history.ts"
PRIVACY = "packages/contracts/src/v1/privacy.ts"
AUTH = "packages/contracts/src/v1/auth.ts"
INDEX = "packages/contracts/src/index.ts"
RESOURCES = "apps/app/src/spend/v1/resources.ts"
APP_JSON = "apps/app/app.json"

# The cases, by the start of their titles.
WALLET_CASE = "an older wallet is THB"
CATEGORY_CASE = "a category has its icon and pack key"
RECORD_CASE = "a record carries all of its money fields or none"
HEADER_CASE = "the vault's export header"
LISTS_CASE = "the contract's lists are the boards'"
LOOKS_CASE = "each look is one of its list or none"
ICONS_CASE = "a category's icon and pack key are each"
FIELDS_CASE = "each money field is checked"
MIGRATED_CASE = "an older record, as the P5-T4 migration"
TOTALS_CASE = "totals may name their currency"
VERSION_CASE = "this build is at least the minimum client version"
API_CASE = "recognizes exactly the persisted wallet and category shapes"

# (id, what it does, [(file, old, new)], suites, the case that must fail)
MUTANTS = [
    ("W1", "the older wallet shape takes any ISO currency", [(WALLETS, "      ? wallet.currency === WALLET_CURRENCY\n", "      ? isCurrencyCode(wallet.currency)\n")], ["edge", "api"], [WALLET_CASE, API_CASE]),
    ("W2", "a wallet with its look takes any currency", [(WALLETS, "        isCurrencyCode(wallet.currency) &&\n", "")], ["edge"], [WALLET_CASE]),
    ("W3", "a wallet with its look takes any three capitals", [(WALLETS, "        isCurrencyCode(wallet.currency) &&\n", "        /^[A-Z]{3}$/.test(String(wallet.currency)) &&\n")], ["edge"], [LOOKS_CASE]),
    ("W4", "any wallet kind", [(WALLETS, "        isLook(WALLET_KINDS, wallet.type) &&\n", "")], ["edge"], [WALLET_CASE]),
    ("W5", "any material", [(WALLETS, "        isLook(WALLET_MATERIALS, wallet.material) &&\n", "")], ["edge"], [LOOKS_CASE]),
    ("W6", "any face", [(WALLETS, "        isLook(BUN_FACES, wallet.bun_face);\n", "        true;\n")], ["edge"], [LOOKS_CASE]),
    ("W7", "a look is never null", [(WALLETS, "boolean => value === null || list.includes(value);", "boolean => list.includes(value);")], ["edge"], [LOOKS_CASE]),
    ("W8", "a wallet with its look may carry any other key", [(WALLETS, "      : keys === LOOK_WALLET_KEYS &&\n", "      : keys !== WALLET_KEYS &&\n")], ["edge"], [LOOKS_CASE]),
    ("C1", "no category carries an icon and pack key", [(CATEGORIES, "    (keys === ICON_CATEGORY_KEYS &&\n", "    (false &&\n")], ["edge"], [CATEGORY_CASE]),
    ("C2", "any icon", [(CATEGORIES, "      (category.icon === null || PICKER_GLYPHS.includes(category.icon)) &&\n", "      true &&\n")], ["edge"], [CATEGORY_CASE]),
    ("C3", "an icon is never null", [(CATEGORIES, "(category.icon === null || PICKER_GLYPHS.includes(category.icon))", "PICKER_GLYPHS.includes(category.icon)")], ["edge"], [CATEGORY_CASE]),
    ("C4", "any pack key", [(CATEGORIES, "(PACK.includes(category.pack_key) && category.builtin_key === null)", "(category.builtin_key === null)")], ["edge"], [ICONS_CASE]),
    ("C5", "a built-in may have a pack key", [(CATEGORIES, "(PACK.includes(category.pack_key) && category.builtin_key === null)", "PACK.includes(category.pack_key)")], ["edge"], [CATEGORY_CASE]),
    ("C6", "a pack key is never null", [(CATEGORIES, "(category.pack_key === null || (PACK.includes", "((PACK.includes")], ["edge"], [CATEGORY_CASE]),
    ("C7", "a category with its icon may carry any other key", [(CATEGORIES, "    (keys === ICON_CATEGORY_KEYS &&\n", "    (keys !== CATEGORY_KEYS &&\n")], ["edge"], [ICONS_CASE]),
    ("R1", "a record without money keys is refused", [(TRANSACTIONS, '  if (keys === "") return true;\n', '  if (keys === "") return false;\n')], ["edge"], [RECORD_CASE]),
    ("R2", "the plan's: a record with only some money keys is accepted", [(TRANSACTIONS, '  if (keys === "") return true;\n', "  if (keys !== ENTRY_MONEY_KEYS && keys !== TRANSFER_MONEY_KEYS) return true;\n")], ["edge"], [RECORD_CASE]),
    ("R3", "the money keys are not counted", [(TRANSACTIONS, "    keys === (transfer ? TRANSFER_MONEY_KEYS : ENTRY_MONEY_KEYS) &&\n", "")], ["edge"], [RECORD_CASE]),
    ("R4", "an entry's money keys are a transfer's", [(TRANSACTIONS, "(transfer ? TRANSFER_MONEY_KEYS : ENTRY_MONEY_KEYS)", "(transfer ? ENTRY_MONEY_KEYS : TRANSFER_MONEY_KEYS)")], ["edge"], [RECORD_CASE]),
    ("R5", "any record currency", [(TRANSACTIONS, "    isCurrencyCode(record.currency) &&\n", "")], ["edge"], [FIELDS_CASE]),
    ("R6", "any rate", [(TRANSACTIONS, "    isRate(record.rate) &&\n", "")], ["edge"], [RECORD_CASE]),
    ("R7", "any rate source", [(TRANSACTIONS, "    (RATE_SOURCES as readonly unknown[]).includes(record.rate_source) &&\n", "")], ["edge"], [RECORD_CASE]),
    ("R8", "any rate day", [(TRANSACTIONS, "    (record.rate_date === null || isRateDate(record.rate_date)) &&\n", "")], ["edge"], [FIELDS_CASE]),
    ("R9", "a rate day by its shape only", [(TRANSACTIONS, "isRateDate(record.rate_date)) &&", "DATE.test(String(record.rate_date))) &&")], ["edge"], [FIELDS_CASE]),
    ("R10", "a rate day before 1970", [(TRANSACTIONS, '    validateOccurredOn(value, TRACKING_START_MIN, "9999-12-31");\n', '    validateOccurredOn(value, "0001-01-01", "9999-12-31");\n')], ["edge"], [FIELDS_CASE]),
    ("R11", "a rate day is never null", [(TRANSACTIONS, "(record.rate_date === null || isRateDate(record.rate_date))", "isRateDate(record.rate_date)")], ["edge"], [RECORD_CASE, MIGRATED_CASE]),
    ("R12", "a home amount of 0 is refused", [(TRANSACTIONS, "AMOUNT_OR_ZERO.test(record.home_amount_minor)", "AMOUNT.test(record.home_amount_minor)")], ["edge"], [RECORD_CASE]),
    ("R13", "any home amount", [(TRANSACTIONS, '    typeof record.home_amount_minor === "string" && AMOUNT_OR_ZERO.test(record.home_amount_minor) &&\n', "")], ["edge"], [RECORD_CASE]),
    ("R14", "home and wallet amounts past the cap", [(TRANSACTIONS, "const AMOUNT_OR_ZERO = /^(0|[1-9][0-9]{0,10})$/;", "const AMOUNT_OR_ZERO = /^(0|[1-9][0-9]{0,11})$/;")], ["edge"], [FIELDS_CASE]),
    ("R15", "any wallet or exchanged amount", [(TRANSACTIONS, '    (charged === null || (typeof charged === "string" && (transfer ? AMOUNT : AMOUNT_OR_ZERO).test(charged))) &&\n', "")], ["edge"], [FIELDS_CASE]),
    ("R16", "a wallet charged 0 is refused", [(TRANSACTIONS, "(transfer ? AMOUNT : AMOUNT_OR_ZERO).test(charged)", "AMOUNT.test(charged)")], ["edge"], [FIELDS_CASE]),
    ("R17", "an exchange of 0 is accepted", [(TRANSACTIONS, "(transfer ? AMOUNT : AMOUNT_OR_ZERO).test(charged)", "AMOUNT_OR_ZERO.test(charged)")], ["edge"], [FIELDS_CASE]),
    ("R18", "a wallet or exchanged amount is never null", [(TRANSACTIONS, '(charged === null || (typeof charged === "string"', '((typeof charged === "string"')], ["edge"], [FIELDS_CASE, MIGRATED_CASE]),
    ("R19", "any trip", [(TRANSACTIONS, "    (record.trip_id === null || isUuid(record.trip_id))\n", "    true\n")], ["edge"], [FIELDS_CASE]),
    ("R20", "a trip is never null", [(TRANSACTIONS, "(record.trip_id === null || isUuid(record.trip_id))", "isUuid(record.trip_id)")], ["edge"], [RECORD_CASE]),
    ("R21", "money keys break the record's own keys", [(TRANSACTIONS, 'key !== "source" && !MONEY_KEYS.includes(key)', 'key !== "source"')], ["edge"], [RECORD_CASE]),
    ("R22", "money is not checked", [(TRANSACTIONS, '    hasRecordMoney(record, record.type === "transfer") &&\n', "")], ["edge"], [RECORD_CASE]),
    ("R23", "every record's money is checked as an entry's", [(TRANSACTIONS, 'hasRecordMoney(record, record.type === "transfer")', "hasRecordMoney(record, false)")], ["edge"], [RECORD_CASE]),
    ("R24", "an exchanged amount past the cap", [(TRANSACTIONS, "const AMOUNT = /^[1-9][0-9]{0,10}$/;", "const AMOUNT = /^[1-9][0-9]{0,11}$/;")], ["edge"], [FIELDS_CASE]),
    ("P1", "the vault's export leaves out source", [(PRIVACY, '  "trip_name",\n  "source",\n] as const;', '  "trip_name",\n] as const;')], ["edge"], [HEADER_CASE]),
    ("P2", "the currency columns come first", [(PRIVACY, "[...EXPORT_CSV_COLUMNS, ...VAULT_EXPORT_CSV_CURRENCY_COLUMNS] as const", "[...VAULT_EXPORT_CSV_CURRENCY_COLUMNS, ...EXPORT_CSV_COLUMNS] as const")], ["edge"], [HEADER_CASE]),
    ("P3", "rate and rate_source swap", [(PRIVACY, '  "rate",\n  "rate_source",\n  "rate_date",\n', '  "rate_source",\n  "rate",\n  "rate_date",\n')], ["edge"], [HEADER_CASE]),
    ("L1", "the kinds in another order", [(WALLETS, '["cash", "bank", "credit_card", "transit"] as const', '["bank", "cash", "credit_card", "transit"] as const')], ["edge"], [LISTS_CASE]),
    ("L2", "no peach", [(WALLETS, '["silk", "paper", "titanium", "sky", "peach"] as const', '["silk", "paper", "titanium", "sky"] as const')], ["edge"], [LISTS_CASE]),
    ("L3", "the faces in another order", [(WALLETS, '["smile", "wink", "calm", "happy", "wow"] as const', '["wink", "smile", "calm", "happy", "wow"] as const')], ["edge"], [LISTS_CASE]),
    ("L4", "no book icon", [(CATEGORIES, '"paw", "book"] as const', '"paw"] as const')], ["edge"], [LISTS_CASE]),
    ("L5", "no family_in pack key", [(CATEGORIES, '"pets", "family_in"] as const', '"pets"] as const')], ["edge"], [LISTS_CASE, ICONS_CASE]),
    ("L6", "21 wallets", [(HISTORY, "export const HISTORY_MAX_WALLETS = 20;", "export const HISTORY_MAX_WALLETS = 21;")], ["edge"], [LISTS_CASE]),
    ("L7", "trip_id is not a money key", [(TRANSACTIONS, '"rate_source", "trip_id"] as const', '"rate_source"] as const')], ["edge"], [LISTS_CASE, RECORD_CASE]),
    ("T1", "the plan's: totals must name their currency", [(RESOURCES, "  const named = 'currency' in value;\n", "  const named = true;\n")], ["app"], [TOTALS_CASE]),
    ("T2", "totals take any currency text", [(RESOURCES, "(!named || isCurrencyCode(value.currency))", "(!named || typeof value.currency === 'string')")], ["app"], [TOTALS_CASE]),
    ("T3", "totals never name a currency", [(RESOURCES, "...(named ? ['currency'] : [])", "...([] as string[])")], ["app"], [TOTALS_CASE]),
    ("V1", "app.json stays at 0.2.0", [(APP_JSON, '"version": "0.3.0",', '"version": "0.2.0",')], ["app"], [VERSION_CASE]),
    ("V2", "the minimum is P3's", [(AUTH, 'export const CURRENCY_MIN_CLIENT_VERSION = "0.3.0";', 'export const CURRENCY_MIN_CLIENT_VERSION = "0.2.0";')], ["app"], [VERSION_CASE]),
    ("V3", "a patch above P3's", [(AUTH, 'export const CURRENCY_MIN_CLIENT_VERSION = "0.3.0";', 'export const CURRENCY_MIN_CLIENT_VERSION = "0.2.1";')], ["app"], [VERSION_CASE]),
    ("V4", "a minimum above this build", [(AUTH, 'export const CURRENCY_MIN_CLIENT_VERSION = "0.3.0";', 'export const CURRENCY_MIN_CLIENT_VERSION = "0.4.0";')], ["app"], [VERSION_CASE]),
    ("V5", "another minimum shares it", [
        (AUTH, 'export const CURRENCY_MIN_CLIENT_VERSION = "0.3.0";', 'export const CURRENCY_MIN_CLIENT_VERSION = "0.3.0";\nexport const PAYMENTS_MIN_CLIENT_VERSION = "0.3.0";'),
        (INDEX, 'export { CURRENCY_MIN_CLIENT_VERSION } from "./v1/auth.ts";', 'export { CURRENCY_MIN_CLIENT_VERSION, PAYMENTS_MIN_CLIENT_VERSION } from "./v1/auth.ts";'),
    ], ["app"], [VERSION_CASE]),
]

EDGE_FAIL = re.compile(r"^\s*×\s+test/contracts/shapes\.test\.ts > (.+?)(?: \d+ms)?$")
APP_FAIL = re.compile(r"^✖ (.+?) \([0-9.]+m?s\)$")
# Jest names a failure "● <describe> › <title>".
API_FAIL = re.compile(r"^\s*● (?:.+ › )?(.+)$")


def sha(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(tree: pathlib.Path, suite: str, log: pathlib.Path) -> tuple[int, list[str]]:
    if suite == "edge":
        cmd, cwd, pattern = ["npx", "vitest", "run", "--reporter=verbose", "test/contracts/shapes.test.ts"], tree / "apps/edge", EDGE_FAIL
    elif suite == "app":
        cmd, cwd, pattern = ["node", "scripts/test-unit.mjs", "src/spend/v1/resources.test.ts", "src/api/clientVersion.test.ts"], tree / "apps/app", APP_FAIL
    else:
        cmd, cwd, pattern = ["npm", "run", "test:api", "--", "src/v1/contracts.spec.ts"], tree, API_FAIL
    try:
        done = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=600)
        output, code = done.stdout + done.stderr, done.returncode
    except subprocess.TimeoutExpired as error:
        output, code = f"timed out: {error}", 124
    log.write_text(f"$ {' '.join(cmd)}  (in {cwd})\n{output}\nexit {code}\n")
    failing = sorted({m.group(1) for line in output.splitlines() if (m := pattern.match(line))})
    return code, failing


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tree", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--only", default="")
    args = parser.parse_args()
    tree = pathlib.Path(args.tree).resolve()
    out = pathlib.Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    chosen = [m for m in MUTANTS if not args.only or m[0] in args.only.split(",")]

    missing = []
    for mid, _, edits, _, _ in chosen:
        for file, old, _new in edits:
            count = (tree / file).read_text().count(old)
            if count != 1:
                missing.append(f"{mid} {file} ({count} matches)")
    if args.check or missing:
        for mid, *_ in chosen:
            print(f"{mid} {'MISSING' if any(x.startswith(mid + ' ') for x in missing) else 'APPLIES'}")
        print(f"{len(chosen) - len({x.split()[0] for x in missing})} of {len(chosen)} apply; missing {missing}")
        return 1 if missing else 0

    killed, survivors, unexpected, unrestored = [], [], [], []
    for mid, what, edits, suites, cases in chosen:
        saved = {file: (tree / file).read_text() for file, _, _ in edits}
        hashes = {file: sha(tree / file) for file in saved}
        try:
            for file, old, new in edits:
                text = (tree / file).read_text()
                (tree / file).write_text(text.replace(old, new, 1))
            results = {suite: run(tree, suite, out / f"{mid}-{suite}.log") for suite in suites}
        finally:
            for file, text in saved.items():
                (tree / file).write_text(text)
        restored = all(sha(tree / file) == digest for file, digest in hashes.items())
        failing = [name for _, names in results.values() for name in names]
        dead = all(code != 0 for code, _ in results.values())
        named = all(any(name.startswith(case) for name in failing) for case in cases)
        if not restored:
            unrestored.append(mid)
        if dead and named:
            killed.append(mid)
            verdict = "killed"
        elif dead:
            killed.append(mid)
            unexpected.append(mid)
            verdict = "killed, but not by the case named"
        else:
            survivors.append(mid)
            verdict = "SURVIVED"
        print(f"{mid} {verdict}: {what}; exits {[code for code, _ in results.values()]}; failing {failing}; restored={restored}", flush=True)
    print(f"{len(killed)} of {len(chosen)} killed; survivors {survivors}; not as expected {unexpected}; not restored {unrestored}")
    return 0 if not survivors and not unexpected and not unrestored else 1


if __name__ == "__main__":
    sys.exit(main())
