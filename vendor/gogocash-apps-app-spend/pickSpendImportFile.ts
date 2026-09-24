import {
  SPEND_CSV_MIME,
  SPEND_MAX_UPLOAD_BYTES,
  SPEND_SLIP_MIME,
  SPEND_XLSX_MIME,
} from "@gogocash/contracts";

const PICKER_TYPES = [
  ...SPEND_CSV_MIME,
  ...SPEND_XLSX_MIME,
  ...SPEND_SLIP_MIME,
] as const;

export type SpendPickedFile =
  | { ok: true; blob: Blob; filename: string }
  | {
      ok: false;
      reason: "canceled" | "too_large" | "unavailable" | "denied";
    };

export async function pickSpendImportFile(): Promise<SpendPickedFile> {
  return pick([...PICKER_TYPES], "import.csv");
}

/**
 * The add panel's file browser. Same picker, narrowed to images so a member
 * reaching for a slip is not offered their spreadsheet exports.
 *
 * This is the FILES path, and on iOS that means the Files app — a slip that
 * lives in the camera roll is not in there at all, which is why the two
 * functions below exist (owner call 2026-09-11).
 */
export async function pickSpendSlipPhoto(): Promise<SpendPickedFile> {
  return pick([...SPEND_SLIP_MIME], "slip.jpg");
}

/**
 * The camera roll.
 *
 * `expo-image-picker` is loaded on demand, and a build without it falls back
 * to the file browser rather than dead-ending: this module ships over the air,
 * the native module does not, so an older binary running new JS would
 * otherwise hand the member a button that can never work.
 */
export async function pickSpendSlipFromPhotos(): Promise<SpendPickedFile> {
  return fromImagePicker("library");
}

/** The camera itself. Same on-demand load, same fallback, same reasons. */
export async function takeSpendSlipPhoto(): Promise<SpendPickedFile> {
  return fromImagePicker("camera");
}

async function fromImagePicker(
  source: "library" | "camera",
): Promise<SpendPickedFile> {
  let ImagePicker: typeof import("expo-image-picker");
  try {
    ImagePicker = await import("expo-image-picker");
  } catch {
    // No native module in this build — the file browser still reads slips.
    return pick([...SPEND_SLIP_MIME], "slip.jpg");
  }
  try {
    const permission =
      source === "camera"
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return { ok: false, reason: "denied" };

    const options = {
      allowsMultipleSelection: false,
      // A slip is read by the API, not shown back — full quality, no crop UI.
      mediaTypes: ["images"] as import("expo-image-picker").MediaType[],
      quality: 1,
    };
    const result =
      source === "camera"
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.[0]) {
      return { ok: false, reason: "canceled" };
    }
    const asset = result.assets[0];
    if (asset.fileSize != null && asset.fileSize > SPEND_MAX_UPLOAD_BYTES) {
      return { ok: false, reason: "too_large" };
    }
    const blob = asset.file ?? (await (await fetch(asset.uri)).blob());
    if (blob.size > SPEND_MAX_UPLOAD_BYTES) {
      return { ok: false, reason: "too_large" };
    }
    return {
      ok: true,
      blob,
      filename: asset.fileName || "slip.jpg",
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

async function pick(
  types: string[],
  fallbackName: string,
): Promise<SpendPickedFile> {
  try {
    const DocumentPicker = await import("expo-document-picker");
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: types,
    });
    if (result.canceled || !result.assets?.[0]) {
      return { ok: false, reason: "canceled" };
    }
    const asset = result.assets[0];
    if (asset.size != null && asset.size > SPEND_MAX_UPLOAD_BYTES) {
      return { ok: false, reason: "too_large" };
    }
    const blob = asset.file
      ? asset.file
      : await (await fetch(asset.uri)).blob();
    if (blob.size > SPEND_MAX_UPLOAD_BYTES) {
      return { ok: false, reason: "too_large" };
    }
    return { ok: true, blob, filename: asset.name || fallbackName };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}
