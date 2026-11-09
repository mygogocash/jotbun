// The slip area's typed links (P4-T12). Every route under app/spend/slips/
// exists from this task on, each a redirect to /spend until its screen task
// (P4-T18 to P4-T21), so `typecheck:routes` checks each link P4-T17 to
// P4-T21 makes.
import type { Href } from 'expo-router';

export const SLIPS_HREF: Href = '/spend/slips';
export const SLIP_SCAN_HREF: Href = '/spend/slips/scan';
/** A run over photos picked by hand (P4-T19). */
export const SLIP_MANUAL_SCAN_HREF: Href = { pathname: '/spend/slips/scan', params: { run: 'manual' } };
export const SLIP_REVIEW_HREF: Href = '/spend/slips/review';
