// Shared render harness for the v1 money screens: real theme, copy and
// resources context around a fake resources port. Test use only.
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { IntlProvider } from 'react-intl';

import { SpendV1Provider } from '@mobile/spend/v1/SpendV1Context';
import type { SpendV1Resources } from '@mobile/spend/v1/resources';
import { ThemeProvider } from '@mobile/theme/ThemeProvider';

/** 29 September 2026, 10:00 in Bangkok: the golden month is the current month. */
export const NOW = new Date('2026-09-29T03:00:00Z');

export function mountV1(element: ReactElement, resources: SpendV1Resources, locale = 'en') {
  return render(
    <IntlProvider locale={locale}>
      <ThemeProvider>
        <SpendV1Provider resources={resources}>{element}</SpendV1Provider>
      </ThemeProvider>
    </IntlProvider>,
  );
}
