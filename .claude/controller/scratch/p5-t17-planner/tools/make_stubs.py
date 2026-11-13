"""P5-T17: build the RED stage's typed stubs from orig/ and real/.

  python3 -I tools/make_stubs.py <kit>

Each stub keeps the plan's interface (every export, type and option) and none
of the behaviour: the transport ignores the new options, every new resources
and fake method refuses with NOT_BUILT before sending anything, and the cache
answers null.
"""
import pathlib
import sys

kit = pathlib.Path(sys.argv[1]).resolve()
CLIENT = "apps/app/src/api/client.ts"
RESOURCES = "apps/app/src/spend/v1/resources.ts"
CACHE = "apps/app/src/spend/v1/ratesCache.ts"
FAKE = "apps/app/src/spend/v1/testing/fakeResources.ts"


def sub(text: str, old: str, new: str) -> str:
    if text.count(old) != 1:
        raise SystemExit(f"expected one match, found {text.count(old)}: {old[:80]!r}")
    return text.replace(old, new, 1)


def block(text: str, start: str, end: str, new: str) -> str:
    """Replaces from the line starting `start` up to (not including) `end`."""
    a = text.index(start)
    b = text.index(end, a)
    if text.count(start) != 1:
        raise SystemExit(f"start not unique: {start!r}")
    return text[:a] + new + text[b:]


def write(rel: str, text: str) -> None:
    out = kit / "stubs" / rel
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text)
    print(f"stubs/{rel}")


# The transport: the constant and the two options, no behaviour.
client = (kit / "orig" / CLIENT).read_text()
real_client = (kit / "real" / CLIENT).read_text()
const_start = real_client.index("/**\n * What a conditional read")
const_end = real_client.index("export type V1RequestOptions<T> = {")
client = sub(client, "export type V1RequestOptions<T> = {", "// RED stub (P5-T17): the constant and options below, with no behaviour yet.\n" + real_client[const_start:const_end] + "export type V1RequestOptions<T> = {")
opt_start = real_client.index("  /**\n   * A conditional read: sent as If-None-Match.")
opt_end = real_client.index("  /** Rejects any response that is not exactly the expected DTO. */")
client = sub(client, "  /** Rejects any response that is not exactly the expected DTO. */", real_client[opt_start:opt_end] + "  /** Rejects any response that is not exactly the expected DTO. */")
write(CLIENT, client)

# Resources: the real types and imports; every new method refuses before sending.
resources = (kit / "real" / RESOURCES).read_text()
resources = block(resources, "    trips: async () => transport.request('GET', '/v1/trips'", "  };\n}\n\n/**\n * The sync side",
    "    // RED stubs (P5-T17): the plan's methods, sending nothing yet.\n"
    "    trips: async () => notBuilt(),\n"
    "    createTrip: async () => notBuilt(),\n"
    "    updateTrip: async () => notBuilt(),\n"
    "    deleteTrip: async () => notBuilt(),\n"
    "    tripSummary: async () => notBuilt(),\n"
    "    ratesToday: async () => notBuilt(),\n"
    "    homeCurrencyPreview: async () => notBuilt(),\n"
    "    setHomeCurrency: async () => notBuilt(),\n")
resources = sub(resources, "export function createSpendV1Resources(transport: V1Transport): SpendV1Resources {\n",
    "const notBuilt = (): never => {\n  throw new V1Error('invalid', 0, 'NOT_BUILT');\n};\n\nexport function createSpendV1Resources(transport: V1Transport): SpendV1Resources {\n")
write(RESOURCES, resources)

# The cache: its interface, answering no cache.
write(CACHE, """// RED stub (P5-T17): the plan's interface, answering no cache yet.
import type { RatesTodayDto } from '@gogospend/contracts';

import type { KeyValueStore } from '../../wallet/store/walletStore.ts';
import type { SpendV1Resources } from './resources.ts';

export const RATES_TODAY_NAME = 'rates-today';

export type CachedRates = { etag: string | null; rates: RatesTodayDto };

export async function readCachedRates(_store: KeyValueStore): Promise<CachedRates | null> {
  return null;
}

export async function refreshRates(_resources: Pick<SpendV1Resources, 'ratesToday'>, _store: KeyValueStore): Promise<CachedRates | null> {
  return null;
}
""")

# The fake: the real seed, imports and controls' types; every new method refuses, the controls do nothing.
fake = (kit / "real" / FAKE).read_text()
fake = block(fake, "    async trips() {\n", "  };\n\n  return {\n",
    "    // RED stubs (P5-T17): the plan's methods, with no behaviour yet.\n"
    "    async trips() { return notBuilt(); },\n"
    "    async createTrip() { return notBuilt(); },\n"
    "    async updateTrip() { return notBuilt(); },\n"
    "    async deleteTrip() { return notBuilt(); },\n"
    "    async tripSummary() { return notBuilt(); },\n"
    "    async ratesToday() { return notBuilt(); },\n"
    "    async homeCurrencyPreview() { return notBuilt(); },\n"
    "    async setHomeCurrency() { return notBuilt(); },\n")
fake = block(fake, "    /** Sets today's rates (a fresh ETag each time, returned), or none again (503). */\n", "    newId: uuid,\n",
    "    setRates(_set: RatesTodayDto | null): string | null {\n      return null;\n    },\n"
    "    settings: (): SettingsSnapshot | null => null,\n")
fake = sub(fake, "export function createFakeResources(", "const notBuilt = (): never => {\n  throw new V1Error('invalid', 0, 'NOT_BUILT');\n};\n\nexport function createFakeResources(")
write(FAKE, fake)
