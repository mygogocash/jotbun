import { isSpendAllowlisted, parseSpendAllowlist } from './spend-allowlist';

describe('spend allowlist', () => {
  it('empty or junk admits nobody', () => {
    expect(parseSpendAllowlist(undefined).size).toBe(0);
    expect(parseSpendAllowlist('').size).toBe(0);
    expect(parseSpendAllowlist('not-an-id, still-bad').size).toBe(0);
  });

  it('only 24-hex ids survive, lowercased', () => {
    const ids = parseSpendAllowlist(
      ' 507F1F77BCF86CD799439011 , deadbeef, 507f1f77bcf86cd799439012 ',
    );
    expect([...ids]).toEqual([
      '507f1f77bcf86cd799439011',
      '507f1f77bcf86cd799439012',
    ]);
  });

  it('isSpendAllowlisted reads the process env allowlist', () => {
    const previous = process.env.SPEND_ALLOWLIST_USER_IDS;
    try {
      delete process.env.SPEND_ALLOWLIST_USER_IDS;
      expect(isSpendAllowlisted('507f1f77bcf86cd799439011')).toBe(true);
      process.env.SPEND_ALLOWLIST_USER_IDS = '507f1f77bcf86cd799439011';
      expect(isSpendAllowlisted('507F1F77BCF86CD799439011')).toBe(true);
      expect(isSpendAllowlisted('507f1f77bcf86cd799439012')).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.SPEND_ALLOWLIST_USER_IDS;
      } else {
        process.env.SPEND_ALLOWLIST_USER_IDS = previous;
      }
    }
  });
});
