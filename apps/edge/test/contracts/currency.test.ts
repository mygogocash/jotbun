// P5-T1: the ISO 4217 table and exact rate arithmetic (spec section 6.10, D24).
// The first four cases are the plan's, verbatim (the boards' figures); the
// last two are the brief's: half-way cases in zero- and three-decimal
// currencies, and each helper's refusals.
import {
  ContractValidationError,
  CURRENCY_SYMBOLS,
  ISO_4217_MINOR_UNITS,
  PICKER_CURRENCIES,
  RATE_SOURCES,
  addDays,
  canonicalQuote,
  convertMinor,
  convertMinorDown,
  crossRate,
  decimalToMinor,
  isCurrencyCode,
  minorToDecimal,
  minorUnitsOf,
  moneyText,
  parseRate,
  rateFromAmounts,
  rateText,
} from '@gogospend/contracts'
import { expect, it } from 'vitest'

it('minor units come from the ISO table, never from Intl', () => {
  expect(['THB', 'JPY', 'KRW', 'VND', 'LAK', 'USD', 'BHD', 'CLF'].map(minorUnitsOf)).toEqual([2, 0, 0, 0, 2, 2, 3, 4])
  const codes = (u: number) => Object.entries(ISO_4217_MINOR_UNITS).filter(([, v]) => v === u).map(([c]) => c).sort()
  expect(codes(0)).toEqual(['BIF', 'CLP', 'DJF', 'GNF', 'ISK', 'JPY', 'KMF', 'KRW', 'PYG', 'RWF', 'UGX', 'UYI', 'VND', 'VUV', 'XAF', 'XOF', 'XPF'])
  expect([codes(3), codes(4)]).toEqual([['BHD', 'IQD', 'JOD', 'KWD', 'LYD', 'OMR', 'TND'], ['CLF', 'UYW']])
  expect([Object.keys(ISO_4217_MINOR_UNITS).length, codes(2).length]).toEqual([165, 139])   // SIX list one of 2026-09-17
  expect([...PICKER_CURRENCIES, 'THB'].every(isCurrencyCode)).toBe(true)
  for (const bad of ['XAU', 'thb', 'ABC', 'JPYX', 1]) expect(isCurrencyCode(bad)).toBe(false)
})

it('converts once, half-up, in exact integers', () => {
  const jpy = (y: string, r: string) => convertMinor(y, r, 'JPY', 'THB')
  expect([jpy('4620', '0.2312'), jpy('1200', '0.2312'), jpy('360', '0.2312'), jpy('43000', '0.2312'), jpy('120000', '0.2312')]).toEqual([106814n, 27744n, 8323n, 994160n, 2774400n])
  expect([jpy('3400', '0.2308'), jpy('7980', '0.2308'), jpy('4620', '0.2308'), jpy('2580', '0.2317')]).toEqual([78472n, 184178n, 106630n, 59779n])
  expect(jpy('6180', '0.2312')).toBe(142882n)                       // the day's yen at once; its stored rows add to 142,881
  expect([convertMinor('6500', '4.6583', 'THB', 'JPY'), convertMinor('1800000', '4.6583', 'THB', 'JPY'), convertMinor('150013', '4.6583', 'THB', 'JPY')]).toEqual([303n, 83849n, 6988n])
  expect(convertMinorDown('100005', '4.6583', 'THB', 'JPY') + convertMinorDown('50008', '4.6583', 'THB', 'JPY')).toBe(6987n)
  expect([convertMinor('1', '0.0013', 'VND', 'THB'), convertMinor('1', '4.6583', 'THB', 'JPY'), convertMinor('5', '0.5', 'THB', 'THB')]).toEqual([0n, 0n, 3n])
  expect(convertMinor('99999999999', '765.6', 'THB', 'VND')).toBe(765599999992n)
})

it('cross rates and rates from amounts round once to 12 significant digits', () => {
  expect([crossRate('34.755', '150'), crossRate('34.62', '150'), crossRate('34.68', '150'), crossRate('149.0656', '32')]).toEqual(['0.2317', '0.2308', '0.2312', '4.6583'])
  expect([crossRate('150', '34.68'), crossRate('32', '149.0656')]).toEqual(['4.32525951557', '0.214670587983'])
  expect(rateFromAmounts('4620', 'JPY', '107550', 'THB')).toBe('0.232792207792')   // tc-rate-edit: ฿1,075.50 charged
  expect(rateFromAmounts('43000', 'JPY', '1000000', 'THB')).toBe('0.232558139535')  // tc-exchange: ฿10,000 for ¥43,000
  expect(convertMinor('4620', '0.232558139535', 'JPY', 'THB')).toBe(107442n)
})

it('rates, quotes and amounts as text', () => {
  expect([parseRate('0.2312'), parseRate('1'), parseRate('765.6')]).toEqual(['0.2312', '1', '765.6'])
  for (const bad of ['0', '-1', '0.23120', '.5', '1e3', '0.1234567890123', ' 1', 1, null]) expect(() => parseRate(bad, 'rate')).toThrow(ContractValidationError)
  expect([canonicalQuote(149.0656), canonicalQuote('34.6800'), canonicalQuote(0), canonicalQuote(Number.NaN), canonicalQuote('1.23e5')]).toEqual(['149.0656', '34.68', null, null, null])
  expect([minorToDecimal('4620', 'JPY'), minorToDecimal('106814', 'THB'), minorToDecimal('-5', 'THB'), minorToDecimal('1234', 'BHD')]).toEqual(['4620', '1068.14', '-0.05', '1.234'])
  expect([decimalToMinor('1075.50', 'THB'), decimalToMinor('12.5', 'JPY'), decimalToMinor('1,075', 'THB')]).toEqual([107550n, null, null])
  expect([moneyText('106814', 'THB'), moneyText('4620', 'JPY'), moneyText('-5000', 'THB'), moneyText('1250', 'CHF')]).toEqual(['฿1,068.14', '¥4,620', '−฿50.00', 'CHF 12.50'])
  expect(['0.2312', '0.232792207792', '0.232558139535', '4.32525951557', '765.6', '0.00130612'].map(rateText)).toEqual(['0.2312', '0.2328', '0.2326', '4.3253', '765.6', '0.001306'])
  expect([addDays('2026-10-31', 1), addDays('2026-11-03', -366), addDays('2028-02-28', 1)]).toEqual(['2026-11-01', '2025-11-02', '2028-02-29'])
})

it('half-way cases round up once, in zero-, two- and three-decimal currencies', () => {
  // Exactly half a minor unit each: ¥100 at 9.125 is ₩912.5; ₩50 at 0.0245 is
  // 122.5 satang; ฿1.25 at 40.4 is ₩50.5; 0.002 BHD at 92.5 is 18.5 satang;
  // ฿1.25 at 0.0108 is 13.5 fils.
  const halves = [['100', '9.125', 'JPY', 'KRW'], ['50', '0.0245', 'KRW', 'THB'], ['125', '40.4', 'THB', 'KRW'], ['2', '92.5', 'BHD', 'THB'], ['125', '0.0108', 'THB', 'BHD']] as const
  expect(halves.map(([a, r, f, t]) => convertMinor(a, r, f, t))).toEqual([913n, 123n, 51n, 19n, 14n])
  expect(halves.map(([a, r, f, t]) => convertMinorDown(a, r, f, t))).toEqual([912n, 122n, 50n, 18n, 13n])
  expect([convertMinor(4620n, '0.2312', 'JPY', 'THB'), convertMinor('0', '0.2312', 'JPY', 'THB'), convertMinor('12345', '1', 'KRW', 'KRW')]).toEqual([106814n, 0n, 12345n])
  // The 13th significant digit is exactly 5: half-up keeps 12 and rounds up.
  expect([crossRate('1.000000000005', '1'), rateFromAmounts('1000000000000', 'KRW', '1000000000005', 'KRW')]).toEqual(['1.00000000001', '1.00000000001'])
  expect([crossRate('1', '150'), crossRate('1', '8'), rateFromAmounts('8', 'JPY', '1', 'THB')]).toEqual(['0.00666666666667', '0.125', '0.00125'])
  expect(['0.23125', '1.00005', '0.99996', '26000'].map(rateText)).toEqual(['0.2313', '1.0001', '1', '26000'])
  expect([moneyText('1500000', 'KRW'), moneyText('120000', 'VND'), moneyText('1250050', 'LAK'), moneyText('-4620', 'JPY'), moneyText('1234', 'BHD'), moneyText('0', 'THB')])
    .toEqual(['₩1,500,000', '₫120,000', '₭12,500.50', '−¥4,620', 'BHD 1.234', '฿0.00'])
  expect([minorToDecimal('5', 'KRW'), minorToDecimal('0', 'THB'), minorToDecimal('-1234', 'BHD'), minorToDecimal('1', 'CLF')]).toEqual(['5', '0.00', '-1.234', '0.0001'])
  expect([decimalToMinor('4620', 'KRW'), decimalToMinor('4620.0', 'KRW'), decimalToMinor('1.2', 'BHD'), decimalToMinor('1.234', 'BHD'), decimalToMinor('1075.5', 'THB'), decimalToMinor('0', 'JPY')])
    .toEqual([4620n, null, 1200n, 1234n, 107550n, 0n])
  expect([decimalToMinor('01.5', 'THB'), decimalToMinor('-1', 'THB'), decimalToMinor('.5', 'THB'), decimalToMinor('5.', 'THB'), decimalToMinor('1.005', 'THB')]).toEqual([null, null, null, null, null])
})

it('each helper refuses what is outside its domain', () => {
  expect(CURRENCY_SYMBOLS).toEqual({
    THB: '\u0E3F', JPY: '\u00A5', KRW: '\u20A9', CNY: '\u00A5', HKD: 'HK$', TWD: 'NT$', SGD: 'S$',
    MYR: 'RM', VND: '\u20AB', LAK: '\u20AD', USD: '$', EUR: '\u20AC', GBP: '\u00A3', AUD: 'A$',
  })
  expect(RATE_SOURCES).toEqual(['reference', 'own', 'exchange'])
  for (const bad of [['THB'], 'toString', '__proto__', 'XDR', 'XXX']) expect(isCurrencyCode(bad)).toBe(false)
  expect(() => minorUnitsOf('XAU')).toThrow(TypeError)
  expect(() => convertMinor('100', '1', 'THB', 'jpy')).toThrow(TypeError)
  const refusal = (fn: () => unknown) => { try { fn() } catch (error) { return error } return undefined }
  expect(refusal(() => parseRate('0.23120', 'rate'))).toMatchObject({ code: 'VALIDATION_FAILED', field: 'rate' })
  expect([parseRate('0.123456789012'), parseRate('123456789012'), parseRate('1000000000000000')]).toEqual(['0.123456789012', '123456789012', '1000000000000000'])
  expect(() => parseRate('1234567890123000', 'rate')).toThrow(ContractValidationError)
  expect([canonicalQuote(0.1 + 0.2), canonicalQuote('1234567890.123456'), canonicalQuote('1234567890.12345'), canonicalQuote('00034.50'), canonicalQuote(-1), canonicalQuote(Number.POSITIVE_INFINITY)])
    .toEqual([null, null, '1234567890.12345', '34.5', null, null])
  expect([canonicalQuote(1.5e-7), canonicalQuote(2e21), canonicalQuote('0.000'), canonicalQuote('.5'), canonicalQuote(['34.68']), canonicalQuote(5n)])
    .toEqual(['0.00000015', '2000000000000000000000', null, null, null, null])
  for (const fn of [
    () => convertMinor('-1', '1', 'THB', 'THB'),
    () => convertMinor('012', '1', 'THB', 'THB'),
    () => convertMinor('100', '0', 'THB', 'THB'),
    () => convertMinor('100', '0.50', 'THB', 'THB'),
    () => convertMinorDown('100', '-1', 'THB', 'THB'),
    () => crossRate('0', '150'),
    () => crossRate('34.68', '-1'),
    () => rateFromAmounts('100', 'JPY', '0', 'THB'),
    () => rateFromAmounts('0', 'JPY', '100', 'THB'),
    () => minorToDecimal('1.5', 'THB'),
    () => minorToDecimal(15 as unknown as string, 'THB'),
    () => moneyText('', 'THB'),
    () => rateText('0'),
    () => rateText('abc'),
  ]) expect(fn).toThrow(RangeError)
  expect(() => moneyText('100', 'XAU')).toThrow(TypeError)
  expect(decimalToMinor(12 as unknown as string, 'JPY')).toBeNull()
  expect(addDays('0099-12-31', 1)).toBe('0100-01-01')
  expect(() => addDays('2026-02-30', 1)).toThrow(TypeError)
  expect(() => addDays('2026-10-31', 1.5)).toThrow(TypeError)
  expect(() => addDays('9999-12-31', 1)).toThrow(RangeError)
  expect(() => addDays('0001-01-01', -1)).toThrow(RangeError)
})
