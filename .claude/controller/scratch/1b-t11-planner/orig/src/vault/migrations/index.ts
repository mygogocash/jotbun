import core from './0000_vault_core.sql?raw'
import files from './0001_vault_files.sql?raw'
import currenciesTrips from './0002_currencies_trips.sql?raw'

// The journal drizzle-orm's durable-sqlite migrator reads (handwritten SQL, so
// no drizzle-kit). The migrator applies an entry only when its `when` is later
// than the last applied one, so a vault that has applied 0000 skips it on every
// wake. Later migrations append entries with the next idx and a later `when`.
export const VAULT_MIGRATIONS: {
  journal: { entries: { idx: number; when: number; tag: string; breakpoints: boolean }[] }
  migrations: Record<string, string>
} = {
  journal: {
    entries: [
      { idx: 0, when: 1761350400000, tag: '0000_vault_core', breakpoints: true },
      { idx: 1, when: 1761436800000, tag: '0001_vault_files', breakpoints: true },
      { idx: 2, when: 1761523200000, tag: '0002_currencies_trips', breakpoints: true },
    ],
  },
  migrations: { m0000: core, m0001: files, m0002: currenciesTrips },
}
