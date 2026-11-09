// The import screen's device ports (R7): the system file picker
// (expo-document-picker), reading the picked file's bytes (expo-file-system,
// or the browser's File on the web), the v1 import port over the session's
// transport, and the open diary's import draft (decision 7: inside the
// encrypted diary; none on the web or while the diary is locked or opening).
// Each native module loads on first use, so a test or a build without them
// never loads them; the screen takes fakes through the same `ImportPorts` type.
//
// The import resources use their own v1 transport built exactly as
// sharedV1.ts builds the shared one (same base URL, client version and
// session credentials); the transport keeps no state of its own, so the two
// behave alike. sharedV1.ts does not export its transport or an import port;
// see the R7 report for the one-line export that would replace this.
import { IMPORT_CONTENT_TYPES, IMPORT_UPLOAD_MAX_BYTES, importFormatForExtension } from '@gogospend/contracts';

import { createImportResources } from '@mobile/spend/v1/imports';
import type { ImportResources } from '@mobile/spend/v1/imports';
import type { ImportPorts, PickedFile } from '@mobile/spend/v1/redesign/import/importModel';
import type { SpendDiary } from '@mobile/spend/v1/spendDiary';
import { newId } from '../../v1/parts';

/** What the picker offers: the import formats' content types (the server checks the bytes again). */
const PICKER_TYPES = [...Object.values(IMPORT_CONTENT_TYPES), 'text/comma-separated-values'];

async function importResources(): Promise<ImportResources> {
  const [{ createV1Transport }, { getMobileEnv }, { v1SessionCredentials }, { v1ClientVersion }] = await Promise.all([
    import('@mobile/api/client'),
    import('@mobile/config/env'),
    import('@mobile/auth/session'),
    import('@mobile/api/sharedV1'),
  ]);
  return createImportResources(createV1Transport({ baseUrl: getMobileEnv().v1ApiUrl, client: v1ClientVersion(), credentials: v1SessionCredentials }));
}

/** The import port, created on first use. */
function lazyResources(): ImportResources {
  let real: Promise<ImportResources> | null = null;
  const port = () => (real ??= importResources());
  return {
    upload: async (file, commandId) => (await port()).upload(file, commandId),
    status: async (jobId) => (await port()).status(jobId),
    preview: async (jobId, paging) => (await port()).preview(jobId, paging),
    patchRows: async (jobId, revision, rows, commandId) => (await port()).patchRows(jobId, revision, rows, commandId),
    freeze: async (jobId, request, commandId) => (await port()).freeze(jobId, request, commandId),
    confirm: async (jobId, batch, commandId) => (await port()).confirm(jobId, batch, commandId),
    selectionProgress: async (jobId, selectionId) => (await port()).selectionProgress(jobId, selectionId),
  };
}

/** The picked file's content type: the one its extension names (what the server requires), else what the picker said. */
function contentTypeOf(name: string, picked: string | undefined): string {
  const dot = name.lastIndexOf('.');
  const format = dot > 0 ? importFormatForExtension(name.slice(dot + 1)) : null;
  return format ? IMPORT_CONTENT_TYPES[format] : (picked ?? 'application/octet-stream');
}

async function pickFile(): Promise<PickedFile> {
  try {
    const DocumentPicker = await import('expo-document-picker');
    const result = await DocumentPicker.getDocumentAsync({ type: PICKER_TYPES, copyToCacheDirectory: true, multiple: false });
    const asset = result.canceled ? null : result.assets?.[0];
    if (!asset) return { ok: false, reason: 'canceled' };
    if (asset.size != null && asset.size > IMPORT_UPLOAD_MAX_BYTES) return { ok: false, reason: 'too_large' };
    let buffer: ArrayBuffer;
    if (asset.file) {
      buffer = await asset.file.arrayBuffer();
    } else {
      const { File } = await import('expo-file-system');
      buffer = await new File(asset.uri).arrayBuffer();
    }
    const bytes = new Uint8Array(buffer);
    if (bytes.length > IMPORT_UPLOAD_MAX_BYTES) return { ok: false, reason: 'too_large' };
    return { ok: true, file: { name: asset.name, contentType: contentTypeOf(asset.name, asset.mimeType), bytes } };
  } catch {
    return { ok: false, reason: 'unavailable' };
  }
}

/** The ports the app's import screen uses; the draft is the open diary's, asked for each time the screen opens it. */
export function createDeviceImportPorts(diary: SpendDiary | null): ImportPorts {
  return { resources: lazyResources(), openDraftStore: async () => diary?.importDraftStore() ?? null, pickFile, newId };
}
