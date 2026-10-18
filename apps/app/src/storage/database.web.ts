// Web never keeps a real diary: there is no encrypted local store in the
// browser, and an unencrypted fallback is not allowed. The web app stays
// online-only (the v1 API); only synthetic previews may use memory.
import type { DiaryFiles } from './types.ts';

export class LocalDiaryUnavailable extends Error {
  constructor() {
    super('Saving on this device is not available on the web.');
    this.name = 'LocalDiaryUnavailable';
  }
}

export function deviceDiaryFiles(): DiaryFiles {
  const refuse = async (): Promise<never> => {
    throw new LocalDiaryUnavailable();
  };
  return {
    assertAvailable() {
      throw new LocalDiaryUnavailable();
    },
    exists: async () => false,
    open: refuse,
    delete: async () => undefined,
  };
}

/** For the native proof harness only; there is no diary file on the web. */
export function diaryHeaderIsPlainSqlite(_name: string): boolean {
  return false;
}
