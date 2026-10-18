// The screen catalogue's sections (redesign R2c, development only), in the
// order the catalogue steps through them. Each section must fit one 402 × 874
// pt screen under the catalogue's header, so one screenshot covers it; split a
// bigger one into several (see `amount` and `amount-states`).
//
// To add a component or a screen state, add one entry. Its id is the deep
// link's `section` value: lowercase words joined by hyphens, never reused.
//
// Slots still to fill:
// - R2b, entry and data components (group 'Kit'): keypad, type-switch,
//   category-chips, category-grid, wallet-picker, date-chip, note-field,
//   record-row, day-header, budget-bar, pace-ring.
// - R3, core loop screens (group 'Screens'), one entry per state in plan §6.1:
//   home (loading, first run, no budget, offline or saving, over budget,
//   upgrade required, terms required, signed out, diary locked), quick add
//   (saving, saved, queued offline, validation, needs an opening balance, move),
//   history, record detail and its conflict view.
import type { ReactNode } from 'react';

import { KIT_SECTIONS } from './kitSections';
import { MASCOT_SECTIONS } from './mascotSections';

export type CatalogueGroup = 'Kit' | 'Mascot' | 'Screens';

export type CatalogueSection = {
  /** The deep link's `section` value. */
  readonly id: string;
  /** Shown in the catalogue's header and index. Catalogue chrome, so plain English. */
  readonly title: string;
  readonly group: CatalogueGroup;
  /** The section's content. It renders inside the catalogue's theme, locale and bun intensity. */
  readonly render: () => ReactNode;
};

export const CATALOGUE_SECTIONS: readonly CatalogueSection[] = [
  ...KIT_SECTIONS,
  // R2b: ...ENTRY_SECTIONS,
  ...MASCOT_SECTIONS,
  // R3: ...SCREEN_SECTIONS,
];
