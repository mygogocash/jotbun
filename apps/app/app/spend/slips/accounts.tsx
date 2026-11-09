import { Redirect } from 'expo-router';

/** sl-wallet-map (P4-T20); until then it goes back to /spend (P4-T12). */
export default function SlipAccountsRoute() {
  return <Redirect href="/spend" />;
}
