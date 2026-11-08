// The app group on a phone (P6A-T1), over expo-file-system 58.0.9's File,
// Directory and Paths, injected so Node tests pass a fake. iOS: the app
// group's container, absent until P6A-T7's entitlement (then nothing is
// available and nothing is written). Android: the app's documents folder
// (Android has no app groups; its share target and widget belong to the app
// itself). The web: no app group. A native failure is swallowed: a read
// answers null, a copy false, and a write or a remove resolves, keeping the
// last good file. A folder is never touched through a file name (isSafeName
// lets a folder's name through): in 58.0.9 a File whose path is a folder does
// not exist, but its delete() removes the folder and all in it, and iOS's copy
// with overwrite removes it first. So remove deletes only what File.exists
// reports, and copyIn answers false when Directory.exists holds the name.
// Pure: the file system is a type-only import.
import type { Directory, File } from 'expo-file-system';

import { isSafeName, noAppGroup } from './appGroup.ts';
import type { AppGroupPort } from './appGroup.ts';
import type { OutsideIds } from './outsideIds.ts';

export type FileSystemLike = Pick<typeof import('expo-file-system'), 'File' | 'Directory' | 'Paths'>;

/** The message never carries the name. */
function refuseUnsafe(name: string): void {
  if (!isSafeName(name)) throw new TypeError('Not an outside file name.');
}

function rootOf(ids: OutsideIds, platform: 'ios' | 'android' | 'web', fs: FileSystemLike): Directory | null {
  try {
    if (platform === 'ios') {
      const containers: Record<string, Directory | undefined> = fs.Paths.appleSharedContainers;
      return containers[ids.appGroup] ?? null;
    }
    if (platform === 'android') return fs.Paths.document;
    return null;
  } catch {
    return null;
  }
}

export function deviceAppGroup(ids: OutsideIds, platform: 'ios' | 'android' | 'web', fs: FileSystemLike): AppGroupPort {
  const found = rootOf(ids, platform, fs);
  if (!found) return noAppGroup;
  const root: Directory = found;
  const fileAt = (name: string): File => new fs.File(root, name);
  const makeFolderOf = (name: string): void => {
    const folder = new fs.Directory(root, name.slice(0, name.lastIndexOf('/')));
    if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  };
  return {
    available: true,
    readText: async (name) => {
      refuseUnsafe(name);
      try {
        const file = fileAt(name);
        return file.exists ? await file.text() : null;
      } catch {
        return null;
      }
    },
    writeText: async (name, text) => {
      refuseUnsafe(name);
      try {
        makeFolderOf(name);
        await fileAt(name).write(text);
      } catch {
        // Swallowed: the last good file stays.
      }
    },
    remove: async (name) => {
      refuseUnsafe(name);
      try {
        const file = fileAt(name);
        // exists is false for a folder, whose delete() would remove everything in it.
        if (file.exists) file.delete();
      } catch {
        // Swallowed: the file stays.
      }
    },
    list: async (folder) => {
      refuseUnsafe(folder);
      try {
        const directory = new fs.Directory(root, folder);
        if (!directory.exists) return [];
        return directory
          .list()
          .flatMap((entry) => (entry instanceof fs.File ? [entry.name] : []))
          .sort();
      } catch {
        return [];
      }
    },
    copyIn: async (fromUri, name) => {
      refuseUnsafe(name);
      try {
        // A folder at the name is never replaced: iOS's copy with overwrite would delete it first.
        if (new fs.Directory(root, name).exists) return false;
        makeFolderOf(name);
        await new fs.File(fromUri).copy(fileAt(name), { overwrite: true });
        return true;
      } catch {
        return false;
      }
    },
    uriOf: (name) => {
      refuseUnsafe(name);
      try {
        const file = fileAt(name);
        return file.exists ? file.uri : null;
      } catch {
        return null;
      }
    },
  };
}
