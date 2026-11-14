// The only module that loads posthog-react-native (plan 1D-T6). appAnalytics
// imports it lazily, on iOS and Android with a project key, so the web build
// and the tests never start PostHog. Replay and screen calls answer promises
// the controller does not wait for; a refusal there is dropped, never thrown.
// Flags (P6B-T14) are only ever pushed in: the client is built with
// `disableRemoteFeatureFlags`, so it never asks for them itself.
import PostHog from 'posthog-react-native';
import type { PostHogOptions } from 'posthog-react-native';

import type { PostHogLike } from './controller';

const ignore = () => undefined;

export function createPostHogClient(projectToken: string, options: Record<string, unknown>): PostHogLike {
  const posthog = new PostHog(projectToken, options as PostHogOptions);
  return {
    capture: (event, properties) => posthog.capture(event, properties),
    screen: (name, properties) => { posthog.screen(name, properties).catch(ignore); },
    identify: (distinctId) => posthog.identify(distinctId),
    reset: () => posthog.reset(),
    startSessionRecording: (resumeCurrent) => posthog.startSessionRecording(resumeCurrent).catch(ignore),
    stopSessionRecording: () => posthog.stopSessionRecording().catch(ignore),
    updateFlags: (flags, payloads) => posthog.updateFlags(flags, payloads),
    getFeatureFlag: (key) => posthog.getFeatureFlag(key),
  };
}
