import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { V1RequestOptions, V1Transport } from '../../../api/client.ts';
import { createAiResources, isAiAskResult, isAiNoteResult, isAiParseResult, isAiSlipResult } from './aiResources.ts';

// P3-T6: every AI result names its model and whether Opus ran (H4), and each
// AI call waits its route's phone timeout, longer than the route's deadline (H3).
// P3-T8: a slip read also says what it found, whether a model refused, and the
// tokens its calls used.

const draft = {
  type: 'expense',
  amount_minor: '12000',
  occurred_on: '2026-11-12',
  category_id: null,
  wallet_id: '11111111-1111-4111-8111-111111111111',
  merchant: 'Grab',
  note: null,
  confidence: 'medium',
  flags: ['category_guessed'],
};

// Each result as the edge answers it, without its model mark, and the mark its words carry.
const RESULTS = [
  { name: 'parse', valid: isAiParseResult, bare: { drafts: [draft], source: 'ai' }, mark: { model: 'claude-haiku-5-5', escalated: false } },
  { name: 'slip', valid: isAiSlipResult, bare: { drafts: [draft], bank: 'K PLUS', source: 'ai', kind: 'slip', declined: false, tokens: { input: 2_400, output: 310 } }, mark: { model: 'claude-opus-5-5', escalated: true } },
  { name: 'note', valid: isAiNoteResult, bare: { date: '2026-11-12', facts: [{ kind: 'no_records_today' }], text: 'Nothing logged yet today.', source: 'facts' }, mark: { model: 'rules', escalated: false } },
  { name: 'ask', valid: isAiAskResult, bare: { answer: 'You spent ฿60 on food.', figures: [{ label: 'Food', amount_minor: '6000' }], source: 'ai' }, mark: { model: 'claude-haiku-5-5', escalated: false } },
] as const;

test('AI results without model or escalated are refused, and with them accepted', () => {
  for (const { name, valid, bare, mark } of RESULTS) {
    assert.equal(valid({ ...bare, ...mark }), true, `${name} with its model`);
    assert.equal(valid(bare), false, `${name} without a model`);
    assert.equal(valid({ ...bare, model: mark.model }), false, `${name} without escalated`);
    assert.equal(valid({ ...bare, escalated: mark.escalated }), false, `${name} without model`);
    assert.equal(valid({ ...bare, ...mark, model: 'gpt' }), false, `${name} with model gpt`);
    assert.equal(valid({ ...bare, ...mark, model: null }), false, `${name} with model null`);
    assert.equal(valid({ ...bare, ...mark, escalated: 'no' }), false, `${name} with escalated as text`);
  }
});

test('a slip result needs kind, declined and tokens', () => {
  const read = { drafts: [draft], bank: 'K PLUS', source: 'ai', model: 'claude-opus-5-5', escalated: true, kind: 'receipt', declined: true, tokens: { input: 2_400, output: 310 } };
  /** The read without some of its keys. */
  const without = (...keys: string[]) => Object.fromEntries(Object.entries(read).filter(([key]) => !keys.includes(key)));
  assert.equal(isAiSlipResult(read), true, 'a whole read');
  assert.equal(isAiSlipResult({ ...read, kind: 'slip' }), true, 'kind slip');
  assert.equal(isAiSlipResult({ ...read, kind: 'unreadable', drafts: [], declined: false, tokens: { input: 0, output: 0 } }), true, 'kind unreadable');
  // A result as P3-T6 answered it is refused, and so is one without any one of the three.
  assert.equal(isAiSlipResult(without('kind', 'declined', 'tokens')), false, 'without kind, declined and tokens');
  for (const key of ['kind', 'declined', 'tokens']) assert.equal(isAiSlipResult(without(key)), false, `without ${key}`);
  const refused: [string, unknown][] = [
    ['a kind that is not slip, receipt or unreadable', { ...read, kind: 'invoice' }],
    ['kind null', { ...read, kind: null }],
    ['declined as text', { ...read, declined: 'no' }],
    ['tokens null', { ...read, tokens: null }],
    ['tokens with another key', { ...read, tokens: { input: 2_400, output: 310, cache: 0 } }],
    ['tokens without output', { ...read, tokens: { input: 2_400 } }],
    ['negative input tokens', { ...read, tokens: { input: -1, output: 310 } }],
    ['fractional output tokens', { ...read, tokens: { input: 2_400, output: 310.5 } }],
    ['tokens as text', { ...read, tokens: { input: '2400', output: '310' } }],
  ];
  for (const [what, value] of refused) assert.equal(isAiSlipResult(value), false, what);
});

test("each AI call waits its route's phone timeout", async () => {
  const seen: { method: string; path: string; options: V1RequestOptions<unknown> }[] = [];
  const answers: Record<string, unknown> = {
    '/v1/ai/parse': { ...RESULTS[0].bare, ...RESULTS[0].mark },
    '/v1/ai/slip': { ...RESULTS[1].bare, ...RESULTS[1].mark },
    '/v1/ai/note': { ...RESULTS[2].bare, ...RESULTS[2].mark },
    '/v1/ai/ask': { ...RESULTS[3].bare, ...RESULTS[3].mark },
  };
  const transport: V1Transport = {
    async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, options: V1RequestOptions<T>): Promise<T> {
      seen.push({ method, path, options: options as V1RequestOptions<unknown> });
      return answers[path.split('?')[0]] as T;
    },
  };
  const ai = createAiResources(transport);
  await ai.parse({ text: 'grab 120', today: '2026-11-12', locale: 'en' });
  await ai.slip({ image_base64: 'aGVsbG8=', media_type: 'image/jpeg', today: '2026-11-12', locale: 'th' });
  await ai.note('2026-11-12', 'th');
  await ai.ask({ question: 'how much?', today: '2026-11-12', locale: 'en' });
  assert.deepEqual(
    seen.map(({ method, path, options }) => [method, path.split('?')[0], options.timeoutMs, options.deadlineMs, options.resendLost]),
    [
      ['POST', '/v1/ai/parse', 20_000, 20_000, false],
      ['POST', '/v1/ai/slip', 60_000, 60_000, false],
      ['GET', '/v1/ai/note', 15_000, 15_000, undefined],
      ['POST', '/v1/ai/ask', 60_000, 60_000, false],
    ],
  );
  // Each route checks its answer with its own validator.
  for (const { path, options } of seen) assert.equal(options.validate(answers[path.split('?')[0]]), true, path);
});
