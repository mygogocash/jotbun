import type Anthropic from '@anthropic-ai/sdk'

// Ask Bun's tools as the model sees them, moved from the PostgreSQL edge's
// src/server/ai/tools.ts when it retired (C1). The vault runs them on its own
// SQL (aiTool in src/vault/ai.ts); VaultAiService sends them (src/v1/ai/service.ts).
const range = { from: { type: 'string', description: 'First day, YYYY-MM-DD (Bangkok calendar).' }, through: { type: 'string', description: 'Last day, YYYY-MM-DD, inclusive.' } }

/** Read-only questions over the person's own records. Every amount a tool returns is a figure the answer may use. */
export const ASK_TOOLS: Anthropic.Beta.Messages.BetaTool[] = [
  {
    name: 'spending_total',
    description: 'Total and count of the person’s expense or income records between two dates, optionally in one category.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['from', 'through', 'type', 'category_id'],
      properties: { ...range, type: { type: 'string', enum: ['expense', 'income'] }, category_id: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'A category id from the list, or null for all.' } },
    },
  },
  {
    name: 'category_totals',
    description: 'Expense or income totals per category between two dates, largest first.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['from', 'through', 'type'],
      properties: { ...range, type: { type: 'string', enum: ['expense', 'income'] } },
    },
  },
  {
    name: 'top_merchants',
    description: 'The places or descriptions the person spent most at between two dates (up to 8), with totals and counts.',
    strict: true,
    input_schema: { type: 'object', additionalProperties: false, required: ['from', 'through'], properties: range },
  },
  {
    name: 'budget_status',
    description: 'The month’s budget: limit, spent and left, overall and per category. Null when no budget is set.',
    strict: true,
    input_schema: { type: 'object', additionalProperties: false, required: ['month'], properties: { month: { type: 'string', description: 'YYYY-MM' } } },
  },
]

/** A tool input the tool refuses. It goes back to the model as an `is_error` result, never to the client. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ToolInputError'
  }
}
