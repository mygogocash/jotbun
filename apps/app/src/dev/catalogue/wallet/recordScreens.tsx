// The Bun Wallet record's catalogue states (plan P2-T26, development only),
// loaded by ./recordSections.tsx when a section opens, on the boards' day
// (Saturday 24 October 2026, 10:00 in Bangkok) and bw-record's entry: ฿50.00
// of chicken rice from the main account, with its note.
//
// - bw-record, bw-record-draft and bw-record-deleted: the real
//   WalletRecordScreen on fakes (R72), staged by screenSection: the entry
//   saved; the same entry still a draft on this phone, never sent; and the
//   entry deleted an hour ago, with its 30 days to restore.
// - bw-record-actions and bw-record-undo: the actions tray opened at once over
//   a page, and the undo bar, each on the entry's sample props, as the add
//   tray's sections draw theirs. The bar here stays for the screenshot; the
//   record screen lets it go after its time.
// The sample words are catalogue samples, not app copy. A section never
// imports the wallet test harness, which loads vitest.
import type { CategoryDto, TransactionDto, WalletSnapshot } from '@gogospend/contracts';
import { useState } from 'react';
import { View } from 'react-native';

import { createFakeDiary } from '@mobile/spend/v1/testing/fakeDiary';
import { BUILTINS, createFakeResources } from '@mobile/spend/v1/testing/fakeResources';
import type { PendingEntry } from '@mobile/storage/types';
import { BUN_SPACE } from '@mobile/ui/layout';
import { COMMON_COPY } from '@mobile/wallet/common/copy';
import type { DraftTable } from '@mobile/wallet/copy/draftText';
import { useDraftCopy } from '@mobile/wallet/copy/useDraftCopy';
import { WalletCategoryIcon } from '@mobile/wallet/looks/WalletCategoryIcon';
import { usePrivateMode } from '@mobile/wallet/privacy/PrivateModeProvider';
import { COPY } from '@mobile/wallet/records/copy';
import { RecordActionsTray } from '@mobile/wallet/records/RecordActionsTray';
import { WalletRecordScreen, deletedBarText } from '@mobile/wallet/records/WalletRecordScreen';
import { WalletUndoBar } from '@mobile/wallet/records/WalletUndoBar';
import { TextLink } from '@mobile/wallet/tray/TextLink';
import { SpecimenLabel } from '../parts';
import type { CatalogueSection } from '../registry';
import { queued } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture } from '../screenSection';
import { WALLET_RECORD_TITLES } from './recordSections';
import type { WalletRecordId } from './recordSections';

/** Saturday 24 October 2026, 10:00 in Bangkok: the boards' day. */
const NOW = new Date('2026-10-24T03:00:00Z');
const DAY = '2026-10-24';

const wallet = (index: number, name: string): WalletSnapshot => ({
  id: `0000000c-0000-4000-8000-0000000006${String(index).padStart(2, '0')}`, name, currency: 'THB', opening_minor: '0', tracking_start: '2026-01-01', archived: false, version: 1,
});
const MAIN = wallet(1, 'บัญชีหลัก');
const CASH = wallet(2, 'เงินสด');
const WALLETS = [MAIN, CASH];
const FOOD = BUILTINS[0] as CategoryDto;

/** bw-record's entry: ฿50.00 of chicken rice from the main account, today, with a note. */
const LUNCH: TransactionDto = {
  id: '0000000b-0000-4000-8000-000000000601', type: 'expense', amount_minor: '5000', occurred_on: DAY, wallet_id: MAIN.id,
  category_id: FOOD.id, merchant: 'ข้าวมันไก่', note: 'กับเพื่อนที่ออฟฟิศ', deleted_at: null, version: 1,
} as TransactionDto;

/** The same entry, still a draft on this phone that was never sent. */
const DRAFT: PendingEntry = {
  id: '0000000e-0000-4000-8000-000000000601', type: 'expense', amount_minor: '5000', occurred_on: DAY, wallet_id: MAIN.id,
  category_id: FOOD.id, merchant: 'ข้าวมันไก่', note: 'กับเพื่อนที่ออฟฟิศ',
} as PendingEntry;

function online(records: readonly TransactionDto[]): ScreenFixture {
  return { resources: createFakeResources({ wallets: WALLETS, categories: BUILTINS, records: [...records] }).resources, diary: null };
}

function onThisPhone(): ScreenFixture {
  const diary = createFakeDiary({ wallets: WALLETS, categories: BUILTINS, outbox: [queued(DRAFT, 'unsent')] });
  return { resources: createFakeResources({ wallets: WALLETS, categories: BUILTINS }).resources, diary: diary.diary };
}

const SAMPLES = {
  ...COMMON_COPY,
  ...COPY,
  'sample.open': { th: 'เปิดถาด', en: 'Open the tray' },
  'sample.chickenRice': { th: 'ข้าวมันไก่', en: 'Chicken rice' },
  'sample.mainToday': { th: 'บัญชีหลัก · วันนี้', en: 'Main account · Today' },
  'sample.actions': { th: 'ถาดตัวเลือกของรายการ เปิดเหนือหน้า', en: "The record's actions tray, open over the page" },
  'sample.undo': { th: 'แถบเลิกทำหลังลบรายการ', en: 'The undo bar after a delete' },
} as const satisfies DraftTable;

/** rh-actions: the tray opens at once over a page; Open the tray brings it back. */
function ActionsTraySection() {
  const t = useDraftCopy(SAMPLES);
  const [open, setOpen] = useState(true);
  const close = () => setOpen(false);
  return (
    <View style={{ gap: BUN_SPACE.xs, alignItems: 'flex-start', padding: BUN_SPACE.md }}>
      <SpecimenLabel>{t('sample.actions')}</SpecimenLabel>
      <TextLink label={t('sample.open')} onPress={() => setOpen(true)} />
      <RecordActionsTray
        visible={open}
        onClose={close}
        title={t('sample.chickenRice')}
        detail={t('sample.mainToday')}
        amountMinor="5000"
        art={<WalletCategoryIcon category={FOOD} name={t('sample.chickenRice')} size={48} />}
        onEdit={close}
        onCopy={close}
        onDelete={close}
      />
    </View>
  );
}

/** rh-undo: the bar over a page, in the words the record screen gives it; it stays here for the screenshot. */
function UndoBarSection() {
  const t = useDraftCopy(SAMPLES);
  const { hidden } = usePrivateMode();
  // Drawn and spoken (R124): the spoken amount needs common.baht, so SAMPLES carries COMMON_COPY.
  const words = deletedBarText(t('sample.chickenRice'), '5000', hidden, t);
  return (
    <View style={{ flex: 1, gap: BUN_SPACE.md, padding: BUN_SPACE.md, justifyContent: 'space-between' }}>
      <SpecimenLabel>{t('sample.undo')}</SpecimenLabel>
      <WalletUndoBar message={words.text} spoken={words.spoken} onUndo={() => undefined} onDismiss={() => undefined} />
    </View>
  );
}

const SECTIONS: Readonly<Record<WalletRecordId, CatalogueSection>> = {
  'bw-record': screenSection({
    id: 'bw-record',
    title: WALLET_RECORD_TITLES['bw-record'],
    fixture: () => online([LUNCH]),
    script: () => [{ waitFor: 'wallet-record-facts' }],
    render: () => <WalletRecordScreen id={LUNCH.id} now={NOW} />,
  }),
  'bw-record-draft': screenSection({
    id: 'bw-record-draft',
    title: WALLET_RECORD_TITLES['bw-record-draft'],
    fixture: onThisPhone,
    script: () => [{ waitFor: 'wallet-record-facts' }],
    render: () => <WalletRecordScreen id={DRAFT.id} now={NOW} />,
  }),
  'bw-record-deleted': screenSection({
    id: 'bw-record-deleted',
    title: WALLET_RECORD_TITLES['bw-record-deleted'],
    fixture: () => online([{ ...LUNCH, deleted_at: '2026-10-24T02:00:00.000Z', version: 2 } as TransactionDto]),
    script: () => [{ waitFor: 'wallet-record-restore' }],
    render: () => <WalletRecordScreen id={LUNCH.id} now={NOW} />,
  }),
  'bw-record-actions': { id: 'bw-record-actions', title: WALLET_RECORD_TITLES['bw-record-actions'], group: 'Kit', render: () => <ActionsTraySection /> },
  'bw-record-undo': { id: 'bw-record-undo', title: WALLET_RECORD_TITLES['bw-record-undo'], group: 'Kit', render: () => <UndoBarSection /> },
};

/** One record state, drawn as the catalogue draws its sections. */
export default function RecordScreenSection({ id }: { id: WalletRecordId }) {
  return <>{SECTIONS[id].render()}</>;
}
