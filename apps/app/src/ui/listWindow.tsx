// How much of a long list is drawn before the list has measured the screen
// (redesign review m7). Long lists in the redesign are virtualized
// (`FlatList`): they draw their first items at once, then only a window
// around what is on screen, so a month of two thousand entries never mounts
// two thousand rows, and typing in a search redraws only what is in view.
//
// Render tests have no layout (happy-dom measures nothing), so there a
// virtualized list never grows past its first items. `DrawWholeLists` is for
// those test harnesses: under it, a list draws every item, as it does on a
// device once the person scrolls. The app itself never uses it.
import { createContext, useContext } from 'react';
import type { PropsWithChildren } from 'react';

const WholeLists = createContext(false);

/** Test harnesses only: every virtualized list below draws all of its items. */
export function DrawWholeLists({ children }: PropsWithChildren) {
  return <WholeLists.Provider value>{children}</WholeLists.Provider>;
}

/** A virtualized list's `initialNumToRender`: `count`, or every item under `DrawWholeLists`. */
export function useFirstItems(count: number): number {
  return useContext(WholeLists) ? Number.MAX_SAFE_INTEGER : count;
}
