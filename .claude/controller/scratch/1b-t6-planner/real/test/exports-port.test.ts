import { describe, expect, it } from 'vitest'

import { EXPORT_ENTITY as API_ENTITY, EXPORT_REQUEST_KIND as API_KIND, parseExportFilter as apiExportFilter } from '@api/exports/export.service'

import { EXPORT_ENTITY, EXPORT_REQUEST_KIND, parseExportFilter } from '../src/vault/files/exports'

// @api/exports/export.service cannot load in workerd (its database imports reach
// drizzle-orm/node-postgres and pg), so the vault restates its two names and
// parseExportFilter (src/vault/files/exports.ts, 1B-T6). These cases pin the
// restatement to the API's, in Node.

/** What a period parser answers for one input: the period, or the refusal's class, code and field. */
function outcomeOf(parse: (input: Record<string, unknown>) => unknown, input: Record<string, unknown>): unknown {
  try {
    return parse(input)
  } catch (error) {
    const refused = error as { name?: string; code?: string; field?: string }
    return { refused: refused.name, code: refused.code, field: refused.field }
  }
}

describe("the vault's export names and period rule are ExportService's", () => {
  it('names the export entity and its request kind as ExportService does', () => {
    expect([EXPORT_ENTITY, EXPORT_REQUEST_KIND]).toEqual([API_ENTITY, API_KIND])
  })

  it('reads an export period as ExportService does, refusals included', () => {
    const inputs: Record<string, unknown>[] = [
      { from: '2026-03-01', through: '2026-03-31' },
      { from: '2026-03-01', through: '2026-03-01' },
      { from: '1970-01-01', through: '9999-12-31' },
      { from: '2026-03-31', through: '2026-03-01' },
      { from: '2026-02-30', through: '2026-03-01' },
      { from: '1969-12-31', through: '2026-03-01' },
      { from: '2026-03-01' },
      { through: '2026-03-01' },
      { from: ['2026-03-01'], through: '2026-03-31' },
      { from: 20260301, through: '2026-03-31' },
      { from: '2026-3-1', through: '2026-03-31' },
      { from: '2026-03-01', through: '2026-03-31', proof_id: 'ignored', account_id: 'ignored' },
    ]
    for (const input of inputs) expect(outcomeOf(parseExportFilter, input), JSON.stringify(input)).toEqual(outcomeOf(apiExportFilter, input))
    expect(outcomeOf(parseExportFilter, inputs[0])).toEqual({ from: '2026-03-01', through: '2026-03-31' })
    expect(outcomeOf(parseExportFilter, inputs[3])).toMatchObject({ code: 'VALIDATION_FAILED', field: 'through' })
  })
})
