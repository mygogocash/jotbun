"""P5-T17 mutation check: one mutant per new guard, each applied alone, run, restored.

  python3 -I mutants.py --tree <repo tree> --out <log folder>          run every mutant
  python3 -I mutants.py --tree <repo tree> --out <log folder> --check  only check each applies once
  python3 -I mutants.py ... --only C1,R2                               run some

Each mutant edits the GREEN tree, runs the Node test files of its suites
(`node scripts/test-unit.mjs <file>` in apps/app), and restores every touched
file from memory, checked by SHA-256. A mutant is killed when its run fails,
every case it names is among the failures, and every failure is an
AssertionError (as many `code: 'ERR_ASSERTION'` as failed tests). The last
line is "<k> of <n> killed; survivors [...]; not as expected [...];
not by an assertion [...]; not restored [...]".
"""
import argparse
import hashlib
import pathlib
import re
import subprocess
import sys

CLIENT = "apps/app/src/api/client.ts"
RESOURCES = "apps/app/src/spend/v1/resources.ts"
CACHE = "apps/app/src/spend/v1/ratesCache.ts"
FAKE = "apps/app/src/spend/v1/testing/fakeResources.ts"
DIARY = "apps/app/src/storage/diaryRepository.ts"

SUITES = {
    "client": "src/api/client.test.ts",
    "resources": "src/spend/v1/resources.test.ts",
    "cache": "src/spend/v1/ratesCache.test.ts",
    "fake": "src/spend/v1/testing/fakeResources.test.ts",
    "diary": "src/storage/diaryRepository.test.ts",
}

# The cases, by the start of their titles.
CONDITIONAL = "a conditional read hands a 304 back as NOT_MODIFIED"
TRIPS = "trips are created, edited and deleted"
HOME = "the home currency is changed with If-Match"
PREVIEW = "the home currency preview is read"
RATES = "today's rates answer unchanged"
STORES = "a refresh stores a new set"
KEEPS = "a 304 or a failure keeps the cache"
DAMAGED = "a damaged cache reads as none"
NEVER_FAILS = "a refresh never fails"
FAKE_TRIPS = "the fake keeps trips with versions"
FAKE_SUMMARY = "the fake's trip summary"
FAKE_RATES = "the fake answers 503 until rates are set"
FAKE_HOME = "the fake changes the home currency"
DRAFT = "a draft must match its command and account"
CHOICE = "a choice for a mismatched record"

TRIPS_LINE = "    trips: async () => transport.request('GET', '/v1/trips', { validate: listOf(isTripSnapshot) }),\n"
CREATE_TRIP = "    createTrip: async (input, commandId) => transport.request('POST', '/v1/trips', { body: input, command: command(commandId), validate: ackFor(commandId, input.id) }),\n"
UPDATE_TRIP = "      transport.request('PATCH', `/v1/trips/${segment(id)}`, { body: changes, command: command(commandId, version), validate: ackFor(commandId, id) }),\n"
DELETE_TRIP = "    deleteTrip: async (id, version, commandId) => transport.request('DELETE', `/v1/trips/${segment(id)}`, { command: command(commandId, version), validate: ackFor(commandId, id) }),\n"
SUMMARY_LINE = "    tripSummary: async (id) => transport.request('GET', `/v1/trips/${segment(id)}/summary`, { validate: isTripSummaryDto }),\n"
SET_HOME = "      transport.request('PUT', '/v1/me/home-currency', { body: { currency }, command: command(commandId, version ?? undefined), validate: ackForCommand(commandId) }),\n"
PREVIEW_LINE = "      transport.request('GET', `/v1/me/home-currency/preview?currency=${encodeURIComponent(currency)}`, { validate: isHomeCurrencyPreview }),\n"
OVERLAPS = "    [...trips.values()].some((trip) => trip.id !== except && !trip.deleted_at && trip.starts_on <= endsOn && startsOn <= trip.ends_on);\n"
EDIT_OVERLAP = "        if (overlaps(next.starts_on, next.ends_on, id)) throw stateProblem(changes.starts_on === undefined ? 'ends_on' : 'starts_on', 'errors.trip_overlap');\n"


def swap(file: str, old: str, new: str) -> tuple[str, str, str]:
    return (file, old, new)


# (id, what it does, [(file, old, new)], suites, the cases that must fail)
MUTANTS = [
    # The transport (client.ts).
    ("C1", "the plan's: a 304 is a refusal", [swap(CLIENT, "      if (status === 304 && request.ifNoneMatch !== undefined) {\n", "      if (false) {\n")], ["client"], [CONDITIONAL]),
    ("C2", "a 304 answers NOT_MODIFIED to a read that sent no ETag", [swap(CLIENT, "      if (status === 304 && request.ifNoneMatch !== undefined) {\n", "      if (status === 304) {\n")], ["client"], [CONDITIONAL]),
    ("C3", "a 304 skips the validator", [swap(CLIENT, "        if (!request.validate(unchanged)) throw new V1Error('invalid_response', status, 'INVALID_RESPONSE');\n", "")], ["client"], [CONDITIONAL]),
    ("C4", "If-None-Match is never sent", [swap(CLIENT, "      if (request.ifNoneMatch !== undefined) headers['If-None-Match'] = request.ifNoneMatch;\n", "")], ["client"], [CONDITIONAL]),
    ("C5", "a success's ETag is never reported", [swap(CLIENT, "      request.etag?.(etag);\n      return payload;\n", "      return payload;\n")], ["client"], [CONDITIONAL]),
    ("C6", "the ETag is reported before the body is checked", [swap(CLIENT, "      if (!request.validate(payload)) throw new V1Error('invalid_response', status, 'INVALID_RESPONSE');\n      request.etag?.(etag);\n", "      request.etag?.(etag);\n      if (!request.validate(payload)) throw new V1Error('invalid_response', status, 'INVALID_RESPONSE');\n")], ["client"], [CONDITIONAL]),
    ("C7", "the ETag header is never read", [swap(CLIENT, "      const etag = response.headers.get('etag');\n", "      const etag = null;\n")], ["client"], [CONDITIONAL]),
    ("C8", "a 304 reports its ETag too", [swap(CLIENT, "        const unchanged: unknown = NOT_MODIFIED;\n", "        const unchanged: unknown = NOT_MODIFIED;\n        request.etag?.(etag);\n")], ["client"], [CONDITIONAL]),
    # Resources (resources.ts).
    ("R1", "the trip list is not checked", [swap(RESOURCES, TRIPS_LINE, TRIPS_LINE.replace("listOf(isTripSnapshot)", "listOf((value): value is TripDto => typeof value === 'object')"))], ["resources"], [TRIPS]),
    ("R2", "a create is sent without its key and schema", [swap(RESOURCES, CREATE_TRIP, CREATE_TRIP.replace("command: command(commandId), ", ""))], ["resources"], [TRIPS]),
    ("R3", "a create takes an acknowledgement for another trip", [swap(RESOURCES, CREATE_TRIP, CREATE_TRIP.replace("ackFor(commandId, input.id)", "ackForCommand(commandId)"))], ["resources"], [TRIPS]),
    ("R4", "an edit sends no If-Match", [swap(RESOURCES, UPDATE_TRIP, UPDATE_TRIP.replace("command(commandId, version)", "command(commandId)"))], ["resources"], [TRIPS]),
    ("R5", "an edit takes an acknowledgement for another trip", [swap(RESOURCES, UPDATE_TRIP, UPDATE_TRIP.replace("ackFor(commandId, id)", "ackForCommand(commandId)"))], ["resources"], [TRIPS]),
    ("R6", "an edit sends a malformed id", [swap(RESOURCES, UPDATE_TRIP, UPDATE_TRIP.replace("${segment(id)}", "${id}"))], ["resources"], [TRIPS]),
    ("R7", "a delete sends no If-Match", [swap(RESOURCES, DELETE_TRIP, DELETE_TRIP.replace("command(commandId, version)", "command(commandId)"))], ["resources"], [TRIPS]),
    ("R8", "a delete takes an acknowledgement for another trip", [swap(RESOURCES, DELETE_TRIP, DELETE_TRIP.replace("ackFor(commandId, id)", "ackForCommand(commandId)"))], ["resources"], [TRIPS]),
    ("R9", "a delete sends a malformed id", [swap(RESOURCES, DELETE_TRIP, DELETE_TRIP.replace("${segment(id)}", "${id}"))], ["resources"], [TRIPS]),
    ("R10", "a summary is not checked", [swap(RESOURCES, SUMMARY_LINE, SUMMARY_LINE.replace("validate: isTripSummaryDto", "validate: (value): value is TripSummaryDto => typeof value === 'object'"))], ["resources"], [TRIPS]),
    ("R11", "a summary is asked with a malformed id", [swap(RESOURCES, SUMMARY_LINE, SUMMARY_LINE.replace("${segment(id)}", "${id}"))], ["resources"], [TRIPS]),
    ("R12", "the cached ETag is not sent", [swap(RESOURCES, "        ifNoneMatch: etag,\n", "        ifNoneMatch: undefined,\n")], ["resources"], [RATES]),
    ("R13", "unchanged is refused", [swap(RESOURCES, "value === NOT_MODIFIED || isRatesTodayDto(value)", "isRatesTodayDto(value)")], ["resources"], [RATES]),
    ("R14", "any set is taken", [swap(RESOURCES, "value === NOT_MODIFIED || isRatesTodayDto(value)", "value === NOT_MODIFIED || typeof value === 'object'")], ["resources"], [RATES]),
    ("R15", "a 304 is answered as a set", [swap(RESOURCES, "      return answer === NOT_MODIFIED ? 'unchanged' : { etag: heard.etag, rates: answer };\n", "      return { etag: heard.etag, rates: answer } as never;\n")], ["resources"], [RATES]),
    ("R16", "the ETag a 200 brought is dropped", [swap(RESOURCES, "        etag: (value) => { heard.etag = value; },\n", "        etag: () => undefined,\n")], ["resources"], [RATES]),
    ("R17", "a 200 without an ETag answers the ETag the read sent", [swap(RESOURCES, "{ etag: heard.etag, rates: answer }", "{ etag: heard.etag ?? etag ?? null, rates: answer }")], ["resources"], [RATES]),
    ("R18", "the preview is not checked", [swap(RESOURCES, PREVIEW_LINE, PREVIEW_LINE.replace("validate: isHomeCurrencyPreview", "validate: (value): value is HomeCurrencyPreview => typeof value === 'object'"))], ["resources"], [PREVIEW]),
    ("R19", "the preview's currency is not encoded", [swap(RESOURCES, PREVIEW_LINE, PREVIEW_LINE.replace("${encodeURIComponent(currency)}", "${currency}"))], ["resources"], [PREVIEW]),
    ("R20", "a home currency change always sends If-Match", [swap(RESOURCES, SET_HOME, SET_HOME.replace("version ?? undefined", "version ?? 0"))], ["resources"], [HOME]),
    ("R21", "a home currency change never sends If-Match", [swap(RESOURCES, SET_HOME, SET_HOME.replace("command(commandId, version ?? undefined)", "command(commandId)"))], ["resources"], [HOME]),
    ("R22", "a home currency change takes another command's acknowledgement", [swap(RESOURCES, SET_HOME, SET_HOME.replace("validate: ackForCommand(commandId)", "validate: isCommandAck"))], ["resources"], [HOME]),
    # The cache (ratesCache.ts).
    ("K1", "the plan's: a failure overwrites the cache", [swap(CACHE, "  } catch {\n    return cached;\n  }\n", "  } catch {\n    await store.remove(RATES_TODAY_NAME);\n    return null;\n  }\n")], ["cache"], [KEEPS]),
    ("K2", "a 304 forgets the cache", [swap(CACHE, "  if (answer === 'unchanged') return cached;\n", "  if (answer === 'unchanged') return null;\n")], ["cache"], [KEEPS]),
    ("K3", "the cached ETag is not sent", [swap(CACHE, "resources.ratesToday(cached?.etag ?? undefined)", "resources.ratesToday(undefined)")], ["cache"], [STORES, KEEPS]),
    ("K4", "a new set is not stored", [swap(CACHE, "    await store.set(RATES_TODAY_NAME, JSON.stringify(next));\n", "")], ["cache"], [STORES]),
    ("K5", "a new set is stored without its ETag", [swap(CACHE, "JSON.stringify(next)", "JSON.stringify({ rates: next.rates })")], ["cache"], [STORES]),
    ("K6", "a store that cannot be written fails the refresh", [swap(CACHE, "  try {\n    await store.set(RATES_TODAY_NAME, JSON.stringify(next));\n  } catch {\n    // Not kept for the next start, but it is still today's set.\n  }\n", "  await store.set(RATES_TODAY_NAME, JSON.stringify(next));\n")], ["cache"], [NEVER_FAILS]),
    ("K7", "a failed read fails the refresh", [swap(CACHE, "  try {\n    answer = await resources.ratesToday(cached?.etag ?? undefined);\n  } catch {\n    return cached;\n  }\n", "  answer = await resources.ratesToday(cached?.etag ?? undefined);\n")], ["cache"], [KEEPS]),
    ("K8", "damaged JSON fails the read", [swap(CACHE, "  } catch {\n    return null;\n  }\n  return isCachedRates(value) ? value : null;\n", "  } catch (error) {\n    throw error;\n  }\n  return isCachedRates(value) ? value : null;\n")], ["cache"], [DAMAGED]),
    ("K9", "a store that cannot be read fails the read", [swap(CACHE, "  let value: unknown;\n  try {\n    const text = await store.get(RATES_TODAY_NAME);\n", "  let value: unknown;\n  const text = await store.get(RATES_TODAY_NAME);\n  try {\n")], ["cache"], [DAMAGED, NEVER_FAILS]),
    ("K10", "any JSON reads as a cached set", [swap(CACHE, "  return isCachedRates(value) ? value : null;\n", "  return value as CachedRates;\n")], ["cache"], [DAMAGED]),
    ("K11", "a stored null is read as a set's object", [swap(CACHE, "  if (typeof value !== 'object' || value === null) return false;\n", "")], ["cache"], [DAMAGED]),
    ("K12", "an ETag of any type", [swap(CACHE, "(cached.etag === null || typeof cached.etag === 'string')", "true")], ["cache"], [DAMAGED]),
    ("K13", "a null ETag is damage", [swap(CACHE, "(cached.etag === null || typeof cached.etag === 'string')", "typeof cached.etag === 'string'")], ["cache"], [STORES]),
    ("K14", "other keys are taken", [swap(CACHE, "Object.keys(cached).sort().join(',') === 'etag,rates' && ", "")], ["cache"], [DAMAGED]),
    ("K15", "the set is not checked", [swap(CACHE, " && isRatesTodayDto(cached.rates);", " && typeof cached.rates === 'object';")], ["cache"], [DAMAGED]),
    ("K16", "another name in the device store", [swap(CACHE, "export const RATES_TODAY_NAME = 'rates-today';", "export const RATES_TODAY_NAME = 'rates';")], ["cache"], [STORES]),
    # The fake: trips.
    ("F1", "a create ignores other trips' days", [swap(FAKE, "        if (overlaps(input.starts_on, input.ends_on)) throw stateProblem('starts_on', 'errors.trip_overlap');\n", "")], ["fake"], [FAKE_TRIPS]),
    ("F2", "trips that touch on a day do not overlap", [swap(FAKE, OVERLAPS, OVERLAPS.replace("trip.starts_on <= endsOn && startsOn <= trip.ends_on", "trip.starts_on < endsOn && startsOn < trip.ends_on"))], ["fake"], [FAKE_TRIPS]),
    ("F3", "a deleted trip keeps its days", [swap(FAKE, OVERLAPS, OVERLAPS.replace(" && !trip.deleted_at", ""))], ["fake"], [FAKE_TRIPS]),
    ("F4", "an edit overlaps its own days", [swap(FAKE, OVERLAPS, OVERLAPS.replace("trip.id !== except && ", ""))], ["fake"], [FAKE_TRIPS]),
    ("F5", "an edit ignores other trips' days", [swap(FAKE, EDIT_OVERLAP, "")], ["fake"], [FAKE_TRIPS]),
    ("F6", "an edit's overlap is always on starts_on", [swap(FAKE, EDIT_OVERLAP, EDIT_OVERLAP.replace("changes.starts_on === undefined ? 'ends_on' : 'starts_on'", "'starts_on'"))], ["fake"], [FAKE_TRIPS]),
    ("F7", "an edit's overlap is always on ends_on", [swap(FAKE, EDIT_OVERLAP, EDIT_OVERLAP.replace("changes.starts_on === undefined ? 'ends_on' : 'starts_on'", "'ends_on'"))], ["fake"], [FAKE_TRIPS]),
    ("F8", "a create takes an id already used", [swap(FAKE, "        const existing = trips.get(input.id);\n        if (existing) throw conflict(existing);\n", "        const existing = trips.get(input.id);\n")], ["fake"], [FAKE_TRIPS]),
    ("F9", "a stale version edits", [swap(FAKE, "    if (trip.version !== version) throw conflict(trip);\n", "")], ["fake"], [FAKE_TRIPS]),
    ("F10", "a deleted trip can be edited", [swap(FAKE, "    if (trip.deleted_at) throw new V1Error('deleted', 409, 'ENTITY_DELETED');\n", "")], ["fake"], [FAKE_TRIPS]),
    ("F11", "an unknown trip is not 404", [swap(FAKE, "    if (!trip) throw notFound();\n    if (trip.deleted_at)", "    if (trip.deleted_at)")], ["fake"], [FAKE_TRIPS]),
    ("F12", "a delete removes the trip", [swap(FAKE, "        trips.set(id, { ...trip, deleted_at: '2026-09-29T00:00:00.000Z', version: version + 1 });\n", "        trips.delete(id);\n")], ["fake"], [FAKE_TRIPS]),
    ("F13", "the list shows deleted trips", [swap(FAKE, "      return [...trips.values()].filter((trip) => !trip.deleted_at).sort(", "      return [...trips.values()].sort(")], ["fake"], [FAKE_TRIPS]),
    ("F14", "the list is oldest first", [swap(FAKE, ".sort((a, b) => b.starts_on.localeCompare(a.starts_on))", ".sort((a, b) => a.starts_on.localeCompare(b.starts_on))")], ["fake"], [FAKE_TRIPS]),
    ("F15", "a trip created without a budget keeps it undefined", [swap(FAKE, "budget_minor: input.budget_minor ?? null,", "budget_minor: input.budget_minor,")], ["fake"], [FAKE_TRIPS]),
    ("F16", "a create is not in the call log", [swap(FAKE, "      await step('createTrip', [input, commandId]);\n", "")], ["fake"], [FAKE_TRIPS]),
    # The fake: the trip summary.
    ("S1", "a deleted trip has a summary", [swap(FAKE, "      if (!trip || trip.deleted_at) throw notFound();\n", "      if (!trip) throw notFound();\n")], ["fake"], [FAKE_SUMMARY]),
    ("S2", "an unknown trip's summary is not 404", [swap(FAKE, "      if (!trip || trip.deleted_at) throw notFound();\n", "      if (trip?.deleted_at) throw notFound();\n")], ["fake"], [FAKE_SUMMARY]),
    ("S3", "deleted records count", [swap(FAKE, "record is TaggedRecord => !record.deleted_at && record.trip_id === id", "record is TaggedRecord => record.trip_id === id")], ["fake"], [FAKE_SUMMARY]),
    ("S4", "untagged records count", [swap(FAKE, "record is TaggedRecord => !record.deleted_at && record.trip_id === id", "record is TaggedRecord => !record.deleted_at")], ["fake"], [FAKE_SUMMARY]),
    ("S5", "every tagged record adds to the sums", [swap(FAKE, "      const expenses = tagged.filter((record): record is TaggedExpense => record.type === 'expense');\n", "      const expenses = tagged as TaggedExpense[];\n")], ["fake"], [FAKE_SUMMARY]),
    ("S6", "the count is of expenses only", [swap(FAKE, "        count: tagged.length,\n", "        count: expenses.length,\n")], ["fake"], [FAKE_SUMMARY]),
    ("S7", "home sums add each amount, not its home amount", [swap(FAKE, "    home += BigInt(record.home_amount_minor);\n", "    home += BigInt(record.amount_minor);\n")], ["fake"], [FAKE_SUMMARY]),
    ("S8", "every expense counts in the trip currency", [swap(FAKE, "    if (record.currency === tripCurrency) inTrip += BigInt(record.amount_minor);\n    else other += BigInt(record.home_amount_minor);\n", "    inTrip += BigInt(record.amount_minor);\n")], ["fake"], [FAKE_SUMMARY]),
    ("S9", "another currency adds its amount, not its home amount", [swap(FAKE, "    else other += BigInt(record.home_amount_minor);\n", "    else other += BigInt(record.amount_minor);\n")], ["fake"], [FAKE_SUMMARY]),
    ("S10", "days in the records' order", [swap(FAKE, "groups((record) => record.occurred_on).sort(([a], [b]) => a.localeCompare(b)).map(", "groups((record) => record.occurred_on).map(")], ["fake"], [FAKE_SUMMARY]),
    ("S11", "categories by home amount, the smaller first", [swap(FAKE, "largerFirst(a.spent_home_minor, b.spent_home_minor) ||", "-largerFirst(a.spent_home_minor, b.spent_home_minor) ||")], ["fake"], [FAKE_SUMMARY]),
    ("S12", "a tie in spending keeps the records' order", [swap(FAKE, "largerFirst(a.spent_home_minor, b.spent_home_minor) || a.category_id.localeCompare(b.category_id)", "largerFirst(a.spent_home_minor, b.spent_home_minor)")], ["fake"], [FAKE_SUMMARY]),
    ("S13", "the rates used include the home currency", [swap(FAKE, "        if (record.currency === home) continue;\n", "")], ["fake"], [FAKE_SUMMARY]),
    ("S14", "the rates used repeat", [swap(FAKE, "        used.set(JSON.stringify(rate), rate);\n", "        used.set(String(used.size), rate);\n")], ["fake"], [FAKE_SUMMARY]),
    ("S15", "the rates used by date only", [swap(FAKE, "a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency)", "a.date.localeCompare(b.date)")], ["fake"], [FAKE_SUMMARY]),
    ("S16", "the rates used in the records' order", [swap(FAKE, "        rates: [...used.values()].sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency)),\n", "        rates: [...used.values()],\n")], ["fake"], [FAKE_SUMMARY]),
    ("S17", "the home currency is always THB", [swap(FAKE, "  const homeCurrency = (): CurrencyCode => settings?.home_currency ?? DEFAULT_HOME_CURRENCY;\n", "  const homeCurrency = (): CurrencyCode => DEFAULT_HOME_CURRENCY;\n")], ["fake"], [FAKE_SUMMARY, FAKE_HOME]),
    # The fake: today's rates.
    ("Q1", "rates are always set", [swap(FAKE, "      if (!rates) throw new V1Error('unavailable', 503, 'SERVICE_UNAVAILABLE', { retryAfterSeconds: 300 });\n", "")], ["fake"], [FAKE_RATES]),
    ("Q2", "the 503 names no retry", [swap(FAKE, "'SERVICE_UNAVAILABLE', { retryAfterSeconds: 300 })", "'SERVICE_UNAVAILABLE')")], ["fake"], [FAKE_RATES]),
    ("Q3", "unchanged never answers", [swap(FAKE, "      if (etag === rates.etag) return 'unchanged' as const;\n", "")], ["fake"], [FAKE_RATES]),
    ("Q4", "any ETag answers unchanged", [swap(FAKE, "      if (etag === rates.etag) return 'unchanged' as const;\n", "      if (etag !== undefined) return 'unchanged' as const;\n")], ["fake"], [FAKE_RATES]),
    ("Q5", "a new set keeps the old ETag", [swap(FAKE, "      rateSets += 1;\n", "")], ["fake"], [FAKE_RATES]),
    ("Q6", "rates cannot be cleared", [swap(FAKE, "      if (!set) {\n        rates = null;\n        return null;\n      }\n", "      if (!set) return null;\n")], ["fake"], [FAKE_RATES]),
    # The fake: the home currency.
    ("H1", "any version changes the home currency", [swap(FAKE, "        if (version !== (settings?.version ?? null)) throw conflict(settings);\n", "")], ["fake"], [FAKE_HOME]),
    ("H2", "before the first change the version must be undefined", [swap(FAKE, "if (version !== (settings?.version ?? null))", "if (version !== settings?.version)")], ["fake"], [FAKE_HOME]),
    ("H3", "the same currency is taken", [swap(FAKE, "        if (currency === homeCurrency()) throw stateProblem('currency', 'errors.home_currency_same');\n", "")], ["fake"], [FAKE_HOME]),
    ("H4", "each change makes new settings", [swap(FAKE, "id: settings?.id ?? uuid(),", "id: uuid(),")], ["fake"], [FAKE_HOME]),
    ("H5", "the version never moves", [swap(FAKE, "version: (settings?.version ?? 0) + 1 };", "version: 1 };")], ["fake"], [FAKE_HOME]),
    ("P1", "the preview counts own rates only", [swap(FAKE, "record.rate_source === 'own' || record.rate_source === 'exchange'", "record.rate_source === 'own'")], ["fake"], [FAKE_HOME]),
    ("P2", "the preview leaves out deleted records", [swap(FAKE, "      const all = [...records.values()];\n", "      const all = [...records.values()].filter((record) => !record.deleted_at);\n")], ["fake"], [FAKE_HOME]),
    ("P3", "the preview counts no budget", [swap(FAKE, "budgets: budgets.size };", "budgets: 0 };")], ["fake"], [FAKE_HOME]),
    ("P4", "the preview names the home currency", [swap(FAKE, "const preview: HomeCurrencyPreview = { currency, records:", "const preview: HomeCurrencyPreview = { currency: homeCurrency(), records:")], ["fake"], [FAKE_HOME]),
    # followups.md line 726 (P5-T2's second review, m3): the outbox refuses money keys until P5-T18a.
    ("O18", "a pending choice's changes take currency and trip_id", [swap(DIARY, "  destination_wallet_id: isUuid,\n};\n", "  destination_wallet_id: isUuid,\n  currency: (value: unknown) => typeof value === 'string',\n  trip_id: (value: unknown) => value === null || isUuid(value),\n};\n")], ["diary"], [CHOICE]),
    ("O19", "a draft's keys take the money keys", [swap(DIARY, "const ENTRY_KEYS = ['amount_minor', 'category_id', 'id', 'merchant', 'note', 'occurred_on', 'source', 'type', 'wallet_id'];", "const ENTRY_KEYS = ['amount_minor', 'category_id', 'currency', 'home_amount_minor', 'home_currency', 'id', 'merchant', 'note', 'occurred_on', 'rate', 'rate_source', 'source', 'trip_id', 'type', 'wallet_id'];")], ["diary"], [DRAFT]),
]

FAILED = re.compile(r"^✖ (.+?) \([0-9.]+m?s\)$")
FAILS = re.compile(r"^ℹ fail (\d+)$")


def sha(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(tree: pathlib.Path, suite: str, log: pathlib.Path) -> tuple[int, list[str], int, int]:
    cmd = ["node", "scripts/test-unit.mjs", SUITES[suite]]
    cwd = tree / "apps/app"
    try:
        done = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=300)
        output, code = done.stdout + done.stderr, done.returncode
    except subprocess.TimeoutExpired as error:
        output, code = f"timed out: {error}", 124
    log.write_text(f"$ {' '.join(cmd)}  (in {cwd})\n{output}\nexit {code}\n")
    # Failures are read from the summary after "✖ failing tests:", where each appears once.
    summary = output.split("✖ failing tests:", 1)[1] if "✖ failing tests:" in output else ""
    failing = sorted({m.group(1) for line in summary.splitlines() if (m := FAILED.match(line))})
    fails = max([int(m.group(1)) for line in output.splitlines() if (m := FAILS.match(line))] or [0])
    assertions = summary.count("code: 'ERR_ASSERTION'")
    return code, failing, fails, assertions


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
    ids = [m[0] for m in MUTANTS]
    if len(ids) != len(set(ids)):
        raise SystemExit("duplicate mutant ids")

    missing = []
    for mid, _, edits, _, _ in chosen:
        for file, old, new in edits:
            count = (tree / file).read_text().count(old)
            if count != 1 or old == new:
                missing.append(f"{mid} {file} ({count} matches{', no change' if old == new else ''})")
    if args.check or missing:
        for mid, *_ in chosen:
            print(f"{mid} {'MISSING' if any(x.startswith(mid + ' ') for x in missing) else 'APPLIES'}")
        print(f"{len(chosen) - len({x.split()[0] for x in missing})} of {len(chosen)} apply; missing {missing}")
        return 1 if missing else 0

    killed, survivors, unexpected, unasserted, unrestored = [], [], [], [], []
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
        failing = [name for _, names, _, _ in results.values() for name in names]
        dead = all(code != 0 for code, _, _, _ in results.values())
        named = all(any(name.startswith(case) for name in failing) for case in cases)
        asserted = all(fails > 0 and assertions == fails for code, _, fails, assertions in results.values())
        if not restored:
            unrestored.append(mid)
        if dead and named and asserted:
            killed.append(mid)
            verdict = "killed"
        elif dead:
            killed.append(mid)
            if not named:
                unexpected.append(mid)
            if not asserted:
                unasserted.append(mid)
            verdict = "killed, but " + ("not by the case named" if not named else "not by an assertion")
        else:
            survivors.append(mid)
            verdict = "SURVIVED"
        counts = {suite: f"fail {fails}, assertions {assertions}" for suite, (_, _, fails, assertions) in results.items()}
        print(f"{mid} {verdict}: {what}; exits {[code for code, _, _, _ in results.values()]}; {counts}; failing {failing}; restored={restored}", flush=True)
    print(f"{len(killed)} of {len(chosen)} killed; survivors {survivors}; not as expected {unexpected}; not by an assertion {unasserted}; not restored {unrestored}")
    return 0 if not survivors and not unexpected and not unasserted and not unrestored else 1


if __name__ == "__main__":
    sys.exit(main())
