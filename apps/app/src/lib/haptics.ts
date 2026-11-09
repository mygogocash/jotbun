// Cross-platform haptic feedback (web + native), single source of truth.
//
// Thin wrapper over expo-haptics. On web (Platform.OS === "web") every method is a
// no-op — the native module is never loaded. On native, calls are wrapped in
// try/catch so a missing or failing native module never throws: haptics are
// cosmetic feedback (success/impact/error cues), so we fire-and-forget and
// silently degrade rather than surfacing an error to the caller.
//
// This module imports `react-native` NOWHERE — not statically, and not through a
// dynamic `import("react-native")` (see defaultPlatformOS for why the dynamic form
// is fatal, not merely slow). expo-haptics is still lazily imported, mirroring
// i18n/localeStorage.ts's dynamic-import discipline — note that pattern lazily
// loads a SPECIFIC package, never a barrel. Keeping react-native out entirely also
// keeps the node test environment — which cannot parse the Flow-typed react-native
// source — from ever loading it, so the unit tests live in the fast source suite.

export type ExpoHapticsModule = {
  notificationAsync: (type: unknown) => Promise<void>;
  impactAsync: (style?: unknown) => Promise<void>;
  selectionAsync: () => Promise<void>;
  NotificationFeedbackType: { Success: unknown; Warning: unknown; Error: unknown };
  ImpactFeedbackStyle: { Light: unknown; Medium: unknown; Rigid: unknown };
};

export type HapticsCallOptions = {
  /** Override the detected platform (defaults to a lazy react-native Platform.OS read). */
  platformOS?: string;
  /** Override the native module loader (defaults to a lazy expo-haptics import). */
  loadModule?: () => Promise<ExpoHapticsModule>;
  /** Override the pause between a pattern's beats (tests). */
  wait?: (ms: number) => Promise<void>;
};

/** The gap between the beats of the celebration pattern. */
export const CELEBRATE_BEAT_MS = 110;

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function defaultPlatformOS(): Promise<string> {
  // NEVER import the `react-native` barrel here — not statically, and not via
  // `await import("react-native")`. Metro compiles a namespace import into
  // metroImportAll, which copies every enumerable export off react-native's
  // index. Those exports are LAZY GETTERS, so enumerating them invokes them —
  // including `get PushNotificationIOS`, which constructs a NativeEventEmitter
  // over a native module that is not linked in this build. The resulting
  // invariant violation is raised inside Metro's guardedLoadModule, which
  // routes it to ErrorUtils.reportFatalError instead of rethrowing — so it
  // escapes runHaptic's try/catch and aborts the process (RCTFatalException).
  //
  // runHaptic only ever compares against "web", so a document probe is
  // sufficient and pulls in no module at all: React Native (Hermes) has no
  // `document`, react-native-web runs in a DOM.
  return typeof document === "undefined" ? "native" : "web";
}

async function defaultLoadModule(): Promise<ExpoHapticsModule> {
  return (await import("expo-haptics")) as unknown as ExpoHapticsModule;
}

async function runHaptic(
  options: HapticsCallOptions,
  invoke: (mod: ExpoHapticsModule) => Promise<void>,
): Promise<void> {
  try {
    const platformOS = options.platformOS ?? (await defaultPlatformOS());
    if (platformOS === "web") {
      return;
    }
    const loadModule = options.loadModule ?? defaultLoadModule;
    const mod = await loadModule();
    await invoke(mod);
  } catch {
    // Fire-and-forget: a missing/failing native haptics module must never throw.
  }
}

export const haptics = {
  /** Success notification haptic (e.g. OTP verified, withdraw confirmed). */
  success(options: HapticsCallOptions = {}): Promise<void> {
    return runHaptic(options, (mod) =>
      mod.notificationAsync(mod.NotificationFeedbackType.Success),
    );
  },
  /** Medium impact haptic (e.g. button press / selection confirm). */
  impact(options: HapticsCallOptions = {}): Promise<void> {
    return runHaptic(options, (mod) =>
      mod.impactAsync(mod.ImpactFeedbackStyle.Medium),
    );
  },
  /** Selection-change haptic (e.g. switching primary navigation destinations). */
  selection(options: HapticsCallOptions = {}): Promise<void> {
    return runHaptic(options, (mod) => mod.selectionAsync());
  },
  /** Error notification haptic (e.g. failed action). */
  error(options: HapticsCallOptions = {}): Promise<void> {
    return runHaptic(options, (mod) =>
      mod.notificationAsync(mod.NotificationFeedbackType.Error),
    );
  },
  /** Light impact: a soft confirmation (saved offline, undo, a suggestion arriving). */
  light(options: HapticsCallOptions = {}): Promise<void> {
    return runHaptic(options, (mod) =>
      mod.impactAsync(mod.ImpactFeedbackStyle.Light),
    );
  },
  /** Rigid impact: something was removed (a delete that can still be undone). */
  rigid(options: HapticsCallOptions = {}): Promise<void> {
    return runHaptic(options, (mod) =>
      mod.impactAsync(mod.ImpactFeedbackStyle.Rigid),
    );
  },
  /** Warning notification haptic (a budget threshold crossed). */
  warning(options: HapticsCallOptions = {}): Promise<void> {
    return runHaptic(options, (mod) =>
      mod.notificationAsync(mod.NotificationFeedbackType.Warning),
    );
  },
  /** Three beats for a real milestone: success, then two light taps. */
  celebrate(options: HapticsCallOptions = {}): Promise<void> {
    const wait = options.wait ?? pause;
    return runHaptic(options, async (mod) => {
      await mod.notificationAsync(mod.NotificationFeedbackType.Success);
      await wait(CELEBRATE_BEAT_MS);
      await mod.impactAsync(mod.ImpactFeedbackStyle.Light);
      await wait(CELEBRATE_BEAT_MS);
      await mod.impactAsync(mod.ImpactFeedbackStyle.Light);
    });
  },
};
