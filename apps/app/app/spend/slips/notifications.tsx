import { Redirect } from 'expo-router';

/** es-notifications-off (P4-T21); until then it goes back to /spend (P4-T12). */
export default function SlipNotificationsRoute() {
  return <Redirect href="/spend" />;
}
