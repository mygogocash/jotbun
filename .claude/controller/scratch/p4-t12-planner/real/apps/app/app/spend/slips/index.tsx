import { Redirect } from 'expo-router';

/** The slip area's home: sl-intro (P4-T18), then sl-settings once albums are connected (P4-T21); until then it goes back to /spend (P4-T12). */
export default function SlipsRoute() {
  return <Redirect href="/spend" />;
}
