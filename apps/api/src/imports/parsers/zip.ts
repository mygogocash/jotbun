// A strict, bounded ZIP reader for XLSX (runs in the parser child). It reads
// the central directory and inflates only the entries asked for, with Node's
// zlib and hard output limits - no third-party unzip code runs on uploads.
// Refused:
//   - zip_too_many_entries: more than 1,000 entries;
//   - zip_too_large: declared sizes adding up to more than 50 MiB, or more
//     than 50 MiB actually inflated (a decompression bomb);
//   - zip_unsupported: ZIP64, multiple disks, encryption, or a compression
//     method other than stored/deflate;
//   - zip_malformed: anything inconsistent - a missing or misplaced record, a
//     local header that disagrees with the directory, entries whose data
//     overlap, duplicate or path-like names, an entry that inflates to a
//     different size than declared, or a CRC-32 mismatch.
import { crc32, inflateRawSync } from 'node:zlib';

import { LIMITS, ParseRejection } from './protocol.ts';

export type ZipEntry = { name: string; method: number; compressedSize: number; size: number; crc: number; dataStart: number };

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const NAME = /^[A-Za-z0-9_\-.[\]]+(?:\/[A-Za-z0-9_\-.[\]]+)*\/?$/;

/**
 * Opening an archive checks its directory and then inflates every entry once
 * (sizes and CRC-32s must match; at most 50 MiB in all, since each entry is
 * capped at its declared size), so an inconsistent or hostile entry is
 * refused even if the workbook never refers to it.
 */
export class ZipArchive {
  readonly entries: ReadonlyMap<string, ZipEntry>;
  private readonly bytes: Buffer;

  constructor(bytes: Buffer) {
    this.bytes = bytes;
    this.entries = readDirectory(bytes);
    for (const entry of this.entries.values()) inflate(bytes, entry);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  names(): string[] {
    return [...this.entries.keys()];
  }

  /** The entry's bytes, or null when absent. */
  read(name: string): Buffer | null {
    const entry = this.entries.get(name);
    return entry ? inflate(this.bytes, entry) : null;
  }
}

function inflate(bytes: Buffer, entry: ZipEntry): Buffer {
  const data = bytes.subarray(entry.dataStart, entry.dataStart + entry.compressedSize);
  let output: Buffer;
  if (entry.method === 0) {
    output = Buffer.from(data);
  } else {
    try {
      // One byte more than declared: a stream that inflates further is caught, never buffered.
      output = inflateRawSync(data, { maxOutputLength: entry.size + 1 });
    } catch {
      throw new ParseRejection('zip_malformed');
    }
  }
  if (output.length !== entry.size || crc32(output) !== entry.crc) throw new ParseRejection('zip_malformed');
  return output;
}

function readDirectory(bytes: Buffer): Map<string, ZipEntry> {
  if (bytes.length < 22) throw new ParseRejection('zip_malformed');
  // The end record sits at the very end (no archive comment is accepted).
  const end = bytes.length - 22;
  if (bytes.readUInt32LE(end) !== EOCD) throw new ParseRejection('zip_malformed');
  const disk = bytes.readUInt16LE(end + 4);
  const directoryDisk = bytes.readUInt16LE(end + 6);
  const entriesHere = bytes.readUInt16LE(end + 8);
  const total = bytes.readUInt16LE(end + 10);
  const directorySize = bytes.readUInt32LE(end + 12);
  const directoryOffset = bytes.readUInt32LE(end + 16);
  if (total === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) throw new ParseRejection('zip_unsupported');
  if (disk !== 0 || directoryDisk !== 0 || entriesHere !== total) throw new ParseRejection('zip_unsupported');
  if (total > LIMITS.zipEntries) throw new ParseRejection('zip_too_many_entries');
  if (directoryOffset + directorySize !== end) throw new ParseRejection('zip_malformed');

  const entries = new Map<string, ZipEntry>();
  const lowerNames = new Set<string>();
  const ranges: [number, number][] = [];
  let declared = 0;
  let at = directoryOffset;
  for (let index = 0; index < total; index += 1) {
    if (at + 46 > end || bytes.readUInt32LE(at) !== CENTRAL) throw new ParseRejection('zip_malformed');
    const flags = bytes.readUInt16LE(at + 8);
    const method = bytes.readUInt16LE(at + 10);
    const crc = bytes.readUInt32LE(at + 16);
    const compressedSize = bytes.readUInt32LE(at + 20);
    const size = bytes.readUInt32LE(at + 24);
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const localOffset = bytes.readUInt32LE(at + 42);
    const next = at + 46 + nameLength + extraLength + commentLength;
    if (next > end) throw new ParseRejection('zip_malformed');
    if (flags & 0x0001 || flags & 0x0040) throw new ParseRejection('zip_unsupported');
    if (method !== 0 && method !== 8) throw new ParseRejection('zip_unsupported');
    if (compressedSize === 0xffffffff || size === 0xffffffff || localOffset === 0xffffffff) throw new ParseRejection('zip_unsupported');
    const nameBytes = bytes.subarray(at + 46, at + 46 + nameLength);
    let name: string;
    try {
      name = new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
    } catch {
      throw new ParseRejection('zip_malformed');
    }
    if (!NAME.test(name) || name.split('/').some((part) => part === '..' || part === '.')) throw new ParseRejection('zip_malformed');
    const lower = name.toLowerCase();
    if (lowerNames.has(lower)) throw new ParseRejection('zip_malformed');
    lowerNames.add(lower);
    declared += size;
    if (declared > LIMITS.zipExpandedBytes) throw new ParseRejection('zip_too_large');
    if (method === 0 && compressedSize !== size) throw new ParseRejection('zip_malformed');

    // The local header must agree with the directory, and its data must lie before the directory.
    if (localOffset + 30 > directoryOffset || bytes.readUInt32LE(localOffset) !== LOCAL) throw new ParseRejection('zip_malformed');
    const localNameLength = bytes.readUInt16LE(localOffset + 26);
    const localExtraLength = bytes.readUInt16LE(localOffset + 28);
    const localName = bytes.subarray(localOffset + 30, localOffset + 30 + localNameLength);
    if (bytes.readUInt16LE(localOffset + 8) !== method || !localName.equals(nameBytes)) throw new ParseRejection('zip_malformed');
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > directoryOffset) throw new ParseRejection('zip_malformed');
    ranges.push([localOffset, dataEnd]);
    entries.set(name, { name, method, compressedSize, size, crc, dataStart });
    at = next;
  }
  if (at !== end) throw new ParseRejection('zip_malformed');
  // Entries must not share or overlap their bytes (overlapping-entry bombs).
  ranges.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i += 1) {
    if (ranges[i][0] < ranges[i - 1][1]) throw new ParseRejection('zip_malformed');
  }
  return entries;
}
