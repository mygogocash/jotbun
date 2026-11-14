// Where a push tap goes (P4-T17; §6.13). Each push kind opens its screen:
// slips ready the slip review, a statement read the import, an export ready
// Privacy (where exports are made), a month recap that month's recap.
// Anything that is not a push's data (P2-T36's local reminders, a malformed
// payload) opens nothing. Pure, so Node tests it; the links are typed routes,
// which `typecheck:routes` checks.
import { isPushData } from '@gogospend/contracts';
import type { PushData } from '@gogospend/contracts';
import type { Href } from 'expo-router';

import { SLIP_REVIEW_HREF } from '../slipRoutes.ts';

export function routeForPush(data: PushData): Href | null {
  // A notification's data is whatever arrived: only a push's own shape opens a screen.
  if (!isPushData(data)) return null;
  switch (data.kind) {
    case 'slips_ready':
      return SLIP_REVIEW_HREF;
    case 'statement_parsed':
      return '/spend/import';
    case 'export_ready':
      return '/settings/privacy';
    case 'month_recap_ready':
      // isPushData has checked that the ref is a YYYY-MM month.
      return { pathname: '/spend/recap/[month]', params: { month: data.ref as string } };
  }
}
