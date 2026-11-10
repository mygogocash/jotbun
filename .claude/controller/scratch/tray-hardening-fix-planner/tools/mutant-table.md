In the table, "the late case" is `on iOS a dismissal that ends after the tray is shown again says nothing; the next one says it closed` (the first round's), "m-1's case" is `on iOS a dismissal that ends in the commit that opens the tray again says nothing`, "the exit case" is `a card that leaves stays where the finger let it go, even when the lock cover comes and goes`, "the lift case" is `once the lock cover lifts a step change ticks, even when it lifted on the step it had under the cover`, and "the no-onClosed case" is `on iOS a tray with no onClosed closes, its dismissal ends, and it opens again`.

| Mutant | Change | Killed by |
| --- | --- | --- |
| H12 | the late `onDismiss`'s guard reads a ref of `shown` that an effect refreshes, as `784667b` did (m-1) | m-1's case, and only it |
| X1 | the drag is reset during the exit too, with no `if (visible)` (m-2) | the exit case, and only it |
| D2 | the tick effect without `hidden` in its dependencies (n-1) | the lift case, and only it |
| X4 | iOS's `onDismiss` calls `onClosed` with no optional chaining, so a host with none throws (n-2) | the no-onClosed case, and only it |
| D1, X2 | the tick effect without `visible`; the drag reset without `visible` | the full-motion case (D1); the swipe case `the swipe follows the finger down, ...` (X2) |
| H2, H4 | the late `onDismiss` always says the tray closed; its guard keeps the first render's `shown` (a callback never renewed) | the late case and m-1's case |
| H3 | the late `onDismiss`'s guard reads `visible`, not `shown` | the late case (`while the card leaves`) |
| H1 | under the cover the system back still asks to close (m1) | `under the lock cover nothing asks to close the tray` |
| H5 | the cover coming or going leaves a drag where it was (m3) | `a drag the lock cover cuts off is gone when the cover lifts` |
| H6, H8 | opening at another step in one render ticks; the cover lifting on another step ticks (m4) | `opening at another step in one render, or a step change under the lock cover, ticks nothing` |
| H7 | a step change under the cover ticks (m4) | that case, and the lift case |
| H9 | a step change never ticks once the tray is open (m4) | the reduced-motion and full-motion cases, that case and the lift case |
| H10, H11 | a cancelled swipe past the line closes; a cancelled swipe stays pulled down (n1) | `a swipe the system cancels springs back, even past the line` |
| B1, B4 | the `onClosed` ref is never refreshed; the hide calls the `onClosed` its effect captured (n3) | `an onClosed given while the card leaves is the one called` |
| B2 | the Modal is given `onDismiss` on every platform | `the card leaves before the Modal hides, then onClosed fires once`, and n3's case |
| O1, O2, O5, O6 | a phone's card is no dialog; its dialog has no name; with a header, a phone's focus goes nowhere, or to the header (m5) | the phone case, `on a phone the card is the named dialog and the title takes focus, with or without a header; ...` |
| O7, O11 | the backdrop without `focusable={false}`; the title without `accessible: true` (m6) | the Node case `what the web drops is wired for a phone: ...` |
| R1 to R3 | the plan's three: the backdrop closes a locked tray; the Modal hides at once on close; the cover is ignored | `while locked nothing closes it, ...` and `the card leaves before the Modal hides, ...` (R1); that case, the exit case and the phone case (R2); `a hidden lock cover replaces the tray's content` and the four cover cases (R3) |
| R4, R5, R7 | a locked tray still closes; a leaving tray asks to close again; a locked swipe stays pulled down | `while locked nothing closes it, ...` (R4, R7); `the card leaves before the Modal hides, ...` (R5) |
| R13 | a reopened tray keeps the last pull | the cover's drag case and the swipe case |
| R14 to R16 | no tick on a step change; opening ticks too; a closed tray ticks | the reduced-motion and full-motion cases and the two tick cases (R14, R15); the full-motion case and the first tick case (R16) |
| R25, R26 | on iOS `onClosed` fires before the Modal has gone; on iOS it never fires | the phone case, the late case and m-1's case (R26 also the no-onClosed case) |
| K1, K2 | the tray's sections missing from the wallet list; the tray's before the kit's | `the catalogue's tray sections come after the kit's, and each tray opens at once` |
