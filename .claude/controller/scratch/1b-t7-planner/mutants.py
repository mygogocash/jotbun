#!/usr/bin/env python3
"""1B-T7 mutation check. Applies each mutant (one or more exact text
replacements in one file), runs the focused workers file
(test/workers/ai.test.ts), restores the file byte for byte, and reports the
failing cases.

Usage (take the heavy lock first, release it after):
  python3 -I mutants.py <apps/edge directory> <scratch directory> [LABEL ...]
  python3 -I mutants.py --check <apps/edge directory>   (no lock needed: checks
      that each mutant's old text occurs exactly once in its file, and that
      every required case name is a case of the test file)

The scratch directory receives the backup (mutant.keep) and one log per mutant
under mutant-logs/. Exit status 1 if a mutant fails to apply, a restore differs
from the backup, or a mutant leaves any of its REQUIRED cases passing.
"""
import filecmp
import os
import re
import shutil
import subprocess
import sys

AI = 'src/vault/ai.ts'
SV = 'src/v1/ai/service.ts'
RO = 'src/v1/ai/routes.ts'
RT = 'src/v1/routes.ts'

F = 'ai.test.ts'
T = f'test/workers/{F}'


def case(name: str) -> str:
    return f'{F}: {name}'


# Required cases, by the names the test file gives them.
OFF_UNTIL = case('AI is off until the user agrees to the current notice')
NOTICE = case('turning AI on needs the current notice version; tips can be set alone')
OTHER_NOTICE = case('consent to another notice version does not count: the companion reads off, the routes that need consent refuse, and the note is the plain facts')
GROUNDED_DRAFT = case('turns a sentence into a grounded draft, asking Claude through the shared settings')
NOT_CONFIGURED = case('without AI configured, answers from the rules and spends no uses')
DAILY_LIMIT = case('stops at the daily limit until the next Bangkok day')
CHOICES = case("the model sees only the active wallets' and categories' ids and names, and a date more than a day from the server's is replaced")
VAULT_CLOCK = case("the day's uses follow the vault clock in Bangkok: the last use is allowed, the next waits for midnight, and counts older than 35 days are forgotten")
BANK = case("a slip's bank name is trimmed and cut to 60 characters, and anything else reads null")
NO_CONSENT_NOTE = case('without consent: the plain facts, and no model call')
CLAUDES_WORDS = case('uses Claude’s words only when every number is one of the facts')
NOTE_WORDS = case("the note's words may use the day's date and every number of its facts, and nothing else, in at most 200 characters")
READ_ONLY_TOOL = case('answers through a read-only tool and returns the figures it used')
BAD_INPUT = case('a bad tool input is reported back to Claude, not run')
ALLOWANCE = case("a tool's allowance reaches the grounding check")
SIGNED_OUT_ASK = case('a session signed out while Ask Bun runs is refused at its next tool step, and no tool reads the records')
FIVE_TURNS = case('Ask Bun stops after five tool turns and answers from the figures it read')
TWO_TOOLS = case('two tools in one turn both run, and their results go back to Claude together')
ASK_FAILS = case('Ask Bun answers from the figures it read when a later turn fails, and is paused when it read none')
ENV = case('with no model given, the env decides: AI needs AI_ENABLED and an API key, and AI_MODEL names the model')
USE_FIRST = case('every model call costs its use before it is made: a failed call still counts, and at the limit nothing is asked')
WITHOUT_AI = case('without AI, a slip and a question are 503 AI_PAUSED and spend no use, and the note is the plain facts')
FIRST_STEP = case('each AI route is refused at its first step when a newer policy is pending, the session ended or the account stopped being active, before any model call')
INPUT = case('the note and Ask Bun read their input before any step, and a HEAD on an AI read answers its GET with no body')
FACTS = case("the day's facts come from the vault's records in dayFacts' order: over budget first, then today, the pace, the week, the top category and the month")
TOTALS = case('spending_total and category_totals read the records runTool read, and allow each number they return')
PLACES = case('top_merchants and budget_status read the records runTool read, and allow each number they return')
LIMITS = case('category_totals answers at most 12 categories and top_merchants at most 8 places, largest first')
REFUSED = case('a tool input the tool refuses comes back as its error, and an unknown tool is refused by name')

SPENDING_SQL = """            WHERE t.deleted_at IS NULL AND t.type = ? AND t.occurred_on BETWEEN ? AND ?
              AND (? IS NULL OR t.category_id = ?)`,
          type,
          from,
          through,
          category,
          category,
"""

# (label, description, file, [(old, new), ...], required cases)
MUTANTS = [
    # The plan's two (Step 5 of the task).
    ('M1', "Tell Bun's use is counted after the model call", SV,
     [("    if (!this.deps.send) return rules()\n    await this.consume(s, 'parse')\n", '    if (!this.deps.send) return rules()\n'),
      ('      const drafts = sanitizeDrafts(finishedJson(message), ctx, request.text)\n', "      await this.consume(s, 'parse')\n      const drafts = sanitizeDrafts(finishedJson(message), ctx, request.text)\n")],
     {DAILY_LIMIT, USE_FIRST}),
    ('M2', "the tool reply's allowance is dropped (empty)", AI,
     [('    return { result, figures, allow: allowed.allow }', '    return { result, figures, allow: { satang: [], counts: [], dates: [] } }')],
     {ALLOWANCE, READ_ONLY_TOOL, TOTALS}),
    # Consent and the daily uses (V1 to V12).
    ('V1', 'consent ignores the notice version', AI,
     [('const consented = (prefs: AiPreferences): boolean => prefs.companion && prefs.notice_version === AI_NOTICE_VERSION',
       'const consented = (prefs: AiPreferences): boolean => prefs.companion')],
     {OTHER_NOTICE}),
    ('V2', "the preferences read today's uses by the real clock", AI,
     [("'SELECT feature, uses FROM ai_usage WHERE day = ?', bangkokDate(c.now)", "'SELECT feature, uses FROM ai_usage WHERE day = ?', bangkokDate(new Date())")],
     {VAULT_CLOCK}),
    ('V3', 'the uses left ignore the uses made', AI,
     [('Math.max(0, AI_DAILY_LIMITS[feature] - (usedBy.get(feature) ?? 0))', 'Math.max(0, AI_DAILY_LIMITS[feature])')],
     {GROUNDED_DRAFT, USE_FIRST}),
    ('V4', 'an update does not keep the stored choices', AI,
     [('  const next: AiPreferences = { ...storedPreferences(c), ...update }', '  const next: AiPreferences = { companion: false, cashback_tips: false, notice_version: null, ...update }')],
     {NOTICE}),
    ('V5', 'turning AI on does not need the current notice', AI,
     [("  if (next.companion && next.notice_version !== AI_NOTICE_VERSION) {\n    throw new ProblemException(403, 'AI_CONSENT_REQUIRED', { messageKey: 'errors.ai_notice_required' })\n  }\n", '')],
     {NOTICE}),
    ('V6', 'the draft context has no wallets', AI,
     [('wallets: listWallets(c), categories: listCategories(c) }', 'wallets: [], categories: listCategories(c) }')],
     {GROUNDED_DRAFT}),
    ('V7', 'the last use of the day is refused (>=)', AI,
     [('  if (uses > AI_DAILY_LIMITS[feature]) throw', '  if (uses >= AI_DAILY_LIMITS[feature]) throw')],
     {VAULT_CLOCK}),
    ('V8', 'no daily limit', AI,
     [("  if (uses > AI_DAILY_LIMITS[feature]) throw new ProblemException(429, 'AI_LIMIT_REACHED', { retryAfterSeconds: secondsToBangkokMidnight(c.now) })\n", '')],
     {DAILY_LIMIT, USE_FIRST}),
    ('V9', 'the retry waits for midnight UTC', AI,
     [('  const next = Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth(), bangkok.getUTCDate() + 1) - 7 * 3_600_000',
       '  const next = Date.UTC(bangkok.getUTCFullYear(), bangkok.getUTCMonth(), bangkok.getUTCDate() + 1)')],
     {VAULT_CLOCK}),
    ('V10', "a use is counted on the real clock's day", AI,
     [('  const today = bangkokDate(c.now)\n  c.sql.exec(`DELETE FROM ai_usage', '  const today = bangkokDate(new Date())\n  c.sql.exec(`DELETE FROM ai_usage')],
     {VAULT_CLOCK}),
    ('V11', 'old daily counts are never forgotten', AI,
     [("  c.sql.exec(`DELETE FROM ai_usage WHERE day < date(?, '-${USAGE_KEEP_DAYS} days')`, today)\n", '')],
     {VAULT_CLOCK}),
    ('V12', 'the count from exactly 35 days ago is forgotten too', AI,
     [("WHERE day < date(?, '-${USAGE_KEEP_DAYS} days')", "WHERE day <= date(?, '-${USAGE_KEEP_DAYS} days')")],
     {VAULT_CLOCK}),
    # The day's facts (V13 to V27).
    ('V13', "today's spending counts every type", AI,
     [("FROM transactions t WHERE t.deleted_at IS NULL AND t.type = 'expense' AND t.occurred_on = ?", 'FROM transactions t WHERE t.deleted_at IS NULL AND t.occurred_on = ?')],
     {FACTS}),
    ('V14', "today's spending counts deleted records", AI,
     [("FROM transactions t WHERE t.deleted_at IS NULL AND t.type = 'expense' AND t.occurred_on = ?", "FROM transactions t WHERE t.type = 'expense' AND t.occurred_on = ?")],
     {FACTS}),
    ('V15', 'the week counts its eighth day back', AI,
     [("t.occurred_on > date(?, '-7 days')", "t.occurred_on >= date(?, '-7 days')")],
     {FACTS}),
    ('V16', 'the week counts days after the date', AI,
     [("        WHERE t.deleted_at IS NULL AND t.occurred_on > date(?, '-7 days') AND t.occurred_on <= ?`,\n      date,\n      date,\n",
       "        WHERE t.deleted_at IS NULL AND t.occurred_on > date(?, '-7 days')`,\n      date,\n")],
     {FACTS}),
    ('V17', 'the week counts deleted records', AI,
     [("        WHERE t.deleted_at IS NULL AND t.occurred_on > date(?, '-7 days')", "        WHERE t.occurred_on > date(?, '-7 days')")],
     {FACTS}),
    ('V18', 'a budget used to the last satang is over budget', AI,
     [('  if (totals.budget && BigInt(totals.budget.remaining_minor) < 0n) {', '  if (totals.budget && BigInt(totals.budget.remaining_minor) <= 0n) {')],
     {FACTS}),
    ('V19', 'the pace needs money left', AI,
     [('  if (totals.budget && BigInt(totals.budget.remaining_minor) >= 0n) {', '  if (totals.budget && BigInt(totals.budget.remaining_minor) > 0n) {')],
     {FACTS}),
    ('V20', 'the days left leave out today', AI,
     [('    const daysLeft = daysInMonth(month) - Number(date.slice(8)) + 1\n', '    const daysLeft = daysInMonth(month) - Number(date.slice(8))\n')],
     {FACTS}),
    ('V21', 'the days over budget count today', AI,
     [('days: daysInMonth(month) - Number(date.slice(8)) })', 'days: daysInMonth(month) - Number(date.slice(8)) + 1 })')],
     {FACTS}),
    ('V22', 'the pace per day is the whole budget left', AI,
     [("amount_minor: (BigInt(totals.budget.remaining_minor) / BigInt(daysLeft)).toString(), days: daysLeft })", 'amount_minor: totals.budget.remaining_minor, days: daysLeft })')],
     {FACTS}),
    ('V23', 'the top category is the smallest', AI,
     [('(BigInt(b.total_minor) > BigInt(a.total_minor) ? 1 : BigInt(b.total_minor) < BigInt(a.total_minor) ? -1 : 0)',
       '(BigInt(b.total_minor) > BigInt(a.total_minor) ? -1 : BigInt(b.total_minor) < BigInt(a.total_minor) ? 1 : 0)')],
     {FACTS}),
    ('V24', 'the top category may be an income category', AI,
     [("    .filter((category) => category.type === 'expense')\n", '')],
     {FACTS}),
    ('V25', "the top category's share is of the month's income", AI,
     [('(BigInt(top.total_minor) * 100n) / BigInt(totals.expense_minor)', '(BigInt(top.total_minor) * 100n) / BigInt(totals.income_minor)')],
     {FACTS}),
    ('V26', "the top category's label is dropped", AI,
     [("category_key: name?.builtin_key ?? null, category_label: name?.label ?? null })", 'category_key: name?.builtin_key ?? null, category_label: null })')],
     {FACTS}),
    ('V27', "the month's income is said even when it is none", AI,
     [('  if (BigInt(totals.income_minor) > 0n) facts.push', '  if (BigInt(totals.income_minor) >= 0n) facts.push')],
     {FACTS}),
    # Ask Bun's tools (V28 to V52).
    ('V28', 'spending_total reads any type it is given', AI,
     [("      const { from, through } = dates(input)\n      const type = input.type === 'income' ? 'income' : 'expense'\n      const category = ",
       '      const { from, through } = dates(input)\n      const type = String(input.type)\n      const category = ')],
     {TOTALS}),
    ('V29', 'a category the person does not have filters by its id', AI,
     [("typeof input.category_id === 'string' && names.has(input.category_id) ? input.category_id : null", "typeof input.category_id === 'string' ? input.category_id : null")],
     {TOTALS}),
    ('V30', 'spending_total counts deleted records', AI,
     [(SPENDING_SQL, SPENDING_SQL.replace('WHERE t.deleted_at IS NULL AND t.type = ?', 'WHERE t.type = ?'))],
     {TOTALS}),
    ('V31', 'spending_total ignores the category', AI,
     [(SPENDING_SQL, "            WHERE t.deleted_at IS NULL AND t.type = ? AND t.occurred_on BETWEEN ? AND ?`,\n          type,\n          from,\n          through,\n")],
     {TOTALS}),
    ('V32', "spending_total does not allow its count", AI,
     [('      allowed.addCount(row.n).addDate(from).addDate(through)\n', '      allowed.addDate(from).addDate(through)\n')],
     {ALLOWANCE, TOTALS}),
    ('V33', "spending_total does not allow its period's dates", AI,
     [('      allowed.addCount(row.n).addDate(from).addDate(through)\n', '      allowed.addCount(row.n)\n')],
     {ALLOWANCE, TOTALS}),
    ('V34', 'category_totals counts deleted records', AI,
     [('            WHERE t.deleted_at IS NULL AND t.type = ? AND t.occurred_on BETWEEN ? AND ?\n            GROUP BY t.category_id',
       '            WHERE t.type = ? AND t.occurred_on BETWEEN ? AND ?\n            GROUP BY t.category_id')],
     {TOTALS}),
    ('V35', 'category_totals answers the smallest first', AI,
     [('GROUP BY t.category_id ORDER BY sum(t.amount_minor) DESC LIMIT 12', 'GROUP BY t.category_id ORDER BY sum(t.amount_minor) LIMIT 12')],
     {TOTALS, LIMITS}),
    ('V36', 'category_totals answers every category', AI,
     [('ORDER BY sum(t.amount_minor) DESC LIMIT 12', 'ORDER BY sum(t.amount_minor) DESC')],
     {LIMITS}),
    ('V37', "category_totals does not allow its counts", AI,
     [('      for (const r of rows) allowed.addCount(r.n)\n      return { result: rows.map((r) => ({ category:', '      return { result: rows.map((r) => ({ category:')],
     {TOTALS, LIMITS}),
    ('V38', 'top_merchants reads income too', AI,
     [("FROM transactions t WHERE t.deleted_at IS NULL AND t.type = 'expense' AND t.occurred_on BETWEEN ? AND ?",
       'FROM transactions t WHERE t.deleted_at IS NULL AND t.occurred_on BETWEEN ? AND ?')],
     {PLACES}),
    ('V39', 'top_merchants counts deleted records', AI,
     [("FROM transactions t WHERE t.deleted_at IS NULL AND t.type = 'expense' AND t.occurred_on BETWEEN ? AND ?",
       "FROM transactions t WHERE t.type = 'expense' AND t.occurred_on BETWEEN ? AND ?")],
     {PLACES}),
    ('V40', 'top_merchants names a place by its note first', AI,
     [("SELECT coalesce(nullif(t.merchant, ''), nullif(t.note, '')) AS merchant", "SELECT coalesce(nullif(t.note, ''), nullif(t.merchant, '')) AS merchant"),
      ("GROUP BY coalesce(nullif(t.merchant, ''), nullif(t.note, ''))", "GROUP BY coalesce(nullif(t.note, ''), nullif(t.merchant, ''))")],
     {PLACES}),
    ('V41', 'top_merchants answers every place', AI,
     [('ORDER BY sum(t.amount_minor) DESC LIMIT 8', 'ORDER BY sum(t.amount_minor) DESC')],
     {LIMITS}),
    ('V42', "top_merchants does not allow its counts", AI,
     [('      for (const r of rows) allowed.addCount(r.n)\n      const when = periodText(from, through, locale)\n      const figures = rows.map((r) => money(figureLabel(r.merchant',
       '      const when = periodText(from, through, locale)\n      const figures = rows.map((r) => money(figureLabel(r.merchant')],
     {PLACES}),
    ('V43', "a place without a description has no name on its figure", AI,
     [("money(figureLabel(r.merchant ?? figureWord('noDescription', locale), when, locale), r.total)", "money(figureLabel(r.merchant ?? '', when, locale), r.total)")],
     {PLACES}),
    ('V44', "budget_status reads a month it has not checked", AI,
     [("      if (typeof month !== 'string' || !MONTH.test(month)) throw new ToolInputError('month must be YYYY-MM')\n", '')],
     {REFUSED}),
    ('V45', "budget_status does not allow its categories' limits and spending", AI,
     [('        allowed.addSatang(limit.limit_minor).addSatang(limit.spent_minor)\n', '')],
     {PLACES}),
    ('V46', 'a range may run backwards', AI,
     [('|| from > through) throw new ToolInputError', ') throw new ToolInputError')],
     {REFUSED, BAD_INPUT}),
    ('V47', 'a range of 400 days is refused', AI,
     [('if (!Number.isFinite(span) || span > MAX_SPAN_DAYS)', 'if (!Number.isFinite(span) || span >= MAX_SPAN_DAYS)')],
     {REFUSED}),
    ('V48', 'an unknown tool answers nothing instead of its error', AI,
     [('    default:\n      throw new ToolInputError(`unknown tool ${name}`)', '    default:\n      return { result: null, figures: [] }')],
     {REFUSED}),
    ('V49', 'a refused tool input is thrown (500) instead of answered', AI,
     [('    if (error instanceof ToolInputError) return { error: error.message }\n', '')],
     {REFUSED, BAD_INPUT}),
    ('V50', "a person's own category is named by its built-in key", AI,
     [("  return name?.label ?? name?.builtin_key ?? 'uncategorised'", "  return name?.builtin_key ?? 'uncategorised'")],
     {LIMITS}),
    ('V51', "a person's own category's figure loses its label", AI,
     [('  return categoryText({ category_key: name?.builtin_key ?? null, category_label: name?.label ?? null }, locale)',
       '  return categoryText({ category_key: name?.builtin_key ?? null, category_label: null }, locale)')],
     {LIMITS}),
    # The service (S1 to S34).
    ('S1', 'the preferences answer without `available`', SV,
     [("    return { ...(await step<AiStoredPreferences>(s, 'ai.preferences')), available: this.available }",
       "    return { ...(await step<AiStoredPreferences>(s, 'ai.preferences')) } as AiPreferencesDto")],
     {OFF_UNTIL, NOT_CONFIGURED}),
    ('S2', 'a preferences update answers without `available`', SV,
     [("    return { ...(await step<AiStoredPreferences>(s, 'ai.setPreferences', { body: update })), available: this.available }",
       "    return { ...(await step<AiStoredPreferences>(s, 'ai.setPreferences', { body: update })) } as AiPreferencesDto")],
     {ENV}),
    ('S3', 'Tell Bun and slips do not need consent', SV,
     [("    const ctx = await step<AiContext>(s, 'ai.context')\n    if (!ctx.consent) throw new ProblemException(403, 'AI_CONSENT_REQUIRED')\n    return { today:",
       "    const ctx = await step<AiContext>(s, 'ai.context')\n    return { today:")],
     {OFF_UNTIL, OTHER_NOTICE}),
    ('S4', 'Ask Bun does not need consent', SV,
     [("    if (!ctx.consent) throw new ProblemException(403, 'AI_CONSENT_REQUIRED')\n    if (!this.deps.send) throw this.paused()\n    await this.consume(s, 'ask')",
       "    if (!this.deps.send) throw this.paused()\n    await this.consume(s, 'ask')")],
     {OTHER_NOTICE}),
    ('S5', 'the note does not need consent for the model', SV,
     [('    if (!this.deps.send || !(await this.hasConsent(s))) return plain', '    if (!this.deps.send) return plain')],
     {NO_CONSENT_NOTE, OTHER_NOTICE}),
    ('S6', 'a slip without AI spends a use', SV,
     [("    if (!this.deps.send) throw this.paused()\n    await this.consume(s, 'slip')\n", "    await this.consume(s, 'slip')\n")],
     {WITHOUT_AI}),
    ('S7', 'a question without AI spends a use', SV,
     [("    if (!this.deps.send) throw this.paused()\n    await this.consume(s, 'ask')\n", "    await this.consume(s, 'ask')\n")],
     {WITHOUT_AI}),
    ('S8', 'the note without AI spends a use', SV,
     [('    if (!this.deps.send || !(await this.hasConsent(s))) return plain', '    if (!(await this.hasConsent(s))) return plain')],
     {WITHOUT_AI}),
    ('S9', "a slip's use is counted after the model call", SV,
     [("    await this.consume(s, 'slip')\n    try {\n", '    try {\n'),
      ('      const raw = finishedJson(message) as { bank?: unknown }\n', "      await this.consume(s, 'slip')\n      const raw = finishedJson(message) as { bank?: unknown }\n")],
     {USE_FIRST}),
    ('S10', "a question's use is counted after the first model call", SV,
     [("    await this.consume(s, 'ask')\n    const today = trustedToday(request.today", '    const today = trustedToday(request.today'),
      ('        const message = await this.deps.send(params)\n', "        const message = await this.deps.send(params)\n        if (turn === 0) await this.consume(s, 'ask')\n")],
     {USE_FIRST}),
    ('S11', "the note's use is counted after the model call", SV,
     [("      await this.consume(s, 'note')\n      const message = await this.deps.send({", '      const message = await this.deps.send({'),
      ("      const text = String((finishedJson(message) as { text?: unknown })?.text ?? '').trim()\n",
       "      await this.consume(s, 'note')\n      const text = String((finishedJson(message) as { text?: unknown })?.text ?? '').trim()\n")],
     {USE_FIRST}),
    ('S12', "any client date is trusted", SV,
     [('  return Number.isFinite(gap) && gap <= 86_400_000 ? clientToday : serverToday', '  return clientToday')],
     {CHOICES}),
    ('S13', 'a client date a day away is replaced', SV,
     [('gap <= 86_400_000', 'gap < 86_400_000')],
     {CHOICES}),
    ('S14', 'the model is offered archived wallets', SV,
     [('      wallets: ctx.wallets.filter((w) => !w.archived).map((w) => ({ id: w.id, name: w.name })),', '      wallets: ctx.wallets.map((w) => ({ id: w.id, name: w.name })),')],
     {CHOICES}),
    ('S15', 'the model is offered archived categories', SV,
     [('      categories: ctx.categories.filter((c) => !c.archived).map(', '      categories: ctx.categories.map(')],
     {CHOICES}),
    ('S16', "the model sees a category's built-in key only", SV,
     [('name: c.label ?? c.builtin_key }))', 'name: c.builtin_key }))')],
     {CHOICES}),
    ('S17', "a slip's bank name is not cut", SV,
     [('raw.bank.trim().slice(0, 60) : null', 'raw.bank.trim() : null')],
     {BANK}),
    ('S18', "a slip's empty bank name is kept", SV,
     [("typeof raw?.bank === 'string' && raw.bank.trim() ? raw.bank", "typeof raw?.bank === 'string' ? raw.bank")],
     {BANK}),
    ('S19', "the note's words may not use the day's date", SV,
     [('    const allowed = new AllowedNumbers().addDate(today)\n    for (const fact of facts) {', '    const allowed = new AllowedNumbers()\n    for (const fact of facts) {')],
     {NOTE_WORDS}),
    ('S20', "the note's words may not use the facts' counts", SV,
     [('      for (const n of [fact.count, fact.days, fact.percent]) if (n !== undefined) allowed.addCount(n)\n', '')],
     {NOTE_WORDS}),
    ('S21', "the note's words may not use the facts' amounts", SV,
     [('      if (fact.amount_minor) allowed.addSatang(fact.amount_minor)\n', '')],
     {NOTE_WORDS, CLAUDES_WORDS}),
    ('S22', "the note's words may run to 201 characters", SV,
     [('[...text].length > 200', '[...text].length > 201')],
     {NOTE_WORDS}),
    ('S23', "the note's empty words are used", SV,
     [('      if (!text || [...text].length > 200', '      if ([...text].length > 200')],
     {NOTE_WORDS}),
    ('S24', 'Ask Bun takes six tool turns', SV,
     [('const ASK_MAX_TURNS = 5', 'const ASK_MAX_TURNS = 6')],
     {FIVE_TURNS}),
    ('S25', 'only the first tool of a turn runs', SV,
     [('          for (const block of message.content) {', '          for (const block of message.content.slice(0, 1)) {')],
     {TWO_TOOLS}),
    ('S26', 'a refused tool input goes back to Claude as a plain result', SV,
     [('content: run.error, is_error: true })', 'content: run.error })')],
     {BAD_INPUT}),
    ('S27', "the answer's grounding leaves out the tools' amounts", SV,
     [('  for (const minor of allow.satang) allowed.addSatang(minor)\n', '')],
     {ALLOWANCE}),
    ('S28', "the answer's grounding leaves out the tools' counts", SV,
     [('  for (const count of allow.counts) allowed.addCount(count)\n', '')],
     {ALLOWANCE}),
    ('S29', "the answer's grounding leaves out the tools' dates", SV,
     [('  for (const date of allow.dates) allowed.addDate(date)\n', '')],
     {ALLOWANCE}),
    ('S30', 'a vault step that failed (500) is a refusal', SV,
     [('    if (error instanceof ProblemException && error.getStatus() !== 500) throw error', '    if (error instanceof ProblemException) throw error')],
     {ASK_FAILS}),
    ('S31', 'a refusal falls back instead of answering', SV,
     [('    if (error instanceof ProblemException && error.getStatus() !== 500) throw error\n', '')],
     {SIGNED_OUT_ASK}),
    ('S32', 'Ask Bun is never paused after a failure', SV,
     [("      if (figures.length > 0) return { answer: figuresText(figures, request.locale), figures, source: 'facts' }\n      throw this.paused()",
       "      return { answer: figuresText(figures, request.locale), figures, source: 'facts' }")],
     {ASK_FAILS, USE_FIRST}),
    ('S33', "a step's refusal is read as its answer", SV,
     [('  if (!reply.ok) throw new ProblemException(reply.status, reply.code, reply.problem)\n', '')],
     {FIRST_STEP}),
    # The routes (R1 to R6).
    ('R1', 'the env ignores AI_ENABLED', RO,
     [('  return flag(env.AI_ENABLED) && env.ANTHROPIC_API_KEY ? anthropicSender', '  return env.ANTHROPIC_API_KEY ? anthropicSender')],
     {ENV}),
    ('R2', 'the env ignores the API key', RO,
     [('  return flag(env.AI_ENABLED) && env.ANTHROPIC_API_KEY ? anthropicSender(env.ANTHROPIC_API_KEY, env.ANTHROPIC_BASE_URL) : null',
       "  return flag(env.AI_ENABLED) ? anthropicSender(env.ANTHROPIC_API_KEY ?? '', env.ANTHROPIC_BASE_URL) : null")],
     {ENV}),
    ('R3', "a null model from the front door falls back to the env", RO,
     [('  if (given !== undefined) return given', '  if (given) return given')],
     {ENV}),
    ('R4', 'AI_MODEL is ignored', RO,
     [('model: w.env.AI_MODEL || DEFAULT_AI_MODEL', 'model: DEFAULT_AI_MODEL')],
     {ENV}),
    ('R5', 'the note reads any query field', RO,
     [("  const input = assertKnownFields({ ...w.query }, ['date', 'locale'])", '  const input = { ...w.query } as Record<string, unknown>')],
     {INPUT}),
    ('R6', "the note's date error names `today`", RO,
     [("  const date = parseAiDate(input.date, 'date')", '  const date = parseAiDate(input.date)')],
     {INPUT}),
    # The route table (T1 to T7).
    ('T1', 'Tell Bun does not need the current policy', RT,
     [("{ method: 'POST', path: '/v1/ai/parse', access: 'current_policy',", "{ method: 'POST', path: '/v1/ai/parse', access: 'bound_session',")],
     {FIRST_STEP}),
    ('T2', 'the note needs the current policy', RT,
     [("{ method: 'GET', path: '/v1/ai/note', access: 'bound_session',", "{ method: 'GET', path: '/v1/ai/note', access: 'current_policy',")],
     {FIRST_STEP}),
    ('T3', 'the context step runs after the session ended', RT,
     [("  'ai.context': {},\n", "  'ai.context': { anySession: true },\n")],
     {FIRST_STEP}),
    ('T4', 'the facts step runs after the session ended', RT,
     [("  'ai.facts': {},\n", "  'ai.facts': { anySession: true },\n")],
     {FIRST_STEP}),
    ('T5', 'the tool step runs after the session ended', RT,
     [("  'ai.tool': {},\n", "  'ai.tool': { anySession: true },\n")],
     {SIGNED_OUT_ASK}),
    ('T6', 'the preferences step runs after the session ended', RT,
     [("  'ai.preferences': {},\n", "  'ai.preferences': { anySession: true },\n")],
     {FIRST_STEP}),
    ('T7', 'the preferences update runs after the session ended', RT,
     [("  'ai.setPreferences': {},\n", "  'ai.setPreferences': { anySession: true },\n")],
     {FIRST_STEP}),
]

FAILED = re.compile(r'^\s*×\s+test/(?:workers/)?(\S+)\s+>\s+(?:.+? > )?(.+?)(?:\s+\d+ms)?$')
IT_NAME = re.compile(r"""^\s*it\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")""")


def case_names(edge: str) -> set:
    names = set()
    for line in open(os.path.join(edge, T), encoding='utf-8'):
        match = IT_NAME.match(line)
        if match:
            raw = match.group(1) if match.group(1) is not None else match.group(2)
            names.add(case(raw.replace("\\'", "'").replace('\\"', '"')))
    return names


def run_focused(edge: str, log_path: str) -> tuple:
    out = subprocess.run(['npx', 'vitest', 'run', '--config', 'vitest.workers.config.ts', '--reporter=verbose', T], cwd=edge, capture_output=True, text=True, timeout=1200)
    text = out.stdout + out.stderr
    with open(log_path, 'w') as log:
        log.write(text)
    failed = set()
    for line in text.splitlines():
        match = FAILED.match(line)
        if match:
            failed.add(f'{match.group(1)}: {match.group(2).strip()}')
    totals = re.search(r'Tests\s+(.+)', text)
    return failed, f'workers {totals.group(1).strip() if totals else "no totals"}'


def check(edge: str) -> int:
    ok = True
    names = case_names(edge)
    labels = set()
    for label, _description, rel, edits, required in MUTANTS:
        if label in labels:
            print(f'{label} is used twice')
            ok = False
        labels.add(label)
        text = open(os.path.join(edge, rel), encoding='utf-8').read()
        for old, new in edits:
            if text.count(old) != 1:
                print(f'{label} old text found {text.count(old)} times in {rel}')
                ok = False
            if old == new:
                print(f'{label} changes nothing')
                ok = False
        for name in sorted(required - names):
            print(f'{label} requires a case the test file does not have: {name}')
            ok = False
    print(f'{len(MUTANTS)} mutants, {len(names)} cases; old text found exactly once and every required case exists: {ok}')
    return 0 if ok else 1


def main() -> int:
    if sys.argv[1] == '--check':
        return check(sys.argv[2])
    edge, scratch = sys.argv[1], sys.argv[2]
    only = set(sys.argv[3:])
    os.makedirs(os.path.join(scratch, 'mutant-logs'), exist_ok=True)
    ok = True
    for label, description, rel, edits, required in MUTANTS:
        if only and label not in only:
            continue
        path = os.path.join(edge, rel)
        keep = os.path.join(scratch, 'mutant.keep')
        shutil.copyfile(path, keep)
        text = open(path, encoding='utf-8').read()
        if any(text.count(old) != 1 for old, _new in edits):
            print(f'{label} NOT APPLIED: an old text is not found exactly once in {rel}')
            ok = False
            continue
        for old, new in edits:
            text = text.replace(old, new)
        open(path, 'w', encoding='utf-8').write(text)
        try:
            failed, totals = run_focused(edge, os.path.join(scratch, 'mutant-logs', f'{label}.log'))
        finally:
            shutil.copyfile(keep, path)
        restored = filecmp.cmp(keep, path, shallow=False)
        missing = sorted(required - failed)
        verdict = 'KILLED' if not missing else 'SURVIVED'
        if missing or not restored:
            ok = False
        print(f'{label} {verdict} ({description}) [{totals}] restored={restored}', flush=True)
        for name in sorted(failed):
            print(f'    failed: {name}', flush=True)
        for name in missing:
            print(f'    REQUIRED BUT PASSED: {name}', flush=True)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
