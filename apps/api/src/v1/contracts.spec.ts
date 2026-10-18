import {
  ATTACHMENT_COPY_REQUIREMENTS,
  ATTACHMENT_DOWNLOAD_PATH,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MESSAGE_KEYS,
  ContractValidationError,
  MINOR_AMOUNT_MAX,
  RECEIPT_RETENTION_CONSENT,
  isAttachmentGrant,
  isImportPreview,
  assertKnownFields,
  bangkokDate,
  compareVersions,
  BUILTIN_CATEGORIES,
  CATEGORY_COLORS,
  formatClientHeader,
  isBudgetSnapshot,
  isCategorySnapshot,
  isCommittedChangeGroup,
  isEntityChange,
  isSnapshotChunk,
  isSyncChangesPage,
  SYNC_ENTITY_VALIDATORS,
  isSnapshotChunkGrant,
  isUuid,
  isTransactionSnapshot,
  isWalletSnapshot,
  normalizeCommand,
  normalizeMerchant,
  normalizeName,
  normalizeNote,
  parseClientHeader,
  parseMinor,
  parseMonth,
  validateOccurredOn,
  validateTrackingStart,
} from '@gogospend/contracts';
import type { CommandInput } from '@gogospend/contracts';

const amount = { allowZero: false, allowNegative: false, max: MINOR_AMOUNT_MAX };
const opening = { allowZero: true, allowNegative: false, max: MINOR_AMOUNT_MAX };
const total = { allowZero: true, allowNegative: true };

function failure(fn: () => unknown): { code: string; field: string | undefined } | undefined {
  try {
    fn();
  } catch (error) {
    if (error instanceof ContractValidationError) return { code: error.code, field: error.field };
    throw error;
  }
  return undefined;
}
const codeOf = (fn: () => unknown) => failure(fn)?.code;

describe('v1 money', () => {
  it('parses_satang_without_float_conversion', () => {
    expect(parseMinor('6500', { allowZero: false, allowNegative: false })).toBe(6500n);
  });

  it.each([1.5, 6500, '1.5', '65.00', '65.001', '1e3', '01', '-0', '+5', 'NaN', '', '   ', ' 5', '5 ', '0x10', '٦٥', null, undefined, {}])(
    'rejects non-canonical amount %p',
    (value) => {
      expect(codeOf(() => parseMinor(value, amount))).toBe('INVALID_MINOR');
    },
  );

  it('enforces the amount cap and positivity', () => {
    expect(parseMinor('99999999999', amount)).toBe(99_999_999_999n);
    expect(codeOf(() => parseMinor('100000000000', amount))).toBe('MINOR_OUT_OF_RANGE');
    expect(codeOf(() => parseMinor('0', amount))).toBe('MINOR_OUT_OF_RANGE');
    expect(codeOf(() => parseMinor('-6500', amount))).toBe('MINOR_OUT_OF_RANGE');
  });

  it('allows a zero opening balance but not a negative one', () => {
    expect(parseMinor('0', opening)).toBe(0n);
    expect(codeOf(() => parseMinor('-1', opening))).toBe('MINOR_OUT_OF_RANGE');
  });

  it('permits negative values only for totals', () => {
    expect(parseMinor('-235000', total)).toBe(-235000n);
  });

  it('applies a cap to the magnitude of negative values too', () => {
    const cappedSigned = { allowZero: true, allowNegative: true, max: MINOR_AMOUNT_MAX };
    expect(parseMinor('-99999999999', cappedSigned)).toBe(-99_999_999_999n);
    expect(codeOf(() => parseMinor('-100000000000', cappedSigned))).toBe('MINOR_OUT_OF_RANGE');
  });

  it('keeps totals above the JS safe-integer range exact', () => {
    const beyondDouble = '9007199254740993'; // 2^53 + 1 has no exact double
    expect(parseMinor(beyondDouble, total)).toBe(9007199254740993n);
    expect(parseMinor(`-${beyondDouble}`, total).toString()).toBe(`-${beyondDouble}`);
    expect((parseMinor('9007199254740992', total) + parseMinor('1', total)).toString()).toBe(beyondDouble);
  });

  it('rejects unbounded digit strings before converting them', () => {
    expect(codeOf(() => parseMinor('1'.repeat(41), total))).toBe('INVALID_MINOR');
  });

  it('reports the offending field', () => {
    expect(failure(() => parseMinor('1.5', amount, 'amount_minor'))).toEqual({ code: 'INVALID_MINOR', field: 'amount_minor' });
  });
});

describe('v1 dates', () => {
  const start = '2024-01-01';
  const today = '2026-10-17';

  it('accepts real dates inside the tracking window, including both ends', () => {
    expect(validateOccurredOn('2024-02-29', start, today)).toBe('2024-02-29');
    expect(validateOccurredOn(start, start, today)).toBe(start);
    expect(validateOccurredOn(today, start, today)).toBe(today);
    expect(validateOccurredOn('2000-02-29', '1999-01-01', today)).toBe('2000-02-29');
  });

  it.each(['2023-02-29', '2026-02-29', '2100-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-1-01', '20261017', '2026-10-17T00:00:00Z', '0000-01-01', '', 20261017, null])(
    'rejects invalid date %p',
    (value) => {
      expect(codeOf(() => validateOccurredOn(value, '0001-01-01', today))).toBe('INVALID_DATE');
    },
  );

  it('rejects dates before tracking started and after today', () => {
    expect(codeOf(() => validateOccurredOn('2023-12-31', start, today))).toBe('DATE_BEFORE_TRACKING_START');
    expect(codeOf(() => validateOccurredOn('2026-10-18', start, today))).toBe('DATE_IN_FUTURE');
  });

  it('derives the Bangkok calendar day across midnight, year end and leap day', () => {
    expect(bangkokDate(new Date('2026-10-16T16:59:59.999Z'))).toBe('2026-10-16');
    expect(bangkokDate(new Date('2026-10-16T17:00:00.000Z'))).toBe('2026-10-17');
    expect(bangkokDate(new Date('2026-12-31T17:00:00.000Z'))).toBe('2027-01-01');
    expect(bangkokDate(new Date('2028-02-28T17:30:00.000Z'))).toBe('2028-02-29');
  });

  it('treats 00:30 in Bangkok as today even while UTC is still yesterday', () => {
    const todayBangkok = bangkokDate(new Date('2026-10-16T17:30:00.000Z'));
    expect(validateOccurredOn('2026-10-17', start, todayBangkok)).toBe('2026-10-17');
  });

  it('refuses an invalid instant instead of guessing a day', () => {
    expect(() => bangkokDate(new Date('not a date'))).toThrow(RangeError);
  });
});

describe('v1 command normalization', () => {
  const kind = 'transaction.create';

  it('makes reordered equivalent payloads equal', () => {
    const a = normalizeCommand(kind, 1, { wallet_id: 'w', amount_minor: '6500', meta: { b: 1, a: [{ y: 1, x: 2 }] } });
    const b = normalizeCommand(kind, 1, { meta: { a: [{ x: 2, y: 1 }], b: 1 }, amount_minor: '6500', wallet_id: 'w' });
    expect(a).toEqual(b);
    expect(a.canonicalJson).toBe(
      '{"kind":"transaction.create","payload":{"amount_minor":"6500","meta":{"a":[{"x":2,"y":1}],"b":1},"wallet_id":"w"},"schema_version":1}',
    );
  });

  it('leaves command identity to the command ID, not to content', () => {
    // Two same-day coffees normalize identically. Normalization only defines
    // the digest compared under ONE command ID (IDEMPOTENCY_MISMATCH); keeping
    // the two commands apart is the receipt key's job, proven in M1.
    const payload = { wallet_id: 'w', amount_minor: '6500' };
    const first: CommandInput<typeof payload> = { commandId: '0192f0c1-7b3a-7c3e-9d4f-1a2b3c4d5e6f', kind, schemaVersion: 1, payload };
    const second: CommandInput<typeof payload> = { ...first, commandId: '0192f0c1-7b3a-7c3e-9d4f-1a2b3c4d5e70' };
    const [one, two] = [first, second].map((command) => normalizeCommand(command.kind, command.schemaVersion, command.payload));
    expect(one).toEqual(two);
    expect(Object.keys(one).sort()).toEqual(['canonicalJson', 'kind', 'schemaVersion']);
  });

  it('normalizes the same payload under two schema versions differently', () => {
    expect(normalizeCommand(kind, 1, { a: 1 }).canonicalJson).not.toBe(normalizeCommand(kind, 2, { a: 1 }).canonicalJson);
  });

  it('preserves array order', () => {
    expect(normalizeCommand(kind, 1, [1, 2]).canonicalJson).not.toBe(normalizeCommand(kind, 1, [2, 1]).canonicalJson);
  });

  it('omits undefined object properties exactly as JSON does', () => {
    expect(normalizeCommand(kind, 1, { a: 1, b: undefined })).toEqual(normalizeCommand(kind, 1, { a: 1 }));
  });

  it('treats an own __proto__ key as data, not as a prototype', () => {
    const payload: unknown = JSON.parse('{"__proto__":{"x":1},"a":1}');
    expect(normalizeCommand('k', 1, payload).canonicalJson).toBe('{"kind":"k","payload":{"__proto__":{"x":1},"a":1},"schema_version":1}');
  });

  it.each([[[undefined]], [[1, , 3]], [new Array(1)], [1.5], [2 ** 53], [Number.NaN], [Number.POSITIVE_INFINITY], [1n], [() => 1], [new Date(0)], [new Map()], [Symbol('s')]])(
    'rejects non-JSON payload %p',
    (payload) => {
      expect(codeOf(() => normalizeCommand(kind, 1, payload))).toBe('INVALID_COMMAND');
    },
  );

  it('rejects malformed kinds and schema versions', () => {
    for (const bad of ['', 'Transaction', 'a b', `a${'b'.repeat(64)}`]) expect(codeOf(() => normalizeCommand(bad, 1, {}))).toBe('INVALID_COMMAND');
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(codeOf(() => normalizeCommand(kind, bad, {}))).toBe('INVALID_COMMAND');
  });

  it('rejects pathologically deep payloads', () => {
    let deep: unknown = {};
    for (let i = 0; i < 40; i++) deep = { d: deep };
    expect(codeOf(() => normalizeCommand(kind, 1, deep))).toBe('INVALID_COMMAND');
  });
});

describe('v1 request shapes', () => {
  it('rejects unknown fields and names them', () => {
    expect(failure(() => assertKnownFields({ amount_minor: '1', owner_id: 'x' }, ['amount_minor']))).toEqual({ code: 'UNKNOWN_FIELD', field: 'owner_id' });
  });

  it('returns a known-field object unchanged', () => {
    expect(assertKnownFields({ amount_minor: '1' }, ['amount_minor', 'note'])).toEqual({ amount_minor: '1' });
  });

  it.each([null, [], 'x', 1, new Date(0)])('rejects a non-object body %p', (value) => {
    expect(codeOf(() => assertKnownFields(value, ['a']))).toBe('VALIDATION_FAILED');
  });

  it('accepts canonical lower-case UUIDs only', () => {
    expect(isUuid('0192f0c1-7b3a-7c3e-9d4f-1a2b3c4d5e6f')).toBe(true);
    expect(isUuid('3b241101-e2bb-4255-8caf-4136c566a962')).toBe(true);
    for (const bad of ['3B241101-E2BB-4255-8CAF-4136C566A962', '3b241101e2bb42558caf4136c566a962', '00000000-0000-0000-0000-000000000000', '3b241101-e2bb-4255-8caf-4136c566a96', 123]) {
      expect(isUuid(bad)).toBe(false);
    }
  });

  it('parses, formats and orders client version headers', () => {
    expect(parseClientHeader('ios/1.4.0')).toEqual({ platform: 'ios', version: '1.4.0' });
    expect(formatClientHeader({ platform: 'android', version: '2.0.10' })).toBe('android/2.0.10');
    for (const bad of ['web/1.0.0', 'ios/1.4', 'ios/01.4.0', 'ios/1.4.0-beta', ' ios/1.4.0', 'IOS/1.4.0', '', undefined]) {
      expect(parseClientHeader(bad)).toBeNull();
    }
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('2.0.0', '2.0.0')).toBe(0);
    expect(compareVersions('0.9.12', '1.0.0')).toBe(-1);
  });

  it('refuses to compare malformed versions rather than failing open', () => {
    for (const [a, b] of [['1.4.0', '1.4'], ['v2.0.0', '1.0.0'], ['1.0.0.9', '1.0.0'], ['1.0.0', '']]) {
      expect(() => compareVersions(a, b)).toThrow(TypeError);
      expect(() => compareVersions(b, a)).toThrow(TypeError);
    }
  });
});

describe('v1 wallets and categories', () => {
  it('normalizes names: NFC, trimmed, 1-80 code points, no control characters', () => {
    expect(normalizeName('  Cafe\u0301 ', 'name')).toBe('Caf\u00e9');
    expect(normalizeName('ก'.repeat(80), 'name')).toHaveLength(80);
    expect(normalizeName('😀'.repeat(80), 'name')).toBe('😀'.repeat(80));
    for (const bad of ['', '   ', 'x'.repeat(81), 'a\tb', 'a\u0000', 'a\u2028b', 5, null]) {
      expect(failure(() => normalizeName(bad, 'name'))).toEqual({ code: 'VALIDATION_FAILED', field: 'name' });
    }
  });

  it('accepts tracking starts from 1970 up to today in Bangkok', () => {
    expect(validateTrackingStart('1970-01-01', '2026-10-17')).toBe('1970-01-01');
    expect(validateTrackingStart('2026-10-17', '2026-10-17')).toBe('2026-10-17');
    expect(codeOf(() => validateTrackingStart('2026-10-18', '2026-10-17'))).toBe('DATE_IN_FUTURE');
    expect(codeOf(() => validateTrackingStart('1969-12-31', '2026-10-17'))).toBe('INVALID_DATE');
    expect(codeOf(() => validateTrackingStart('2025-02-29', '2026-10-17'))).toBe('INVALID_DATE');
  });

  it('recognizes exactly the persisted wallet and category shapes', () => {
    const wallet = { id: 'a', name: 'Cash', currency: 'THB', opening_minor: '0', tracking_start: '2026-01-01', archived: false, version: 1 };
    expect(isWalletSnapshot(wallet)).toBe(true);
    expect(isWalletSnapshot({ ...wallet, balance_minor: '0' })).toBe(false);
    expect(isWalletSnapshot({ ...wallet, opening_minor: '-1' })).toBe(false);
    expect(isWalletSnapshot({ ...wallet, currency: 'USD' })).toBe(false);
    const category = { id: 'b', type: 'expense', builtin_key: null, label: 'Pets', color: CATEGORY_COLORS[0], archived: false, version: 1 };
    expect(isCategorySnapshot(category)).toBe(true);
    expect(isCategorySnapshot({ ...category, label: null })).toBe(false);
    // Snapshots accept any stored #RRGGBB, so a palette change can never strand an old category.
    expect(isCategorySnapshot({ ...category, color: '#000000' })).toBe(true);
    expect(isCategorySnapshot({ ...category, color: '#00000g' })).toBe(false);
    expect(isCategorySnapshot({ ...category, builtin_key: 'cashback' })).toBe(false);
  });

  it('built-in categories use palette colours and unique keys, and leave out cashback', () => {
    const keys = BUILTIN_CATEGORIES.map((builtin) => builtin.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain('cashback');
    expect(BUILTIN_CATEGORIES.every((builtin) => (CATEGORY_COLORS as readonly string[]).includes(builtin.color))).toBe(true);
  });
});

describe('v1 records', () => {
  it('normalizes notes (multi-line) and merchants (one line); blank means none', () => {
    for (const blank of [undefined, null, '', '   ', '\n\n']) {
      expect(normalizeNote(blank)).toBeNull();
      expect(normalizeMerchant(blank)).toBeNull();
    }
    expect(normalizeNote(' a\r\nb\rc ')).toBe('a\nb\nc');
    expect(normalizeNote('n'.repeat(500))).toHaveLength(500);
    expect(failure(() => normalizeNote('n'.repeat(501)))).toEqual({ code: 'VALIDATION_FAILED', field: 'note' });
    expect(failure(() => normalizeNote('a\u0000b'))).toEqual({ code: 'VALIDATION_FAILED', field: 'note' });
    expect(failure(() => normalizeMerchant('a\nb'))).toEqual({ code: 'VALIDATION_FAILED', field: 'merchant' });
    expect(failure(() => normalizeMerchant('m'.repeat(121)))).toEqual({ code: 'VALIDATION_FAILED', field: 'merchant' });
    expect(failure(() => normalizeNote(5))).toEqual({ code: 'VALIDATION_FAILED', field: 'note' });
  });

  it('recognizes exactly the persisted entry and transfer shapes', () => {
    const common = { id: 'a', amount_minor: '6500', occurred_on: '2026-09-20', note: null, merchant: null, deleted_at: null, version: 1 };
    expect(isTransactionSnapshot({ ...common, type: 'expense', wallet_id: 'w', category_id: 'c' })).toBe(true);
    expect(isTransactionSnapshot({ ...common, type: 'transfer', source_wallet_id: 'w', destination_wallet_id: 'v' })).toBe(true);
    expect(isTransactionSnapshot({ ...common, type: 'transfer', source_wallet_id: 'w', destination_wallet_id: 'w' })).toBe(false);
    expect(isTransactionSnapshot({ ...common, type: 'transfer', source_wallet_id: 'w', destination_wallet_id: 'v', category_id: 'c' })).toBe(false);
    expect(isTransactionSnapshot({ ...common, type: 'expense', wallet_id: 'w', category_id: 'c', amount_minor: '0' })).toBe(false);
    expect(isTransactionSnapshot({ ...common, type: 'refund', wallet_id: 'w', category_id: 'c' })).toBe(false);
  });

  it('P2c: a record snapshot may name its receipt; older snapshots without one stay valid', () => {
    const common = { id: 'a', amount_minor: '6500', occurred_on: '2026-09-20', note: null, merchant: null, deleted_at: null, version: 2 };
    const receipt = '0b8f6a52-1c3d-4e5f-8a7b-9c0d1e2f3a4b';
    expect(isTransactionSnapshot({ ...common, type: 'expense', wallet_id: 'w', category_id: 'c', attachment_id: receipt })).toBe(true);
    expect(isTransactionSnapshot({ ...common, type: 'transfer', source_wallet_id: 'w', destination_wallet_id: 'v', attachment_id: receipt })).toBe(true);
    for (const bad of [null, '', 'receipt/x/y', receipt.toUpperCase(), 7]) {
      expect(isTransactionSnapshot({ ...common, type: 'expense', wallet_id: 'w', category_id: 'c', attachment_id: bad })).toBe(false);
    }
    expect(isTransactionSnapshot({ ...common, type: 'expense', wallet_id: 'w', category_id: 'c', attachment_key: receipt })).toBe(false);
  });
});

describe('v1 receipt attachments (P2c)', () => {
  const grant = {
    url: `${ATTACHMENT_DOWNLOAD_PATH}AbC_d-1`,
    expires_at: '2026-10-18T10:05:00.000Z',
    content_type: 'image/jpeg',
    bytes: 1234,
    sha256: 'a'.repeat(64),
  };

  it('recognizes exactly a grant: a relative download path, the image type, size and digest', () => {
    expect(isAttachmentGrant(grant)).toBe(true);
    expect(isAttachmentGrant({ ...grant, url: 'https://bucket.example/receipt/x.jpg' })).toBe(false);
    expect(isAttachmentGrant({ ...grant, url: `${ATTACHMENT_DOWNLOAD_PATH}../x` })).toBe(false);
    expect(isAttachmentGrant({ ...grant, content_type: 'image/heic' })).toBe(false);
    expect(isAttachmentGrant({ ...grant, bytes: 0 })).toBe(false);
    expect(isAttachmentGrant({ ...grant, bytes: ATTACHMENT_MAX_BYTES + 1 })).toBe(false);
    expect(isAttachmentGrant({ ...grant, sha256: 'A'.repeat(64) })).toBe(false);
    expect(isAttachmentGrant({ ...grant, object_key: 'receipt/x' })).toBe(false);
    expect(isAttachmentGrant({ ...grant, expires_at: 'soon' })).toBe(false);
  });

  it('names the consent literal and the copy the client must show, including that removal has no undo', () => {
    expect(RECEIPT_RETENTION_CONSENT).toBe('retain_receipt');
    expect(ATTACHMENT_MESSAGE_KEYS.removeNoUndo).toBe('attachments.remove_no_undo');
    expect(ATTACHMENT_COPY_REQUIREMENTS[ATTACHMENT_MESSAGE_KEYS.removeNoUndo]).toMatch(/cannot be undone/);
    expect(ATTACHMENT_COPY_REQUIREMENTS[ATTACHMENT_MESSAGE_KEYS.retainConsent]).toBeDefined();
  });

  it('a preview image carries its opaque attachment id and retain deadline, never a key', () => {
    const preview = {
      job_id: '1b8f6a52-1c3d-4e5f-8a7b-9c0d1e2f3a4b', status: 'ready', candidates: [], issues: [], duplicate_advice: [], review_revision: '1', expires_at: '2026-10-25T10:00:00.000Z',
      summary: {
        layout: 'receipt', candidate_count: 0, review_required_count: 0, totals: { expense_minor: '0', income_minor: '0', transfer_minor: '0' },
        image: { width: 64, height: 48, attachment_id: '2b8f6a52-1c3d-4e5f-8a7b-9c0d1e2f3a4b', attachable_until: '2026-10-19T09:58:00.000Z' },
      },
    };
    expect(isImportPreview(preview)).toBe(true);
    expect(isImportPreview({ ...preview, summary: { ...preview.summary, image: { ...preview.summary.image, attachable_until: null } } })).toBe(true);
    expect(isImportPreview({ ...preview, summary: { ...preview.summary, image: { width: 64, height: 48 } } })).toBe(false);
    expect(isImportPreview({ ...preview, summary: { ...preview.summary, image: { ...preview.summary.image, attachment_id: 'import_image/x' } } })).toBe(false);
    expect(isImportPreview({ ...preview, summary: { ...preview.summary, image: { ...preview.summary.image, image_key: 'import_image/x' } } })).toBe(false);
  });
});

describe('v1 budgets', () => {
  it('parses calendar months from 1970-01', () => {
    expect(parseMonth('2026-09')).toBe('2026-09');
    for (const bad of ['2026-9', '2026-13', '2026-00', '1969-12', '2026-09-01', 202609, undefined]) {
      expect(failure(() => parseMonth(bad))).toEqual({ code: 'VALIDATION_FAILED', field: 'month' });
    }
  });

  it('recognizes exactly the persisted budget shape', () => {
    const budget = { id: 'b', month: '2026-09', overall_limit_minor: '1000', category_limits: [{ category_id: 'c', limit_minor: '10' }], version: 1 };
    expect(isBudgetSnapshot(budget)).toBe(true);
    expect(isBudgetSnapshot({ ...budget, overall_limit_minor: '0' })).toBe(false);
    expect(isBudgetSnapshot({ ...budget, category_limits: [{ category_id: 'c', limit_minor: '10', note: 'x' }] })).toBe(false);
    expect(isBudgetSnapshot({ ...budget, month: '2026-9' })).toBe(false);
  });
});

describe('v1 text hygiene', () => {
  it('refuses names that are invisible, direction-switching or not well-formed Unicode', () => {
    for (const bad of ['\u200b', '\u3164', '\u2060\u2060', '\u202eevil', 'a\u2066b', 'A\ud800', '\udc00x']) {
      expect(failure(() => normalizeName(bad, 'name'))).toEqual({ code: 'VALIDATION_FAILED', field: 'name' });
    }
    expect(normalizeName('ร้านกาแฟ', 'name')).toBe('ร้านกาแฟ');
    expect(normalizeName('👨‍👩‍👧', 'name')).toBe('👨‍👩‍👧');
  });

  it('refuses direction overrides and broken surrogates in notes and merchants too', () => {
    expect(failure(() => normalizeNote('ok \u202e'))).toEqual({ code: 'VALIDATION_FAILED', field: 'note' });
    expect(failure(() => normalizeMerchant('Shop\ud800'))).toEqual({ code: 'VALIDATION_FAILED', field: 'merchant' });
    expect(normalizeMerchant('\u200b')).toBeNull();
  });
});

describe('sync wire validators', () => {
  const wallet = { id: '0000000a-0000-4000-8000-000000000001', name: 'Cash', currency: 'THB', opening_minor: '0', tracking_start: '2026-01-01', archived: false, version: 1 };
  const change = (overrides: Record<string, unknown> = {}) => ({ entity: 'wallet', id: wallet.id, version: 1, state: 'active', snapshot: wallet, ...overrides });

  it('accepts only known entities whose snapshot matches their persisted DTO', () => {
    expect(isWalletSnapshot(wallet)).toBe(true);
    expect(isEntityChange(change())).toBe(true);
    expect(isEntityChange(change({ state: 'deleted' }))).toBe(true);
    expect(isEntityChange(change({ state: 'purged', snapshot: null }))).toBe(true);
    expect(isEntityChange(change({ entity: 'fixture_purchase' }))).toBe(false);
    expect(isEntityChange(change({ entity: 'constructor' }))).toBe(false);
    expect(isEntityChange(change({ version: 2 }))).toBe(false);
    expect(isEntityChange(change({ snapshot: { ...wallet, extra: true } }))).toBe(false);
    expect(isEntityChange(change({ state: 'purged' }))).toBe(false);
    expect(isEntityChange({ ...change(), more: 1 })).toBe(false);
  });

  it('checks whole groups and versioned chunks', () => {
    const group = { revision: '12', command_id: '0000000c-0000-4000-8000-000000000001', changes: [change()] };
    expect(isCommittedChangeGroup(group)).toBe(true);
    expect(isCommittedChangeGroup({ ...group, revision: '012' })).toBe(false);
    expect(isCommittedChangeGroup({ ...group, revision: '0' })).toBe(false);
    expect(isCommittedChangeGroup({ ...group, changes: [] })).toBe(false);
    const chunk = { schema_version: 1, snapshot_id: '0000000d-0000-4000-8000-000000000001', high_water: '12', index: 0, entities: [change()] };
    expect(isSnapshotChunk(chunk)).toBe(true);
    expect(isSnapshotChunk({ ...chunk, schema_version: 2 })).toBe(false);
    expect(isSnapshotChunk({ ...chunk, entities: [change({ snapshot: null })] })).toBe(false);
    expect(isSnapshotChunkGrant({ index: 0, bytes: 10, sha256: 'a'.repeat(64), grant: 'A'.repeat(55), grant_expires_at: '2026-10-17T00:05:00.000Z' })).toBe(true);
    expect(isSnapshotChunkGrant({ index: 0, bytes: 10, sha256: 'a'.repeat(64), grant: 'sync_snapshot/x', grant_expires_at: '2026-10-17T00:05:00.000Z' })).toBe(false);
  });
  describe('older validator sets (an entity type the reader does not know yet)', () => {
    // A build from before P3 knows no import_review / import_selection.
    const { import_review: _review, import_selection: _selection, ...older } = SYNC_ENTITY_VALIDATORS;
    const job = '0000003d-0000-4000-8000-000000000001';
    const importChange = (overrides: Record<string, unknown> = {}) => ({ entity: 'import_review', id: job, version: 1, state: 'active', snapshot: { id: job, review_revision: '2' }, ...overrides });
    const group = (...changes: unknown[]) => ({ revision: '12', command_id: '0000000c-0000-4000-8000-000000000001', changes });
    const page = (...groups: unknown[]) => ({ groups, next_cursor: 'cursor', has_more: false });
    const skip = { unknownEntities: 'skip' } as const;

    it('rejects an unknown entity strictly (the default), but tolerates it when the reader skips unknown entities', () => {
      expect(isEntityChange(importChange(), older)).toBe(false);
      expect(isCommittedChangeGroup(group(change(), importChange()), older)).toBe(false);
      expect(isEntityChange(importChange(), older, skip)).toBe(true);
      expect(isCommittedChangeGroup(group(change(), importChange()), older, skip)).toBe(true);
      expect(isSyncChangesPage(page(group(importChange())), older, skip)).toBe(true);
      const chunk = { schema_version: 1, snapshot_id: '0000000d-0000-4000-8000-000000000001', high_water: '12', index: 0, entities: [change(), importChange()] };
      expect(isSnapshotChunk(chunk, older)).toBe(false);
      expect(isSnapshotChunk(chunk, older, skip)).toBe(true);
    });

    it('still checks the envelope of an unknown entity and the snapshot of every known one', () => {
      expect(isEntityChange(importChange({ id: 'nope' }), older, skip)).toBe(false);
      expect(isEntityChange(importChange({ version: 0 }), older, skip)).toBe(false);
      expect(isEntityChange(importChange({ state: 'gone' }), older, skip)).toBe(false);
      expect(isEntityChange(importChange({ state: 'purged' }), older, skip)).toBe(false);
      expect(isEntityChange(importChange({ state: 'purged', snapshot: null }), older, skip)).toBe(true);
      expect(isEntityChange({ ...importChange(), extra: 1 }, older, skip)).toBe(false);
      expect(isEntityChange(importChange({ entity: 'constructor' }), older, skip)).toBe(true);
      expect(isEntityChange(change({ snapshot: { ...wallet, extra: true } }), older, skip)).toBe(false);
      expect(isCommittedChangeGroup(group(change({ snapshot: { ...wallet, extra: true } }), importChange()), older, skip)).toBe(false);
    });

    it('a reader that knows the entity still validates its snapshot strictly', () => {
      expect(isEntityChange(importChange(), SYNC_ENTITY_VALIDATORS, skip)).toBe(true);
      expect(isEntityChange(importChange({ snapshot: { id: job, review_revision: 2 } }), SYNC_ENTITY_VALIDATORS, skip)).toBe(false);
    });
  });
});
