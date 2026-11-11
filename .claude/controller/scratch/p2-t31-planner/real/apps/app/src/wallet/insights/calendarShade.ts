// Calendar shade step calculation for Bun Wallet insights (P2-T31).
// Pure function: maps money out in satang (Minor) to a CalendarStep 0..5.
// 0: nothing spent (outMinor <= 0)
// 1: up to ฿200 inclusive (outMinor <= 20000)
// 2: up to ฿500 inclusive (outMinor <= 50000)
// 3: up to ฿1,000 inclusive (outMinor <= 100000)
// 4: up to ฿2,000 inclusive (outMinor <= 200000)
// 5: above ฿2,000 (outMinor > 200000)
import type { Minor } from '@gogospend/contracts';
import type { CalendarStep } from '@mobile/theme/walletPalette';

export function calendarShade(outMinor: Minor): CalendarStep {
  const satang = BigInt(outMinor);
  if (satang <= 0n) return 0;
  if (satang <= 20000n) return 1;
  if (satang <= 50000n) return 2;
  if (satang <= 100000n) return 3;
  if (satang <= 200000n) return 4;
  return 5;
}
