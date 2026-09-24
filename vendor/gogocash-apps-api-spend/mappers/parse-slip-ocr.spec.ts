import { parseSlipText } from './parse-slip-ocr';

describe('parseSlipText', () => {
  it('reads Thai PromptPay labels for amount, merchant, and Buddhist date', () => {
    const text = `
ร้านค้า: กาแฟบ้านสวน
พร้อมเพย์
จำนวนเงิน 120.50 บาท
วันที่ 27/08/2569
`;
    expect(parseSlipText(text)).toEqual({
      amount_minor: 12050,
      merchant: 'กาแฟบ้านสวน',
      occurred_on: '2026-08-27',
    });
  });

  it('prefers an explicit amount label over other numbers', () => {
    const text = 'ref 998877\nTotal: 99.00 THB\ntrace 12';
    expect(parseSlipText(text).amount_minor).toBe(9900);
  });

  it('returns null amount when the slip has no money line', () => {
    expect(parseSlipText('KBank slip copy').amount_minor).toBeNull();
  });

  it('reads a Kasikorn transfer slip and ignores the fee line', () => {
    const text = `
กสิกรไทย
โอนเงินสำเร็จ
ผู้รับเงิน: ร้านกาแฟบ้านสวน
จำนวนเงิน 1,250.00 บาท
ค่าธรรมเนียม 25.00 บาท
วันที่ 27 ส.ค. 2569
`;
    expect(parseSlipText(text)).toEqual({
      amount_minor: 125000,
      merchant: 'ร้านกาแฟบ้านสวน',
      occurred_on: '2026-08-27',
    });
  });
});
