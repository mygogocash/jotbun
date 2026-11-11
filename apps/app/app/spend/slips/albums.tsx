import { Redirect } from 'expo-router';

/** sl-albums (P4-T18); until then it goes back to /spend (P4-T12). */
export default function SlipAlbumsRoute() {
  return <Redirect href="/spend" />;
}
