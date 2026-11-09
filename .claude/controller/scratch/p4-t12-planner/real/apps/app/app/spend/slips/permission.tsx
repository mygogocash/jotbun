import { Redirect } from 'expo-router';

/** sl-permission and es-photos-denied (P4-T18); until then it goes back to /spend (P4-T12). */
export default function SlipPermissionRoute() {
  return <Redirect href="/spend" />;
}
