// A calendar day's step from its money out (P2-T31, wc-calendar, W22): 0 for
// nothing spent, then up to ฿200, ฿500, ฿1,000 and ฿2,000 a day (each
// inclusive) from CALENDAR_STEP_LIMITS_BAHT, and 5 above that. Exact: satang
// through BigInt only. Pure: a Node test reads it, so it imports by relative
// path.
import type { Minor } from '@gogospend/contracts';

import { CALENDAR_STEP_LIMITS_BAHT } from '../../theme/walletPalette.ts';
import type { CalendarStep } from '../../theme/walletPalette.ts';

export function calendarShade(outMinor: Minor): CalendarStep {
  const out = BigInt(outMinor);
  const step = CALENDAR_STEP_LIMITS_BAHT.findIndex((baht) => out <= BigInt(baht) * 100n);
  return (step === -1 ? CALENDAR_STEP_LIMITS_BAHT.length : step) as CalendarStep;
}
