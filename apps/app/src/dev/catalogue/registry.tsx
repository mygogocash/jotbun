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
// Screens built behind an area awaiting its E2 checkpoint have their own list
// here, in the 'Screens' group, in plan order: Planning (R4), Insights (R5) and
// Account (R6). Import (R7) comes later.
import type { ReactNode } from 'react';

import { ENTRY_SECTIONS } from './entrySections';
import { HISTORY_SECTIONS } from './historySections';
import { HOME_SECTIONS } from './homeSections';
import { KIT_SECTIONS } from './kitSections';
import { FIRST_RUN_SECTIONS } from './account/firstRunSections';
import { INSIGHTS_SECTIONS } from './insights/insightsSections';
import { RECAP_SECTIONS } from './insights/recapSections';
import { REMINDERS_SECTIONS } from './insights/remindersSections';
import { MASCOT_SECTIONS } from './mascotSections';
import { BUDGET_SECTIONS } from './planning/budgetSections';
import { CATEGORY_SECTIONS } from './planning/categorySections';
import { WALLET_SECTIONS } from './planning/walletSections';
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

/** R4 Planning (behind `planning` until E2 checkpoint 2): Budget, Wallets, Categories. */
export const PLANNING_SECTIONS: readonly CatalogueSection[] = [
  ...BUDGET_SECTIONS,
  ...WALLET_SECTIONS,
  ...CATEGORY_SECTIONS,
];

/** R5 Insights (behind `insights` until E2 checkpoint 3): the hub, a month's recap, reminders. */
export const INSIGHTS_SCREEN_SECTIONS: readonly CatalogueSection[] = [
  ...INSIGHTS_SECTIONS,
  ...RECAP_SECTIONS,
  ...REMINDERS_SECTIONS,
];

/** R6 Account (behind `account` until E2 checkpoint 4): first run, sign-in, Settings, privacy. */
export const ACCOUNT_SECTIONS: readonly CatalogueSection[] = [
  ...FIRST_RUN_SECTIONS,
];

export const CATALOGUE_SECTIONS: readonly CatalogueSection[] = [
  ...KIT_SECTIONS,
  ...ENTRY_SECTIONS,
  ...MASCOT_SECTIONS,
  ...SCREEN_SECTIONS,
  ...PLANNING_SECTIONS,
  ...INSIGHTS_SCREEN_SECTIONS,
  ...ACCOUNT_SECTIONS,
];
