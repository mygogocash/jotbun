/**
 * What the vault's file code runs with: its SQL, its storage (for the short
 * `transactionSync` blocks background methods open), the vault clock read
 * once, and the vault's own id, which every object key carries (B1). A
 * VaultContext is also a FileContext, so a command and a background method
 * call the same registry functions.
 */
export type FileContext = { sql: SqlStorage; storage: DurableObjectStorage; now: Date; vaultId: string; touched?: boolean }

/**
 * Marks the context as having written a row. Every 1B function that writes
 * calls it, so the vault knows to set its alarm again afterwards (1B-T11).
 */
export function touch(c: FileContext): void {
  c.touched = true
}
