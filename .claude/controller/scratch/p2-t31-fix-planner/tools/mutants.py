#!/usr/bin/env python3
"""P2-T31 fix round mutation check. Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs its tests (WalletInsights.render.test.tsx
for the screen, the tabs, the bars, the data hook and the catalogue sections; the Node
tests for dateStep.ts and calendarShade.ts), restores the file byte for byte (sha256
checked) and prints one line per mutant. Exits 0 only when every mutant is killed and
every file is restored. The review's fifteen survivors (R1 to R15) are here under their
own names, against the round's code; the plan's three are H1, C8 and S2.
"""
import hashlib
import os
import re
import subprocess
import sys

BASE = 'apps/app/src/wallet/insights/'
SCREEN = BASE + 'WalletInsightsScreen.tsx'
DATA = BASE + 'insightsData.ts'
SPENDING = BASE + 'SpendingTab.tsx'
BARS = BASE + 'MonthBars.tsx'
INOUT = BASE + 'InOutTab.tsx'
CAL = BASE + 'CalendarTab.tsx'
TRAY = BASE + 'InfoTray.tsx'
SHADE = BASE + 'calendarShade.ts'
DATESTEP = 'apps/app/src/ui/dateStep.ts'
SECTIONS = 'apps/app/src/dev/catalogue/wallet/insightsSections.tsx'
SCREENS = 'apps/app/src/dev/catalogue/wallet/insightsScreens.tsx'
INDEX = 'apps/app/src/dev/catalogue/wallet/index.ts'

RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/insights/WalletInsights.render.test.tsx']
NODE_DATE = ['npm', 'run', 'test:unit', '--', 'src/ui/dateStep.test.ts']
NODE_SHADE = ['npm', 'run', 'test:unit', '--', 'src/wallet/insights/calendarShade.test.ts']
NODE = (NODE_DATE, NODE_SHADE)

LOAD_DEPS = '  }, [resources, month, today]);\n'
DAY_PAINT = "  const paint = hidden ? { fill: colors.raised, text: colors.ink, border: null } : calendarPaint(calendarShade(day.outMinor), colors.isDark);\n"
MONTH_LINE = '{ amount: hidden ? HIDDEN_AMOUNT : walletMoneyText(data.summary.expense_minor), n: calendar.daysLogged, d: daysSoFar }'
FRAME = "  const frame = day.isToday ? { borderWidth: 2, borderColor: colors.ink } : paint.border !== null ? { borderWidth: 1, borderColor: paint.border } : { borderWidth: 0 };\n"
LABEL = "  const label = hidden ? (day.isToday ? `${tc('Today')}, ${date}` : date) : day.label;\n"
COMPARE_READ = '      Promise.all(others.map((other) => resources.summary(other))),\n'
HISTORY_READ = "      readAllPages((cursor) => resources.history({ ...monthRange(month), sort: 'date_desc' }, cursor, HISTORY_MAX_LIMIT)),\n"

# (id, description, file, tests, [(old, new), ...]); each old must occur exactly once. Every mutant is expected killed.
MUTANTS = [
    # The load (M1, M6, m1, R10, n6)
    ('D1', "each new outbox reloads from loading (M1: the outbox in the load's keys)", DATA, RENDER,
     [(LOAD_DEPS, '  }, [resources, month, today, diaryView.outbox]);\n')]),
    ('D2', 'a resolved draft reloads loudly, from loading', DATA, RENDER,
     [('  useRefreshOnResolve(drafts, loaded.refresh);\n', '  useRefreshOnResolve(drafts, loaded.reload);\n')]),
    ('D3', 'a resolved draft never refreshes', DATA, RENDER, [('    if (resolved) refresh();\n', '    if (false) refresh();\n')]),
    ('D4', 'an acknowledged draft still counts as open', DATA, RENDER,
     [(".filter((command) => command.state !== 'acknowledged')", '.filter(() => true)')]),
    ('D5', "the phone's drafts never read", DATA, RENDER,
     [('  const drafts = diaryOpen ? diaryView.outbox : NO_DRAFTS;\n', '  const drafts = NO_DRAFTS;\n')]),
    ('D6', 'a diary that is not open counts as open', DATA, RENDER,
     [("  const diaryOpen = diary !== null && diaryView.phase === 'ready';\n", '  const diaryOpen = diary !== null;\n')]),
    ('D7', 'offline said with no diary open (m1)', DATA, RENDER, [('offline: unreachable && diaryOpen', 'offline: unreachable')]),
    ('D8', 'every problem said as offline', DATA, RENDER,
     [("    const unreachable = loaded.error instanceof V1Error && loaded.error.outcome === 'network';\n", '    const unreachable = true;\n')]),
    ('D9', "the month before's data handed over as this month's", DATA, RENDER,
     [("  if (loaded.state === 'ready' && loaded.data.month === month) {\n", "  if (loaded.state === 'ready') {\n")]),
    ('D10', 'a compare month that fails is drawn as ฿0 (M6)', DATA, RENDER,
     [(COMPARE_READ, "      Promise.all(others.map((other) => resources.summary(other).catch(() => ({ month: other, income_minor: '0', expense_minor: '0', balance_minor: '0', by_wallet: {}, categories: [], budget: null, as_of_revision: '0' })))),\n")]),
    ('D11', "this month's summary read twice (n6)", DATA, RENDER,
     [('    const others = months.filter((other) => other !== month);\n', '    const others = months;\n')]),
    ('D12', "the month's bar not from its own summary", DATA, RENDER,
     [('      const totals = shown === month ? summary : summaryOf.get(shown)!;\n', '      const totals = summaryOf.get(shown)!;\n')]),
    ('R10', "only the month's first history page read", DATA, RENDER,
     [(HISTORY_READ, "      resources.history({ ...monthRange(month), sort: 'date_desc' }, undefined, HISTORY_MAX_LIMIT).then((page) => ({ records: page.items, summary: page.summary, refreshSuggested: page.refresh_suggested })),\n")]),
    ('D13', 'a later page that says the diary changed is never said (m1)', DATA, RENDER,
     [('refreshSuggested: read.refreshSuggested }', 'refreshSuggested: false }')]),
    ('D14', 'a deleted record counted as money out', DATA, RENDER,
     [("  return record.deleted_at === null && record.type === 'expense';\n", "  return record.type === 'expense';\n")]),
    ('D15', 'money in counted as money out', DATA, RENDER,
     [("  return record.deleted_at === null && record.type === 'expense';\n", '  return record.deleted_at === null;\n')]),
    # The screen, its tabs and the analytics (R61)
    ('R1', 'insights_viewed on every render (the dependency array dropped)', SCREEN, RENDER,
     [('    trackInsightsViewed({ tab });\n  }, [tab]);\n', '    trackInsightsViewed({ tab });\n  });\n')]),
    ('S2', "the plan's mutant: tab 'inOut'", SCREEN, RENDER,
     [('    trackInsightsViewed({ tab });\n', "    trackInsightsViewed({ tab: tab === 'in_out' ? 'inOut' : tab });\n")]),
    ('S3', 'the first tab shown never sent', SCREEN, RENDER,
     [("  const [tab, setTab] = useState<InsightsTab>('spending');\n", "  const [tab, setTab] = useState<InsightsTab>('spending');\n  const first = useRef(true);\n"),
      ('    trackInsightsViewed({ tab });\n', '    if (first.current) { first.current = false; return; }\n    trackInsightsViewed({ tab });\n'),
      ("import { useEffect, useMemo, useState } from 'react';\n", "import { useEffect, useMemo, useRef, useState } from 'react';\n")]),
    ('R9', 'a load problem offers no Try again', SCREEN, RENDER, [('{load.problem.retry ? <PrimaryButton', '{false ? <PrimaryButton')]),
    ('S4', 'Try again for a problem a retry cannot fix', SCREEN, RENDER, [('{load.problem.retry ? <PrimaryButton', '{true ? <PrimaryButton')]),
    ('S5', 'Try again does nothing', SCREEN, RENDER, [('onPress={load.reload}', 'onPress={() => undefined}')]),
    ('S6', "the problem's title dropped (m1)", SCREEN, RENDER,
     [('        <WalletText role="h2" accessibilityRole="header">{load.problem.title}</WalletText>\n', '')]),
    ('S7', 'the offline banner never shown (m1)', SCREEN, RENDER, [('{load.offline ? <SyncBanner', '{false ? <SyncBanner')]),
    ('S8', 'entries changed meanwhile never said', SCREEN, RENDER, [('{load.data.refreshSuggested ? (', '{false ? (')]),
    ('S9', 'Refresh does nothing', SCREEN, RENDER, [('onPress={load.refresh}', 'onPress={() => undefined}')]),
    ('S10', 'no tab says it is selected', SCREEN, RENDER, [('aria-selected={selected}', 'aria-selected={false}')]),
    ('S11', 'tabs 40 pt tall', SCREEN, RENDER, [('minHeight: 44, minWidth: 44, justifyContent', 'minHeight: 40, minWidth: 44, justifyContent')]),
    ('S12', 'the calendar tab names the month twice', SCREEN, RENDER, [("{tab === 'calendar' ? null : (", '{false ? null : (')]),
    # S13 (the calendar drawn for the data's month, `calendarModel({ month: data.month, ...` in ShownTab) is equivalent
    # and not run: the tabs render only when the load's data is for the month shown, which D9 holds, so the two are equal.
    # The spending tab (m2, m8, M4, R8, R12, R13, R14, R71)
    ('R13', 'the days-left line always says 0', SPENDING, RENDER,
     [('  const daysLeft = calendar.days.filter((day) => day.date >= today).length;\n', '  const daysLeft = 0;\n')]),
    ('P2', 'today not counted in the days left (m2)', SPENDING, RENDER, [('(day) => day.date >= today', '(day) => day.date > today')]),
    ('P3', 'a month gone by says how many days are left', SPENDING, RENDER, [('        {month === monthOf(today) ? (\n', '        {true ? (\n')]),
    ('R14', 'three logged days still early', SPENDING, RENDER,
     [('  const early = logged.length < EARLY_DAYS;\n', '  const early = logged.length <= EARLY_DAYS;\n')]),
    ('P5', 'the early title always asks for three days', SPENDING, RENDER,
     [("{ n: EARLY_DAYS - logged.length }", '{ n: EARLY_DAYS }')]),
    ('P6', 'every logged day labelled with today (M4)', SPENDING, RENDER,
     [('{day ? shortDateLabel(day.date, today, dateLocale)', '{day ? shortDateLabel(today, today, dateLocale)')]),
    ('P7', 'every day so far counted as logged', SPENDING, RENDER,
     [('  const logged = calendar.days.filter((day) => day.logged);\n', '  const logged = calendar.days.filter((day) => !day.isFuture);\n')]),
    ('R8', 'the early state never says insights.noPrevious', SPENDING, RENDER, [('{early && !earlier ?', '{false ?')]),
    ('P9', 'insights.noPrevious though an earlier month has money out', SPENDING, RENDER, [('{early && !earlier ?', '{early ?')]),
    ('P10', 'an earlier month with nothing spent counts as one to compare', SPENDING, RENDER,
     [('other.month < month && BigInt(other.expenseMinor) > 0n', 'other.month < month')]),
    ('P11', "the early state's categories heading is the board's หมวดหมู่", SPENDING, RENDER,
     [("t(early ? 'insights.soFar' : 'insights.categories')", "t('insights.categories')")]),
    ('P12', 'an empty categories card with nothing logged', SPENDING, RENDER, [('      {top.length > 0 ? (\n', '      {true ? (\n')]),
    ('R12', 'every category says 1 รายการ', SPENDING, RENDER,
     [("{ count: data.records.filter((record) => isMoneyOut(record) && record.category_id === item.categoryId).length }", '{ count: 1 }')]),
    ('P14', "a category's count holds every expense", SPENDING, RENDER,
     [('isMoneyOut(record) && record.category_id === item.categoryId', 'isMoneyOut(record)')]),
    ('P15', "a category row opens History by the category's name (R71)", SPENDING, RENDER,
     [('params: { category: item.categoryId } })', 'params: { category: item.name } })')]),
    ('P16', 'the bars never given the budget', SPENDING, RENDER,
     [('budgetMinor={summary.budget?.overall_limit_minor ?? null}', 'budgetMinor={null}')]),
    ('P17', 'the bars never told about private mode', SPENDING, RENDER, [('budgetMinor={summary.budget?.overall_limit_minor ?? null} hidden={hidden}', 'budgetMinor={summary.budget?.overall_limit_minor ?? null} hidden={false}')]),
    ('P18', 'the info button opens nothing', SPENDING, RENDER, [('onPress={() => setExplaining(true)}', 'onPress={() => undefined}')]),
    ('P19', 'a category no longer listed has no tile', SPENDING, RENDER,
     [('byId.get(item.categoryId) ?? unknownCategory(item.categoryId)', 'byId.get(item.categoryId)!')]),
    # The bars (M2, m7, m10, R2, R3, R5, n1)
    ('B1', "the bars on their own scale, not the budget's (M2)", BARS, RENDER,
     [('larger(top, BigInt(bar.minor)), budget === null ? 0n : BigInt(budget))', 'larger(top, BigInt(bar.minor)), 0n)')]),
    ('B2', 'the scale ignores the months', BARS, RENDER, [('bars.reduce((top, bar) => larger(top, BigInt(bar.minor)),', 'bars.reduce((top) => top,')]),
    ('B3', 'a small month draws flat', BARS, RENDER, [('  return rise < MIN_RISE ? MIN_RISE : rise;\n', '  return rise;\n')]),
    ('B4', 'a month with nothing out draws a stub', BARS, RENDER, [('  if (value <= 0n) return 0;\n', '')]),
    ('B5', "the line's baseline is not the bars' (M2)", BARS, RENDER,
     [('            y1={CHART.baseline - riseOf(budget, ceiling)}\n', '            y1={CHART.baseline - 5 - riseOf(budget, ceiling)}\n')]),
    ('R2', "the chart's spoken label drops this month's amount", BARS, RENDER,
     [('${bars.map((bar) => (hidden ? bar.label : bar.spoken))', '${bars.filter((bar) => !bar.current).map((bar) => (hidden ? bar.label : bar.spoken))')]),
    ('B7', "private mode: the chart's label keeps the amounts", BARS, RENDER, [('(hidden ? bar.label : bar.spoken)', '(bar.spoken)')]),
    ('R5', 'private mode: the budget label shows the budget', BARS, RENDER,
     [('{ amount: hidden ? HIDDEN_AMOUNT : walletMoneyText(budget) }', '{ amount: walletMoneyText(budget) }')]),
    ('B9', 'the budget label in the exact form (m10)', BARS, RENDER,
     [('{ amount: hidden ? HIDDEN_AMOUNT : walletMoneyText(budget) }', '{ amount: hidden ? HIDDEN_AMOUNT : walletMoneyText(budget, { exact: true }) }')]),
    ('R3', 'five bars drawn, not six', BARS, RENDER, [('        {bars.map((bar, index) => {\n', '        {bars.slice(1).map((bar, index) => {\n')]),
    ('B11', 'this month drawn in barPast', BARS, RENDER, [('fill={bar.current ? colors.barNow : colors.barPast}', 'fill={colors.barPast}')]),
    ('B12', "the months cut from their long names (m7)", BARS, RENDER,
     [('{monthShortLabel(bar.month, dateLocale)}', '{monthLabel(bar.month, dateLocale).slice(0, 4)}')]),
    # The in-and-out tab (W21, m4, m9, R4, R15)
    ('R15', 'money in drawn in ink, with no plus', INOUT, RENDER,
     [('<WalletAmount minor={summary.income_minor} sign="income" size={28}', '<WalletAmount minor={summary.income_minor} size={28}')]),
    ('R4', 'private mode: the kept line shows its amount', INOUT, RENDER,
     [('  const amount = hidden ? HIDDEN_AMOUNT : walletMoneyText(kept.minor);\n', '  const amount = walletMoneyText(kept.minor);\n')]),
    ('I3', 'the kept line a bare amount (m9)', INOUT, RENDER, [("kept.kind === 'kept' ? t('insights.kept', { amount })", "kept.kind === 'kept' ? amount")]),
    ('I4', 'in and out matched said as more out', INOUT, RENDER, [("  if (kept.kind === 'even') return kept.text;\n", '')]),
    ('I5', 'money in drawn in barPast', INOUT, RENDER, [('height={inRise} rx={4} fill={colors.violet}', 'height={inRise} rx={4} fill={colors.barPast}')]),
    ('I6', 'money out drawn in barPast', INOUT, RENDER, [('height={outRise} rx={4} fill={colors.barNow}', 'height={outRise} rx={4} fill={colors.barPast}')]),
    ('I7', 'the in-and-out chart unnamed (m4)', INOUT, RENDER, [("      accessibilityLabel={`${name}: ${months.join(', ')}`}\n", '')]),
    ('I8', "private mode: the in-and-out chart's label keeps the amounts", INOUT, RENDER,
     [('  const months = compare.map((other) => (hidden\n', '  const months = compare.map((other) => (false\n')]),
    ('I9', 'the pairs scaled by money out only', INOUT, RENDER,
     [('larger(larger(top, BigInt(other.incomeMinor)), BigInt(other.expenseMinor))', 'larger(top, BigInt(other.expenseMinor))')]),
    # The calendar (M3, M5, M7, m3, m5, m7, m11, n4, n5, R6, R7, R11)
    ('C1', "the month line rounded through a JS number (M5)", CAL, RENDER,
     [(MONTH_LINE, "{ amount: hidden ? HIDDEN_AMOUNT : `฿${Math.round(Number(data.summary.expense_minor) / 100).toLocaleString()}`, n: calendar.daysLogged, d: daysSoFar }")]),
    ('R6', "private mode: the calendar's month line shows the month's spending", CAL, RENDER,
     [(MONTH_LINE, '{ amount: walletMoneyText(data.summary.expense_minor), n: calendar.daysLogged, d: daysSoFar }')]),
    ('C3', 'the days so far taken as the whole month', CAL, RENDER,
     [('  const daysSoFar = calendar.days.filter((day) => !day.isFuture).length;\n', '  const daysSoFar = calendar.days.length;\n')]),
    ('R7', 'next month never disabled', CAL, RENDER, [('disabled={month >= thisMonth}', 'disabled={false}')]),
    ('C5', 'previous steps forward', CAL, RENDER, [('onMonthChange(shiftMonth(month, -1))', 'onMonthChange(shiftMonth(month, 1))')]),
    ('C6', 'the weekday initials always Thai (M7)', CAL, RENDER, [('{weekdayInitials(dateLocale).map(', "{weekdayInitials('th').map(")]),
    ('C7', "private mode: an empty day keeps its hairline (M3)", CAL, RENDER,
     [(DAY_PAINT, "  const paint = hidden ? { fill: colors.raised, text: colors.ink, border: calendarPaint(calendarShade(day.outMinor), colors.isDark).border } : calendarPaint(calendarShade(day.outMinor), colors.isDark);\n")]),
    ('C8', "the plan's mutant: the shades kept in private mode", CAL, RENDER,
     [(DAY_PAINT, '  const paint = calendarPaint(calendarShade(day.outMinor), colors.isDark);\n')]),
    ('R11', "private mode: the day numbers keep the step's colour", CAL, RENDER,
     [(DAY_PAINT, "  const paint = hidden ? { fill: colors.raised, text: calendarPaint(calendarShade(day.outMinor), colors.isDark).text, border: null } : calendarPaint(calendarShade(day.outMinor), colors.isDark);\n")]),
    ('C10', 'today framed 1 pt', CAL, RENDER, [(FRAME, FRAME.replace('{ borderWidth: 2, borderColor: colors.ink }', '{ borderWidth: 1, borderColor: colors.ink }'))]),
    ('C11', 'an empty day loses its hairline', CAL, RENDER, [(FRAME, "  const frame = day.isToday ? { borderWidth: 2, borderColor: colors.ink } : { borderWidth: 0 };\n")]),
    ('C12', 'a day button names its date alone (m3)', CAL, RENDER, [(LABEL, '  const label = hidden ? (day.isToday ? `${tc(\'Today\')}, ${date}` : date) : date;\n')]),
    ('C13', "private mode: a day button says its money out", CAL, RENDER, [(LABEL, '  const label = day.label;\n')]),
    ('C14', 'private mode: today not named', CAL, RENDER, [(LABEL, '  const label = hidden ? date : day.label;\n')]),
    ('C15', "private mode: a day shows its amount", CAL, RENDER, [('{!hidden && BigInt(day.outMinor) > 0n ? (', '{BigInt(day.outMinor) > 0n ? (')]),
    ('C16', 'a day with nothing spent shows 0', CAL, RENDER, [('{!hidden && BigInt(day.outMinor) > 0n ? (', '{!hidden && BigInt(day.outMinor) >= 0n ? (')]),
    ('C17', "a day's baht rounded through a JS number (M5)", CAL, RENDER,
     [('>{dayBaht(day.outMinor)}</GridText>', '>{Math.round(Number(day.outMinor) / 100).toLocaleString()}</GridText>')]),
    ('C18', "the days shaded by the month's heat, not the fixed steps (W22)", CAL, RENDER,
     [(DAY_PAINT, "  const paint = hidden ? { fill: colors.raised, text: colors.ink, border: null } : calendarPaint(day.step, colors.isDark);\n")]),
    ('C19', 'future days are buttons', CAL, RENDER, [('              if (day.isFuture) {\n', '              if (false) {\n')]),
    ('C20', 'future days reach screen readers', CAL, RENDER,
     [("                    {...DECORATIVE}\n                    testID={`calendar-future-day-${day.dayOfMonth}`}\n", "                    testID={`calendar-future-day-${day.dayOfMonth}`}\n")]),
    ('C21', "private mode: the legend's values shown (R65)", CAL, RENDER, [('{hidden ? null : <GridText size={11}', '{false ? null : <GridText size={11}')]),
    ('C22', "private mode: the legend's unit shown", CAL, RENDER, [('        {hidden ? null : (\n          <WalletText role="caption" tone="quietOnGround" maxFontSizeMultiplier={LARGEST_STANDARD_SCALE} testID="legend-unit">', '        {false ? null : (\n          <WalletText role="caption" tone="quietOnGround" maxFontSizeMultiplier={LARGEST_STANDARD_SCALE} testID="legend-unit">')]),
    ('C23', "private mode: the legend says its values (n4)", CAL, RENDER,
     [("accessibilityLabel={hidden ? t('insights.legendToday') : `${t('insights.legend')} ${t('insights.legendToday')}`}", "accessibilityLabel={`${t('insights.legend')} ${t('insights.legendToday')}`}")]),
    ('C24', "the legend's last value read past the limits", CAL, RENDER, [('  if (step < limits.length) return', '  if (step <= limits.length) return')]),
    ('C25', 'the per-day unit always Thai (M7)', CAL, RENDER, [("{t('insights.perDay')}", "{'บาท\\nต่อวัน'}")]),
    ('C26', 'วันนี้ always Thai on the chosen day (M7)', CAL, RENDER, [("`${heading} · ${t('insights.today')}`", '`${heading} · วันนี้`')]),
    ('C27', 'the chosen day not through dateStep (m7)', CAL, RENDER,
     [('  const heading = shortDateLabel(chosen, today, dateLocale);\n', '  const heading = `${chosen.slice(8)} ${monthLabel(month, dateLocale)}`;\n')]),
    ('C28', 'the chosen day never says today', CAL, RENDER, [("{chosen === today ? `${heading} · ${t('insights.today')}` : heading}", '{heading}')]),
    ('C29', "a month gone by opens on today's date", CAL, RENDER,
     [('useState(() => (month === thisMonth ? today : `${month}-01`))', 'useState(() => today)')]),
    ('C30', 'choosing a day does nothing', CAL, RENDER, [('onPress={() => onChoose(day.date)}', 'onPress={() => undefined}')]),
    ('C31', "the chosen day lists the month's records", CAL, RENDER, [('isMoneyOut(record) && record.occurred_on === chosen', 'isMoneyOut(record)')]),
    ('C32', 'a built-in category unnamed on the chosen day (m5)', CAL, RENDER,
     [("  const categoryText = category ? categoryName(category, tc) : tc('Category');\n", "  const categoryText = category?.label ?? tc('Category');\n")]),
    ('C33', 'the wallet left off the chosen day (m5)', CAL, RENDER, [('{wallet ? `${categoryText} · ${wallet.name}` : categoryText}', '{categoryText}')]),
    ('C34', 'a record whose wallet is not listed', CAL, RENDER, [('{wallet ? `${categoryText} · ${wallet.name}` : categoryText}', '{`${categoryText} · ${wallet!.name}`}')]),
    ('C35', 'a record with no merchant or note named รายการ (M7)', CAL, RENDER, [('{record.merchant ?? record.note ?? categoryText}', "{record.merchant ?? record.note ?? 'รายการ'}")]),
    ('C36', "the chosen day's total never added up", CAL, RENDER, [('sum + BigInt(record.amount_minor), 0n)', 'sum, 0n)')]),
    ('C37', 'a day 43 pt wide (m11)', CAL, RENDER, [('const CELL = { flex: 1, minWidth: 44,', 'const CELL = { flex: 1, minWidth: 43,')]),
    ('C38', "the grid's gaps 6 pt, below 44 pt a day on a 375 pt phone (m11)", CAL, RENDER, [('const CELL_GAP = 4;', 'const CELL_GAP = 6;')]),
    ('C39', "the grid's numbers grow to the body's scale (m11)", CAL, RENDER, [('      maxFontSizeMultiplier={LARGEST_STANDARD_SCALE}\n      style={{ fontFamily: LATIN_UI_FONT_FAMILY', '      maxFontSizeMultiplier={3.12}\n      style={{ fontFamily: LATIN_UI_FONT_FAMILY')]),
    ('C40', "the grid's numbers in Anuphan (n5)", CAL, RENDER, [('style={{ fontFamily: LATIN_UI_FONT_FAMILY, fontWeight: weight', "style={{ fontFamily: 'Anuphan', fontWeight: weight")]),
    ('C41', 'a day a fixed 50 pt tall (m11)', CAL, RENDER, [('minWidth: 44, minHeight: 50, borderRadius: 12', 'minWidth: 44, height: 50, borderRadius: 12')]),
    # The info tray
    ('F1', 'the tray explains nothing', TRAY, RENDER, [("{t('insights.spentExplain')}", "{t('insights.whatIsThis')}")]),
    # calendarShade.ts (Node)
    ('H1', "the plan's mutant: ฿200 is step 2", SHADE, NODE_SHADE, [('out <= BigInt(baht) * 100n', 'out < BigInt(baht) * 100n')]),
    ('H2', 'above ฿2,000 is step 4', SHADE, NODE_SHADE, [('step === -1 ? CALENDAR_STEP_LIMITS_BAHT.length : step', 'step === -1 ? 4 : step')]),
    ('H3', 'the limits read as tenths of baht', SHADE, NODE_SHADE, [('BigInt(baht) * 100n', 'BigInt(baht) * 10n')]),
    # dateStep.ts (Node)
    ('T1', "a year 0 month named", DATESTEP, NODE_DATE, [("  if (!match || Number(match[1]) < 1 || number < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);\n  return WORDS[locale].monthsShort[number - 1];\n", "  if (!match || number < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);\n  return WORDS[locale].monthsShort[number - 1];\n")]),
    ('T2', 'month 00 named', DATESTEP, NODE_DATE, [("  if (!match || Number(match[1]) < 1 || number < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);\n  return WORDS[locale].monthsShort[number - 1];\n", "  if (!match || Number(match[1]) < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);\n  return WORDS[locale].monthsShort[number - 1];\n")]),
    ('T3', 'month 13 named', DATESTEP, NODE_DATE, [("  if (!match || Number(match[1]) < 1 || number < 1 || number > 12) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);\n  return WORDS[locale].monthsShort[number - 1];\n", "  if (!match || Number(match[1]) < 1 || number < 1 || number > 13) throw new TypeError(`Expected a YYYY-MM month, got ${month}.`);\n  return WORDS[locale].monthsShort[number - 1];\n")]),
    ('T4', "another year's date written without its year", DATESTEP, NODE_DATE, [('  return shortDate(day, locale, day.year !== partsOf(today).year);\n', '  return shortDate(day, locale, false);\n')]),
    ('T5', 'today written as วันนี้', DATESTEP, NODE_DATE, [('  return shortDate(day, locale, day.year !== partsOf(today).year);\n', '  return dayLabel(date, today, locale).text;\n')]),
    # The catalogue (m6)
    ('K1', "the sections back in 'Kit'", SECTIONS, RENDER, [("  group: 'Screens',\n", "  group: 'Kit',\n")]),
    ('K2', 'the sections not drawn as whole screens', SECTIONS, RENDER, [("  layout: 'screen',\n", '')]),
    ('K3', "nothing drawn while the screen's module loads", SECTIONS, RENDER, [('    <Suspense fallback={<Loading />}>\n', '    <Suspense fallback={null}>\n')]),
    ('K4', 'the insights sections left out of the catalogue', INDEX, RENDER, [('  ...WALLET_INSIGHTS_SECTIONS,\n', '')]),
    ('K5', 'the private calendar without private mode', SCREENS, RENDER, [('    render: () => <PrivateInsights>{insights()}</PrivateInsights>,\n', '    render: insights,\n')]),
    ('K6', 'the in-and-out section on the spending tab', SCREENS, RENDER,
     [("    script: () => [shown('insights-month-bars'), tab('in_out'), shown('in-out-paired-bars')],\n", "    script: () => [shown('insights-month-bars')],\n")]),
    ('K7', "the first days drawn on wc-calendar's month", SCREENS, RENDER,
     [("    fixture: () => fakes(FIRST_DAYS),\n", '    fixture: () => fakes([...OCTOBER, ...BEFORE]),\n')]),
    ('K8', 'the largest amount drawn on an ordinary month', SCREENS, RENDER,
     [('    fixture: () => fakes(LARGEST),\n', '    fixture: () => fakes([...OCTOBER, ...BEFORE]),\n')]),
]

SUMMARY = re.compile(r'^\s*Tests\s+(.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
NODE_COUNT = re.compile(r'^ℹ (tests|pass|fail) (\d+)', re.M)
NODE_FAILED = re.compile(r'^✖ (.+?) \([\d.]+ms\)$', re.M)
ANSI = re.compile(r'\x1b\[[0-9;]*m')


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def main():
    root, logs = sys.argv[1], sys.argv[2]
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    wanted = set(sys.argv[3:])
    unexpected = 0
    killed = survived = 0
    for ident, description, rel, command, edits in MUTANTS:
        if wanted and ident not in wanted:
            continue
        path = os.path.join(root, rel)
        with open(path, 'rb') as handle:
            original = handle.read()
        before = hashlib.sha256(original).hexdigest()
        text = original.decode('utf-8')
        for old, new in edits:
            count = text.count(old)
            if count != 1:
                print(f'{ident} SETUP ERROR: {count} matches for {old!r} in {rel}', flush=True)
                sys.exit(2)
            text = text.replace(old, new)
        try:
            with open(path, 'wb') as handle:
                handle.write(text.encode('utf-8'))
            run = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=1200)
            output = ANSI.sub('', run.stdout + run.stderr)
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        if command in NODE:
            totals = dict(NODE_COUNT.findall(output))
            summary = f"{totals.get('fail', '?')} failed | {totals.get('pass', '?')} passed ({totals.get('tests', '?')})"
            failed = [name for name in NODE_FAILED.findall(output) if name != 'failing tests:']
        else:
            found = SUMMARY.findall(output)
            summary = found[-1] if found else 'no summary'
            failed = FAILED.findall(output)
        assertions = output.count('AssertionError')
        outcome = 'killed' if run.returncode != 0 else 'survived'
        if outcome == 'killed':
            killed += 1
        else:
            survived += 1
        mark = 'KILLED' if outcome == 'killed' else 'SURVIVED'
        first = f' -> {failed[0].strip()}' if failed else ''
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        print(f'{ident} {mark}: {description}{first} [{os.path.basename(rel)}; Tests {summary}; AssertionError x{assertions}; {restored}]', flush=True)
        if outcome != 'killed' or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()
