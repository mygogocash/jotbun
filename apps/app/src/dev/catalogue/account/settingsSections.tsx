// Settings and Privacy and data in each of their states (redesign R6,
// development only), drawn by the real screens on fakes: a fake account (its
// sign-outs recorded), fake export and deletion clients and a fake
// re-authentication. No network, no sign-in.
//
// Not registered yet: R6 waits for E2 checkpoint 4, and registry.tsx adds
// these to SCREEN_SECTIONS then.
import type { CommandAck, ExportDto, ExportFilter } from '@gogospend/contracts';

import { V1Error } from '@mobile/api/client';
import type { Proof } from '@mobile/auth/reauthentication';
import { PrivacyScreen } from '@mobile/screens/redesign/account/PrivacyScreen';
import type { ProofPurpose, PrivacyServices } from '@mobile/screens/redesign/account/PrivacyParts';
import type { AccountServices, SignOutEverywhereResult } from '@mobile/screens/redesign/account/SettingsParts';
import { SettingsScreen } from '@mobile/screens/redesign/account/SettingsScreen';
import type { DeletionProof, DeletionResources } from '@mobile/spend/v1/deletion';
import type { PrivacyResources } from '@mobile/spend/v1/privacy';
import type { SettingsAreas, SignInMethod } from '@mobile/spend/v1/redesign/account/settingsModel';
import type { DiaryView } from '@mobile/spend/v1/spendDiary';
import type { CatalogueSection } from '../registry';
import { CATALOGUE_NOW, deviceDiary, draftEntry, goldenFake, queued } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep, Translate } from '../screenSection';

// ---------------------------------------------------------------------------
// Fakes (the screens' render tests use them too)

export type FakeAccountOptions = {
  readonly signInMethod?: SignInMethod | null;
  /** How a sign-out everywhere ends; null: this build cannot do it. Default `done`. */
  readonly everywhere?: SignOutEverywhereResult | null;
  /** Shared with a fake diary, so the order of erase and sign-out shows. */
  readonly log?: string[];
};

/** An account whose sign-outs are recorded. */
export function fakeAccount(options: FakeAccountOptions = {}) {
  const log = options.log ?? [];
  const everywhere = options.everywhere === undefined ? 'done' : options.everywhere;
  const services: AccountServices = {
    signInMethod: options.signInMethod ?? null,
    signOut: async () => { log.push('signOut'); },
    signOutEverywhere: everywhere === null ? null : async () => {
      log.push('signOutEverywhere');
      return everywhere;
    },
  };
  return { services, log };
}

/** The fakes' one export and one deletion request. */
export const FAKE_EXPORT_ID = '7b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d';
export const FAKE_REQUEST_ID = '5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a';
/** The ready file: requested at 10:00 on 29 September in Bangkok, kept until 10:00 the next day. */
const REQUESTED_AT = '2026-09-29T03:00:00.000Z';
const EXPIRES_AT = '2026-09-30T03:00:00.000Z';
const FAKE_CSV = '﻿record_id,date,type,amount,amount_minor,currency\n';

export type FakePrivacyOptions = {
  /** The fresh sign-in: a proof; the person cancels; the sign-in service can't be reached; or this build can't re-authenticate. Default `proof`. */
  readonly reauth?: 'proof' | 'cancel' | 'unreachable' | 'unavailable';
  /** POST /v1/exports, one answer per call (the last repeats): accepted; the answer lost; a used proof; refused. Default `ack`. */
  readonly exportRequests?: readonly ('ack' | 'lost' | 'reauth' | 'refused')[];
  /** GET /v1/exports/:id, one answer per check (the last repeats). `offline`: Jotbun can't be reached. Default `pending`. */
  readonly statuses?: readonly ('pending' | 'ready' | 'expired' | 'failed' | 'too_large' | 'offline')[];
  /** The file itself, or Jotbun can't be reached. Default `ok`. */
  readonly download?: 'ok' | 'offline';
  /** Whether the person sends the file somewhere from the share sheet. Default true. */
  readonly save?: boolean;
  /** POST /v1/me/deletion, one answer per call (the last repeats). Default `accepted`. */
  readonly deletions?: readonly ('accepted' | 'lost' | 'refused' | 'reauth')[];
  /** The initiating device's receipt: accepted, completed, none (404) or offline. Default `none`. */
  readonly receipt?: 'accepted' | 'completed' | 'none' | 'offline';
  /** Never answers a deletion, so its working state stays on screen. */
  readonly holdDeletion?: boolean;
};

let proofs = 0;
const fakeProof = (): Proof => {
  proofs += 1;
  const tail = proofs.toString(16).padStart(12, '0');
  return { proofId: `0000000a-0000-4000-8000-${tail}`, commandId: `0000000c-0000-4000-8000-${tail}`, expiresAt: '2026-09-29T03:05:00.000Z' };
};
const pick = <T,>(answers: readonly T[] | undefined, fallback: T, index: number): T =>
  answers && answers.length > 0 ? answers[Math.min(index, answers.length - 1)] : fallback;
const unreachable = () => new V1Error('network', 0, 'NETWORK');
const notFound = () => new V1Error('not_found', 404, 'NOT_FOUND');

/** Export and deletion clients, a re-authentication and a share sheet, all recorded. Every wait is instant. */
export function fakePrivacy(options: FakePrivacyOptions = {}) {
  const calls = {
    reauth: [] as ProofPurpose[],
    exportRequests: [] as { filter: ExportFilter; proofId: string; commandId: string }[],
    statusChecks: [] as string[],
    grants: 0,
    saved: [] as { csv: string; fileName: string }[],
    deletions: [] as DeletionProof[],
    receipts: [] as string[],
    signOut: 0,
  };
  let period: ExportFilter = { from: '1970-01-01', through: '2026-09-29' };
  const base = () => ({ export_id: FAKE_EXPORT_ID, from: period.from, through: period.through, requested_at: REQUESTED_AT });

  const privacy: PrivacyResources = {
    async requestExport(filter, proof) {
      const answer = pick(options.exportRequests, 'ack', calls.exportRequests.length);
      calls.exportRequests.push({ filter, proofId: proof.proofId, commandId: proof.commandId });
      period = filter;
      if (answer === 'lost') throw unreachable();
      if (answer === 'reauth') throw new V1Error('signed_out', 401, 'REAUTH_REQUIRED');
      if (answer === 'refused') throw new V1Error('rate_limited', 429, 'RATE_LIMITED');
      const ack: CommandAck = { command_id: proof.commandId, entity_id: FAKE_EXPORT_ID, version: 1, committed_revision: '42', outcome: 'accepted', entity_state: 'active' };
      return ack;
    },
    async exportStatus(exportId) {
      const status = pick(options.statuses, 'pending', calls.statusChecks.length);
      calls.statusChecks.push(exportId);
      const dto = (): ExportDto => {
        switch (status) {
          case 'offline': throw unreachable();
          case 'ready': return { ...base(), status: 'ready', as_of_revision: '42', row_count: 4, bytes: 512, sha256: 'a'.repeat(64), expires_at: EXPIRES_AT };
          case 'failed': return { ...base(), status: 'failed', reason: 'error' };
          case 'too_large': return { ...base(), status: 'failed', reason: 'too_large' };
          case 'expired': return { ...base(), status: 'expired' };
          case 'pending': return { ...base(), status: 'pending' };
        }
      };
      return dto();
    },
    async exportGrant() {
      calls.grants += 1;
      return { url: `/v1/export-files/${'g'.repeat(32)}`, expires_at: '2026-09-29T03:05:00.000Z' };
    },
    async downloadExport() {
      if (options.download === 'offline') throw unreachable();
      return FAKE_CSV;
    },
  };

  const deletion: DeletionResources = {
    async requestDeletion(proof) {
      const answer = pick(options.deletions, 'accepted', calls.deletions.length);
      calls.deletions.push({ proofId: proof.proofId, commandId: proof.commandId });
      if (options.holdDeletion) return new Promise(() => undefined);
      if (answer === 'lost') throw unreachable();
      if (answer === 'refused') throw new V1Error('signed_out', 401, 'SESSION_REQUIRED');
      if (answer === 'reauth') throw new V1Error('signed_out', 401, 'REAUTH_REQUIRED');
      return { request_id: FAKE_REQUEST_ID, status: 'accepted' };
    },
    async deletionReceipt(commandId) {
      calls.receipts.push(commandId);
      const receipt = options.receipt ?? 'none';
      if (receipt === 'none') throw notFound();
      if (receipt === 'offline') throw unreachable();
      return { request_id: FAKE_REQUEST_ID, status: receipt };
    },
  };

  const reauth = options.reauth ?? 'proof';
  const services: PrivacyServices = {
    privacy,
    deletion,
    reauthenticate: reauth === 'unavailable' ? null : async (purpose) => {
      calls.reauth.push(purpose);
      if (reauth === 'cancel') return null;
      if (reauth === 'unreachable') throw new Error('Could not reach the sign-in service. Try again.');
      return fakeProof();
    },
    async saveExport(file) {
      calls.saved.push(file);
      return options.save ?? true;
    },
    signOut: async () => { calls.signOut += 1; },
    sleep: async () => undefined,
    pollMs: 0,
    maxPolls: 2,
  };
  return { services, calls };
}

// ---------------------------------------------------------------------------
// Sections
//
// Appearance, language and the bun follow the catalogue's own theme, locale
// and bun switches, as Thai and dark mode do for every section. The areas
// (planning, insights, import) are given to the screen directly, so both
// sides show while their flags stay off.

type AccountFixture = ScreenFixture & { readonly account: ReturnType<typeof fakeAccount> };
type PrivacyFixture = ScreenFixture & { readonly fake: ReturnType<typeof fakePrivacy> };

/** Every area off: Settings as it ships until planning, insights and import are approved. */
const NO_AREAS: SettingsAreas = { planning: false, insights: false, imports: false };

function accountFixture(options: FakeAccountOptions = {}, view: Partial<DiaryView> = {}): AccountFixture {
  return { resources: goldenFake().resources, diary: deviceDiary(view).diary, account: fakeAccount(options) };
}

function privacyFixture(options: FakePrivacyOptions = {}): PrivacyFixture {
  return { resources: goldenFake().resources, diary: deviceDiary().diary, fake: fakePrivacy(options) };
}

const settings = (areas: Partial<SettingsAreas> = {}) => (fixture: AccountFixture) => <SettingsScreen services={fixture.account.services} areas={{ ...NO_AREAS, ...areas }} />;
const privacy = (fixture: PrivacyFixture) => <PrivacyScreen services={fixture.fake.services} now={CATALOGUE_NOW} />;

/** Two drafts on this phone while sync backs off: offline, with entries a sign-out would lose. */
const offlineWithDrafts = (): Partial<DiaryView> => ({
  outbox: [queued(draftEntry(), 'unsent'), queued(draftEntry({ amount_minor: '4000' }), 'uncertain')],
  outcome: { status: 'waiting', progress: { sent: 0, total: 2 }, nextAttemptAt: null, uncertain: 1, needsReview: 0 },
});

/** Opens a confirm and confirms it. Its confirm button shares the opening button's name, so the sheet's own handler is called. */
const confirmVia = (open: string, title: string): ScriptStep[] => [{ press: open }, { waitFor: title }, { call: 'onConfirm', on: { title } }];

const EXPORT_FILE = 'jotbun-export-1970-01-01-to-2026-09-29.csv';
const requestExportStep = (tc: Translate): ScriptStep => ({ press: tc('Request export') });

const SETTINGS: CatalogueSection[] = [
  screenSection({ id: 'settings-main', title: 'Settings: as it ships', fixture: () => accountFixture(), render: settings() }),
  screenSection({
    id: 'settings-all-areas',
    title: 'Settings: planning and insights on',
    fixture: () => accountFixture(),
    script: (tc) => [{ waitFor: tc('Wallets') }],
    render: settings({ planning: true, insights: true }),
  }),
  screenSection({
    id: 'settings-import',
    title: 'Settings: import on',
    fixture: () => accountFixture(),
    script: (tc) => [{ waitFor: tc('Import') }],
    render: settings({ planning: true, insights: true, imports: true }),
  }),
  screenSection({
    id: 'settings-sign-in-method',
    title: 'Settings: signed in with Apple',
    fixture: () => accountFixture({ signInMethod: 'apple' }),
    script: (tc) => [{ waitFor: tc('Signed in with Apple') }],
    render: settings(),
  }),
  screenSection({
    id: 'settings-offline',
    title: 'Settings: offline',
    fixture: () => accountFixture({}, offlineWithDrafts()),
    script: (tc) => [{ waitFor: tc('Offline. New entries are saved on this phone.') }],
    render: settings(),
  }),
  screenSection({
    id: 'settings-sign-out',
    title: 'Settings: sign out confirm',
    fixture: () => accountFixture(),
    script: (tc) => [{ press: tc('Sign out') }, { waitFor: tc('Sign out?') }],
    render: settings(),
  }),
  screenSection({
    id: 'settings-sign-out-unsynced',
    title: 'Settings: sign out with unsynced entries',
    fixture: () => accountFixture({}, offlineWithDrafts()),
    script: (tc) => [{ press: tc('Sign out') }, { waitFor: tc('Sign out?') }],
    render: settings(),
  }),
  screenSection({
    id: 'settings-erase-failed',
    title: 'Settings: diary could not be erased',
    fixture: () => {
      const fixture = accountFixture();
      if (fixture.diary) fixture.diary.eraseForSignOut = async () => { throw new Error('The diary could not be erased.'); };
      return fixture;
    },
    script: (tc) => [...confirmVia(tc('Sign out'), tc('Sign out?')), { waitFor: tc("Couldn't erase this phone's diary, so you're still signed in. Try again.") }],
    render: settings(),
  }),
  screenSection({
    id: 'settings-everywhere',
    title: 'Settings: sign out everywhere confirm',
    fixture: () => accountFixture(),
    script: (tc) => [{ press: tc('Sign out everywhere') }, { waitFor: tc('Sign out everywhere?') }],
    render: settings(),
  }),
  screenSection({
    id: 'settings-everywhere-cancelled',
    title: 'Settings: sign out everywhere cancelled',
    fixture: () => accountFixture({ everywhere: 'cancelled' }),
    script: (tc) => [...confirmVia(tc('Sign out everywhere'), tc('Sign out everywhere?')), { waitFor: tc('Nothing changed.') }],
    render: settings(),
  }),
  screenSection({
    id: 'settings-everywhere-unavailable',
    title: 'Settings: sign out everywhere unavailable',
    fixture: () => accountFixture({ everywhere: null }),
    script: (tc) => [{ waitFor: tc("Signing out everywhere needs a fresh sign-in, which this build can't do yet.") }],
    render: settings(),
  }),
];

const PRIVACY: CatalogueSection[] = [
  screenSection({ id: 'privacy-main', title: 'Privacy: promises, export and delete', fixture: () => privacyFixture(), render: privacy }),
  screenSection({
    id: 'privacy-no-reauth',
    title: 'Privacy: no fresh sign-in in this build',
    fixture: () => privacyFixture({ reauth: 'unavailable' }),
    script: (tc) => [{ waitFor: tc("Deleting your account needs a fresh sign-in, which this build can't do yet.") }],
    render: privacy,
  }),
  screenSection({
    id: 'privacy-export-preparing',
    title: 'Privacy: export preparing',
    fixture: () => privacyFixture({ statuses: ['pending'] }),
    script: (tc) => [requestExportStep(tc), { waitFor: tc('Preparing your file') }],
    render: privacy,
  }),
  screenSection({
    id: 'privacy-export-ready',
    title: 'Privacy: export ready',
    fixture: () => privacyFixture({ statuses: ['ready'] }),
    script: (tc) => [requestExportStep(tc), { waitFor: tc('Your file is ready') }],
    render: privacy,
  }),
  screenSection({
    id: 'privacy-export-downloaded',
    title: 'Privacy: export downloaded',
    fixture: () => privacyFixture({ statuses: ['ready'] }),
    script: (tc) => [requestExportStep(tc), { press: tc('Download') }, { waitFor: tc('Downloaded {name}.', { name: EXPORT_FILE }) }],
    render: privacy,
  }),
  screenSection({
    id: 'privacy-export-expired',
    title: 'Privacy: export expired',
    fixture: () => privacyFixture({ statuses: ['expired'] }),
    script: (tc) => [requestExportStep(tc), { waitFor: tc('Request a new export') }],
    render: privacy,
  }),
  screenSection({
    id: 'privacy-export-failed',
    title: 'Privacy: export failed',
    fixture: () => privacyFixture({ statuses: ['failed'] }),
    script: (tc) => [requestExportStep(tc), { waitFor: tc("Jotbun couldn't make your file. Your diary is unchanged.") }],
    render: privacy,
  }),
  screenSection({
    id: 'privacy-export-too-large',
    title: 'Privacy: export too large',
    fixture: () => privacyFixture({ statuses: ['too_large'] }),
    script: (tc) => [requestExportStep(tc), { waitFor: tc('Export this year instead') }],
    render: privacy,
  }),
  screenSection({
    id: 'privacy-export-lost',
    title: 'Privacy: export answer lost',
    fixture: () => privacyFixture({ exportRequests: ['lost'] }),
    script: (tc) => [requestExportStep(tc), { waitFor: tc("We couldn't tell if Jotbun got your request. Try again to send the same request.") }],
    render: privacy,
  }),
  screenSection({
    id: 'privacy-export-offline',
    title: 'Privacy: export offline',
    fixture: () => privacyFixture({ statuses: ['pending', 'offline'] }),
    script: (tc) => [requestExportStep(tc), { waitFor: tc("Couldn't reach Jotbun. Your file is still being prepared.") }],
    render: privacy,
  }),
  screenSection({
    id: 'privacy-export-reauth',
    title: 'Privacy: export sign-in check expired',
    fixture: () => privacyFixture({ exportRequests: ['reauth'] }),
    script: (tc) => [requestExportStep(tc), { waitFor: tc('Your sign-in check expired. Nothing was requested.') }],
    render: privacy,
  }),
  screenSection({
    id: 'privacy-delete-confirm',
    title: 'Privacy: delete confirm',
    fixture: () => privacyFixture(),
    script: (tc) => [{ press: tc('Delete my account') }, { waitFor: tc('Delete your account?') }],
    render: privacy,
  }),
  screenSection({
    id: 'privacy-delete-working',
    title: 'Privacy: delete request on its way',
    fixture: () => privacyFixture({ holdDeletion: true }),
    script: (tc) => [...confirmVia(tc('Delete my account'), tc('Delete your account?')), { waitFor: tc('Sending your request…') }],
    render: privacy,
  }),
  screenSection({
    id: 'privacy-delete-receipt',
    title: 'Privacy: delete receipt',
    fixture: () => privacyFixture(),
    script: (tc) => [...confirmVia(tc('Delete my account'), tc('Delete your account?')), { waitFor: tc('Your account is being deleted') }],
    render: privacy,
  }),
  screenSection({
    id: 'privacy-delete-refused',
    title: 'Privacy: delete refused',
    fixture: () => privacyFixture({ deletions: ['refused'], receipt: 'none' }),
    script: (tc) => [...confirmVia(tc('Delete my account'), tc('Delete your account?')), { waitFor: tc("Jotbun didn't accept the request, so nothing was deleted.") }],
    render: privacy,
  }),
  screenSection({
    id: 'privacy-delete-unconfirmed',
    title: 'Privacy: delete answer lost',
    fixture: () => privacyFixture({ deletions: ['lost'], receipt: 'none' }),
    script: (tc) => [
      ...confirmVia(tc('Delete my account'), tc('Delete your account?')),
      { waitFor: tc("We couldn't confirm your request. Nothing on this phone was erased. Try again to send the same request.") },
    ],
    render: privacy,
  }),
];

/** Settings and Privacy and data, one section per state. */
export const SETTINGS_SECTIONS: CatalogueSection[] = [...SETTINGS, ...PRIVACY];
