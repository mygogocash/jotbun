import { Redirect } from 'expo-router';

/** sl-scanning, and a run over photos picked by hand with run=manual (P4-T19); until then it goes back to /spend (P4-T12). */
export default function SlipScanRoute() {
  return <Redirect href="/spend" />;
}
