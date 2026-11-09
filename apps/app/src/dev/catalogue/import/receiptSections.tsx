// A record's receipt photo in each of its states (R7, development only),
// drawn by the real receipt panel on fakes and reached with the same steps as
// RecordReceipt.render.test.tsx: the same taps and names, the same held,
// failed or lost calls, and the same changes "on another device". The panel
// sits on a plain entry page here (Record itself draws it only under the
// `import` area). Thai and dark mode are the catalogue's own header choices.
//
// Not registered yet: R7 awaits E2 checkpoint 5, and the main session adds
// RECEIPT_SECTIONS to registry.tsx.
import type { TransactionDto } from '@gogospend/contracts';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import type { ReceiptPorts } from '@mobile/screens/redesign/import/ReceiptParts';
import { ReceiptPanel } from '@mobile/screens/redesign/import/RecordReceipt';
import { createFakeAttachments } from '@mobile/spend/v1/testing/fakeAttachments';
import type { FakeAttachments } from '@mobile/spend/v1/testing/fakeAttachments';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { BUN_SPACE } from '@mobile/ui/layout';
import { StageHeader } from '@mobile/ui/StageHeader';
import type { CatalogueSection } from '../registry';
import { GOLDEN, goldenFake } from '../screenFixtures';
import type { FakeResources } from '../screenFixtures';
import { screenSection } from '../screenSection';
import type { ScreenFixture, ScriptStep, Translate } from '../screenSection';

/** The golden lunch (฿182.00 of food on 26 September) is the record that holds the receipt. */
const LUNCH = GOLDEN.lunchId;
const GRANT_LIFETIME_MS = 5 * 60_000;

/** A fixture that keeps its fakes, so a script can change them as another device (or the clock) would. */
type ReceiptFixture = ScreenFixture & { readonly fake: FakeResources; readonly files: FakeAttachments; readonly ports: Partial<ReceiptPorts> };

function receiptFixture(options: { withReceipt?: boolean; prepare?: (files: FakeAttachments) => void } = {}): ReceiptFixture {
  const fake = goldenFake();
  const files = createFakeAttachments({ records: fake.records });
  if (options.withReceipt) files.seedReceipt(LUNCH);
  options.prepare?.(files);
  const ports: Partial<ReceiptPorts> = {
    attachments: files.attachments,
    uploads: files.uploads,
    picker: files.picker,
    now: files.now,
    newId: fake.newId,
    sleep: (ms) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }),
    pollMs: 50,
    maxPolls: 20,
  };
  return { resources: fake.resources, diary: null, fake, files, ports };
}

/** An entry page with the panel under its stage, as Record places it: the record's id and the version it read. */
function ReceiptStage({ fixture }: { fixture: ReceiptFixture }) {
  const tc = useCopy();
  const colors = useBunColors();
  const [version] = useState(() => (fixture.fake.records.get(LUNCH) as TransactionDto).version);
  return (
    <View testID="receipt-stage" style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ paddingBottom: BUN_SPACE.xl, gap: BUN_SPACE.md }}>
        <StageHeader title={tc('Entry')} />
        <View style={{ paddingHorizontal: BUN_SPACE.md }}>
          <ReceiptPanel recordId={LUNCH} version={version} ports={fixture.ports} />
        </View>
      </ScrollView>
    </View>
  );
}
const stage = (fixture: ReceiptFixture) => <ReceiptStage fixture={fixture} />;

const none = (tc: Translate): ScriptStep[] => [{ waitFor: tc('Attach a receipt photo') }];
/** Attach, the sample photo picked, and the consent sheet open. */
const consent = (tc: Translate): ScriptStep[] => [...none(tc), { press: tc('Attach a receipt photo') }, { waitFor: tc('Keep this receipt photo?') }];
const kept = (tc: Translate): ScriptStep[] => [...consent(tc), { press: tc('Keep this photo') }];
const attached = (tc: Translate): ScriptStep[] => [{ waitFor: tc('Open the receipt photo') }];

export const RECEIPT_SECTIONS: CatalogueSection[] = [
  screenSection({ id: 'receipt-none', title: 'Receipt: none', fixture: () => receiptFixture(), script: none, render: stage }),
  screenSection({ id: 'receipt-consent', title: 'Receipt: consent before attaching', fixture: () => receiptFixture(), script: consent, render: stage }),
  screenSection({
    id: 'receipt-uploading',
    title: 'Receipt: sending the photo',
    // The upload is held, so it stays on its way.
    fixture: () => receiptFixture({ prepare: (files) => { files.hold('upload'); } }),
    script: (tc) => [...kept(tc), { waitFor: tc('Sending the photo…') }],
    render: stage,
  }),
  screenSection({
    id: 'receipt-preparing',
    title: 'Receipt: getting the photo ready',
    fixture: () => receiptFixture({ prepare: (files) => { files.hold('preview'); } }),
    script: (tc) => [...kept(tc), { waitFor: tc('Getting the photo ready…') }],
    render: stage,
  }),
  screenSection({
    id: 'receipt-saving',
    title: 'Receipt: saving',
    fixture: () => receiptFixture({ prepare: (files) => { files.hold('retain'); } }),
    script: (tc) => [...kept(tc), { waitFor: tc('Saving…') }],
    render: stage,
  }),
  screenSection({ id: 'receipt-attached', title: 'Receipt: attached, thumbnail', fixture: () => receiptFixture({ withReceipt: true }), script: attached, render: stage }),
  screenSection({
    id: 'receipt-full-screen',
    title: 'Receipt: full screen',
    fixture: () => receiptFixture({ withReceipt: true }),
    script: (tc) => [...attached(tc), { press: tc('Open the receipt photo') }, { waitFor: 'receipt-full-image' }],
    render: stage,
  }),
  screenSection({
    id: 'receipt-grant-renewed',
    title: 'Receipt: expired grant, asking again',
    // Five minutes pass on the fake clock, so the thumbnail's grant has expired; the new one is held on its way.
    fixture: () => receiptFixture({ withReceipt: true }),
    script: (tc, fixture: ReceiptFixture) => [
      ...attached(tc),
      { run: () => { fixture.files.advance(GRANT_LIFETIME_MS); fixture.files.hold('grant'); } },
      { press: tc('Open the receipt photo') },
      { waitFor: 'receipt-viewer' },
    ],
    render: stage,
  }),
  screenSection({
    id: 'receipt-replace-consent',
    title: 'Receipt: replace, consent',
    fixture: () => receiptFixture({ withReceipt: true }),
    script: (tc) => [...attached(tc), { press: tc('Replace photo') }, { waitFor: tc('Replace the receipt photo?') }],
    render: stage,
  }),
  screenSection({
    id: 'receipt-remove-confirm',
    title: 'Receipt: remove, can\'t be undone',
    fixture: () => receiptFixture({ withReceipt: true }),
    script: (tc) => [...attached(tc), { press: tc('Remove photo') }, { waitFor: tc('Remove the receipt photo?') }],
    render: stage,
  }),
  screenSection({
    id: 'receipt-removed',
    title: 'Receipt: removed',
    fixture: () => receiptFixture({ withReceipt: true }),
    script: (tc) => [...attached(tc), { press: tc('Remove photo') }, { press: tc('Remove the photo') }, { waitFor: tc('Receipt photo removed.') }],
    render: stage,
  }),
  screenSection({
    id: 'receipt-unconfirmed',
    title: 'Receipt: unconfirmed',
    // The receipt is kept, then its answer is lost: frozen, with only Try again (which then goes through).
    fixture: () => receiptFixture({ prepare: (files) => files.loseResponse('retain') }),
    script: (tc) => [...kept(tc), { waitFor: tc('Not confirmed yet. Try again.') }],
    render: stage,
  }),
  screenSection({
    id: 'receipt-conflict',
    title: 'Receipt: entry changed elsewhere',
    // Another device edits the lunch while the consent sheet is open.
    fixture: () => receiptFixture(),
    script: (tc, fixture: ReceiptFixture) => [
      ...consent(tc),
      { run: () => { fixture.fake.records.set(LUNCH, { ...(fixture.fake.records.get(LUNCH) as TransactionDto), note: 'Lunch with Mai', version: 2 }); } },
      { press: tc('Keep this photo') },
      { waitFor: tc('This entry changed on another device.') },
    ],
    render: stage,
  }),
  screenSection({
    id: 'receipt-uploads-off',
    title: 'Receipt: uploads off on the server',
    fixture: () => receiptFixture({ prepare: (files) => files.setUploadsEnabled(false) }),
    script: (tc) => [...kept(tc), { waitFor: tc("Adding receipt photos isn't switched on yet.") }],
    render: stage,
  }),
  screenSection({
    id: 'receipt-offline',
    title: 'Receipt: offline',
    // The record reads, but its photo's grant can't be reached.
    fixture: () => receiptFixture({ withReceipt: true, prepare: (files) => files.fail('grant', 'network') }),
    script: (tc) => [{ waitFor: tc("You're offline. The receipt photo shows when you're back online.") }],
    render: stage,
  }),
];
