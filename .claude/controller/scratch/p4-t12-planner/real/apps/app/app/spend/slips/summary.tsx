import { Redirect } from 'expo-router';

/** sl-summary (P4-T19); until then it goes back to /spend (P4-T12). */
export default function SlipSummaryRoute() {
  return <Redirect href="/spend" />;
}
