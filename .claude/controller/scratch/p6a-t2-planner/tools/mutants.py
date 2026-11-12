#!/usr/bin/env python3
"""P6A-T2 mutation check. Usage: python3 -I mutants.py <tree or worktree root> <log dir> [ids...]

Applies each mutant alone, runs the three focused Node test files
(widgetSnapshot, outsideCopy, dateStep), restores the file byte for byte
(sha256 checked) and prints one line per mutant: KILLED when the run fails,
every failing case fails on an AssertionError, and the cases named for it are
among them. Exits 0 only when every mutant is KILLED and every file restored.
"""
import hashlib
import os
import re
import subprocess
import sys

SNAPSHOT = 'apps/app/src/wallet/outside/widgetSnapshot.ts'
DATES = 'apps/app/src/ui/dateStep.ts'
COPY = 'apps/app/src/wallet/outside/outsideCopy.draft.ts'
TESTS = ['src/wallet/outside/widgetSnapshot.test.ts', 'src/wallet/outside/outsideCopy.test.ts', 'src/ui/dateStep.test.ts']

HOME = 'the home face reads as ox-widget-home'
B21 = 'with the Face ID lock on, the lock face holds no amount, private mode or not'
PRIVATE = 'private mode masks both faces and keeps the count'
OVER = 'over budget says เกินงบไป ฿420 and, masked, keeps the words'
NO_BUDGET = 'no budget has no side line and no gauge figure'
MIDNIGHT = 'after midnight the widget shows a new day with nothing logged'
DAYS = 'each face names its day'
MONTH_END = "on the month's last evening the next entry drops the budget figures"
OTHER_MONTH = "a pace for another month draws no budget figures, so the 1st never shows last month's"
STALE = 'the second midnight asks to open Jotbun'
NEXT = 'nextBangkokMidnight is the next 00:00 in Bangkok, strictly after now'
ENTRY_AT = 'entryAt picks the newest started entry, else the first'
FACE_FOR = 'faceFor gives system families the home face and accessory families the lock face'
VIETNAMESE = 'Vietnamese reads the English lines'
SAME = "sameSnapshot ignores only the first entry's time"
LABELS = "both snapshots carry the link words in the person's language"
LINES = 'every outside line has Thai and English with the same placeholders, no emoji and no dash punctuation, under an outside. key'
MONTH_NAME = 'monthName gives short and long names in Thai and English'
DAY_NAME = 'shortDayName gives ส. 24 and Sat 24'

# (id, file, what it breaks, [(old, new), ...] each old occurring exactly once, cases that must fail)
MUTANTS = [
    # The plan's five (Step 5).
    ('P1', SNAPSHOT, "the lock face masked only in private mode (the plan's B21 mutant)",
     [('lock: face(figures, facts.hidden || facts.lockOn, say),', 'lock: face(figures, facts.hidden, say),')], [B21]),
    ('P2', SNAPSHOT, "tomorrow's faces worked out on today's day, so with today's days left (the plan's midnight mutant)",
     [("...faces({ day: tomorrow, count: 0,", "...faces({ day: today, count: 0,")], [MIDNIGHT]),
    ('P3', SNAPSHOT, "VoiceOver handed the per-day satang (the plan's mutant)",
     [("said: { key: 'outside.spokenLeft', minor: wholeBaht(perDay) }", "said: { key: 'outside.spokenLeft', minor: perDay.toString() }")], [MIDNIGHT]),
    ('P4', SNAPSHOT, "the budget figures kept across a month end (the plan's mutant)",
     [("if (pace === null || pace.limitMinor === null || pace.month !== day.slice(0, 7)) return null;", "if (pace === null || pace.limitMinor === null) return null;")], [MONTH_END, OTHER_MONTH]),
    ('P5', SNAPSHOT, "the link words in Thai whatever the language (the plan's mutant)",
     [("return { record: t('outside.record'), scan: t('outside.scan'), log: t('outside.log') };", "return { record: 'จดรายจ่าย', scan: 'สแกนสลิป', log: 'จด' };")], [LABELS]),
    # Masking (D41, B21, Review Focus 1).
    ('W1', SNAPSHOT, 'the home face never masked',
     [('home: face(figures, facts.hidden, say),', 'home: face(figures, false, say),')], [PRIVATE]),
    ('W2', SNAPSHOT, "a masked face shows today's spending",
     [('out: masked ? HIDDEN_AMOUNT : walletMoneyText(outMinor),', 'out: walletMoneyText(outMinor),')], [B21, PRIVATE]),
    ('W3', SNAPSHOT, 'a masked face shows the side figure',
     [('side: side === null ? null : masked ? HIDDEN_AMOUNT : side.text,', 'side: side === null ? null : side.text,')], [B21, PRIVATE]),
    ('W4', SNAPSHOT, 'a masked face shows the gauge percent',
     [("gaugeText: gauge === null || masked ? null : t('outside.percent', { percent: gauge.percent }),", "gaugeText: gauge === null ? null : t('outside.percent', { percent: gauge.percent }),")], [B21, PRIVATE]),
    ('W5', SNAPSHOT, 'a masked face keeps the gauge fraction',
     [('gaugeFraction: gauge === null || masked ? null : gauge.fraction,', 'gaugeFraction: gauge === null ? null : gauge.fraction,')], [B21, PRIVATE]),
    ('W6', SNAPSHOT, 'a masked face says the amounts',
     [('spoken: masked ? hiddenWords(count, t) : shownWords(figures, side, gauge, say),', 'spoken: shownWords(figures, side, gauge, say),')], [B21, PRIVATE]),
    ('W7', SNAPSHOT, 'a masked face drops the side words',
     [('sideLabel: side === null ? null : side.label,', 'sideLabel: side === null || masked ? null : side.label,')], [B21, OVER]),
    ('W8', SNAPSHOT, 'a masked face says the gauge is hidden as the today line',
     [("return { small: line, inline: line, gauge: t('outside.spokenGaugeHidden'), rectangular: line };", 'return { small: line, inline: line, gauge: line, rectangular: line };')], [B21, PRIVATE]),
    # The side line and the gauge.
    ('W9', SNAPSHOT, 'never over',
     [('over: side !== null && side.over,', 'over: false,')], [OVER]),
    ('W10', SNAPSHOT, 'spent to the satang of the limit counts as over',
     [('if (left < 0n) {', 'if (left <= 0n) {')], [OVER]),
    ('W11', SNAPSHOT, 'the left-a-day figure shares among one day more than the face has left',
     [('const perDay = left / daysLeftOn(day);', 'const perDay = left / (daysLeftOn(day) + 1n);')], [HOME, MIDNIGHT]),
    ('W12', SNAPSHOT, 'the percent rounded up',
     [('percent: ((spent * 100n) / limit).toString()', 'percent: ((spent * 100n + limit - 1n) / limit).toString()')], [HOME]),
    ('W13', SNAPSHOT, 'the fraction not capped at 1',
     [('fraction: Number(thousandths > 1000n ? 1000n : thousandths) / 1000', 'fraction: Number(thousandths) / 1000')], [OVER]),
    ('W14', SNAPSHOT, 'a limit of zero divided by',
     [('return limit > 0n ? { limit, spent: BigInt(pace.spent.estimatedMinor) } : null;', 'return { limit, spent: BigInt(pace.spent.estimatedMinor) };')], [NO_BUDGET]),
    ('W15', SNAPSHOT, 'a missing pace read as a budget',
     [('if (pace === null || pace.limitMinor === null || pace.month', 'if (pace!.limitMinor === null || pace!.month')], [NO_BUDGET]),
    ('W16', SNAPSHOT, 'a pace without a budget read as one',
     [('if (pace === null || pace.limitMinor === null || pace.month', 'if (pace === null || pace.month')], [NO_BUDGET]),
    # What VoiceOver says.
    ('W17', SNAPSHOT, 'the gauge said with the short month',
     [("const month = monthName(figures.day.slice(0, 7), words, 'long');", "const month = monthName(figures.day.slice(0, 7), words, 'short');")], [HOME]),
    ('W18', SNAPSHOT, 'no budget said as the hidden gauge',
     [("gauge: gauge === null ? t('outside.noBudget') :", "gauge: gauge === null ? t('outside.spokenGaugeHidden') :")], [NO_BUDGET]),
    ('W19', SNAPSHOT, 'the inline family says the today line',
     [('inline: line ?? today,', 'inline: today,')], [HOME]),
    ('W20', SNAPSHOT, 'the small and rectangular families leave out the side line',
     [('const both = line === null ? today : `${today} ${line}`;', 'const both = today;')], [HOME]),
    # The entries.
    ('W21', SNAPSHOT, "tomorrow keeps today's count and spending",
     [("count: 0, outMinor: '0',", 'count: facts.todayCount, outMinor: facts.todayOutMinor,')], [MIDNIGHT]),
    ('W22', SNAPSHOT, 'the stale entry says the signed-out prompt',
     [("kind: 'stale', home: null, lock: null, prompt: t('outside.stale')", "kind: 'stale', home: null, lock: null, prompt: t('outside.signedOut')")], [STALE]),
    ('W23', SNAPSHOT, 'Vietnamese days and months in Vietnamese words, not the English lines',
     [("words: facts.locale === 'th' ? 'th' : 'en'", "words: facts.locale as 'th' | 'en'")], [VIETNAMESE]),
    ('W24', SNAPSHOT, 'the next midnight can be now itself',
     [('return (Math.floor((nowMs + BANGKOK_OFFSET_MS) / DAY_MS) + 1) * DAY_MS - BANGKOK_OFFSET_MS;', 'return Math.ceil((nowMs + BANGKOK_OFFSET_MS) / DAY_MS) * DAY_MS - BANGKOK_OFFSET_MS;')], [NEXT]),
    ('W25', SNAPSHOT, 'midnight in UTC-7 instead of Bangkok',
     [('return (Math.floor((nowMs + BANGKOK_OFFSET_MS) / DAY_MS) + 1) * DAY_MS - BANGKOK_OFFSET_MS;', 'return (Math.floor((nowMs - BANGKOK_OFFSET_MS) / DAY_MS) + 1) * DAY_MS + BANGKOK_OFFSET_MS;')], [NEXT, MIDNIGHT]),
    ('W26', SNAPSHOT, 'an entry is shown only after its start, not at it',
     [('if (entry.from <= nowMs) chosen = entry;', 'if (entry.from < nowMs) chosen = entry;')], [ENTRY_AT]),
    ('W27', SNAPSHOT, 'before every start the last entry shows',
     [('let chosen = snapshot.entries[0];', 'let chosen = snapshot.entries[snapshot.entries.length - 1];')], [ENTRY_AT]),
    ('W28', SNAPSHOT, 'the families take the other face',
     [("return family.startsWith('system') ? entry.home : entry.lock;", "return family.startsWith('system') ? entry.lock : entry.home;")], [FACE_FOR]),
    ('W29', SNAPSHOT, "sameSnapshot ignores every entry's time",
     [('(index === 0 ? { ...entry, from: 0 } : entry)', '({ ...entry, from: 0 })')], [SAME]),
    ('W30', SNAPSHOT, "sameSnapshot compares the first entry's time too",
     [('(index === 0 ? { ...entry, from: 0 } : entry)', '(entry)')], [SAME]),
    ('W31', SNAPSHOT, 'the links written as given, with whatever else they carry',
     [('return { record: links.record, today: links.today, scan: links.scan };', 'return links;')], [LABELS]),
    # dateStep.ts.
    ('D1', DATES, 'the short and long month names swapped',
     [("return (form === 'long' ? words.monthsLong : words.monthsShort)[monthIndex(month)];", "return (form === 'short' ? words.monthsLong : words.monthsShort)[monthIndex(month)];")], [MONTH_NAME, HOME]),
    ('D2', DATES, 'a month with no match read anyway',
     [('if (!match || Number(match[1]) < 1 || number < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);\n  return number - 1;', 'if (Number(match![1]) < 1 || number < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);\n  return number - 1;')], [MONTH_NAME]),
    ('D3', DATES, 'year 0 accepted',
     [('if (!match || Number(match[1]) < 1 || number < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);\n  return number - 1;', 'if (!match || number < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);\n  return number - 1;')], [MONTH_NAME]),
    ('D4', DATES, 'month 00 accepted',
     [('Number(match[1]) < 1 || number < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);\n  return number - 1;', 'Number(match[1]) < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);\n  return number - 1;')], [MONTH_NAME]),
    ('D5', DATES, 'month 13 accepted',
     [('number < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);\n  return number - 1;', 'number < 1) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);\n  return number - 1;')], [MONTH_NAME]),
    ('D6', DATES, 'the Thai day without its full stop',
     [("if (locale === 'th') return `${words.weekdaysNarrow[index]}. ${day.day}`;", "if (locale === 'th') return `${words.weekdaysNarrow[index]} ${day.day}`;")], [DAY_NAME, DAYS]),
    ('D7', DATES, 'the Thai day with the longer weekday',
     [("if (locale === 'th') return `${words.weekdaysNarrow[index]}. ${day.day}`;", "if (locale === 'th') return `${words.weekdaysShort[index]}. ${day.day}`;")], [DAY_NAME, DAYS]),
    ('D8', DATES, 'Vietnamese written as English',
     [("  if (locale === 'vi') return `${words.weekdaysNarrow[index]}, ${day.day}`;\n", '')], [DAY_NAME]),
    ('D9', DATES, 'English with the one-letter weekday',
     [('  return `${words.weekdaysShort[index]} ${day.day}`;\n}\n', '  return `${words.weekdaysNarrow[index]} ${day.day}`;\n}\n')], [DAY_NAME, DAYS]),
    # outsideCopy.draft.ts: the copy test's checks.
    ('C1', COPY, 'a line of the task missing',
     [("  'outside.widgetName': { th: 'Jotbun วันนี้', en: 'Jotbun today' },\n", '')], [LINES]),
    ('C2', COPY, 'the English with another placeholder',
     [("'outside.count': { th: '{count} รายการ', en: '{count} records' },", "'outside.count': { th: '{count} รายการ', en: '{n} records' },")], [LINES]),
    ('C3', COPY, 'a dash used as punctuation',
     [("'outside.stale': { th: 'เปิด Jotbun เพื่อดูยอดวันนี้', en: \"Open Jotbun to see today's spending\" },", "'outside.stale': { th: 'เปิด Jotbun เพื่อดูยอดวันนี้', en: \"Open Jotbun " + chr(0x2014) + " see today's spending\" },")], [LINES]),
    ('C4', COPY, 'a Thai line with no Thai',
     [("'outside.widgetName': { th: 'Jotbun วันนี้', en: 'Jotbun today' },", "'outside.widgetName': { th: 'Jotbun today', en: 'Jotbun today' },")], [LINES]),
    ('C5', COPY, 'an emoji',
     [("'outside.widgetName': { th: 'Jotbun วันนี้', en: 'Jotbun today' },", "'outside.widgetName': { th: 'Jotbun วันนี้ \U0001F407', en: 'Jotbun today' },")], [LINES]),
    ('C6', COPY, 'a key outside the outside area',
     [("'outside.widgetName':", "'widget.name':")], [LINES]),
]

FAILING = re.compile(r'^✖ (.+?) \([0-9.]+m?s\)$')


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def failures(output):
    """The failing cases and each one's first error line, from the reporter's 'failing tests' section."""
    lines = output.splitlines()
    try:
        start = lines.index('✖ failing tests:')
    except ValueError:
        return {}
    found = {}
    current = None
    for line in lines[start + 1:]:
        match = FAILING.match(line)
        if match:
            current = match.group(1)
            found[current] = None
        elif current is not None and found[current] is None and line.strip():
            found[current] = line.strip()
    return found


def main():
    root, logs = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
    wanted = set(sys.argv[3:])
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    killed = total = 0
    ok = True
    for mid, rel, what, edits, cases in MUTANTS:
        if wanted and mid not in wanted:
            continue
        total += 1
        path = os.path.join(root, rel)
        before = sha(path)
        with open(path, encoding='utf-8') as handle:
            original = handle.read()
        text = original
        for old, new in edits:
            if text.count(old) != 1:
                print(f'{mid} BAD MUTANT: target found {text.count(old)} times in {rel}: {old[:70]!r}')
                ok = False
                break
            text = text.replace(old, new)
        else:
            try:
                with open(path, 'w', encoding='utf-8') as handle:
                    handle.write(text)
                run = subprocess.run(['node', '--test', *TESTS], cwd=app, capture_output=True, text=True)
                output = run.stdout + run.stderr
                with open(os.path.join(logs, f'mutant-{mid}.log'), 'w', encoding='utf-8') as handle:
                    handle.write(output)
            finally:
                with open(path, 'w', encoding='utf-8') as handle:
                    handle.write(original)
            restored = sha(path) == before
            failed = failures(output)
            assertions = bool(failed) and all(error is not None and error.startswith('AssertionError') for error in failed.values())
            named = all(case in failed for case in cases)
            verdict = 'KILLED' if run.returncode != 0 and assertions and named else 'SURVIVED' if run.returncode == 0 else 'WRONG KILL'
            summary = re.search(r'^ℹ tests (\d+)\nℹ suites \d+\nℹ pass (\d+)\nℹ fail (\d+)', output, re.M)
            counts = f'tests {summary.group(1)} pass {summary.group(2)} fail {summary.group(3)}' if summary else 'no summary'
            print(f'{mid} {verdict}: {what} [{rel}] -> {counts}; failing: {"; ".join(sorted(failed))}; restored sha256 {"equal" if restored else "DIFFERS"}')
            if verdict == 'KILLED':
                killed += 1
            else:
                ok = False
            if not restored:
                ok = False
                print('stopping: a file was not restored')
                break
    print(f'{killed} killed, {total - killed} not killed, of {total}')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
