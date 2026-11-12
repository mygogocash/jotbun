"""Builds the RED stage's typed stubs from real/ and orig/ (P5-T2 planner kit).

Each stub keeps real/'s types and exports, empties the new lists (typed by a
cast, so every type that reads them stays exact), and keeps orig/'s validator.
Run: python3 -I tools/make_stubs.py (from the kit folder).
"""
import pathlib
import sys

KIT = pathlib.Path(__file__).resolve().parent.parent
REAL = KIT / "real"
ORIG = KIT / "orig"
STUBS = KIT / "stubs"


def sub(text: str, old: str, new: str, where: str) -> str:
    if text.count(old) != 1:
        sys.exit(f"{where}: expected one match of {old[:60]!r}, found {text.count(old)}")
    return text.replace(old, new)


def tail_from(text: str, marker: str, where: str) -> str:
    if text.count(marker) != 1:
        sys.exit(f"{where}: expected one {marker!r}")
    return text[text.index(marker):]


def empty_list(text: str, name: str, values: str, where: str) -> str:
    return sub(text, f"export const {name} = {values} as const;", f"export const {name} = [] as unknown as readonly {values};", where)


def stub(rel: str, build) -> None:
    real = (REAL / rel).read_text()
    orig = (ORIG / rel).read_text()
    out = STUBS / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build(real, orig, rel))
    print(f"stub {rel}")


def wallets(real: str, orig: str, rel: str) -> str:
    text = sub(real, 'import { isCurrencyCode } from "./currency.ts";\n', "", rel)
    text = empty_list(text, "WALLET_KINDS", '["cash", "bank", "credit_card", "transit"]', rel)
    text = empty_list(text, "WALLET_MATERIALS", '["silk", "paper", "titanium", "sky", "peach"]', rel)
    text = empty_list(text, "BUN_FACES", '["smile", "wink", "calm", "happy", "wow"]', rel)
    marker = "const WALLET_KEYS = "
    return text[: text.index(marker)] + tail_from(orig, marker, rel)


def categories(real: str, orig: str, rel: str) -> str:
    text = empty_list(real, "CATEGORY_PICKER_GLYPHS", '["food", "coffee", "car", "bag", "home", "receipt", "heart", "lotus", "gift", "phone", "paw", "book"]', rel)
    text = empty_list(text, "PACK_KEYS", '["family_out", "merit", "delivery", "motorbike_rail", "topup", "seven", "lottery", "pets", "family_in"]', rel)
    marker = "const CATEGORY_KEYS = "
    return text[: text.index(marker)] + tail_from(orig, marker, rel)


def transactions(real: str, orig: str, rel: str) -> str:
    text = sub(real, 'import { RATE_SOURCES, isCurrencyCode, parseRate } from "./currency.ts";\n', "", rel)
    text = sub(
        text,
        'import { BIDI_CONTROL, LONE_SURROGATE, TRACKING_START_MIN, isInvisible, isUuid, validateOccurredOn } from "./validation.ts";',
        'import { BIDI_CONTROL, LONE_SURROGATE, isInvisible, isUuid } from "./validation.ts";',
        rel,
    )
    text = empty_list(text, "RECORD_MONEY_KEYS", '["currency", "home_amount_minor", "rate", "rate_date", "rate_source", "trip_id"]', rel)
    marker = "const ENTRY_KEYS = "
    return text[: text.index(marker)] + tail_from(orig, marker, rel)


def history(real: str, orig: str, rel: str) -> str:
    return sub(real, "export const HISTORY_MAX_WALLETS = 20;", "export const HISTORY_MAX_WALLETS = 0;", rel)


def privacy(real: str, orig: str, rel: str) -> str:
    start = "export const VAULT_EXPORT_CSV_CURRENCY_COLUMNS = ["
    end = '  "source",\n] as const;\n'
    if real.count(start) != 1 or real.count(end) != 1:
        sys.exit(f"{rel}: the currency columns are not where expected")
    block = real[real.index(start): real.index(end) + len(end)]
    names = [line.strip().rstrip(",") for line in block.splitlines()[1:-1]]
    typed = "[" + ", ".join(names) + "]"
    text = real.replace(block, f"export const VAULT_EXPORT_CSV_CURRENCY_COLUMNS = [] as unknown as readonly {typed};\n")
    return sub(
        text,
        "export const VAULT_EXPORT_CSV_COLUMNS = [...EXPORT_CSV_COLUMNS, ...VAULT_EXPORT_CSV_CURRENCY_COLUMNS] as const;",
        "export const VAULT_EXPORT_CSV_COLUMNS = [...EXPORT_CSV_COLUMNS] as unknown as readonly [...typeof EXPORT_CSV_COLUMNS, ...typeof VAULT_EXPORT_CSV_CURRENCY_COLUMNS];",
        rel,
    )


stub("packages/contracts/src/v1/wallets.ts", wallets)
stub("packages/contracts/src/v1/categories.ts", categories)
stub("packages/contracts/src/v1/transactions.ts", transactions)
stub("packages/contracts/src/v1/history.ts", history)
stub("packages/contracts/src/v1/privacy.ts", privacy)
