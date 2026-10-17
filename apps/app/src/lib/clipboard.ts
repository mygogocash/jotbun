// Cross-platform clipboard copy (web + native), single source of truth.
//
// Screens previously called navigator.clipboard.writeText directly, which is a
// no-op on native iOS/Android (navigator is undefined there). This wrapper uses
// the web Clipboard API when available and falls back to expo-clipboard on
// native (lazy-imported so the Node test environment never loads it).
//
// Returns true if the text was copied, false otherwise — callers can use the
// result to drive a "Copied!" affordance. Never throws.

type WebClipboardLike = {
  writeText: (text: string) => Promise<void> | void;
};

type WebClipboardReaderLike = {
  readText: () => Promise<string> | string;
};

export type ReadFromClipboardOptions = {
  /** Override the web clipboard (defaults to globalThis.navigator.clipboard). */
  webClipboard?: WebClipboardReaderLike;
  /** Override the native reader (defaults to a lazy expo-clipboard import). */
  nativeReader?: () => Promise<string | null>;
};

function resolveWebClipboardReader(): WebClipboardReaderLike | undefined {
  const nav = (globalThis as { navigator?: { clipboard?: WebClipboardReaderLike } })
    .navigator;
  if (nav?.clipboard && typeof nav.clipboard.readText === "function") {
    return nav.clipboard;
  }
  return undefined;
}

async function defaultNativeReader(): Promise<string | null> {
  const mod = (await import("expo-clipboard")) as {
    getStringAsync?: () => Promise<string>;
  };
  if (typeof mod.getStringAsync !== "function") {
    throw new Error("expo-clipboard getStringAsync is not available in this runtime.");
  }
  return await mod.getStringAsync();
}

function usableClipboardText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
}

/**
 * Read the clipboard. Tries the web Clipboard API first, then the native
 * reader. Resolves the trimmed text, or null when the clipboard is empty,
 * unreadable, or permission was denied. Never rejects.
 *
 * #1413 — the counterpart to `copyToClipboard`, which existed alone. GoGoLink's
 * "Paste and Go" had no way to read the clipboard, so it read whatever the
 * member had typed into the field instead. That is why the field had to stay
 * editable, and why the un-dismissable keyboard it raises could cover the sheet.
 *
 * Web `readText` rejects without a user gesture in Safari/Firefox and whenever
 * permission is denied, so a rejection falls through to the native reader
 * rather than surfacing — the caller gets null and can say something useful.
 */
export async function readFromClipboard(
  options: ReadFromClipboardOptions = {},
): Promise<string | null> {
  return (await readClipboardResult(options)).text;
}

/**
 * Why a clipboard read produced no text — `readFromClipboard` collapses all
 * three into `null`, and callers that show a message need to tell them apart.
 *
 * - `ok`          — text was read.
 * - `empty`       — the clipboard was readable and held nothing usable.
 * - `unavailable` — permission denied, no secure context, no clipboard API, or
 *                   the native module threw. The member did nothing wrong.
 *
 * Reported 2026-09-03: a member copied a link, pressed Paste and Go, and was
 * told "Paste a product or shop link first." On iOS a dismissed "Allow Paste"
 * alert returns an empty string from `UIPasteboard.general.string ?? ""`
 * (expo-clipboard ios/ClipboardModule.swift), which is indistinguishable from
 * an empty pasteboard once it reaches JS — so `unavailable` cannot be detected
 * on that path and is inferred from a thrown/absent reader only. Web denial
 * DOES reject, and that is the case this exists to name.
 */
export type ClipboardReadStatus = "ok" | "empty" | "unavailable";

export type ClipboardReadResult = {
  status: ClipboardReadStatus;
  text: string | null;
};

/**
 * Read the clipboard and report WHY there is no text. Never rejects.
 *
 * Ordering is unchanged from `readFromClipboard` and is load-bearing: web
 * Clipboard API first, then the lazy native reader. `clipboard-read.test.ts`
 * pins both the order and the "an empty web clipboard is an answer, not a
 * failure" short-circuit.
 */
export async function readClipboardResult(
  options: ReadFromClipboardOptions = {},
): Promise<ClipboardReadResult> {
  const webClipboard =
    "webClipboard" in options ? options.webClipboard : resolveWebClipboardReader();
  // Only a REJECTED read is evidence of denial. An absent web clipboard just
  // means we are on native, where the native reader is the real answer.
  let webDenied = false;

  if (webClipboard?.readText) {
    try {
      const text = usableClipboardText(await webClipboard.readText());
      if (text) {
        return { status: "ok", text };
      }
      // An empty web clipboard is an answer, not a failure — do not fall
      // through and read a stale native value on top of it.
      if (!("nativeReader" in options)) {
        return { status: "empty", text: null };
      }
    } catch {
      // Denied, insecure context, or unsupported. Fall through to the native
      // reader, but remember that this surface refused us.
      webDenied = true;
    }
  }

  const nativeReader = options.nativeReader ?? defaultNativeReader;

  try {
    const text = usableClipboardText(await nativeReader());
    if (text) {
      return { status: "ok", text };
    }
    // On web the native reader is expo-clipboard's web shim, which throws
    // rather than answering — so reaching here with a prior rejection means
    // the read was refused, not that the clipboard is empty.
    return { status: webDenied ? "unavailable" : "empty", text: null };
  } catch {
    return { status: "unavailable", text: null };
  }
}

export type CopyToClipboardOptions = {
  /** Override the web clipboard (defaults to globalThis.navigator.clipboard). */
  webClipboard?: WebClipboardLike;
  /** Override the native writer (defaults to a lazy expo-clipboard import). */
  nativeWriter?: (text: string) => Promise<void>;
};

function resolveWebClipboard(): WebClipboardLike | undefined {
  const nav = (globalThis as { navigator?: { clipboard?: WebClipboardLike } }).navigator;
  if (nav?.clipboard && typeof nav.clipboard.writeText === "function") {
    return nav.clipboard;
  }
  return undefined;
}

async function defaultNativeWriter(text: string): Promise<void> {
  const mod = (await import("expo-clipboard")) as {
    setStringAsync?: (value: string) => Promise<boolean>;
  };
  if (typeof mod.setStringAsync !== "function") {
    throw new Error("expo-clipboard setStringAsync is not available in this runtime.");
  }
  await mod.setStringAsync(text);
}

/**
 * Copy `text` to the clipboard. Tries the web Clipboard API first, then the
 * native writer. Resolves true on success, false if the text is empty or every
 * path fails. Never rejects.
 */
export async function copyToClipboard(
  text: string,
  options: CopyToClipboardOptions = {}
): Promise<boolean> {
  if (!text) {
    return false;
  }

  const webClipboard =
    "webClipboard" in options ? options.webClipboard : resolveWebClipboard();

  if (webClipboard?.writeText) {
    try {
      await webClipboard.writeText(text);
      return true;
    } catch {
      // fall through to the native writer
    }
  }

  const nativeWriter = options.nativeWriter ?? defaultNativeWriter;

  try {
    await nativeWriter(text);
    return true;
  } catch {
    return false;
  }
}
