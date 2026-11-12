// P3-T2: how a record was made (B2), in the shared contract.
import { ContractValidationError, TRANSACTION_SOURCES, isTransactionSnapshot, parseTransactionSource } from '@gogospend/contracts'
import { describe, expect, it } from 'vitest'

const expense = {
  id: '3c000000-0000-4000-8000-000000000001',
  type: 'expense',
  amount_minor: '4500',
  occurred_on: '2026-10-20',
  wallet_id: '1a000000-0000-4000-8000-000000000001',
  category_id: '2c000000-0000-4000-8000-000000000001',
  note: null,
  merchant: null,
  deleted_at: null,
  version: 1,
}
const transfer = {
  id: '3c000000-0000-4000-8000-000000000002',
  type: 'transfer',
  amount_minor: '1000',
  occurred_on: '2026-10-21',
  source_wallet_id: '1a000000-0000-4000-8000-000000000001',
  destination_wallet_id: '1a000000-0000-4000-8000-000000000002',
  note: null,
  merchant: null,
  deleted_at: null,
  version: 2,
}

/** The refusal's code and field, or 'accepted'. */
const refusal = (run: () => unknown): { code: string; field: string | undefined } | 'accepted' => {
  try {
    run()
    return 'accepted'
  } catch (error) {
    if (!(error instanceof ContractValidationError)) throw error
    return { code: error.code, field: error.field }
  }
}

describe('a record source', () => {
  it("the sources are the spec's seven, in order", () => {
    expect(TRANSACTION_SOURCES).toEqual(['typed', 'photo', 'slip_import', 'tell_bun', 'statement', 'share_extension', 'siri'])
  })

  it('a record snapshot accepts each source or none, and refuses anything else', () => {
    for (const source of TRANSACTION_SOURCES) {
      expect([source, isTransactionSnapshot({ ...expense, source })]).toEqual([source, true])
      expect([source, isTransactionSnapshot({ ...transfer, source })]).toEqual([source, true])
    }
    expect(isTransactionSnapshot(expense)).toBe(true)
    expect(isTransactionSnapshot({ ...expense, attachment_id: '4d000000-0000-4000-8000-000000000001', source: 'photo' })).toBe(true)
    for (const source of ['manual', null, '', 'Photo', 7]) expect([source, isTransactionSnapshot({ ...expense, source })]).toEqual([source, false])
  })

  it('parseTransactionSource reads absent and null as none and refuses other values on source', () => {
    expect(parseTransactionSource(undefined)).toBeNull()
    expect(parseTransactionSource(null)).toBeNull()
    for (const source of TRANSACTION_SOURCES) expect(parseTransactionSource(source)).toBe(source)
    for (const value of ['manual', '', 'TELL_BUN', ' photo', 1, true, {}, ['typed']]) {
      expect([value, refusal(() => parseTransactionSource(value))]).toEqual([value, { code: 'VALIDATION_FAILED', field: 'source' }])
    }
    expect(refusal(() => parseTransactionSource('camera', 'drafts[0].source'))).toEqual({ code: 'VALIDATION_FAILED', field: 'drafts[0].source' })
  })
})
