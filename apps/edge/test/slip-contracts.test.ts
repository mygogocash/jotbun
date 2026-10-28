import { createHash } from 'node:crypto'

import {
  ContractValidationError,
  SLIP_INBOX_ID,
  SYNC_ENTITY_VALIDATORS,
  accountLast4,
  isBankAlbumsDto,
  isEntityChange,
  isPushData,
  isSlipAccountDto,
  isSlipAccountsDto,
  isSlipBatchResult,
  isSlipDraftsPage,
  isSlipInboxSnapshot,
  isSlipRefHash,
  isSlipSaltDto,
  normalizeSlipRef,
  parseDeviceRegistration,
  parseSlipAccountUpdate,
  parseSlipBatchRequest,
  parseSlipConfirmRequest,
  parseSlipRefRequest,
  slipRefHash,
} from '@gogospend/contracts'
import { describe, expect, it } from 'vitest'

// Node's WebCrypto, as the Worker and the phone's adapter call it. The copy
// gives digest an ArrayBuffer-backed view, which its types require.
const webCryptoSha256 = async (data: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(data)))

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const hash = (n: number) => n.toString(16).padStart(64, '0')

/** The code and field of the ContractValidationError that `run` throws. */
function refusal(run: () => unknown): { code: string; field: string | undefined } {
  try {
    run()
  } catch (error) {
    if (error instanceof ContractValidationError) return { code: error.code, field: error.field }
    throw error
  }
  throw new Error('expected a ContractValidationError')
}

const IMAGE = Buffer.from('JOTBUN-TEST-SLIP').toString('base64')
const slip = (n: number, overrides: Record<string, unknown> = {}) => ({ ref_hash: hash(n), image_base64: IMAGE, media_type: 'image/jpeg', album: 'K PLUS', origin: 'album', ...overrides })
const batch = (overrides: Record<string, unknown> = {}) => ({ purpose: 'backfill', last: false, today: '2026-10-25', locale: 'th', slips: [slip(1)], ...overrides })

const record = (n: number) => ({ id: uuid(200 + n), type: 'expense', amount_minor: '5000', occurred_on: '2026-10-24', wallet_id: uuid(1) })
const confirmItem = (n: number, overrides: Record<string, unknown> = {}) => ({ draft_id: uuid(100 + n), transaction: record(n), ...overrides })

const party = { bank: 'kbank', account_last4: '1234', name: 'นาย กานต์ ใจดี' }
const draft = {
  id: uuid(300),
  amount_minor: '125050',
  occurred_on: '2026-10-24',
  occurred_time: '18:40',
  direction: 'out',
  from: party,
  to: { bank: 'scb', account_last4: '9876', name: 'ร้านป้าแดง ข้าวแกง' },
  category_id: null,
  category_guessed: false,
  flags: ['category_guessed'],
  album: 'K PLUS',
  origin: 'album',
  model: 'claude-haiku-5-5',
  escalated: false,
  created_at: '2026-10-25T03:00:00.000Z',
  expires_at: '2026-11-24T03:00:00.000Z',
  duplicate_of: null,
}
const result = { ref_hash: hash(1), outcome: 'read', draft }
const usesLeft = { live: 9, backfill: 498 }
const batchResult = { results: [result], uses_left: usesLeft, retry_after_seconds: null }
const draftsPage = { drafts: [draft], total: 1, next_cursor: null }
const account = { id: uuid(400), version: 1, bank: 'kbank', account_last4: '1234', wallet_id: null, open_drafts: 3 }
const album = { bank: 'kbank', platform: 'ios', album_name: 'K PLUS' }

describe('slip contracts', () => {
  it('a slip reference normalizes its bank code and reference, and refuses what cannot be one', () => {
    expect(normalizeSlipRef('4', ' 016297184012bpp06418 ')).toBe('004:016297184012BPP06418')
    expect(normalizeSlipRef('004', '')).toBeNull()
    expect(normalizeSlipRef('0041', 'A')).toBeNull()
    expect(normalizeSlipRef('kb', 'A')).toBeNull()
    expect(normalizeSlipRef('004', 'ก1')).toBeNull()
    expect(normalizeSlipRef('14', 'ab\tc d')).toBe('014:ABCD')
    expect(normalizeSlipRef('004', 'a'.repeat(64))).toBe(`004:${'A'.repeat(64)}`)
    expect(normalizeSlipRef('004', 'a'.repeat(65))).toBeNull()
    expect(normalizeSlipRef('004', 'ß')).toBeNull()
    expect(normalizeSlipRef('004', 'AB\u007f')).toBeNull()
  })

  it('the salted hash is SHA-256 of the salt, the label, a zero byte and the reference', async () => {
    const salt = Uint8Array.from({ length: 32 }, (_, i) => i + 1)
    const n = '004:016297184012BPP06418'
    const expected = createHash('sha256').update(salt).update('jotbun-slip-ref-v1').update(Buffer.from([0])).update(n).digest('hex')
    const value = await slipRefHash(salt, n, webCryptoSha256)
    expect(value).toBe(expected)
    expect(value).toBe('029e46f70cbfa751f030c1d33b671859ad9519c17eecd52e6a0539775443df5a')
    expect(isSlipRefHash(value)).toBe(true)
    await expect(slipRefHash(salt.subarray(0, 31), n, webCryptoSha256)).rejects.toThrow(RangeError)
    await expect(slipRefHash(new Uint8Array(33), n, webCryptoSha256)).rejects.toThrow(RangeError)
    expect(isSlipRefHash(value.toUpperCase())).toBe(false)
    expect(isSlipRefHash(value.slice(1))).toBe(false)
    expect(isSlipRefHash(null)).toBe(false)
  })

  it('the last four digits come from a masked account or phone as printed', () => {
    expect(accountLast4('xxx-x-x1234-x')).toBe('1234')
    expect(accountLast4('XXX-XXX-5678')).toBe('5678')
    expect(accountLast4('๑๒๓๔')).toBe('1234')
    expect(accountLast4('012-3-45678-9')).toBe('6789')
    expect(accountLast4('๐๘๑-xxx-๕๖๗๘')).toBe('5678')
    expect(accountLast4('xxx-12')).toBeNull()
    expect(accountLast4('xxx-123')).toBeNull()
    expect(accountLast4(null)).toBeNull()
    expect(accountLast4(undefined)).toBeNull()
  })

  it('a slip batch takes 1 to 5 slips with distinct hashes and images within 1,200,000 bytes, and nothing else', () => {
    const five = [1, 2, 3, 4, 5].map((n) => slip(n))
    expect(parseSlipBatchRequest(batch({ slips: five }))).toEqual(batch({ slips: five }))
    expect(parseSlipBatchRequest(batch({ slips: [slip(1, { album: '  Café  ' })] })).slips[0].album).toBe('Café')
    expect(parseSlipBatchRequest(batch({ slips: [slip(1, { album: null })] })).slips[0].album).toBeNull()
    expect(parseSlipBatchRequest(batch({ purpose: 'live', last: true, slips: [slip(1, { origin: 'share', album: null })] })).slips[0].origin).toBe('share')
    expect(parseSlipBatchRequest(batch({ purpose: 'live', slips: [slip(1, { origin: 'photo' })] })).slips[0].origin).toBe('photo')
    const largest = Buffer.alloc(1_200_000).toString('base64')
    expect(parseSlipBatchRequest(batch({ slips: [slip(1, { image_base64: largest })] })).slips[0].image_base64).toBe(largest)

    expect(refusal(() => parseSlipBatchRequest(batch({ slips: [1, 2, 3, 4, 5, 6].map((n) => slip(n)) })))).toEqual({ code: 'VALIDATION_FAILED', field: 'slips' })
    expect(refusal(() => parseSlipBatchRequest(batch({ slips: [] })))).toEqual({ code: 'VALIDATION_FAILED', field: 'slips' })
    expect(refusal(() => parseSlipBatchRequest(batch({ slips: [slip(1), slip(1)] })))).toEqual({ code: 'VALIDATION_FAILED', field: 'slips[1].ref_hash' })
    expect(refusal(() => parseSlipBatchRequest(batch({ slips: [slip(1, { ref_hash: 'A'.repeat(64) })] })))).toEqual({ code: 'VALIDATION_FAILED', field: 'slips[0].ref_hash' })
    expect(refusal(() => parseSlipBatchRequest(batch({ slips: [slip(1, { image_base64: Buffer.alloc(1_200_001).toString('base64') })] })))).toEqual({ code: 'UPLOAD_TOO_LARGE', field: 'slips[0].image_base64' })
    expect(refusal(() => parseSlipBatchRequest(batch({ slips: [slip(1, { image_base64: `${IMAGE.slice(0, 8)}\n${IMAGE.slice(8)}` })] })))).toEqual({ code: 'VALIDATION_FAILED', field: 'slips[0].image_base64' })
    expect(refusal(() => parseSlipBatchRequest(batch({ slips: [slip(1, { media_type: 'image/heic' })] })))).toEqual({ code: 'UPLOAD_UNSUPPORTED_TYPE', field: 'slips[0].media_type' })
    expect(refusal(() => parseSlipBatchRequest(batch({ purpose: 'live', slips: [slip(1)] })))).toEqual({ code: 'VALIDATION_FAILED', field: 'slips[0].origin' })
    expect(refusal(() => parseSlipBatchRequest(batch({ slips: [slip(1, { origin: 'share' })] })))).toEqual({ code: 'VALIDATION_FAILED', field: 'slips[0].origin' })
    expect(refusal(() => parseSlipBatchRequest(batch({ slips: [slip(1, { album: 'ก'.repeat(61) })] })))).toEqual({ code: 'VALIDATION_FAILED', field: 'slips[0].album' })
    expect(refusal(() => parseSlipBatchRequest(batch({ slips: [slip(1, { album: '   ' })] })))).toEqual({ code: 'VALIDATION_FAILED', field: 'slips[0].album' })
    const { album: _album, ...withoutAlbum } = slip(1)
    expect(refusal(() => parseSlipBatchRequest(batch({ slips: [withoutAlbum] })))).toEqual({ code: 'VALIDATION_FAILED', field: 'slips[0].album' })
    expect(refusal(() => parseSlipBatchRequest(batch({ purpose: 'scan' })))).toEqual({ code: 'VALIDATION_FAILED', field: 'purpose' })
    expect(refusal(() => parseSlipBatchRequest(batch({ last: 'yes' })))).toEqual({ code: 'VALIDATION_FAILED', field: 'last' })
    expect(refusal(() => parseSlipBatchRequest(batch({ today: '25/10/2026' })))).toEqual({ code: 'INVALID_DATE', field: 'today' })
    expect(refusal(() => parseSlipBatchRequest(batch({ locale: 'fr' })))).toEqual({ code: 'VALIDATION_FAILED', field: 'locale' })
    expect(refusal(() => parseSlipBatchRequest({ ...batch(), extra: 1 }))).toEqual({ code: 'UNKNOWN_FIELD', field: 'extra' })
    expect(refusal(() => parseSlipBatchRequest(batch({ slips: [slip(1, { extra: 1 })] })))).toEqual({ code: 'UNKNOWN_FIELD', field: 'slips[0].extra' })
  })

  it('a confirm takes 1 to 50 drafts with distinct draft and record ids', () => {
    const fifty = Array.from({ length: 50 }, (_, n) => confirmItem(n))
    expect(parseSlipConfirmRequest({ drafts: fifty })).toEqual({ drafts: fifty })
    const kept = { ...record(1), source: 'typed' }
    expect(parseSlipConfirmRequest({ drafts: [confirmItem(1, { transaction: kept })] }).drafts[0].transaction).toEqual(kept)

    expect(refusal(() => parseSlipConfirmRequest({ drafts: Array.from({ length: 51 }, (_, n) => confirmItem(n)) }))).toEqual({ code: 'VALIDATION_FAILED', field: 'drafts' })
    expect(refusal(() => parseSlipConfirmRequest({ drafts: [] }))).toEqual({ code: 'VALIDATION_FAILED', field: 'drafts' })
    expect(refusal(() => parseSlipConfirmRequest({ drafts: [confirmItem(1), confirmItem(2, { draft_id: uuid(101) })] }))).toEqual({ code: 'VALIDATION_FAILED', field: 'drafts[1].draft_id' })
    expect(refusal(() => parseSlipConfirmRequest({ drafts: [confirmItem(1), confirmItem(2, { transaction: record(1) })] }))).toEqual({ code: 'VALIDATION_FAILED', field: 'drafts[1].transaction.id' })
    expect(refusal(() => parseSlipConfirmRequest({ drafts: [confirmItem(1, { draft_id: 'draft-1' })] }))).toEqual({ code: 'VALIDATION_FAILED', field: 'drafts[0].draft_id' })
    expect(refusal(() => parseSlipConfirmRequest({ drafts: [confirmItem(1, { transaction: [record(1)] })] }))).toEqual({ code: 'VALIDATION_FAILED', field: 'drafts[0].transaction' })
    expect(refusal(() => parseSlipConfirmRequest({ drafts: [confirmItem(1, { transaction: { type: 'expense' } })] }))).toEqual({ code: 'VALIDATION_FAILED', field: 'drafts[0].transaction.id' })
    expect(refusal(() => parseSlipConfirmRequest({ drafts: [confirmItem(1, { extra: 1 })] }))).toEqual({ code: 'UNKNOWN_FIELD', field: 'drafts[0].extra' })
    expect(refusal(() => parseSlipConfirmRequest({ drafts: [confirmItem(1)], extra: 1 }))).toEqual({ code: 'UNKNOWN_FIELD', field: 'extra' })
  })

  it('the inbox snapshot is exactly its id, version and open count, and an older reader skips it', () => {
    const change = (snapshot: Record<string, unknown>, id = SLIP_INBOX_ID) => ({ entity: 'slip_inbox', id, version: 2, state: 'active', snapshot })
    const inbox = { id: SLIP_INBOX_ID, version: 2, open: 3 }
    expect(isEntityChange(change(inbox))).toBe(true)
    const { slip_inbox: _inbox, ...older } = SYNC_ENTITY_VALIDATORS
    expect(isEntityChange(change(inbox), older)).toBe(false)
    expect(isEntityChange(change(inbox), older, { unknownEntities: 'skip' })).toBe(true)
    expect(isEntityChange(change({ ...inbox, extra: 1 }))).toBe(false)
    expect(isEntityChange(change({ ...inbox, id: uuid(9) }, uuid(9)))).toBe(false)
    expect(isSlipInboxSnapshot({ id: SLIP_INBOX_ID, version: 1, open: 100_000 })).toBe(true)
    expect(isSlipInboxSnapshot({ id: SLIP_INBOX_ID, version: 1, open: 100_001 })).toBe(false)
    expect(isSlipInboxSnapshot({ id: SLIP_INBOX_ID, version: 1, open: -1 })).toBe(false)
    expect(isSlipInboxSnapshot({ id: SLIP_INBOX_ID, version: 1, open: 1.5 })).toBe(false)
    expect(isSlipInboxSnapshot({ id: SLIP_INBOX_ID, version: 0, open: 0 })).toBe(false)
  })

  it('device registrations take an Expo push token or null, and nothing else', () => {
    const device = { push_token: 'ExponentPushToken[abc]', platform: 'ios', language: 'th', slip_notices: true }
    expect(parseDeviceRegistration(device)).toEqual(device)
    expect(parseDeviceRegistration({ ...device, push_token: null })).toEqual({ ...device, push_token: null })
    expect(parseDeviceRegistration({ ...device, push_token: `ExpoPushToken[${'a'.repeat(200)}]`, platform: 'android', language: 'en', slip_notices: false })).toEqual({ push_token: `ExpoPushToken[${'a'.repeat(200)}]`, platform: 'android', language: 'en', slip_notices: false })

    expect(refusal(() => parseDeviceRegistration({ ...device, push_token: 'abc' }))).toEqual({ code: 'VALIDATION_FAILED', field: 'push_token' })
    expect(refusal(() => parseDeviceRegistration({ ...device, push_token: 'ExponentPushToken[]' }))).toEqual({ code: 'VALIDATION_FAILED', field: 'push_token' })
    expect(refusal(() => parseDeviceRegistration({ ...device, push_token: `ExpoPushToken[${'a'.repeat(201)}]` }))).toEqual({ code: 'VALIDATION_FAILED', field: 'push_token' })
    expect(refusal(() => parseDeviceRegistration({ ...device, platform: 'web' }))).toEqual({ code: 'VALIDATION_FAILED', field: 'platform' })
    expect(refusal(() => parseDeviceRegistration({ ...device, language: 'vi' }))).toEqual({ code: 'VALIDATION_FAILED', field: 'language' })
    expect(refusal(() => parseDeviceRegistration({ ...device, slip_notices: 'yes' }))).toEqual({ code: 'VALIDATION_FAILED', field: 'slip_notices' })
    expect(refusal(() => parseDeviceRegistration({ ...device, extra: 1 }))).toEqual({ code: 'UNKNOWN_FIELD', field: 'extra' })
  })

  it('an account mapping takes a wallet id or null, and a slip ref a hash and a record id', () => {
    expect(parseSlipAccountUpdate({ wallet_id: uuid(1) })).toEqual({ wallet_id: uuid(1) })
    expect(parseSlipAccountUpdate({ wallet_id: null })).toEqual({ wallet_id: null })
    expect(refusal(() => parseSlipAccountUpdate({ wallet_id: 'cash' }))).toEqual({ code: 'VALIDATION_FAILED', field: 'wallet_id' })
    expect(refusal(() => parseSlipAccountUpdate({}))).toEqual({ code: 'VALIDATION_FAILED', field: 'wallet_id' })
    expect(refusal(() => parseSlipAccountUpdate({ wallet_id: null, version: 2 }))).toEqual({ code: 'UNKNOWN_FIELD', field: 'version' })

    expect(parseSlipRefRequest({ ref_hash: hash(7), transaction_id: uuid(2) })).toEqual({ ref_hash: hash(7), transaction_id: uuid(2) })
    expect(refusal(() => parseSlipRefRequest({ ref_hash: 'A'.repeat(64), transaction_id: uuid(2) }))).toEqual({ code: 'VALIDATION_FAILED', field: 'ref_hash' })
    expect(refusal(() => parseSlipRefRequest({ ref_hash: hash(7), transaction_id: 'record' }))).toEqual({ code: 'VALIDATION_FAILED', field: 'transaction_id' })
    expect(refusal(() => parseSlipRefRequest({ ref_hash: hash(7), transaction_id: uuid(2), reference: 'BPP06418' }))).toEqual({ code: 'UNKNOWN_FIELD', field: 'reference' })
  })

  it('push data names its kind and one id or month, never content', () => {
    expect(isPushData({ kind: 'slips_ready', ref: null })).toBe(true)
    expect(isPushData({ kind: 'statement_parsed', ref: uuid(5) })).toBe(true)
    expect(isPushData({ kind: 'export_ready', ref: uuid(6) })).toBe(true)
    expect(isPushData({ kind: 'month_recap_ready', ref: '2026-09' })).toBe(true)
    expect(isPushData({ kind: 'slips_ready', ref: '3' })).toBe(false)
    expect(isPushData({ kind: 'export_ready', ref: null })).toBe(false)
    expect(isPushData({ kind: 'statement_parsed', ref: '2026-09' })).toBe(false)
    expect(isPushData({ kind: 'month_recap_ready', ref: '2026-13' })).toBe(false)
    expect(isPushData({ kind: 'month_recap_ready', ref: 'ร้านป้าแดง ฿120' })).toBe(false)
    expect(isPushData({ kind: 'budget_over', ref: null })).toBe(false)
  })

  it('every DTO validator refuses an extra key and a missing one', () => {
    const rows: [string, (value: unknown) => boolean, Record<string, unknown>][] = [
      ['slip inbox snapshot', isSlipInboxSnapshot, { id: SLIP_INBOX_ID, version: 1, open: 0 }],
      ['slip batch result', isSlipBatchResult, batchResult],
      ['slip result', (value) => isSlipBatchResult({ ...batchResult, results: [value] }), result],
      ['uses left', (value) => isSlipBatchResult({ ...batchResult, uses_left: value }), usesLeft],
      ['slip drafts page', isSlipDraftsPage, draftsPage],
      ['slip draft', (value) => isSlipDraftsPage({ ...draftsPage, drafts: [value] }), draft],
      ['slip party', (value) => isSlipDraftsPage({ ...draftsPage, drafts: [{ ...draft, from: value }] }), party],
      ['slip account', isSlipAccountDto, account],
      ['slip accounts', isSlipAccountsDto, { accounts: [account] }],
      ['slip salt', isSlipSaltDto, { salt: Buffer.from(Uint8Array.from({ length: 32 }, (_, i) => i + 1)).toString('base64url') }],
      ['bank albums', isBankAlbumsDto, { albums: [album] }],
      ['bank album', (value) => isBankAlbumsDto({ albums: [value] }), album],
      ['push data', isPushData, { kind: 'month_recap_ready', ref: '2026-09' }],
    ]
    for (const [name, isValid, valid] of rows) {
      expect(isValid(valid), `${name} as given`).toBe(true)
      expect(isValid({ ...valid, extra: 1 }), `${name} with an extra key`).toBe(false)
      for (const key of Object.keys(valid)) {
        const { [key]: _dropped, ...missing } = valid
        expect(isValid(missing), `${name} without ${key}`).toBe(false)
      }
    }
  })

  it('every DTO field takes its own shape, up to its limits, and nothing else', () => {
    const withDraft = (fields: Record<string, unknown>) => isSlipDraftsPage({ ...draftsPage, drafts: [{ ...draft, ...fields }] })
    const withParty = (fields: Record<string, unknown>) => withDraft({ to: { ...party, ...fields } })
    const withResult = (fields: Record<string, unknown>) => isSlipBatchResult({ ...batchResult, results: [{ ...result, ...fields }] })
    const withAccount = (fields: Record<string, unknown>) => isSlipAccountDto({ ...account, ...fields })
    const withAlbum = (fields: Record<string, unknown>) => isBankAlbumsDto({ albums: [{ ...album, ...fields }] })
    const allowed: [string, boolean][] = [
      ['largest amount', withDraft({ amount_minor: '99999999999' })],
      ['no amount, date or time', withDraft({ amount_minor: null, occurred_on: null, occurred_time: null })],
      ['last minute of the day', withDraft({ occurred_time: '23:59' })],
      ['money in, a category and a possible duplicate', withDraft({ direction: 'in', category_id: uuid(7), category_guessed: true, duplicate_of: uuid(8) })],
      ['a shared slip read by Opus', withDraft({ album: null, origin: 'share', model: 'claude-opus-5-5', escalated: true })],
      ['a 120-character name', withParty({ name: 'ก'.repeat(120) })],
      ['an unknown side', withParty({ bank: null, account_last4: null, name: null })],
      ['every outcome', ['read', 'duplicate', 'unreadable', 'over_quota', 'paused'].every((outcome) => withResult({ outcome, draft: null }))],
      ['a wait', isSlipBatchResult({ ...batchResult, retry_after_seconds: 30 })],
      ['a next page', isSlipDraftsPage({ ...draftsPage, next_cursor: 'eyJvbiI6IjIwMjYtMTAtMjQifQ' })],
      ['a mapped account', withAccount({ wallet_id: uuid(1), version: 2, open_drafts: 0 })],
      ['a 60-character album on Android', withAlbum({ platform: 'android', album_name: 'ก'.repeat(60) })],
    ]
    for (const [name, value] of allowed) expect(value, name).toBe(true)
    const refused: [string, boolean][] = [
      ['draft id', withDraft({ id: 'draft' })],
      ['zero amount', withDraft({ amount_minor: '0' })],
      ['amount over the cap', withDraft({ amount_minor: '100000000000' })],
      ['amount as a number', withDraft({ amount_minor: 125050 })],
      ['impossible date', withDraft({ occurred_on: '2026-02-30' })],
      ['date before 1970', withDraft({ occurred_on: '1969-12-31' })],
      ['time past midnight', withDraft({ occurred_time: '24:00' })],
      ['direction', withDraft({ direction: 'both' })],
      ['category id', withDraft({ category_id: 'food' })],
      ['category_guessed', withDraft({ category_guessed: 'no' })],
      ['unknown flag', withDraft({ flags: ['made_up'] })],
      ['empty album', withDraft({ album: '' })],
      ['long album', withDraft({ album: 'ก'.repeat(61) })],
      ['origin', withDraft({ origin: 'camera' })],
      ['model', withDraft({ model: 'rules' })],
      ['escalated', withDraft({ escalated: 0 })],
      ['created_at', withDraft({ created_at: 'yesterday' })],
      ['expires_at', withDraft({ expires_at: 'soon' })],
      ['duplicate_of', withDraft({ duplicate_of: 'record' })],
      ['party bank', withParty({ bank: 'gogo' })],
      ['three digits', withParty({ account_last4: '123' })],
      ['five digits', withParty({ account_last4: '12345' })],
      ['empty name', withParty({ name: '' })],
      ['long name', withParty({ name: 'ก'.repeat(121) })],
      ['outcome', withResult({ outcome: 'lost' })],
      ['result hash', withResult({ ref_hash: 'A'.repeat(64) })],
      ['results not a list', isSlipBatchResult({ ...batchResult, results: result })],
      ['uses below zero', isSlipBatchResult({ ...batchResult, uses_left: { live: -1, backfill: 0 } })],
      ['a fractional wait', isSlipBatchResult({ ...batchResult, retry_after_seconds: 1.5 })],
      ['total below zero', isSlipDraftsPage({ ...draftsPage, total: -1 })],
      ['an empty cursor', isSlipDraftsPage({ ...draftsPage, next_cursor: '' })],
      ['a cursor with a space', isSlipDraftsPage({ ...draftsPage, next_cursor: 'a b' })],
      ['account version 0', withAccount({ version: 0 })],
      ['account without a bank', withAccount({ bank: null })],
      ['account digits', withAccount({ account_last4: 'x234' })],
      ['account wallet', withAccount({ wallet_id: 'cash' })],
      ['open drafts below zero', withAccount({ open_drafts: -1 })],
      ['a short salt', isSlipSaltDto({ salt: 'A'.repeat(42) })],
      ['a padded salt', isSlipSaltDto({ salt: `${'A'.repeat(42)}=` })],
      ['a base64 salt', isSlipSaltDto({ salt: '+'.repeat(43) })],
      ['album bank', withAlbum({ bank: 'gogo' })],
      ['album platform', withAlbum({ platform: 'web' })],
      ['empty album name', withAlbum({ album_name: '' })],
      ['long album name', withAlbum({ album_name: 'ก'.repeat(61) })],
    ]
    for (const [name, value] of refused) expect(value, name).toBe(false)
  })
})
