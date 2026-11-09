import { Redirect } from 'expo-router';

/** sl-done (P4-T21); until then it goes back to /spend (P4-T12). */
export default function SlipDoneRoute() {
  return <Redirect href="/spend" />;
}
