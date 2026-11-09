#!/usr/bin/env python3
"""P4-T13 mutants. Usage: python3 -I mutants.py <app dir> [--check] [mutant ids...]

<app dir> is a checkout's apps/app (the implementer's: WT/apps/app), holding the task's final
files. For each mutant: record the file's SHA-256, apply its exact replacements (each must match
once), run its focused Node test file, restore the file and check the SHA-256 again. A mutant is
killed when the focused run fails; the line names the cases that failed. `--check` only checks
that every pattern matches once and changes nothing. Logs go next to this script, under
mutant-logs/ (or MUTANT_LOGS when set). Exit 0 only when every mutant is killed (or, with
--check, applies).
"""
import hashlib
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOGS = os.environ.get('MUTANT_LOGS', os.path.join(HERE, 'mutant-logs'))

LIB = 'src/slips/photoLibrary.ts'
SHRINK = 'src/slips/imageShrink.ts'
BATCH = 'src/slips/slipBatches.ts'
FAKE = 'src/slips/testing/fakePhotos.ts'

UNIT = ['node', 'scripts/test-unit.mjs']
LIB_T = UNIT + ['src/slips/photoLibrary.test.ts']
SHRINK_T = UNIT + ['src/slips/imageShrink.test.ts']
BATCH_T = UNIT + ['src/slips/slipBatches.test.ts']

RELEASE_TRY = (
    "      try {\n"
    "        const { File } = await loadFileSystem();\n"
    "        new File(asset.uri).delete();\n"
    "      } catch {\n"
    "        // Best effort: a copy already gone, or one the phone will not delete, stays in the cache the phone clears.\n"
    "      }\n"
)
SETTINGS_TRY = (
    "      try {\n"
    "        await (await loadLinking()).openSettings();\n"
    "      } catch {\n"
    "        // Best effort: where settings cannot open (the web), nothing happens.\n"
    "      }\n"
)
ALBUM_LINE = "  const label = [...album.normalize('NFC').trim()].slice(0, ALBUM_MAX).join('').trim();\n"

# id: (why, file, [(old, new), ...], command)
MUTANTS = {
    # The plan's four (Task P4-T13, Step 5).
    'M1': ("plan: pick with base64", LIB,
           [("        quality: SLIP_LIMITS.jpegQuality,\n", "        quality: SLIP_LIMITS.jpegQuality,\n        base64: true,\n")], LIB_T),
    'M2': ("plan: six slips a batch", BATCH,
           [("batch.length === SLIP_LIMITS.batchSlips ||", "batch.length === SLIP_LIMITS.batchSlips + 1 ||")], BATCH_T),
    'M3': ("plan: base64 length without the JSON (the batch builder)", BATCH,
           [("    const size = utf8Length(JSON.stringify(slipBatchItem(slip)));\n", "    const size = slip.image.base64.length;\n")], BATCH_T),
    'M3b': ("plan: base64 length without the JSON (the byte count)", BATCH,
            [("  return utf8Length(JSON.stringify(slipBatchRequest(slips, header)));\n", "  return slips.reduce((total, slip) => total + slip.image.base64.length, 0);\n")], BATCH_T),
    'M4': ("plan: ignore ties (the fake's order)", FAKE,
           [("a.createdMs - b.createdMs || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)", "a.createdMs - b.createdMs")], LIB_T),

    # The picker path (photoLibrary.ts).
    'L1': ("albums supported on the picker path", LIB, [("    albumsSupported: false,\n", "    albumsSupported: true,\n")], LIB_T),
    'L2': ("picked at full quality", LIB, [("quality: SLIP_LIMITS.jpegQuality,", "quality: 1,")], LIB_T),
    'L3': ("no compatible representation", LIB,
           [("        preferredAssetRepresentationMode: picker.UIImagePickerPreferredAssetRepresentationMode.Compatible,\n", "")], LIB_T),
    'L4': ("one photo at a time", LIB, [("allowsMultipleSelection: true,", "allowsMultipleSelection: false,")], LIB_T),
    'L5': ("no selection limit", LIB, [("selectionLimit: limit,", "selectionLimit: 0,")], LIB_T),
    'L6': ("videos too", LIB, [("mediaTypes: ['images'],", "mediaTypes: ['images', 'videos'],")], LIB_T),
    'L7': ("a picked copy found by its id", LIB,
           [("    asset: async () => null,\n", "    asset: async (id) => ({ id, uri: id, createdMs: 0, albumId: null }),\n")], LIB_T),
    'L8': ("an album listed on the picker path", LIB,
           [("    albums: async () => [],\n", "    albums: async () => [{ id: 'all', title: 'All', count: 0 }],\n")], LIB_T),
    'L8b': ("album photos listed on the picker path", LIB,
            [("    assetsSince: async () => [],\n", "    assetsSince: async (albumId) => [{ id: albumId, uri: albumId, createdMs: 0, albumId }],\n")], LIB_T),
    'L9': ("a picked photo always known by its uri", LIB, [("id: asset.assetId ?? asset.uri,", "id: asset.uri,")], LIB_T),
    'L10': ("a picked photo without an asset id has no id", LIB, [("id: asset.assetId ?? asset.uri,", "id: asset.assetId ?? '',")], LIB_T),
    'L11': ("a cancelled pick not checked", LIB, [("      if (result.canceled) return [];\n", "")], LIB_T),
    'L12': ("a pick not dated", LIB, [("const createdMs = Date.now();", "const createdMs = 0;")], LIB_T),
    'L13': ("a size always set, even when the picker gives none", LIB,
            [("...(typeof asset.fileSize === 'number' ? { bytes: asset.fileSize } : {}),", "bytes: asset.fileSize,")], LIB_T),
    'L14': ("release deletes an album photo", LIB, [("      if (asset.albumId !== null) return; // an album photo is the person's own\n", "")], LIB_T),
    'L15': ("release throws for a copy already gone", LIB,
            [(RELEASE_TRY, "      const { File } = await loadFileSystem();\n      new File(asset.uri).delete();\n")], LIB_T),
    'L16': ("release keeps the copy", LIB, [("        new File(asset.uri).delete();\n", "        void new File(asset.uri);\n")], LIB_T),
    'L17': ("limited access read as all", LIB,
            [("return answer.accessPrivileges === 'limited' ? 'limited' : 'all';", "return 'all';")], LIB_T),
    'L18': ("granted with no privileges (the web) read as limited", LIB,
            [("return answer.accessPrivileges === 'limited' ? 'limited' : 'all';", "return answer.accessPrivileges === 'all' ? 'all' : 'limited';")], LIB_T),
    'L19': ("undetermined read as none", LIB,
            [("return answer.status === 'undetermined' ? 'undetermined' : 'none';", "return 'none';")], LIB_T),
    'L20': ("denied read as undetermined", LIB,
            [("return answer.status === 'undetermined' ? 'undetermined' : 'none';", "return 'undetermined';")], LIB_T),
    'L21': ("request() only reads", LIB,
            [("request: async () => photoAccessOf(await (await loadPicker()).requestMediaLibraryPermissionsAsync()),",
              "request: async () => photoAccessOf(await (await loadPicker()).getMediaLibraryPermissionsAsync()),")], LIB_T),
    'L22': ("access() asks", LIB,
            [("access: async () => photoAccessOf(await (await loadPicker()).getMediaLibraryPermissionsAsync()),",
              "access: async () => photoAccessOf(await (await loadPicker()).requestMediaLibraryPermissionsAsync()),")], LIB_T),
    'L23': ("settings never open", LIB, [("        await (await loadLinking()).openSettings();\n", "        await loadLinking();\n")], LIB_T),
    'L24': ("settings failure not caught", LIB, [(SETTINGS_TRY, "      await (await loadLinking()).openSettings();\n")], LIB_T),

    # The shrink port (imageShrink.ts).
    'S1': ("the phone's size never checked", SHRINK, [("      if (file.size > SLIP_LIMITS.imageBytes) return null;\n", "")], SHRINK_T),
    'S2': ("a photo of exactly 1,200,000 bytes refused by its size", SHRINK,
           [("if (file.size > SLIP_LIMITS.imageBytes)", "if (file.size >= SLIP_LIMITS.imageBytes)")], SHRINK_T),
    'S3': ("the bytes read never checked", SHRINK, [("      if (bytes > SLIP_LIMITS.imageBytes) return null;\n", "")], SHRINK_T),
    'S4': ("exactly 1,200,000 bytes read refused", SHRINK,
           [("if (bytes > SLIP_LIMITS.imageBytes)", "if (bytes >= SLIP_LIMITS.imageBytes)")], SHRINK_T),
    'S5': ("any letters taken as base64", SHRINK,
           [("if (base64.length % 4 !== 0 || !BASE64.test(base64)) return null;", "if (base64.length % 4 !== 0) return null;")], SHRINK_T),
    'S6': ("any length taken as base64", SHRINK,
           [("if (base64.length % 4 !== 0 || !BASE64.test(base64)) return null;", "if (!BASE64.test(base64)) return null;")], SHRINK_T),
    'S7': ("padding ignored in the byte count", SHRINK,
           [("return (base64.length / 4) * 3 - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);", "return (base64.length / 4) * 3;")], SHRINK_T),
    'S8': ("padding counts swapped", SHRINK,
           [("base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0", "base64.endsWith('==') ? 1 : base64.endsWith('=') ? 2 : 0")], SHRINK_T),
    'S9': ("every image a JPEG", SHRINK,
           [("  if (head.startsWith('\\xff\\xd8\\xff')) return 'image/jpeg';\n", "  return 'image/jpeg';\n")], SHRINK_T),
    'S10': ("no PNG", SHRINK, [("  if (head.startsWith('\\x89PNG\\r\\n\\x1a\\n')) return 'image/png';\n", "")], SHRINK_T),
    'S11': ("any RIFF file a WebP", SHRINK,
            [("if (head.startsWith('RIFF') && head.slice(8, 12) === 'WEBP') return 'image/webp';", "if (head.startsWith('RIFF')) return 'image/webp';")], SHRINK_T),
    'S12': ("the first bytes read short", SHRINK, [("atob(base64.slice(0, 16))", "atob(base64.slice(0, 8))")], SHRINK_T),
    'S13': ("a sent image keeps the photo's uri", SHRINK,
            [("{ uri: null, base64, bytes, mediaType }", "{ uri: asset.uri, base64, bytes, mediaType }")], SHRINK_T),
    'S14': ("a copy that is gone read as one too large", SHRINK,
            [("      const base64 = await file.base64();\n", "      const base64 = await file.base64().catch(() => '');\n")], SHRINK_T),

    # Batches (slipBatches.ts).
    'B1': ("commas not counted in the cut", BATCH,
           [("bytes + 1 + size > SLIP_LIMITS.batchBytes", "bytes + size > SLIP_LIMITS.batchBytes")], BATCH_T),
    'B2': ("commas not counted in the sum", BATCH,
           [("    bytes += batch.length === 0 ? size : 1 + size; // a comma before every slip but the first\n", "    bytes += size;\n")], BATCH_T),
    'B3': ("measured with the batch's own last", BATCH,
           [("  const empty = slipBatchBytes([], { ...header, last: false });\n", "  const empty = slipBatchBytes([], header);\n")], BATCH_T),
    'B4': ("a batch of exactly 8 MiB cut", BATCH,
           [("bytes + 1 + size > SLIP_LIMITS.batchBytes", "bytes + 1 + size >= SLIP_LIMITS.batchBytes")], BATCH_T),
    'B5': ("a slip larger than a batch let through", BATCH,
           [("    if (empty + size > SLIP_LIMITS.batchBytes) throw new RangeError('A slip is larger than a batch.');\n", "")], BATCH_T),
    'B6': ("a slip that fills a batch alone refused", BATCH,
           [("if (empty + size > SLIP_LIMITS.batchBytes)", "if (empty + size >= SLIP_LIMITS.batchBytes)")], BATCH_T),
    'B7': ("UTF-16 length, not UTF-8", BATCH, [("  return new TextEncoder().encode(text).length;\n", "  return text.length;\n")], BATCH_T),
    'B8': ("the last batch dropped", BATCH, [("  if (batch.length > 0) batches.push(batch);\n", "")], BATCH_T),
    'B9': ("slips reversed within a batch", BATCH, [("    batch.push(slip);\n", "    batch.unshift(slip);\n")], BATCH_T),
    'B10': ("batches reversed", BATCH, [("  return batches;\n", "  return batches.reverse();\n")], BATCH_T),
    'B11': ("the album sent as given", BATCH, [("album: albumLabel(slip.album)", "album: slip.album")], BATCH_T),
    'B12': ("the album not NFC", BATCH,
            [(ALBUM_LINE, "  const label = [...album.trim()].slice(0, ALBUM_MAX).join('').trim();\n")], BATCH_T),
    'B13': ("the album not trimmed before the cut", BATCH,
            [(ALBUM_LINE, "  const label = [...album.normalize('NFC')].slice(0, ALBUM_MAX).join('').trim();\n")], BATCH_T),
    'B14': ("the album not trimmed after the cut", BATCH,
            [(ALBUM_LINE, "  const label = [...album.normalize('NFC').trim()].slice(0, ALBUM_MAX).join('');\n")], BATCH_T),
    'B15': ("the album not cut", BATCH,
            [(ALBUM_LINE, "  const label = album.normalize('NFC').trim();\n")], BATCH_T),
    'B16': ("the album cut in UTF-16 units", BATCH,
            [(ALBUM_LINE, "  const label = album.normalize('NFC').trim().slice(0, ALBUM_MAX).trim();\n")], BATCH_T),
    'B17': ("a blank album sent as empty text", BATCH, [("  return label === '' ? null : label;\n", "  return label;\n")], BATCH_T),

    # The fakes (testing/fakePhotos.ts).
    'F1': ("the watermark's id ignored on a tie", FAKE, [("(after.id === null || asset.id > after.id)", "true")], LIB_T),
    'F2': ("the watermark's own photo again", FAKE, [("asset.id > after.id)", "asset.id >= after.id)")], LIB_T),
    'F3': ("photos at the watermark's time always skipped", FAKE,
           [(".filter((asset) => asset.createdMs > after.ms || (asset.createdMs === after.ms && (after.id === null || asset.id > after.id)))",
             ".filter((asset) => asset.createdMs > after.ms)")], LIB_T),
    'F4': ("newest first", FAKE, [(".sort(byAge),", ".sort((a, b) => byAge(b, a)),")], LIB_T),
    'F5': ("the page limit ignored", FAKE, [("        .slice(0, limit)\n        .map((asset) => ({ ...asset }));\n", "        .map((asset) => ({ ...asset }));\n")], LIB_T),
    'F6': ("a photo found again by its uri", FAKE,
           [("album.assets.find((asset) => asset.id === id)", "album.assets.find((asset) => asset.id === id || asset.uri === id)")], LIB_T),
    'F7': ("a pick found by its id", FAKE,
           [("      return null;\n    },\n    async pick(limit) {", "      return (options.picked ?? []).find((asset) => asset.id === id) ?? null;\n    },\n    async pick(limit) {")], LIB_T),
    'F8': ("a listed photo not a copy", FAKE,
           [("        .map((asset) => ({ ...asset }));\n", "        .map((asset) => asset);\n")], LIB_T),
    'F9': ("a found photo not a copy", FAKE, [("if (found) return { ...found };", "if (found) return found;")], LIB_T),
    'F10': ("a picked photo not a copy", FAKE,
            [("return (options.picked ?? []).slice(0, limit).map((asset) => ({ ...asset }));", "return (options.picked ?? []).slice(0, limit);")], LIB_T),
    'F11': ("the pick limit ignored", FAKE,
            [("return (options.picked ?? []).slice(0, limit).map(", "return (options.picked ?? []).map(")], LIB_T),
    'F12': ("album photos without their album", FAKE, [("({ ...asset, albumId: album.id })", "({ ...asset, albumId: null })")], LIB_T),
    'F13': ("an album's count wrong", FAKE, [("count: assets.length", "count: 0")], LIB_T),
    'F14': ("the access option ignored", FAKE, [("  const access = options.access ?? 'all';\n", "  const access = 'all';\n")], LIB_T),
    'F15': ("albums unsupported by default", FAKE,
            [("albumsSupported: options.albumsSupported ?? true,", "albumsSupported: options.albumsSupported ?? false,")], LIB_T),
    'F16': ("a release not recorded", FAKE, [("      released.push(asset);\n", "")], LIB_T),
    'F17': ("calls not recorded", FAKE, [("    calls.push({ method, args });\n", "")], LIB_T),
    'F18': ("request() answers all", FAKE,
            [("      record('request');\n      return access;\n", "      record('request');\n      return 'all';\n")], LIB_T),
    'G1': ("the fake shrink's tooLarge ignored", FAKE,
           [("return options.tooLarge?.includes(asset.id) ? null : fakeShrunkImage(asset);", "return fakeShrunkImage(asset);")], SHRINK_T),
    'G2': ("the fake shrink's gone ignored", FAKE,
           [("      if (options.gone?.includes(asset.uri)) throw new Error('The photo is gone.');\n", "")], SHRINK_T),
    'G3': ("the fake shrink's removals not recorded", FAKE, [("      removed.push(image);\n", "")], SHRINK_T),
    'G4': ("one fake image for every photo", FAKE,
           [("const bytes = `\\xff\\xd8\\xff${encodeURIComponent(asset.uri)}`;", "const bytes = `\\xff\\xd8\\xff`;")], SHRINK_T),
    'G5': ("the fake image not a JPEG", FAKE,
           [("bytes: bytes.length, mediaType: 'image/jpeg' }", "bytes: bytes.length, mediaType: 'image/png' }")], SHRINK_T),
}


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def failing_cases(output):
    """The names of the cases that failed, from the spec reporter's summary."""
    names = []
    marker = output.find('✖ failing tests:')
    for line in output[marker:].splitlines() if marker >= 0 else []:
        found = re.match(r'^✖ (.+?) \(\d+(?:\.\d+)?ms\)$', line.strip())
        if found and found.group(1) not in names:
            names.append(found.group(1))
    return names


def main():
    args = sys.argv[1:]
    check = '--check' in args
    args = [arg for arg in args if arg != '--check']
    app = os.path.abspath(args[0])
    wanted = args[1:] or list(MUTANTS)
    os.makedirs(LOGS, exist_ok=True)
    results = []
    for mid in wanted:
        why, rel, pairs, command = MUTANTS[mid]
        path = os.path.join(app, rel)
        before = sha(path)
        with open(path, encoding='utf-8') as handle:
            original = handle.read()
        mutated = original
        problem = None
        for old, new in pairs:
            if mutated.count(old) != 1:
                problem = f'pattern matches {mutated.count(old)} times: {old[:60]!r}'
                break
            mutated = mutated.replace(old, new)
        if problem:
            results.append((mid, 'NOT APPLIED', problem))
            continue
        if check:
            results.append((mid, 'APPLIES', why))
            continue
        try:
            with open(path, 'w', encoding='utf-8') as handle:
                handle.write(mutated)
            run = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=600)
        finally:
            with open(path, 'w', encoding='utf-8') as handle:
                handle.write(original)
        restored = sha(path) == before
        output = run.stdout + run.stderr
        with open(os.path.join(LOGS, f'{mid}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        counts = ' '.join(line.strip() for line in output.splitlines() if re.match(r'^ℹ (tests|pass|fail) ', line.strip()))
        verdict = 'KILLED' if run.returncode != 0 else 'SURVIVED'
        failed = failing_cases(output)
        results.append((mid, verdict, f"{why}; {counts}; failed: {' / '.join(failed) or '-'}; restored={restored}"))
        print(f'{mid} {verdict}', file=sys.stderr, flush=True)
        if not restored:
            print(f'{mid}: checksum differs after restore', file=sys.stderr)
            sys.exit(2)
    for mid, verdict, detail in results:
        print(f'{mid} {verdict}: {detail}')
    ok = ('APPLIES',) if check else ('KILLED',)
    sys.exit(0 if all(verdict in ok for _, verdict, _ in results) else 1)


if __name__ == '__main__':
    main()
