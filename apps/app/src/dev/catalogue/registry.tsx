// The screen catalogue's sections (redesign R2c, development only), in the
// order the catalogue steps through them. A component section must fit one
// 402 × 874 pt screen under the catalogue's header, so one screenshot covers
// it; split a bigger one into several (see `amount` and `amount-states`). A
// screen section (`layout: 'screen'`) is the real screen in one state, on
// fakes, scrolling as it does in the app.
//
// To add a component or a screen state, add one entry. Its id is the deep
// link's `section` value: lowercase words joined by hyphens, never reused. A
// screen state is one `screenSection(...)` (./screenSection.tsx) in its
// screen's list below: the fakes it is drawn on, the steps that reach it (as
// the screen's render test takes them) and the screen on the fixtures' clock.
// The every-section render test picks a new entry up by itself; say what it
// must show in that test's SHOWS table.
//
// Screens still to come (R4 onwards: Budget, Insights, Import, Settings) get
// a list of their own here, in the 'Screens' group.
import type { ReactNode } from 'react';

import { ENTRY_SECTIONS } from './entrySections';
import { HISTORY_SECTIONS } from './historySections';
import { HOME_SECTIONS } from './homeSections';
import { KIT_SECTIONS } from './kitSections';
import { MASCOT_SECTIONS } from './mascotSections';
import { QUICK_ADD_SECTIONS } from './quickAddSections';
import { RECORD_SECTIONS } from './recordSections';

export type CatalogueGroup = 'Kit' | 'Mascot' | 'Screens';

export type CatalogueSection = {
  /** The deep link's `section` value. */
  readonly id: string;
  /** Shown in the catalogue's header and index. Catalogue chrome, so plain English. */
  readonly title: string;
  readonly group: CatalogueGroup;
  /** The section's content. It renders inside the catalogue's theme, locale and bun intensity. */
  readonly render: () => ReactNode;
  /** `screen`: a whole screen, drawn edge to edge under the header with its own scrolling. */
  readonly layout?: 'screen';
};

/** The redesigned screens (R3), one section per state: Home, Quick add, History and the record. */
export const SCREEN_SECTIONS: readonly CatalogueSection[] = [
  ...HOME_SECTIONS,
  ...QUICK_ADD_SECTIONS,
  ...HISTORY_SECTIONS,
  ...RECORD_SECTIONS,
];

export const CATALOGUE_SECTIONS: readonly CatalogueSection[] = [
  ...KIT_SECTIONS,
  ...ENTRY_SECTIONS,
  ...MASCOT_SECTIONS,
  ...SCREEN_SECTIONS,
];
