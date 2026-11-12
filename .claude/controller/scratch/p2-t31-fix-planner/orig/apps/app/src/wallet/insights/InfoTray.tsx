// Info tray explaining the spent amount number (P2-T31).
import type { ReactElement } from 'react';

import { useWalletColors } from '@mobile/theme/ThemeProvider';
import { useDraftCopy } from '../copy/useDraftCopy';
import { Tray } from '../tray/Tray';
import { WalletText } from '../WalletText';
import { COPY } from './copy';

export function InfoTray(props: { visible: boolean; onClose: () => void }): ReactElement {
  const t = useDraftCopy(COPY);
  const colors = useWalletColors();

  return (
    <Tray
      visible={props.visible}
      onClose={props.onClose}
      title={t('insights.whatIsThis')}
      testID="insights-info-tray"
    >
      <WalletText style={{ fontSize: 15, lineHeight: 22, color: colors.quiet, paddingVertical: 8 }}>
        {t('insights.spentExplain')}
      </WalletText>
    </Tray>
  );
}
