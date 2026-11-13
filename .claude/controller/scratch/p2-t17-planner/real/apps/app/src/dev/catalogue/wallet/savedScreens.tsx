// The saved moment's catalogue states (P2-T17, development only), loaded by
// ./savedSections.tsx when a section opens: the real SavedToastHost on the
// catalogue's fakes (screenSection's stage), over a page that names the state.
// The page shows the state's notice once as the section opens, as the wallet
// shell does from the add tray's onSaved (P2-T18); Show again shows it again.
//
// - The host reads today's spending for the real today, so the fakes hold it:
//   ฿132 spent earlier today and the ฿50 just saved online, which make
//   bw-saved's ฿182.
// - Offline (rh-offline), the ฿50 is a draft on this phone, never sent, and
//   the diary's last sync did not end synced: the toast says so, reads
//   nothing, and offers Undo.
// - Private mode is the section's own, over a store kept in memory, as
//   kitSections.tsx shows it, so the catalogue never changes the person's own
//   setting; the other states follow the private mode around them.
// - After Undo: the script presses Undo, which deletes the online save at
//   version 1, so it waits in Recently deleted.
// No card is on this page, so nothing travels (SaveFlight). The sample words
// are catalogue samples, not app copy.
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { todayInBangkok } from '@mobile/spend/v1/viewModels';
import type { SyncOutcome } from '@mobile/sync/types';
import { BUN_SPACE } from '@mobile/ui/layout';
import type { DraftTable } from '@mobile/wallet/copy/draftText';
import { useDraftCopy } from '@mobile/wallet/copy/useDraftCopy';
import { PRIVATE_MODE_NAME, PrivateModeProvider } from '@mobile/wallet/privacy/PrivateModeProvider';
import type { SavedNotice } from '@mobile/wallet/saved/savedMoment';
import { SavedToastHost, useSavedToast } from '@mobile/wallet/saved/SavedToastHost';
import type { KeyValueStore } from '@mobile/wallet/store/walletStore';
import { TextLink } from '@mobile/wallet/tray/TextLink';
import { WalletText } from '@mobile/wallet/WalletText';
import { SpecimenLabel } from '../parts';
import type { CatalogueSection } from '../registry';
import { deviceDiary, draftEntry, expense, GOLDEN, goldenFake, queued } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep } from '../screenSection';
import { WALLET_SAVED_TITLES } from './savedSections';
import type { WalletSavedId } from './savedSections';

const SAMPLES = {
  'sample.hello': { th: 'สวัสดี', en: 'Hello' },
  'sample.again': { th: 'แสดงอีกครั้ง', en: 'Show again' },
} as const satisfies DraftTable;

/** The ฿50 just saved, and the ฿132 spent earlier today. */
const SAVED = expense(950, '2000-01-01', '5000');
const EARLIER = expense(951, '2000-01-01', '13200');
/** The diary's last sync backed off: not synced, so a save stays on this phone. */
const OFFLINE: SyncOutcome = { status: 'waiting', progress: { sent: 0, total: 1 }, nextAttemptAt: null, uncertain: 0, needsReview: 0 };

type SavedFixture = ScreenFixture & { readonly notice: SavedNotice };

/** The ฿50 of chicken rice from cash, as the add tray's onSaved hands it on. */
function notice(overrides: Partial<SavedNotice> = {}): SavedNotice {
  return { recordId: SAVED.id, commandId: '0000000f-0000-4000-8000-000000000950', kind: 'expense', title: 'ข้าวมันไก่', walletId: GOLDEN.cash.id, via: 'online', amountMinor: '5000', offline: false, ...overrides };
}

/** Online, on the golden fakes with today's two expenses: the toast reads ฿182. */
function online(): SavedFixture {
  const today = todayInBangkok(new Date());
  return { resources: goldenFake([{ ...EARLIER, occurred_on: today }, { ...SAVED, occurred_on: today }]).resources, diary: null, notice: notice() };
}

/** Kept on this phone, never sent, with the diary's last sync not synced. */
function offline(): SavedFixture {
  const today = todayInBangkok(new Date());
  const command = queued(draftEntry({ id: SAVED.id, amount_minor: '5000', occurred_on: today, merchant: 'ข้าวมันไก่' }), 'unsent');
  const diary = deviceDiary({ outbox: [command], pending: [command.payload], outcome: OFFLINE });
  return { resources: goldenFake().resources, diary: diary.diary, notice: notice({ commandId: command.commandId, via: 'device', offline: true }) };
}

function memoryStore(seed: Readonly<Record<string, string>>): KeyValueStore {
  const kept = new Map(Object.entries(seed));
  return {
    get: async (name) => kept.get(name) ?? null,
    set: async (name, value) => { kept.set(name, value); },
    remove: async (name) => { kept.delete(name); },
    eraseAll: async () => { kept.clear(); },
  };
}

/** Private mode on for this section only. */
function Private({ children }: { children: ReactNode }) {
  const [store] = useState(() => memoryStore({ [PRIVATE_MODE_NAME]: '1' }));
  return <PrivateModeProvider store={store}>{children}</PrivateModeProvider>;
}

/** The page under the toast: it shows the notice once as it opens, and again on Show again. */
function Page({ label, notice: shown }: { label: string; notice: SavedNotice }) {
  const t = useDraftCopy(SAMPLES);
  const { show } = useSavedToast();
  // Once, as the section opens.
  useEffect(() => {
    show(shown);
  }, []);
  return (
    <View style={{ flex: 1, gap: BUN_SPACE.xs, alignItems: 'flex-start', paddingHorizontal: BUN_SPACE.md, paddingTop: 96 }}>
      <WalletText role="h1" accessibilityRole="header">{t('sample.hello')}</WalletText>
      <SpecimenLabel>{label}</SpecimenLabel>
      <TextLink label={t('sample.again')} onPress={() => show(shown)} />
    </View>
  );
}

const toast = (label: string) => (fixture: SavedFixture) => (
  <SavedToastHost>
    <Page label={label} notice={fixture.notice} />
  </SavedToastHost>
);
const shown = (): ScriptStep[] => [{ waitFor: 'saved-toast' }];

const SECTIONS: Readonly<Record<WalletSavedId, CatalogueSection>> = {
  'bw-saved-toast': screenSection({
    id: 'bw-saved-toast',
    title: WALLET_SAVED_TITLES['bw-saved-toast'],
    fixture: online,
    script: shown,
    render: toast("bw-saved: ฿50 saved online; today's money out (฿182), Undo, and a neutral check"),
  }),
  'bw-saved-offline': screenSection({
    id: 'bw-saved-offline',
    title: WALLET_SAVED_TITLES['bw-saved-offline'],
    fixture: offline,
    script: shown,
    render: toast('rh-offline: ฿50 kept on this phone while offline, with Undo, and no total'),
  }),
  'bw-saved-private': screenSection({
    id: 'bw-saved-private',
    title: WALLET_SAVED_TITLES['bw-saved-private'],
    fixture: online,
    script: shown,
    render: (fixture) => <Private>{toast("Private mode: today's money out masked, said to be hidden")(fixture)}</Private>,
  }),
  'bw-saved-undone': screenSection({
    id: 'bw-saved-undone',
    title: WALLET_SAVED_TITLES['bw-saved-undone'],
    fixture: online,
    // Undo is the toast's toastLink, whatever the language.
    script: () => [{ waitFor: 'saved-toast' }, { call: 'onPress', on: { tone: 'toastLink' } }, { waitFor: 'saved-said' }],
    render: toast('After Undo: the online save is deleted, and waits 30 days in Recently deleted'),
  }),
};

/** One saved-moment state, drawn as the catalogue draws every screen section. */
export default function SavedScreenSection({ id }: { id: WalletSavedId }) {
  return <>{SECTIONS[id].render()}</>;
}
