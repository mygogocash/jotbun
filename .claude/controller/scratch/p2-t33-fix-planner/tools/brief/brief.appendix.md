
---

## Appendix: the code diffs

Each block is the kit's diff, byte for byte. Copy from `PL/real/`, not from here. The four test files' diffs are in `PL/diffs/` (`Lock.render.test.tsx` adds 14 cases, so its diff is long).

`apps/app/src/screens/redesign/import/ReceiptParts.tsx`:

```diff
diff --git a/apps/app/src/screens/redesign/import/ReceiptParts.tsx b/apps/app/src/screens/redesign/import/ReceiptParts.tsx
index afa6df61d5b394abff8d84d39bee17f43b38f626..a54f8b0ad6f5ac128a16c01f391c3cc2d4c9127a 100644
--- a/apps/app/src/screens/redesign/import/ReceiptParts.tsx
+++ b/apps/app/src/screens/redesign/import/ReceiptParts.tsx
@@ -33,6 +33,7 @@ import { useBunColors } from '@mobile/theme/ThemeProvider';
 import { DECORATIVE, POLITE_LIVE_REGION, moveAccessibilityFocus, useAnnouncement } from '@mobile/ui/a11y';
 import { BunText } from '@mobile/ui/BunText';
 import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
+import { LockCoverArt, useLockCover } from '@mobile/ui/lockCover';
 import { PillButton } from '@mobile/ui/PillButton';
 import { PromiseList } from '@mobile/ui/PromiseList';
 import { Sheet } from '@mobile/ui/Sheet';
@@ -203,12 +204,20 @@ export type ViewerState = { state: 'loading' } | { state: 'ready'; uri: string }
  * its title when it opens. It fades in; under reduced motion it simply
  * appears. The fade is the kit's own opacity timing, like the Sheet's spring,
  * so the modal itself never animates and is active (a dialog) at once.
+ *
+ * Under the Face ID lock's cover (R63, P2-T33) it draws LockCoverArt in place
+ * of the photo, as the Sheet does: a Modal draws above the app, so the lock's
+ * own cover lies under it, and while the app is locked this cover carries the
+ * lock screen. Nothing of the photo is drawn or named, and Android's back
+ * (Escape on the web) asks nothing. When the cover lifts the photo is back as
+ * it was, without fading in again.
  */
 export function ReceiptViewer({ visible, view, onClose, onRetry }: { visible: boolean; view: ViewerState; onClose: () => void; onRetry: () => void }) {
   const tc = useCopy();
   const colors = useBunColors();
   const insets = useSafeAreaInsets();
   const reducedMotion = useReducedMotion();
+  const { hidden } = useLockCover();
   const viewerRef = useRef<HostInstance>(null);
   const titleRef = useRef<HostInstance>(null);
   const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
@@ -223,57 +232,64 @@ export function ReceiptViewer({ visible, view, onClose, onRetry }: { visible: bo
   }, [opacity, reducedMotion, visible]);
   const title = tc('Receipt photo');
   const web = Platform.OS === 'web';
-  const webDialog = web ? { 'aria-label': title } : null;
+  // Under the lock nothing is named.
+  const webDialog = web ? { 'aria-label': hidden ? undefined : title } : null;
   const panelDialog = web ? null : { role: 'dialog' as const, 'aria-modal': true, 'aria-label': title };
   const nativeTitle = web ? null : { accessible: true, accessibilityRole: 'header' as const, accessibilityLabel: title };
+  // Android's back (Escape on the web) asks nothing under the lock's cover.
+  const requestClose = () => {
+    if (!hidden) onClose();
+  };
   return (
     <Modal
       visible={visible}
       animationType="none"
-      onRequestClose={onClose}
+      onRequestClose={requestClose}
       onShow={() => moveAccessibilityFocus(web ? viewerRef.current : titleRef.current)}
       statusBarTranslucent
       {...webDialog}
     >
-      <Animated.View
-        ref={viewerRef}
-        testID="receipt-viewer"
-        {...panelDialog}
-        accessibilityViewIsModal
-        onAccessibilityEscape={onClose}
-        tabIndex={-1}
-        style={{ flex: 1, opacity, backgroundColor: colors.background, paddingTop: insets.top + BUN_SPACE.sm, paddingBottom: insets.bottom + BUN_SPACE.md, paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}
-      >
-        <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.sm }}>
-          <View ref={titleRef} {...nativeTitle} style={{ flex: 1 }}>
-            <BunText variant="heading" role="heading" accessibilityRole="header">{title}</BunText>
-          </View>
-          <Pressable
-            accessibilityRole="button"
-            accessibilityLabel={tc('Close')}
-            onPress={onClose}
-            style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}
-          >
-            <View {...DECORATIVE}>
-              <BunText variant="heading">×</BunText>
-            </View>
-          </Pressable>
-        </View>
-        <View style={{ flex: 1, justifyContent: 'center', borderRadius: BUN_RADIUS.card, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, backgroundColor: colors.paper, overflow: 'hidden' }}>
-          {view.state === 'ready' ? (
-            <Image testID="receipt-full-image" accessible accessibilityRole="image" accessibilityLabel={title} source={{ uri: view.uri }} resizeMode="contain" style={{ flex: 1 }} />
-          ) : view.state === 'loading' ? (
-            <View style={{ padding: BUN_SPACE.md }}>
-              <ReceiptWorking label={tc('Loading the receipt photo…')} />
+      {hidden ? <LockCoverArt /> : (
+        <Animated.View
+          ref={viewerRef}
+          testID="receipt-viewer"
+          {...panelDialog}
+          accessibilityViewIsModal
+          onAccessibilityEscape={onClose}
+          tabIndex={-1}
+          style={{ flex: 1, opacity, backgroundColor: colors.background, paddingTop: insets.top + BUN_SPACE.sm, paddingBottom: insets.bottom + BUN_SPACE.md, paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}
+        >
+          <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.sm }}>
+            <View ref={titleRef} {...nativeTitle} style={{ flex: 1 }}>
+              <BunText variant="heading" role="heading" accessibilityRole="header">{title}</BunText>
             </View>
-          ) : (
-            <View accessibilityRole="alert" style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.sm }}>
-              <BunText style={{ fontWeight: '700' }}>{view.message}</BunText>
-              <PillButton kind="secondary" label={tc('Try again')} onPress={onRetry} />
-            </View>
-          )}
-        </View>
-      </Animated.View>
+            <Pressable
+              accessibilityRole="button"
+              accessibilityLabel={tc('Close')}
+              onPress={onClose}
+              style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}
+            >
+              <View {...DECORATIVE}>
+                <BunText variant="heading">×</BunText>
+              </View>
+            </Pressable>
+          </View>
+          <View style={{ flex: 1, justifyContent: 'center', borderRadius: BUN_RADIUS.card, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, backgroundColor: colors.paper, overflow: 'hidden' }}>
+            {view.state === 'ready' ? (
+              <Image testID="receipt-full-image" accessible accessibilityRole="image" accessibilityLabel={title} source={{ uri: view.uri }} resizeMode="contain" style={{ flex: 1 }} />
+            ) : view.state === 'loading' ? (
+              <View style={{ padding: BUN_SPACE.md }}>
+                <ReceiptWorking label={tc('Loading the receipt photo…')} />
+              </View>
+            ) : (
+              <View accessibilityRole="alert" style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.sm }}>
+                <BunText style={{ fontWeight: '700' }}>{view.message}</BunText>
+                <PillButton kind="secondary" label={tc('Try again')} onPress={onRetry} />
+              </View>
+            )}
+          </View>
+        </Animated.View>
+      )}
     </Modal>
   );
 }
```

`apps/app/src/ui/a11y.ts`:

```diff
diff --git a/apps/app/src/ui/a11y.ts b/apps/app/src/ui/a11y.ts
index a962795a21b0ebc9df29618ad3ee539660457836..d2f95d5a22bba59f90fa5a42f969e26125ea8bb0 100644
--- a/apps/app/src/ui/a11y.ts
+++ b/apps/app/src/ui/a11y.ts
@@ -24,8 +24,26 @@ export const POLITE_LIVE_REGION = {
   'aria-live': 'polite',
 } as const;
 
-/** Speaks `text` on iOS, where live regions are not read. Never moves focus. */
+/**
+ * While the Face ID lock's cover is up (P2-T33), the app below it says nothing:
+ * iOS speaks an announcement whatever is drawn over the part that made it, so
+ * the hidden app's status lines would still be heard over the lock screen.
+ * LockGate sets it from its `hidden`; outside a gate it stays false.
+ */
+let quietUnderLockCover = false;
+
+/** LockGate's: true while its cover is up, false once the app below is in view again. */
+export function setQuietUnderLockCover(quiet: boolean): void {
+  quietUnderLockCover = quiet;
+}
+
+/** Speaks `text` on iOS, where live regions are not read. Never moves focus. Says nothing while the lock's cover is up. */
 export function announcePolitely(text: string): void {
+  if (!quietUnderLockCover) announceOverLockCover(text);
+}
+
+/** Speaks `text` on iOS even while the lock's cover is up: only for the lock's own notes (LockGate). Never moves focus. */
+export function announceOverLockCover(text: string): void {
   if (Platform.OS === 'ios' && text) AccessibilityInfo.announceForAccessibility(text);
 }
 
```

`apps/app/src/sync/announce.ts`:

```diff
diff --git a/apps/app/src/sync/announce.ts b/apps/app/src/sync/announce.ts
index ef1935263d3816f3e9ce8d51c31c00ee4fef178f..532c46638a7fddf5219e0e98b0391a6ffdcd35f8 100644
--- a/apps/app/src/sync/announce.ts
+++ b/apps/app/src/sync/announce.ts
@@ -1,8 +1,9 @@
 // Spoken status updates. iOS VoiceOver ignores live regions, so a changed
 // sync status is announced explicitly there; Android and the web use the
-// banner's polite live region.
-import { AccessibilityInfo, Platform } from 'react-native';
+// banner's polite live region. It is said through announcePolitely, so
+// nothing is said while the Face ID lock's cover is up (P2-T33).
+import { announcePolitely } from '@mobile/ui/a11y';
 
 export function announceStatus(text: string): void {
-  if (Platform.OS === 'ios' && text) AccessibilityInfo.announceForAccessibility(text);
+  announcePolitely(text);
 }
```

`apps/app/src/ui/Sheet.tsx`:

```diff
diff --git a/apps/app/src/ui/Sheet.tsx b/apps/app/src/ui/Sheet.tsx
index 05aad7128cd042523bdbc61eeafc45c9056b97d4..e6bd05a59e5341a5b172e162518ea8bcb46a9645 100644
--- a/apps/app/src/ui/Sheet.tsx
+++ b/apps/app/src/ui/Sheet.tsx
@@ -13,7 +13,9 @@
 // place of its backdrop and panel, and while the app is locked the cover
 // carries the lock screen: a Modal draws above the app, so this is where a
 // person whose sheet is open meets it. Nothing of the sheet is named, and
-// nothing asks to close it; its content is its host's, so nothing is lost.
+// nothing asks to close it. Its children unmount meanwhile: what the host
+// holds is kept, but a child that keeps its own state (a form's step, a typed
+// code) starts again when the cover lifts (P2-T33's second review, m1).
 //
 // ConfirmSheet states the consequence of an action before it happens. When the
 // action is destructive, the safe choice (cancel) keeps the ink fill and the
```

`apps/app/src/wallet/lock/LockGate.tsx`:

```diff
diff --git a/apps/app/src/wallet/lock/LockGate.tsx b/apps/app/src/wallet/lock/LockGate.tsx
index 3c28ddc58320d3caa32eab00b083b8b4ad57b9e2..fe974523ac2b53f215ef9f00b8c65d94a05f5233 100644
--- a/apps/app/src/wallet/lock/LockGate.tsx
+++ b/apps/app/src/wallet/lock/LockGate.tsx
@@ -8,39 +8,50 @@
 //   lock on never sees a frame of it at launch. A setting that cannot be read
 //   counts as on: a broken store never opens the app.
 // - Covered or locked, the app stays mounted (drafts and sync carry on) but no
-//   screen reader reaches it, and LockCoverContext says hidden, so every Tray
-//   and Sheet draws LockCoverArt in place of its content (R63).
+//   screen reader reaches it, and LockCoverContext says hidden, so every Tray,
+//   Sheet and receipt photo draws LockCoverArt in place of its content (R63;
+//   lockCover.test.ts keeps the list of Modals).
 // - Locked, the cover also carries LockedScreen. A Modal draws above the app's
 //   root and iOS presents no Modal over one that is up, so the lock screen is
 //   in every cover: the gate's own, over the app, and an open tray's or
 //   sheet's, inside its Modal. The topmost one is the one a person sees and
 //   presses (P2-T13's review, m1).
 // - Each opening of the app with the lock on (a cold start, every return from
-//   the background) asks the phone once by itself, when the app is in front.
-//   `inactive` (the prompt itself) asks nothing, so the scan cannot loop, and
-//   an answer to an earlier opening is dropped.
+//   the background) asks the phone once by itself, when the app is in front
+//   and the phone has said how it locks (a phone that cannot be read is asked
+//   in the passcode's words). `inactive` (the prompt itself) asks nothing, so
+//   the scan cannot loop, and an answer to an earlier opening is dropped. An
+//   opening counts as asked only once its prompt starts, so one that comes
+//   while an earlier prompt is up asks once that prompt has answered.
 // - The answers (R67): success unlocks; cancelled and failed stay locked and
 //   say lock.tryAgain; lockout says lock.lockout; unavailable reads the phone
 //   again first: still able to lock, it stays locked with lock.tryAgain; no
 //   longer able, the lock turns itself off, unlocks and says lock.turnedOff
-//   once. A prompt that throws counts as failed and a phone that cannot be
-//   read as still able, so a broken port never opens the app. iOS hears each
-//   note once from here, since every cover draws the locked screen.
+//   once. A prompt that throws, or answers outside the port's types, counts
+//   as failed, and a phone that cannot be read, or reads outside them, as
+//   still able, so a broken port never opens the app. A lock that was on only
+//   because its setting could not be read turns off without a word. iOS hears
+//   each note once from here, since every cover draws the locked screen.
+// - While the cover is up the app below says nothing on iOS (its announcements
+//   are quiet; the gate's own notes are said over the cover), and the keyboard
+//   goes, so no typing reaches the screen under it.
 // - Under the cover Android's back does nothing: it would pop a screen, and
 //   the draft on it, under the lock (a tray and a sheet already ignore it).
 // - LockSettingContext serves the setup screen and the Settings row: the lock
 //   goes on only on a phone that can lock, turning it on and off each asks the
-//   phone first, and either keeps lock-answered.
-import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
+//   phone first, and either keeps lock-answered. Turning it on holds only once
+//   it is stored, so the next launch locks too; a store that cannot keep it
+//   leaves the lock off and says so.
+import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
 import type { ReactNode } from 'react';
-import { AppState, BackHandler, Platform, Pressable, View } from 'react-native';
+import { AppState, BackHandler, Keyboard, Platform, Pressable, View } from 'react-native';
 import { IntlContext } from 'react-intl';
 import { useSafeAreaInsets } from 'react-native-safe-area-context';
 
 import { isSupportedLocale } from '@mobile/i18n/locales';
 import { translateCopy } from '@mobile/i18n/messages';
 import { useWalletColors } from '@mobile/theme/ThemeProvider';
-import { announcePolitely, POLITE_LIVE_REGION } from '@mobile/ui/a11y';
+import { announceOverLockCover, POLITE_LIVE_REGION, setQuietUnderLockCover } from '@mobile/ui/a11y';
 import { LockCoverArt, LockCoverContext } from '@mobile/ui/lockCover';
 import type { LockCover } from '@mobile/ui/lockCover';
 import { COMMON_COPY } from '../common/copy';
@@ -51,7 +62,7 @@ import { COPY } from './copy';
 import type { LocalAuthPort } from './localAuthPort';
 import { LockedScreen } from './LockedScreen';
 import type { AuthResult, LockAvailability, LockEvent, LockNote, LockView } from './lockModel';
-import { afterAnswer, afterRecheck, appStateEvent, LOCK_ANSWERED_NAME, LOCK_NAME, lockReducer, METHOD_KEYS, namedMethod, UNLOCKED } from './lockModel';
+import { afterAnswer, afterRecheck, appStateEvent, authResultOf, availabilityOf, LOCK_ANSWERED_NAME, LOCK_NAME, lockReducer, METHOD_KEYS, namedMethod, UNLOCKED } from './lockModel';
 
 /** What the setup screen and the Settings row read, and ask. */
 export type LockSetting = {
@@ -63,7 +74,7 @@ export type LockSetting = {
   readonly availability: LockAvailability | null;
   /** A prompt is up: nothing else asks until it answers. */
   readonly busy: boolean;
-  /** Asks the phone first; on success turns the lock on or off and keeps lock-answered. */
+  /** Asks the phone first; on success turns the lock on (once it is stored) or off, and keeps lock-answered. */
   readonly change: (on: boolean) => Promise<void>;
   /** Keeps lock-answered, the lock left as it is (the setup step's next). */
   readonly answer: () => void;
@@ -98,13 +109,17 @@ const UNREAD: Setting = { ready: false, enabled: false };
 
 const LOCK_COPY = { ...COMMON_COPY, ...COPY };
 
-/** Says once, over the app, that the lock turned itself off (R67), until the person closes it. */
-function TurnedOffNotice({ text, close, onClose }: { text: string; close: string; onClose: () => void }) {
+/** The gate's notices: the lock turned itself off (R67), or could not be kept on. */
+type LockNotice = 'lock.turnedOff' | 'lock.notStored';
+const NOTICE_IDS: Readonly<Record<LockNotice, string>> = { 'lock.turnedOff': 'lock-turned-off', 'lock.notStored': 'lock-not-stored' };
+
+/** Says a notice once, over the app, until the person closes it. */
+function Notice({ testID, text, close, onClose }: { testID: string; text: string; close: string; onClose: () => void }) {
   const colors = useWalletColors();
   const insets = useSafeAreaInsets();
   return (
     <View
-      testID="lock-turned-off"
+      testID={testID}
       {...POLITE_LIVE_REGION}
       style={{
         position: 'absolute',
@@ -145,12 +160,16 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
   const [view, setView] = useState<LockView>(UNLOCKED);
   const [phone, setPhone] = useState<LockAvailability | null>(null);
   const [note, setNote] = useState<LockNote | null>(null);
-  const [turnedOff, setTurnedOff] = useState(false);
+  const [notice, setNotice] = useState<LockNotice | null>(null);
   const [busy, setBusy] = useState(false);
   const [front, setFront] = useState(() => AppState.currentState === 'active');
+  // The phone's first reading has answered, or failed: the first ask waits for it, so it asks in the phone's words.
+  const [settled, setSettled] = useState(false);
 
   // What the rules read between renders.
   const enabled = useRef(false);
+  // On only because the setting could not be read: the person never turned it on.
+  const assumed = useRef(false);
   const known = useRef<LockAvailability | null>(null);
   const asking = useRef(false);
   // Each opening with the lock on is asked once, by itself; an answer to an earlier opening is dropped.
@@ -171,10 +190,11 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
     let live = true;
     void walletDeviceStore()
       .get(LOCK_NAME)
-      .then((value) => value === '1', () => true)
-      .then((on) => {
+      .then((value) => ({ on: value === '1', read: true }), () => ({ on: true, read: false }))
+      .then(({ on, read }) => {
         if (!live) return;
         enabled.current = on;
+        assumed.current = !read;
         setSetting({ ready: true, enabled: on });
         dispatch({ type: 'start' });
       });
@@ -186,8 +206,9 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
   /** What the phone can do, read again each time; null when it cannot be read. */
   const readPhone = useCallback(async (): Promise<LockAvailability | null> => {
     try {
-      const { canLock, method } = await port.availability();
-      const answer = { canLock, method };
+      // A reading outside the port's types counts as one that could not be read.
+      const answer = availabilityOf(await port.availability());
+      if (answer === null) return null;
       known.current = answer;
       setPhone(answer);
       return answer;
@@ -197,7 +218,13 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
   }, [port]);
 
   useEffect(() => {
-    void readPhone();
+    let live = true;
+    void readPhone().then(() => {
+      if (live) setSettled(true);
+    });
+    return () => {
+      live = false;
+    };
   }, [readPhone]);
 
   useEffect(() => {
@@ -214,7 +241,8 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
 
   const prompt = useCallback(async (words: string): Promise<AuthResult> => {
     try {
-      return await port.authenticate({ prompt: words, cancel, fallback: t('lock.usePasscode') });
+      // An answer outside the port's types counts as failed.
+      return authResultOf(await port.authenticate({ prompt: words, cancel, fallback: t('lock.usePasscode') }));
     } catch {
       return 'failed';
     }
@@ -226,36 +254,45 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
     setSetting({ ready: true, enabled: false });
     void walletDeviceStore().remove(LOCK_NAME).catch(() => undefined);
     dispatch({ type: 'disabled' });
-    setTurnedOff(true);
-    announcePolitely(t('lock.turnedOff'));
+    // A lock that was on only because its setting could not be read was never the person's: nothing to say.
+    if (assumed.current) return;
+    setNotice('lock.turnedOff');
+    announceOverLockCover(t('lock.turnedOff'));
   }, [dispatch, t]);
 
   /** Asks the phone to unlock: once by itself for each opening, and again from the locked screen. */
   const unlock = useCallback(async () => {
     if (asking.current) return;
     asking.current = true;
-    setBusy(true);
+    // This opening has its prompt now.
     const at = opening.current;
-    const answer = afterAnswer(await prompt(t(METHOD_KEYS[namedMethod(known.current)].line)));
-    const then = answer.step === 'recheck' ? afterRecheck(await readPhone()) : answer;
-    asking.current = false;
-    setBusy(false);
-    if (at !== opening.current) return;
-    if (then.step === 'turnOff') {
-      turnOff();
-    } else if (then.step === 'unlock') {
-      dispatch({ type: 'unlocked' });
-    } else {
-      setNote(then.note);
-      announcePolitely(t(then.note));
+    asked.current = at;
+    setBusy(true);
+    try {
+      const answer = afterAnswer(await prompt(t(METHOD_KEYS[namedMethod(known.current)].line)));
+      const then = answer.step === 'recheck' ? afterRecheck(await readPhone()) : answer;
+      if (at !== opening.current) return;
+      if (then.step === 'turnOff') {
+        turnOff();
+      } else if (then.step === 'unlock') {
+        dispatch({ type: 'unlocked' });
+      } else {
+        setNote(then.note);
+        announceOverLockCover(t(then.note));
+      }
+    } finally {
+      // However the answer went, the next press, or the next opening, can ask.
+      asking.current = false;
+      setBusy(false);
     }
   }, [prompt, readPhone, turnOff, dispatch, t]);
 
+  // Each opening asks once by itself: in front, and once the phone has said how it locks. While a prompt is up unlock
+  // asks nothing and leaves the opening unasked, so `busy` is a dependency: the opening asks once that prompt answers.
   useEffect(() => {
-    if (!view.locked || !front || asked.current === opening.current) return;
-    asked.current = opening.current;
+    if (!view.locked || !front || !settled || asked.current === opening.current) return;
     void unlock();
-  }, [view.locked, front, unlock]);
+  }, [view.locked, front, settled, busy, unlock]);
 
   const change = useCallback(async (on: boolean) => {
     if (asking.current || on === enabled.current) return;
@@ -263,22 +300,38 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
     if (on && known.current?.canLock !== true) return;
     asking.current = true;
     setBusy(true);
-    const result = await prompt(t('lock.switch', { method: t(METHOD_KEYS[namedMethod(known.current)].name) }));
-    // An unavailable answer reads the phone again; a lock that is on, on a phone that can no longer lock, turns itself off.
-    const gone = result === 'unavailable' && afterRecheck(await readPhone()).step === 'turnOff' && enabled.current;
-    asking.current = false;
-    setBusy(false);
-    if (gone) {
-      turnOff();
-      return;
+    setNotice(null);
+    try {
+      const result = await prompt(t('lock.switch', { method: t(METHOD_KEYS[namedMethod(known.current)].name) }));
+      // An unavailable answer reads the phone again; a lock that is on, on a phone that can no longer lock, turns itself off.
+      const gone = result === 'unavailable' && afterRecheck(await readPhone()).step === 'turnOff' && enabled.current;
+      if (gone) {
+        turnOff();
+        return;
+      }
+      if (result !== 'success') return;
+      const store = walletDeviceStore();
+      if (on) {
+        // Fail closed: the lock is on only once it is stored, so the next launch locks too.
+        const stored = await store.set(LOCK_NAME, '1').then(() => true, () => false);
+        if (!stored) {
+          setNotice('lock.notStored');
+          announceOverLockCover(t('lock.notStored'));
+          return;
+        }
+      } else {
+        // A lock that cannot be removed locks again at the next launch, which fails closed.
+        void store.remove(LOCK_NAME).catch(() => undefined);
+      }
+      // The person's own choice from here on.
+      assumed.current = false;
+      enabled.current = on;
+      setSetting({ ready: true, enabled: on });
+      void store.set(LOCK_ANSWERED_NAME, '1').catch(() => undefined);
+    } finally {
+      asking.current = false;
+      setBusy(false);
     }
-    if (result !== 'success') return;
-    enabled.current = on;
-    setSetting({ ready: true, enabled: on });
-    const store = walletDeviceStore();
-    // A choice that cannot be stored still holds until the app closes.
-    void (on ? store.set(LOCK_NAME, '1') : store.remove(LOCK_NAME)).catch(() => undefined);
-    void store.set(LOCK_ANSWERED_NAME, '1').catch(() => undefined);
   }, [prompt, readPhone, turnOff, t]);
 
   const answer = useCallback(() => {
@@ -295,6 +348,16 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
   );
 
   const hidden = !setting.ready || view.locked || view.covered;
+  // While the cover is up the app below says nothing on iOS. A layout effect, so it is quiet before any part below
+  // runs its own effects: a line that changes as the cover goes up is not said either.
+  useLayoutEffect(() => {
+    setQuietUnderLockCover(hidden);
+    return () => setQuietUnderLockCover(false);
+  }, [hidden]);
+  // Becoming hidden puts the keyboard away, so no typing reaches the screen under the cover.
+  useEffect(() => {
+    if (hidden) Keyboard.dismiss();
+  }, [hidden]);
   // Android only: the web has no back button, and react-native-web's BackHandler says so as an error.
   useEffect(() => {
     if (!hidden || Platform.OS !== 'android') return undefined;
@@ -314,7 +377,7 @@ export function LockGate({ port, children }: { port: LocalAuthPort; children: Re
       <LockSettingContext.Provider value={lock}>
         <View style={{ flex: 1 }} {...(hidden ? UNSEEN : SEEN)}>{children}</View>
         {hidden ? <LockCoverArt /> : null}
-        {turnedOff ? <TurnedOffNotice text={t('lock.turnedOff')} close={t('common.close')} onClose={() => setTurnedOff(false)} /> : null}
+        {notice === null ? null : <Notice testID={NOTICE_IDS[notice]} text={t(notice)} close={t('common.close')} onClose={() => setNotice(null)} />}
       </LockSettingContext.Provider>
     </LockCoverContext.Provider>
   );
```

`apps/app/src/wallet/lock/lockModel.ts`:

```diff
diff --git a/apps/app/src/wallet/lock/lockModel.ts b/apps/app/src/wallet/lock/lockModel.ts
index 32cb08e8b3603c943aac01a145fa20a516da1ad2..dda9b6d51a5527fb3e453d30288d38c2d8b67a58 100644
--- a/apps/app/src/wallet/lock/lockModel.ts
+++ b/apps/app/src/wallet/lock/lockModel.ts
@@ -1,8 +1,10 @@
 // The Face ID lock's rules (P2-T33, W18, R67): how the phone proves its owner,
 // what its system prompt answered, the lock's view as the app comes and goes,
-// and what the locked app does with each answer. LockGate runs them; the setup
-// screen and the Settings row read them. Pure: a Node test reads it, so it
-// imports nothing.
+// and what the locked app does with each answer. An answer or a reading
+// outside the port's types counts as a failed scan or a phone that could not
+// be read, so a slip in the port never opens the app. LockGate runs them; the
+// setup screen and the Settings row read them. Pure: a Node test reads it, so
+// it imports nothing.
 
 /** How the phone proves its owner. P2-T34 reads it from the phone's enrolment. */
 export type LockMethod = 'face' | 'fingerprint' | 'passcode';
@@ -13,6 +15,27 @@ export type AuthResult = 'success' | 'cancelled' | 'failed' | 'lockout' | 'unava
 /** What the phone can do: whether it can lock at all (a passcode or biometrics), and how. */
 export type LockAvailability = { canLock: boolean; method: LockMethod | null };
 
+const AUTH_RESULTS: readonly AuthResult[] = ['success', 'cancelled', 'failed', 'lockout', 'unavailable'];
+const LOCK_METHODS: readonly LockMethod[] = ['face', 'fingerprint', 'passcode'];
+
+/** The port's answer as one the gate knows: anything else (an adapter's slip) counts as failed, so it never unlocks. */
+export function authResultOf(answer: unknown): AuthResult {
+  return AUTH_RESULTS.find((result) => result === answer) ?? 'failed';
+}
+
+/**
+ * The port's reading as one the gate knows, or null, as for a read that
+ * failed, when it is outside the port's types: a phone that could not be read
+ * counts as still able to lock, and as not yet able to turn the lock on.
+ */
+export function availabilityOf(reading: unknown): LockAvailability | null {
+  if (typeof reading !== 'object' || reading === null) return null;
+  const { canLock, method } = reading as { canLock?: unknown; method?: unknown };
+  if (typeof canLock !== 'boolean') return null;
+  if (method !== null && !LOCK_METHODS.some((known) => known === method)) return null;
+  return { canLock, method: method as LockMethod | null };
+}
+
 /**
  * `locked`: the locked screen is up until the phone recognises its owner.
  * `covered`: the app is not in front, so nothing of it shows (W18).
@@ -88,10 +111,11 @@ export function afterAnswer(result: AuthResult): AfterAnswer {
  * After an unavailable answer, the phone read again (R67): still able to lock,
  * the app stays locked and says to try again; no longer able, the lock turns
  * itself off. A phone that could not be read counts as still able, so a read
- * that fails never opens the app.
+ * that fails never opens the app, and so does a reading that does not say
+ * `canLock: false` in so many words.
  */
 export function afterRecheck(phone: LockAvailability | null): { readonly step: 'stay'; readonly note: 'lock.tryAgain' } | { readonly step: 'turnOff' } {
-  return phone !== null && !phone.canLock ? { step: 'turnOff' } : { step: 'stay', note: 'lock.tryAgain' };
+  return phone !== null && phone.canLock === false ? { step: 'turnOff' } : { step: 'stay', note: 'lock.tryAgain' };
 }
 
 /** The method a screen names: the phone's, or the passcode while the phone has not said (every phone that can lock has one). */
```

`apps/app/src/wallet/lock/copy.ts`:

```diff
diff --git a/apps/app/src/wallet/lock/copy.ts b/apps/app/src/wallet/lock/copy.ts
index 077cbd8389ac1477176acca3e0025fa5d0ffcc43..7d40069fcb2f5eaafb49f119c11e22d3f4fed7c6 100644
--- a/apps/app/src/wallet/lock/copy.ts
+++ b/apps/app/src/wallet/lock/copy.ts
@@ -4,11 +4,11 @@ import type { DraftTable } from '../copy/draftText.ts';
  * The Face ID lock's lines: sa-lock-setup's and sa-locked's words, the
  * method's names, the Settings row, and the lines no board shows (the
  * fingerprint and passcode forms, what the locked screen says after a scan
- * that did not pass, the lock turning itself off, a phone with no passcode,
- * and the preview card's name). `{method}` takes a method's name. Data only:
- * read through `useDraftCopy` with COMMON_COPY. Default pending owner Q3:
- * built as written; the English lines, and every Thai line no board shows,
- * are drafts for E2-D.
+ * that did not pass, the lock turning itself off, a lock that could not be
+ * kept on, a phone with no passcode, and the preview card's name). `{method}`
+ * takes a method's name. Data only: read through `useDraftCopy` with
+ * COMMON_COPY. Default pending owner Q3: built as written; the English lines,
+ * and every Thai line no board shows, are drafts for E2-D.
  */
 export const COPY = {
   'lock.step': { th: 'ตั้งค่า · ขั้นที่ 5 จาก 5', en: 'Setup · Step 5 of 5' },
@@ -40,6 +40,7 @@ export const COPY = {
   'lock.tryAgain': { th: 'ลองอีกครั้ง หรือใช้รหัสผ่าน', en: 'Try again, or use your passcode.' },
   'lock.lockout': { th: 'สแกนไม่ผ่านหลายครั้ง ใช้รหัสผ่านของเครื่องแทน', en: "Too many scans didn't pass. Use your phone's passcode instead." },
   'lock.turnedOff': { th: 'ปิดการล็อกแล้ว เพราะเครื่องนี้ไม่มีรหัสผ่านหรือ Face ID แล้ว', en: 'The lock is off, because this phone no longer has a passcode or Face ID.' },
+  'lock.notStored': { th: 'เปิดการล็อกไม่สำเร็จ ลองอีกครั้ง', en: "The lock couldn't be turned on. Try again." },
   'lock.needsPasscode': { th: 'ตั้งรหัสผ่านหรือ Face ID ในการตั้งค่าเครื่องก่อน จึงจะล็อก Jotbun ได้', en: "Set a passcode or Face ID in your phone's settings first, then you can lock Jotbun." },
   'lock.row': { th: 'ล็อกด้วย {method}', en: 'Lock with {method}' },
   'lock.on': { th: 'เปิด', en: 'On' },
```
