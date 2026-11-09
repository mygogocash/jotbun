// D34's consent question and Privacy's Help improve Jotbun switch in each of
// their states (1D-T8, development only), drawn by the real screens on 1D-T1's
// controller over a scripted server (`fakeConsent`): nothing is sent, and the
// app's own answer is never touched, since each section gives its screen its
// own controller (ConsentAnalyticsContext). The question's step event still
// goes through the app's bus, as every catalogue screen's events do. Privacy
// is drawn with the `analytics` area on for these sections only. The copy is a
// draft for E2 (analyticsConsentCopy.draft.ts).
import type { ReactNode } from 'react';

import { fakeConsent } from '@mobile/analytics/testing/fakeConsent';
import type { FakeConsentOptions } from '@mobile/analytics/testing/fakeConsent';
import { ConsentAnalyticsContext } from '@mobile/analytics/useAnalyticsConsent';
import { AnalyticsConsentScreen } from '@mobile/screens/redesign/account/AnalyticsConsentScreen';
import { PrivacyScreen } from '@mobile/screens/redesign/account/PrivacyScreen';
import type { CatalogueSection } from '../registry';
import { CATALOGUE_NOW, deviceDiary, goldenFake } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture } from '../screenSection';
import { fakePrivacy } from './settingsSections';

type ConsentFixture = ScreenFixture & { readonly consent: ReturnType<typeof fakeConsent>; readonly privacy: ReturnType<typeof fakePrivacy> };

/** The account signed in, its server answering as `options` say, before the screen draws. */
const consentFixture = (options: FakeConsentOptions = {}) => (): ConsentFixture => {
  const consent = fakeConsent(options);
  return { resources: goldenFake().resources, diary: deviceDiary().diary, consent, privacy: fakePrivacy(), prepare: () => consent.signIn() };
};

const scoped = (fixture: ConsentFixture, screen: ReactNode) => (
  <ConsentAnalyticsContext.Provider value={fixture.consent.analytics}>{screen}</ConsentAnalyticsContext.Provider>
);
const question = (fixture: ConsentFixture) => scoped(fixture, <AnalyticsConsentScreen />);
const privacy = (fixture: ConsentFixture) => scoped(fixture, <PrivacyScreen services={fixture.privacy.services} now={CATALOGUE_NOW} analyticsArea />);

export const ANALYTICS_SECTIONS: readonly CatalogueSection[] = [
  screenSection({ id: 'analytics-consent', title: 'Analytics: the question', fixture: consentFixture(), render: question }),
  screenSection({
    id: 'analytics-consent-failed',
    title: 'Analytics: the question, answer not saved',
    fixture: consentFixture({ send: 'fails' }),
    script: () => [{ call: 'onPress', on: { testID: 'analytics-consent-yes' } }, { waitFor: 'analytics-consent-failed' }],
    render: question,
  }),
  screenSection({ id: 'privacy-analytics-on', title: 'Privacy: help improve Jotbun on', fixture: consentFixture({ consent: 'yes' }), render: privacy }),
  screenSection({ id: 'privacy-analytics-off', title: 'Privacy: help improve Jotbun off', fixture: consentFixture({ consent: 'no' }), render: privacy }),
  screenSection({
    id: 'privacy-analytics-pending',
    title: 'Privacy: help improve Jotbun, stopped on this phone',
    // A no given offline: the server still says yes, and this phone cannot reach it.
    fixture: consentFixture({ consent: 'yes', storedNo: 'pending', send: 'fails' }),
    script: () => [{ waitFor: 'privacy-analytics-pending' }],
    render: privacy,
  }),
];
