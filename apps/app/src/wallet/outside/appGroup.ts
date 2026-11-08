// The app group store (P6A-T1): a few small files the app shares with its
// widgets and extensions, all under `outside/`. The port hides the file
// system: deviceAppGroup.ts is the phone's store, memoryAppGroup() the tests'.
// Every store refuses an unsafe name with a TypeError before touching
// anything. isSafeName (the plan's pattern) lets a folder's name through as a
// file name, so no store deletes or replaces a folder through a file call.
// Pure: no React, React Native or native module.

export type AppGroupPort = {
  readonly available: boolean;
  readText(name: string): Promise<string | null>;
  writeText(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
  /** The names of the files directly inside `folder`, in order; never folders. */
  list(folder: string): Promise<readonly string[]>;
  /** False when the source cannot be read, or when a folder holds the name (never replaced). */
  copyIn(fromUri: string, name: string): Promise<boolean>;
  /** The file's uri, or null when there is no such file or no app group. */
  uriOf(name: string): string | null;
};

export const OUTSIDE_FILES = { account: 'outside/account-v1.json', shares: 'outside/shares-v1.json', shareFolder: 'outside/shares' } as const;

const SAFE_NAME = /^outside(\/[a-z0-9][a-z0-9-]*)+(\.(json|jpg|png|webp))?$/;

export function isSafeName(name: string): boolean {
  return SAFE_NAME.test(name);
}

/** The message never carries the name. */
function refuseUnsafe(name: string): void {
  if (!isSafeName(name)) throw new TypeError('Not an outside file name.');
}

/** No app group (the web, and iOS before P6A-T7's entitlement): reads nothing, accepts writes, copies nothing. */
export const noAppGroup: AppGroupPort = Object.freeze({
  available: false,
  readText: async (name: string) => {
    refuseUnsafe(name);
    return null;
  },
  writeText: async (name: string) => {
    refuseUnsafe(name);
  },
  remove: async (name: string) => {
    refuseUnsafe(name);
  },
  list: async (folder: string) => {
    refuseUnsafe(folder);
    return [];
  },
  copyIn: async (_fromUri: string, name: string) => {
    refuseUnsafe(name);
    return false;
  },
  uriOf: (name: string) => {
    refuseUnsafe(name);
    return null;
  },
});

/** Tests: the files live in `files`. copyIn keeps the source uri as the file's text and, as the device store does, answers false over a folder's name; uriOf answers `memory:///<name>`. */
export function memoryAppGroup(): AppGroupPort & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    available: true,
    files,
    readText: async (name) => {
      refuseUnsafe(name);
      return files.get(name) ?? null;
    },
    writeText: async (name, text) => {
      refuseUnsafe(name);
      files.set(name, text);
    },
    remove: async (name) => {
      refuseUnsafe(name);
      files.delete(name);
    },
    list: async (folder) => {
      refuseUnsafe(folder);
      const prefix = `${folder}/`;
      return [...files.keys()]
        .filter((name) => name.startsWith(prefix) && !name.slice(prefix.length).includes('/'))
        .map((name) => name.slice(prefix.length))
        .sort();
    },
    copyIn: async (fromUri, name) => {
      refuseUnsafe(name);
      if ([...files.keys()].some((key) => key.startsWith(`${name}/`))) return false;
      files.set(name, fromUri);
      return true;
    },
    uriOf: (name) => {
      refuseUnsafe(name);
      return files.has(name) ? `memory:///${name}` : null;
    },
  };
}
