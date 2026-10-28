// The phone's QR decoder port (P3-T1, capability P3:slip-qr, A13). The native adapter is
// P3-T12's own file, expoCameraQrDecoder.ts, so nothing here imports expo-camera. Until
// P3-T12 installs it, the app's decoder is noQrDecoder.
// Pure: relative imports only, no React, no native module.
import { parseSlipQr } from './slipQr.ts';
import type { SlipQr } from './slipQr.ts';

export type QrDecoder = { readonly available: boolean; decode(uri: string): Promise<readonly string[]> };

/** No decoder: it cannot read photos and finds nothing. */
export const noQrDecoder: QrDecoder = { available: false, decode: async () => [] };

/** A decoder for tests: each listed uri answers its payloads; any other uri finds nothing. */
export function fakeQrDecoder(byUri: Readonly<Record<string, readonly string[]>>): QrDecoder {
  return {
    available: true,
    decode: async (uri) => (Object.prototype.hasOwnProperty.call(byUri, uri) ? byUri[uri] : []),
  };
}

let appDecoder: QrDecoder = noQrDecoder;

/** Sets the app's decoder (P3-T12's adapter, or a fake in tests); null restores noQrDecoder. */
export function installQrDecoder(decoder: QrDecoder | null): void {
  appDecoder = decoder ?? noQrDecoder;
}

export function getAppQrDecoder(): QrDecoder {
  return appDecoder;
}

/** The first payload in the photo that is a Thai bank slip QR; a decoder that throws finds none. */
export async function slipQrIn(decoder: QrDecoder, uri: string): Promise<SlipQr | null> {
  try {
    for (const payload of await decoder.decode(uri)) {
      const slip = parseSlipQr(payload);
      if (slip !== null) return slip;
    }
  } catch {
    // A decoder that fails finds no slip.
  }
  return null;
}
