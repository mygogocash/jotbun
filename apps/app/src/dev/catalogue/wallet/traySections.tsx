// The Bun Wallet tray's catalogue sections (P2-T13, development only): a short
// tray (bw-tray-short), a tall one whose middle scrolls under its pinned
// footer and whose height changes per step (bw-tray-tall), a tray to capture
// at the largest text size, where it fills the screen (bw-tray-large), and the
// main button with the text link (bw-buttons). Each tray opens at once, so a
// screenshot of its section shows it over the page; close it, and Open the
// tray brings it back. Their own list beside kitSections.tsx, spread after the
// kit's in ./index.ts. The sample words are catalogue samples, not app copy.
// A section never imports the wallet test harness, which loads vitest.
import { useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useActiveLocale } from '@mobile/i18n/useCopy';
import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { BUN_RADIUS, BUN_SPACE } from '@mobile/ui/layout';
import { COMMON_COPY } from '@mobile/wallet/common/copy';
import type { DraftTable } from '@mobile/wallet/copy/draftText';
import { useDraftCopy } from '@mobile/wallet/copy/useDraftCopy';
import { PrimaryButton } from '@mobile/wallet/tray/PrimaryButton';
import { TextLink } from '@mobile/wallet/tray/TextLink';
import { Tray } from '@mobile/wallet/tray/Tray';
import { WalletText } from '@mobile/wallet/WalletText';
import { Specimen, SpecimenLabel } from '../parts';
import type { CatalogueSection } from '../registry';

const SAMPLES = {
  ...COMMON_COPY,
  'sample.open': { th: 'เปิดถาด', en: 'Open the tray' },
  'sample.shortTitle': { th: 'ถาด', en: 'Tray' },
  'sample.shortBody': {
    th: 'ลอยห่างขอบจอ 8 พอยต์ ทำได้ทีละอย่าง และสูงเท่าที่แต่ละขั้นต้องใช้',
    en: 'It floats 8 pt in from the edges, does one thing at a time, and is as tall as each step needs.',
  },
  'sample.pickTitle': { th: 'เลือกหมวด', en: 'Pick a category' },
  'sample.doneTitle': { th: 'เลือกแล้ว', en: 'Picked' },
  'sample.doneBody': { th: 'ถาดหดลงเมื่อขั้นนี้สั้นกว่า', en: 'The tray shrinks when this step is shorter.' },
  'sample.largeTitle': { th: 'ถาดที่ตัวอักษรใหญ่ที่สุด เต็มจอใต้แถบสถานะ', en: 'A tray at the largest text size, full height under the status bar' },
  'sample.busy': { th: 'กำลังบันทึก…', en: 'Saving…' },
  'sample.passcode': { th: 'ใช้รหัสผ่าน', en: 'Use passcode' },
} as const satisfies DraftTable;

/** Category names for the tall tray's scrolling list. */
const CATEGORIES = {
  th: ['อาหาร', 'กาแฟ', 'เดินทาง', 'ช้อปปิ้ง', 'บ้าน', 'บิล', 'สุขภาพ', 'ทำบุญ', 'ของขวัญ', 'โทรศัพท์', 'สัตว์เลี้ยง', 'หนังสือ', 'เดลิเวอรี', 'อื่น ๆ'],
  en: ['Food', 'Coffee', 'Travel', 'Shopping', 'Home', 'Bills', 'Health', 'Merit', 'Gifts', 'Phone', 'Pets', 'Books', 'Delivery', 'Other'],
} as const;

/** One row, on the tray's raised fill. */
function Row({ children }: { children: string }) {
  const colors = useWalletColors();
  return (
    <View style={{ minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16, backgroundColor: colors.raised }}>
      <WalletText>{children}</WalletText>
    </View>
  );
}

/** A tray that opens at once, and the link that opens it again. */
function OpenTray({ label, render }: { label: string; render: (open: boolean, close: () => void) => ReactNode }) {
  const t = useDraftCopy(SAMPLES);
  const [open, setOpen] = useState(true);
  return (
    <View style={{ gap: BUN_SPACE.xs, alignItems: 'flex-start' }}>
      <SpecimenLabel>{label}</SpecimenLabel>
      <TextLink label={t('sample.open')} onPress={() => setOpen(true)} />
      {render(open, () => setOpen(false))}
    </View>
  );
}

function ShortTray() {
  const t = useDraftCopy(SAMPLES);
  return (
    <OpenTray
      label="A short tray: its height is its content's, with the main button and a text link pinned under it"
      render={(open, close) => (
        <Tray
          visible={open}
          onClose={close}
          title={t('sample.shortTitle')}
          footer={(
            <>
              <PrimaryButton label={t('common.done')} onPress={close} />
              <TextLink label={t('common.later')} tone="ink" onPress={close} />
            </>
          )}
        >
          <WalletText>{t('sample.shortBody')}</WalletText>
        </Tray>
      )}
    />
  );
}

/** Two steps: a list that scrolls under the pinned footer, then a short step with back. */
function StepTray({ title, label }: { title: 'sample.pickTitle' | 'sample.largeTitle'; label: string }) {
  const t = useDraftCopy(SAMPLES);
  const locale = useActiveLocale();
  const [step, setStep] = useState<'pick' | 'done'>('pick');
  const words = locale === 'th' ? CATEGORIES.th : CATEGORIES.en;
  return (
    <OpenTray
      label={label}
      render={(open, close) => (
        <Tray
          visible={open}
          onClose={close}
          onClosed={() => setStep('pick')}
          title={step === 'pick' ? t(title) : t('sample.doneTitle')}
          step={step}
          onBack={step === 'done' ? () => setStep('pick') : undefined}
          footer={step === 'pick' ? <PrimaryButton label={t('common.next')} onPress={() => setStep('done')} /> : <PrimaryButton label={t('common.done')} onPress={close} />}
        >
          {step === 'pick' ? words.map((name) => <Row key={name}>{name}</Row>) : <WalletText>{t('sample.doneBody')}</WalletText>}
        </Tray>
      )}
    />
  );
}

function ButtonsSection() {
  const t = useDraftCopy(SAMPLES);
  const colors = useWalletColors();
  const noop = () => undefined;
  return (
    <View style={{ backgroundColor: colors.sheet, borderRadius: BUN_RADIUS.card, padding: BUN_SPACE.md, gap: BUN_SPACE.sm }}>
      <Specimen label="The main button: 54 pt, radius 16, one per tray"><PrimaryButton label={t('common.save')} onPress={noop} /></Specimen>
      <Specimen label="Busy: it says so, and presses wait"><PrimaryButton label={t('common.save')} busy busyLabel={t('sample.busy')} onPress={noop} /></Specimen>
      <Specimen label="Disabled"><PrimaryButton label={t('common.next')} disabled onPress={noop} /></Specimen>
      <Specimen label="Text links, at least 44 pt: violet, then ink for the quiet second choice">
        <View style={{ alignItems: 'flex-start' }}>
          <TextLink label={t('common.later')} onPress={noop} />
          <TextLink label={t('sample.passcode')} tone="ink" onPress={noop} />
        </View>
      </Specimen>
    </View>
  );
}

export const WALLET_TRAY_SECTIONS: readonly CatalogueSection[] = [
  { id: 'bw-tray-short', title: 'Bun Wallet: tray, short', group: 'Kit', render: () => <ShortTray /> },
  {
    id: 'bw-tray-tall',
    title: 'Bun Wallet: tray, tall',
    group: 'Kit',
    render: () => <StepTray title="sample.pickTitle" label="A tall tray: the list scrolls under the pinned footer; Next shows a shorter step, and the tray's height follows" />,
  },
  {
    id: 'bw-tray-large',
    title: 'Bun Wallet: tray, largest text',
    group: 'Kit',
    render: () => <StepTray title="sample.largeTitle" label="Capture at AX5: the tray fills the screen under the status bar, and nothing is cut" />,
  },
  { id: 'bw-buttons', title: 'Bun Wallet: main button and text link', group: 'Kit', render: () => <ButtonsSection /> },
];
