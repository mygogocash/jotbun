import { Linking, Platform } from "react-native";

/**
 * Shared denied-recovery helper for OS permission flows (#2649 / epic #2646).
 *
 * WHY THIS EXISTS
 * ---------------
 * Once a member denies Notifications, Camera, Photos, or Tracking, the OS
 * will not show the system dialog again. The only recovery path is the system
 * Settings surface. GoGoTrack already deep-links into Usage Access / app
 * notification settings via its native module; push and GoGoSpend had Retry
 * copy only. This helper is the shared JS seam those flows (T3 / T4) call
 * after a deny — never on cold start, never as a first ask.
 *
 * SURFACES
 * --------
 * - `app` (default): `Linking.openSettings()` on iOS and Android — the app's
 *   Settings page where Camera / Photos / Notifications / Tracking live.
 * - `notifications`: on Android, prefers `ACTION_APP_NOTIFICATION_SETTINGS`
 *   (same intent GototrackDetectorModule uses) so push recovery lands on the
 *   notification toggle; falls back to app Settings if the intent or package
 *   name is unavailable. On iOS, same as `app` (Notifications lives there).
 *
 * T3 / T4 CALLERS
 * ---------------
 * After `enableNativePushNotifications` / image-picker returns denied, show
 * denied-recovery UI and call `openAppSettings({ surface: "notifications" })`
 * (push) or `openAppSettings()` (camera/photos). Do not import this from a
 * cold-start effect.
 */

export type AppSettingsSurface = "app" | "notifications";

export type OpenAppSettingsMethod =
  | "linking_open_settings"
  | "android_notification_settings";

export type OpenAppSettingsPlan =
  | { ok: true; method: OpenAppSettingsMethod }
  | { ok: false; reason: "unsupported_platform" };

export type OpenAppSettingsResult =
  | { ok: true; method: OpenAppSettingsMethod }
  | {
      ok: false;
      reason: "unsupported_platform" | "open_failed";
      cause?: unknown;
    };

export type OpenAppSettingsOptions = {
  /**
   * Which Settings surface to open. Default `app`. Use `notifications` for
   * push denied-recovery so Android lands on the notification channel page.
   */
  surface?: AppSettingsSurface;
  /** Injected so unit tests can exercise iOS / Android / web without mocks. */
  platformOS?: string;
  /** Override `Linking.openSettings` (default). */
  openSettings?: () => Promise<void>;
  /**
   * Override the Android notification-settings intent. Defaults to
   * `Linking.sendIntent(APP_NOTIFICATION_SETTINGS, …)`.
   */
  openAndroidNotificationSettings?: (packageName: string) => Promise<void>;
  /**
   * Android application id for the notification-settings extra. Defaults to a
   * lazy `expo-application` read so node/render harnesses that never touch
   * this path never load `expo-modules-core`.
   */
  androidPackageName?: string | null | (() => string | null | Promise<string | null>);
};

const ANDROID_APP_NOTIFICATION_SETTINGS =
  "android.settings.APP_NOTIFICATION_SETTINGS";
const ANDROID_EXTRA_APP_PACKAGE = "android.provider.extra.APP_PACKAGE";

/**
 * Preferred Settings method for this platform + surface — not the eventual
 * effective method. Android `notifications` prefers the notification intent,
 * but `openAppSettings` may fall back to `linking_open_settings` when the
 * package id or intent is unavailable. Use the **result** of `openAppSettings`
 * for telemetry (T6), not this plan alone.
 */
export function resolveOpenAppSettingsPlan(
  platformOS: string,
  surface: AppSettingsSurface = "app",
): OpenAppSettingsPlan {
  if (platformOS !== "ios" && platformOS !== "android") {
    return { ok: false, reason: "unsupported_platform" };
  }
  if (platformOS === "android" && surface === "notifications") {
    return { ok: true, method: "android_notification_settings" };
  }
  return { ok: true, method: "linking_open_settings" };
}

async function defaultOpenSettings(): Promise<void> {
  await Linking.openSettings();
}

async function defaultOpenAndroidNotificationSettings(
  packageName: string,
): Promise<void> {
  await Linking.sendIntent(ANDROID_APP_NOTIFICATION_SETTINGS, [
    { key: ANDROID_EXTRA_APP_PACKAGE, value: packageName },
  ]);
}

async function defaultAndroidPackageName(): Promise<string | null> {
  // Lazy: expo-application pulls expo-modules-core, which crashes happy-dom /
  // node suites that only import this module for the plan helper.
  const mod = (await import("expo-application")) as {
    applicationId?: string | null;
  };
  const id = mod.applicationId?.trim();
  return id || null;
}

async function resolveAndroidPackageName(
  options: OpenAppSettingsOptions,
): Promise<string | null> {
  try {
    if (!("androidPackageName" in options)) {
      return await defaultAndroidPackageName();
    }
    const value = options.androidPackageName;
    if (typeof value === "function") {
      return await value();
    }
    return value ?? null;
  } catch {
    // expo-application / resolver failures must not block recovery — fall
    // through to Linking.openSettings like a missing package id.
    return null;
  }
}

/**
 * Open the system Settings surface for denied-permission recovery.
 * Never throws — reports `{ ok: false, reason }` so UI can keep a Retry path.
 */
export async function openAppSettings(
  options: OpenAppSettingsOptions = {},
): Promise<OpenAppSettingsResult> {
  const platformOS = options.platformOS ?? Platform.OS;
  const surface = options.surface ?? "app";
  const plan = resolveOpenAppSettingsPlan(platformOS, surface);

  if (!plan.ok) {
    return plan;
  }

  const openSettings = options.openSettings ?? defaultOpenSettings;
  const openAndroidNotificationSettings =
    options.openAndroidNotificationSettings ??
    defaultOpenAndroidNotificationSettings;

  try {
    switch (plan.method) {
      case "android_notification_settings": {
        const packageName = await resolveAndroidPackageName(options);
        if (packageName) {
          try {
            await openAndroidNotificationSettings(packageName);
            return { ok: true, method: "android_notification_settings" };
          } catch {
            // Prefer a usable Settings page over a hard failure — app details
            // still exposes the Notifications toggle on modern Android.
            await openSettings();
            return { ok: true, method: "linking_open_settings" };
          }
        }
        await openSettings();
        return { ok: true, method: "linking_open_settings" };
      }
      case "linking_open_settings": {
        await openSettings();
        return { ok: true, method: "linking_open_settings" };
      }
      default: {
        const _exhaustive: never = plan.method;
        return _exhaustive;
      }
    }
  } catch (cause) {
    return { ok: false, reason: "open_failed", cause };
  }
}
