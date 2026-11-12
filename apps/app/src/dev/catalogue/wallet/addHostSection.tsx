// The add tray's host in the catalogue (P2-T16, development only): the stage of
// the three sections that addSections.tsx lists and loads lazily, so the
// wallet's section list never loads the host (it reaches Quick add's keys,
// and so expo-crypto). The real AddTrayHost, on the fakes of the screen section
// around it (R72), opens its tray once as the section opens, over a page that
// says what the section shows; closed, Open the tray brings it back. The
// section's script does the rest, as a person would. The sample words are
// catalogue samples, not app copy. A section never imports the wallet test
// harness, which loads vitest.
import { useEffect } from 'react';
import { View } from 'react-native';

import { BUN_SPACE } from '@mobile/ui/layout';
import { AddTrayHost, useAddTray } from '@mobile/wallet/add/AddTrayHost';
import type { DraftTable } from '@mobile/wallet/copy/draftText';
import { useDraftCopy } from '@mobile/wallet/copy/useDraftCopy';
import { TextLink } from '@mobile/wallet/tray/TextLink';
import { SpecimenLabel } from '../parts';

const SAMPLES = {
  'sample.open': { th: 'เปิดถาด', en: 'Open the tray' },
} as const satisfies DraftTable;

function Page({ label }: { label: string }) {
  const t = useDraftCopy(SAMPLES);
  const { open } = useAddTray();
  // Once, as the section opens: its open reads the host's latest state.
  useEffect(() => {
    open();
  }, []);
  return (
    <View style={{ gap: BUN_SPACE.xs, alignItems: 'flex-start', padding: BUN_SPACE.md }}>
      <SpecimenLabel>{label}</SpecimenLabel>
      <TextLink label={t('sample.open')} onPress={() => open()} />
    </View>
  );
}

export default function HostTraySection({ label }: { label: string }) {
  return (
    <AddTrayHost>
      <Page label={label} />
    </AddTrayHost>
  );
}
