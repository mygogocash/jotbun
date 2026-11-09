import { Redirect } from 'expo-router';

/** sl-review and sl-slip-detail (P4-T20); until then it goes back to /spend (P4-T12). */
export default function SlipReviewRoute() {
  return <Redirect href="/spend" />;
}
