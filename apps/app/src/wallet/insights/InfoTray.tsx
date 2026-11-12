// What the spent amount is (P2-T31): the wallet's tray, so its motion follows
// the wallet's one reduced-motion answer, with the explanation in body text.
import type { ReactElement } from 'react';

import { useDraftCopy } from '../copy/useDraftCopy';
import { Tray } from '../tray/Tray';
import { WalletText } from '../WalletText';
import { COPY } from './copy';

export function InfoTray({ visible, onClose }: { visible: boolean; onClose: () => void }): ReactElement {
  const t = useDraftCopy(COPY);
  return (
    <Tray visible={visible} onClose={onClose} title={t('insights.whatIsThis')} testID="insights-info-tray">
      <WalletText role="body" tone="quiet" style={{ paddingVertical: 8 }}>{t('insights.spentExplain')}</WalletText>
    </Tray>
  );
}
