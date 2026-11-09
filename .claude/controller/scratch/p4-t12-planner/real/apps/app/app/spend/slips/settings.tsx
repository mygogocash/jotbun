import { Redirect } from 'expo-router';

/** sl-settings (P4-T21); until then it goes back to /spend (P4-T12). */
export default function SlipSettingsRoute() {
  return <Redirect href="/spend" />;
}
