#!/usr/bin/env python3
"""P2-T29 mutation check. Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs its tests (WalletCategories.render.test.tsx),
restores the file byte for byte (sha256 checked) and prints one line per
mutant. Exits 0 only when every mutant ends as expected.
"""
import hashlib
import os
import subprocess
import sys

PACK_TRAY = 'apps/app/src/wallet/categories/ThaiPackTray.tsx'
CAT_TRAY = 'apps/app/src/wallet/categories/CategoryTray.tsx'
SCREEN = 'apps/app/src/wallet/categories/WalletCategoriesScreen.tsx'
ICON = 'apps/app/src/wallet/looks/WalletCategoryIcon.tsx'
SECTIONS = 'apps/app/src/dev/catalogue/wallet/categorySections.tsx'

RENDER = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', 'src/wallet/categories/WalletCategories.render.test.tsx']

M2_OLD = """      const ok = await commands.send(plan.commands, {
        success: isNew ? tc('Created.') : tc('Saved.'),
        draft,
        seen: budget,
      });

      if (ok) {
        // The icon is kept for the account only after Jotbun accepted the category
        if (pickedGlyph) {
          try {
            await setIcon(generatedId, pickedGlyph);
          } catch {
            // Keep no failure outside account
          }
        }
        onClose();
      }"""

M2_NEW = """      if (pickedGlyph) {
        try {
          await setIcon(generatedId, pickedGlyph);
        } catch {
          // Keep no failure outside account
        }
      }
      const ok = await commands.send(plan.commands, {
        success: isNew ? tc('Created.') : tc('Saved.'),
        draft,
        seen: budget,
      });

      if (ok) {
        onClose();
      }"""

MUTANTS = [
    # Guard 1: Pack tray creates every missing item instead of only picked items
    ('M1', 'killed', 'pack tray creates every missing item, not only picked ones', PACK_TRAY, RENDER,
     [('const cmds = packCommands(categories, locale, newId, { only: keysToAdd });',
       'const cmds = packCommands(categories, locale, newId);')]),

    # Guard 2: Icon kept before Jotbun acknowledges save
    ('M2', 'killed', 'icon kept for account before Jotbun accepted category', CAT_TRAY, RENDER,
     [(M2_OLD, M2_NEW)]),

    # Guard 3: Over-budget check removed (allows saving when over budget)
    ('M3', 'killed', 'over-budget refusal removed: save enabled on limit over budget', CAT_TRAY, RENDER,
     [('const canSave = !saving && (isBuiltin || nameCheck.ok) && limitCheck.ok;',
       'const canSave = !saving && (isBuiltin || nameCheck.ok);')]),

    # Guard 4: Private mode masking removed
    ('M4', 'killed', 'private mode masking removed (amounts shown in tiles)', SCREEN, RENDER,
     [('  if (hidden) {',
       '  if (false && hidden) {')]),

    # Guard 5 (RV1): CategoryGlyph unfilled circles filled
    ('M5', 'killed', 'RV1: CategoryGlyph unfilled circles filled', ICON, RENDER,
     [('fill: \'none\', stroke: color',
       'fill: color, stroke: color')]),

    # Guard 6 (RV2): CategoryGlyph linecaps/linejoins square
    ('M6', 'killed', 'RV2: CategoryGlyph linecaps square', ICON, RENDER,
     [('strokeLinecap: \'round\', strokeLinejoin: \'round\'',
       'strokeLinecap: \'butt\', strokeLinejoin: \'miter\'')]),

    # Guard 7 (RV3): CategoryGlyph tile initial uses Latin leading
    ('M7', 'killed', 'RV3: CategoryGlyph tile initial uses Latin line height', ICON, RENDER,
     [('lineHeight: walletLineHeight(initial, \'thai\')',
       'lineHeight: walletLineHeight(initial, \'latin\')')]),

    # Guard 8 (RV4): CategoryGlyph standalone glyph decorative wrapper removed
    ('M8', 'killed', 'RV4: standalone glyph DECORATIVE wrapper removed', ICON, RENDER,
     [('<View {...DECORATIVE}>',
       '<View>')]),

    # Guard 9: Catalogue sections empty
    ('M9', 'killed', 'catalogue sections empty', SECTIONS, RENDER,
     [('export const WALLET_CATEGORY_SECTIONS: readonly CatalogueSection[] = [',
       'export const WALLET_CATEGORY_SECTIONS: readonly CatalogueSection[] = [];\nconst UNUSED = [')]),
]

def sha256_of(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        h.update(f.read())
    return h.hexdigest()

def main():
    if len(sys.argv) < 3:
        print("usage: mutants.py <worktree root> <log dir> [ids...]", file=sys.stderr)
        sys.exit(2)
    wt = sys.argv[1]
    log_dir = sys.argv[2]
    filter_ids = set(sys.argv[3:]) if len(sys.argv) > 3 else None
    os.makedirs(log_dir, exist_ok=True)

    failed = 0
    for mid, exp, desc, rel_file, cmd, replacements in MUTANTS:
        if filter_ids and mid not in filter_ids:
            continue
        full_path = os.path.join(wt, rel_file)
        orig_sha = sha256_of(full_path)
        with open(full_path, 'r', encoding='utf-8') as f:
            content = f.read()

        mutated = content
        for old, new in replacements:
            if old not in mutated:
                print(f"{mid}: FAIL (replacement pattern not found in {rel_file})", file=sys.stderr)
                failed += 1
                break
            mutated = mutated.replace(old, new, 1)
        else:
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(mutated)

            log_file = os.path.join(log_dir, f"{mid}.log")
            app_dir = os.path.join(wt, 'apps/app')
            with open(log_file, 'w', encoding='utf-8') as out:
                proc = subprocess.run(cmd, cwd=app_dir, stdout=out, stderr=subprocess.STDOUT)

            # restore original
            with open(full_path, 'w', encoding='utf-8') as f:
                f.write(content)
            restored_sha = sha256_of(full_path)
            assert orig_sha == restored_sha, f"Restore failed for {rel_file}"

            outcome = 'killed' if proc.returncode != 0 else 'survived'
            ok = outcome == exp
            status = 'OK' if ok else 'FAIL'
            print(f"{mid}: {outcome} ({exp}) [{status}] {desc}")
            if not ok:
                failed += 1

    if failed:
        sys.exit(1)

if __name__ == '__main__':
    main()
