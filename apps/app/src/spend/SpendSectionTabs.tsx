import { useRouter } from "expo-router";
import { useCallback } from "react";

import {
  CustomerSectionTabs,
  type CustomerSectionTabItem,
} from "@mobile/components/CustomerSectionTabs";
import { useCopy } from "@mobile/i18n/useCopy";

export type SpendSection = "overview" | "records" | "import";

/** Where each section actually lives. Overview is GoGoSpend itself. */
const SECTION_ROUTE: Record<SpendSection, string> = {
  overview: "/spend",
  records: "/spend/all",
  import: "/spend/import",
};

/**
 * One strip across GoGoSpend's three screens.
 *
 * They were reachable only in a line before this — Overview, then "View all" a
 * tap away, then "More ways to add" a tap past that, and no way back up except
 * the chevron. The strip makes all three a tap apart from any of them.
 *
 * It is `CustomerSectionTabs`, which is Quest's strip and already carries
 * Wallet, Referral, Missing Orders and both legal screens. Copying its shape
 * rather than inventing a fourth one is the whole point: the app gains no new
 * navigation concept, and `accessibilityRole="tablist"` comes along for free.
 *
 * THE SECTIONS NAVIGATE, they do not swap bodies inside one route. Each of the
 * three screens owns its own `ProfileSubPageFrame`, so a shell rendering a
 * fourth would nest frames — and each sub-page already owns a `goBackToSpend`
 * that pops real history when there is any and falls back to /spend when there
 * is not. Navigating keeps that contract exactly as `spend-subpage-back` pins
 * it: Overview stays home, and back never lands on Profile.
 *
 * Tapping the section you are already standing on does nothing. Pushing the
 * route you are already on would grow the back stack with a duplicate of the
 * current page, so the chevron would then appear to do nothing.
 */
export function SpendSectionTabs({ active }: { active: SpendSection }) {
  const router = useRouter();
  const tc = useCopy();

  const onValueChange = useCallback(
    (next: SpendSection) => {
      if (next === active) return;
      router.push(SECTION_ROUTE[next]);
    },
    [active, router],
  );

  /*
   * "Add", not "More ways to add": the strip gives every label the same narrow
   * column, and the long form wraps to two lines in English before Thai is even
   * considered. The page it opens keeps its full title.
   */
  const items: readonly CustomerSectionTabItem<SpendSection>[] = [
    { id: "overview", label: tc("Overview") },
    { id: "records", label: tc("Records") },
    { id: "import", label: tc("Add") },
  ];

  return (
    <CustomerSectionTabs
      items={items}
      onValueChange={onValueChange}
      value={active}
    />
  );
}
