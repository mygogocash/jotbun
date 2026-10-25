import core from './0000_vault_core.sql?raw'

// The journal drizzle-orm's durable-sqlite migrator reads (handwritten SQL, so
// no drizzle-kit). The migrator applies an entry only when its `when` is later
// than the last applied one, so a vault that has applied 0000 skips it on every
// wake. Later migrations append entries with the next idx and a later `when`.
export const VAULT_MIGRATIONS: {
  journal: { entries: { idx: number; when: number; tag: string; breakpoints: boolean }[] }
  migrations: Record<string, string>
} = {
  journal: {
    entries: [{ idx: 0, when: 1761350400000, tag: '0000_vault_core', breakpoints: true }],
  },
  migrations: { m0000: core },
}
