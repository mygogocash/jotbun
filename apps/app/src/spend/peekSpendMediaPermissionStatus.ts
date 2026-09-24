import {
  mapImagePickerPermissionToPeek,
  type PeekSpendMediaPermissionStatus,
} from "@mobile/spend/peekSpendMediaPermission";

/**
 * Read current camera or media-library permission without prompting (#2651).
 *
 * Returns `unavailable` when expo-image-picker is missing from the binary so
 * the Spend UI can fall through to the file browser instead of priming.
 */
export async function peekSpendMediaPermissionStatus(
  source: "library" | "camera",
): Promise<PeekSpendMediaPermissionStatus> {
  let ImagePicker: typeof import("expo-image-picker");
  try {
    ImagePicker = await import("expo-image-picker");
  } catch {
    return "unavailable";
  }
  try {
    const permission =
      source === "camera"
        ? await ImagePicker.getCameraPermissionsAsync()
        : await ImagePicker.getMediaLibraryPermissionsAsync();
    return mapImagePickerPermissionToPeek(permission.status);
  } catch {
    return "unavailable";
  }
}
