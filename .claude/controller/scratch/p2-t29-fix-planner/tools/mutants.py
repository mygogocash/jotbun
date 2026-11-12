#!/usr/bin/env python3
"""P2-T29 fix round mutation check. Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs its tests, restores the file byte
for byte (sha256 checked) and prints one line per mutant. The tests are:
- RENDER: WalletCategories.render.test.tsx (the wallet screen, both trays, the
  catalogue sections and the copy);
- HOOK: the moved commands' own cases, today's CategoriesScreen suite and the
  wallet suite, since the hook serves both screens;
- ROUTES: PlanningRoutes.render.test.tsx;
- KIT: two of the eight render files that read the wallet catalogue's list
  without standing in for expo-crypto (B2: the screen must load lazily);
- HERMES: the repo's Hermes guard (B1: no Web Crypto global in app code).
Exits 0 only when every mutant is killed and every file is restored.
"""
import hashlib
import os
import re
import subprocess
import sys

SCREEN = 'apps/app/src/wallet/categories/WalletCategoriesScreen.tsx'
TRAY = 'apps/app/src/wallet/categories/CategoryTray.tsx'
PACK = 'apps/app/src/wallet/categories/ThaiPackTray.tsx'
COPY = 'apps/app/src/wallet/categories/copy.ts'
COMMANDS = 'apps/app/src/screens/redesign/planning/categoryCommands.ts'
OLD = 'apps/app/src/screens/redesign/planning/CategoriesScreen.tsx'
ROUTE = 'apps/app/app/spend/categories.tsx'
SECTIONS = 'apps/app/src/dev/catalogue/wallet/categorySections.tsx'
INDEX = 'apps/app/src/dev/catalogue/wallet/index.ts'

VITEST = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose']
RENDER = VITEST + ['src/wallet/categories/WalletCategories.render.test.tsx']
HOOK = VITEST + ['src/screens/redesign/planning/categoryCommands.render.test.tsx', 'src/screens/redesign/planning/CategoriesScreen.render.test.tsx',
                 'src/wallet/categories/WalletCategories.render.test.tsx']
ROUTES = VITEST + ['src/screens/redesign/planning/PlanningRoutes.render.test.tsx']
KIT = VITEST + ['src/wallet/tray/Tray.render.test.tsx', 'src/wallet/testing/walletHarness.render.test.tsx']
HERMES = ['npm', 'run', 'test:unit', '--', 'src/testing/hermesGlobals.test.ts']
NODE = (HERMES,)

OPEN_TRAY = "    if (visible && commands.status !== 'unconfirmed') {\n      setSession(startSession("
OPEN_PACK = "    if (visible && commands.status !== 'unconfirmed') {\n      setPicked(new Set());"

# (id, description, file, tests, [(old, new), ...]); each old must occur exactly once. Every mutant is expected killed.
MUTANTS = [
    # The moved commands: every way a send stops is told (M1, W2)
    ('H1', 'a send that stops short never tells its host (M1)', COMMANDS, HOOK, [('          host.stopped();\n', '')]),
    ('H2', 'a later refusal never rebases the draft', COMMANDS, HOOK, [('          if (rebased) host.rebase(rebased);\n', '')]),
    ('H3', 'every command acknowledged, and the host never told', COMMANDS, HOOK, [('      host.saved(origin);\n', '')]),
    ('H4', 'a change made elsewhere is not told', COMMANDS, HOOK, [('      host.changedElsewhere();\n', '')]),
    ('H5', "a refusal of the draft's fields is not told", COMMANDS, HOOK,
     [('    host.fieldErrors({ label: fields.label, limit: fields.category_limits ?? fields.overall_limit_minor });\n', '')]),
    # Today's screen keeps its behaviour (M1)
    ('S1', 'the archive sheet stays open after a failed send (M1)', OLD, HOOK,
     [('    stopped: () => setConfirming(false),\n', '    stopped: () => undefined,\n')]),
    ('S2', 'the grid is not read again after a save', OLD, HOOK, [('      loaded.refresh();\n', '')]),
    ('S3', 'the type just saved is not shown', OLD, HOOK, [('      if (origin.draft) setType(origin.draft.type);\n', '')]),
    ('S4', 'a change made elsewhere keeps the stale form', OLD, HOOK,
     [('    changedElsewhere: () => {\n      setForm(null);\n      loaded.reload();\n    },\n', '    changedElsewhere: () => loaded.reload(),\n')]),
    ('S5', "a refusal of the fields is not shown beside them", OLD, HOOK,
     [('    fieldErrors: (errors) => setForm((current) => (current ? { ...current, errors } : current)),\n', '    fieldErrors: () => undefined,\n')]),
    ('S6', 'the open form never rebased', OLD, HOOK,
     [('    rebase: (rebased) => setForm((current) => (current ? { ...current, draft: rebased } : current)),\n', '    rebase: () => undefined,\n')]),
    # The wallet screen
    ('W1', "the categories read without ensureBuiltinCategories (M3)", SCREEN, RENDER,
     [('resources.ensureBuiltinCategories(), resources.budget(month)', 'resources.categories(), resources.budget(month)')]),
    ('W2', 'nothing read again after a tray closes (M2)', SCREEN, RENDER, [('    setOpen(null);\n    loaded.refresh();\n', '    setOpen(null);\n')]),
    ('W3', 'spending equal to its limit counts as over (R4)', SCREEN, RENDER, [('BigInt(spentMinor) > BigInt(limitMinor)', 'BigInt(spentMinor) >= BigInt(limitMinor)')]),
    ('W4', 'the over line on the tint, not on a card chip (M4)', SCREEN, RENDER,
     [("paddingHorizontal: 6, borderRadius: 8, backgroundColor: colors.card }}", 'paddingHorizontal: 6, borderRadius: 8 }}')]),
    ('W5', "the tile's light tint in dark mode (M4)", SCREEN, RENDER,
     [('colors.raised : tileTint(category.color, colors.isDark),', 'colors.raised : tileTint(category.color, false),')]),
    ('W6', "the limit line in quiet, 4.04:1 on a tint (M4)", SCREEN, RENDER,
     [('<WalletText testID={`category-limit-${category.id}`} role="caption" tone="quietOnGround">', '<WalletText testID={`category-limit-${category.id}`} role="caption" tone="quiet">')]),
    ('W7', 'private mode: a tile speaks its amounts', SCREEN, RENDER, [('  const label = hidden\n', '  const label = false\n')]),
    ('W8', "private mode: the limit and over lines show amounts", SCREEN, RENDER,
     [('const shown = (minor: Minor) => (hidden ? HIDDEN_AMOUNT : walletMoneyText(minor));', 'const shown = (minor: Minor) => walletMoneyText(minor);')]),
    ('W9', 'an income tile draws a limit line (m11)', SCREEN, RENDER, [('{income ? null : overMinor !== null ? (', '{overMinor !== null ? (')]),
    ('W10', 'the pack card names one missing item, not three (R1)', SCREEN, RENDER, [('const first = missing.slice(0, 3);', 'const first = missing.slice(0, 1);')]),
    ('W11', 'the pack card says และอีก 0 หมวด', SCREEN, RENDER,
     [("const line = more > 0 ? `${names} ${t('categories.packMore', { n: more })}` : names;", "const line = `${names} ${t('categories.packMore', { n: more })}`;")]),
    ('W12', 'the pack card with nothing missing', SCREEN, RENDER, [('{missing.length > 0 ? <PackCard', '{true ? <PackCard')]),
    ('W13', "the Thai names joined with commas (m7)", SCREEN, RENDER, [(".join(locale === 'th' ? ' ' : ', ')", ".join(', ')")]),
    ('W14', 'Try again for a problem a retry cannot fix', SCREEN, RENDER,
     [("{problem.retry ? <TextLink label={t('common.tryAgain')} onPress={onRetry} /> : null}", "<TextLink label={t('common.tryAgain')} onPress={onRetry} />")]),
    ('W15', 'Back with nothing to go back to goes Home, not to Budget (M7)', SCREEN, RENDER, [("useGoBack('/spend/budget')", "useGoBack('/spend')")]),
    ('W16', 'three tiles to a row at AX5 (m5)', SCREEN, RENDER, [('const perRow = large ? 1 : 3;', 'const perRow = 3;')]),
    ('W17', 'a fixed tile height (m5)', SCREEN, RENDER, [('        minHeight: TILE,\n        paddingVertical: 11,\n', '        height: TILE,\n        paddingVertical: 11,\n')]),
    ('W18', 'new offered before the read (M3)', SCREEN, RENDER,
     [("{data === null ? null : (\n            <IconButton label={t('categories.new')}", "{false ? null : (\n            <IconButton label={t('categories.new')}")]),
    ('W19', 'the archived categories never shown (m6)', SCREEN, RENDER, [('{groups.archived.length > 0 ? <ArchivedCategories', '{false ? <ArchivedCategories')]),
    ('W20', 'Unarchive sends an archive (m6)', SCREEN, RENDER, [("archiveCommand(item.category, 'unarchive')", "archiveCommand(item.category, 'archive')")]),
    ('W21', 'an unarchived category is not read again (m6)', SCREEN, RENDER, [('    saved: () => onChanged(),\n', '    saved: () => undefined,\n')]),
    ('W22', 'the income segment shows spending', SCREEN, RENDER, [('onPress={() => onType(each)}', "onPress={() => onType('expense')}")]),
    ('W23', 'the pack tray never told what the person has (R3)', SCREEN, RENDER, [("onClose={closeTray} categories={data.categories} />", 'onClose={closeTray} categories={[]} />')]),
    ('W24', "the tray never given the month's budget", SCREEN, RENDER, [('            budget={data.budget}\n', '            budget={null}\n')]),
    ('W25', 'loading never said (M3)', SCREEN, RENDER, [('{loaded.state === \'loading\' ? <WalletText testID="categories-loading"', '{false ? <WalletText testID="categories-loading"')]),
    ('W26', 'a failed read never said (M3)', SCREEN, RENDER, [("{loaded.state === 'error' ? <LoadProblem", '{false ? <LoadProblem')]),
    ('W27', 'Unarchive offered while blocked', SCREEN, RENDER,
     [("const held = commands.status !== 'idle' || commands.blocked;", "const held = commands.status !== 'idle';")]),
    ('W28', 'several unarchives at once', SCREEN, RENDER, [("const held = commands.status !== 'idle' || commands.blocked;", 'const held = commands.blocked;')]),
    ('W29', 'no Try again for an unconfirmed unarchive (B4)', SCREEN, RENDER,
     [("{commands.status === 'unconfirmed' && !commands.resendBlocked ? <TextLink label={t('common.tryAgain')} onPress={commands.tryAgain} /> : null}", 'null')]),
    ('W30', 'an unarchive changed elsewhere offers no Reload', SCREEN, RENDER,
     [("          {commands.conflict ? (\n            <TextLink\n              label={tc('Reload')}", "          {false ? (\n            <TextLink\n              label={tc('Reload')}")]),
    ('W31', 'a tile with no colour on the card, not raised', SCREEN, RENDER,
     [('category.color === null ? colors.raised : tileTint(category.color', 'category.color === null ? colors.card : tileTint(category.color')]),
    ('W32', 'a short last row stretches its tiles', SCREEN, RENDER,
     [("{Array.from({ length: perRow - row.length }, (_, gap) => <View key={`gap-${gap}`} style={{ flex: 1 }} />)}", '{null}')]),
    ('W33', "the screen's segments never stack at AX5 (m5)", SCREEN, RENDER,
     [("flexDirection: large ? 'column' : 'row', gap: 2, padding: 4, borderRadius: 14, backgroundColor: colors.track", "flexDirection: 'row', gap: 2, padding: 4, borderRadius: 14, backgroundColor: colors.track")]),
    # The category tray
    ('T1', 'a new id from the Web Crypto global, which Hermes lacks (B1)', TRAY, HERMES,
     [('newCategoryDraft({ id: newId(), type, color: TRAY_SWATCHES[0] })', 'newCategoryDraft({ id: globalThis.crypto.randomUUID(), type, color: TRAY_SWATCHES[0] })')]),
    ('T2', 'an unconfirmed draft dropped when the tray opens again (B4)', TRAY, RENDER, [(OPEN_TRAY, '    if (visible) {\n      setSession(startSession(')]),
    ('T3', 'Save offered while unconfirmed (B4)', TRAY, RENDER,
     [("      {commands.status === 'unconfirmed' ? (\n        <PrimaryButton testID=\"category-tray-retry\"", "      {false ? (\n        <PrimaryButton testID=\"category-tray-retry\"")]),
    ('T4', 'the name editable while unconfirmed (B4)', TRAY, RENDER,
     [("                editable={!frozen}\n                placeholder={builtin", "                editable\n                placeholder={builtin")]),
    ('T5', 'the tray not locked while it saves (M8)', TRAY, RENDER, [('      locked={saving}\n      testID="category-tray"', '      locked={false}\n      testID="category-tray"')]),
    ('T6', 'the icon kept before Jotbun accepts the category (the plan)', TRAY, RENDER,
     [("    void commands.send(plan.commands, { success: tc('Saved.'), draft, seen: budget });",
       "    keepIcon();\n    void commands.send(plan.commands, { success: tc('Saved.'), draft, seen: budget });")]),
    ('T7', 'an unchanged glyph kept as an icon (m10)', TRAY, RENDER, [('if (glyph !== null && glyph !== session.shownGlyph)', 'if (glyph !== null)')]),
    ('T8', 'the icon picker offered with no account (followup)', TRAY, RENDER, [('{accountId === null ? null : (', '{false ? null : (')]),
    ('T9', 'private mode: the stored limit shows in its field (M9)', TRAY, RENDER,
     [("const masked = hidden && !limitTyped && draft.limitText !== '';", 'const masked = false;')]),
    ('T10', 'private mode: the budget, the total and the refusal show amounts (M9)', TRAY, RENDER,
     [('const money = (minor: Minor) => (hidden ? HIDDEN_AMOUNT : walletMoneyText(minor));', 'const money = (minor: Minor) => walletMoneyText(minor);')]),
    ('T11', "the refusal in the total's words (m1)", TRAY, RENDER,
     [('tc(OVER_TOTAL, { total: money(fits.total), overall: money(fits.overall) })', "t('categories.limitsTotal', { total: money(fits.total), budget: money(fits.overall) })")]),
    ('T12', "Save's problems never said (M10)", TRAY, RENDER, [('      setSession((now) => ({ ...now, errors: problems() }));\n', '      setSession((now) => now);\n')]),
    ('T13', 'a name too long not said as it is typed (M10)', TRAY, RENDER,
     [("const labelError = errors.label ?? (!live.ok && live.problem !== 'empty' ? tc(LABEL_PROBLEM_TEXT[live.problem]) : null);", 'const labelError = errors.label ?? null;')]),
    ('T14', 'the type offered when editing (R5)', TRAY, RENDER, [("          {draft.mode === 'create' ? (\n            <TypeSegments", "          {true ? (\n            <TypeSegments")]),
    ('T15', "a built-in's placeholder is its key (M6)", TRAY, RENDER,
     [("placeholder={builtin ? draftName({ ...draft, label: '' }, tc) : undefined}", 'placeholder={builtin ? draft.builtinKey ?? undefined : undefined}')]),
    ('T16', 'the swatches named by their keys (M5)', TRAY, RENDER, [('accessibilityLabel={t(SWATCH_NAMES[index])}', 'accessibilityLabel={SWATCH_NAMES[index]}')]),
    ('T17', 'the glyphs named by their keys (m8)', TRAY, RENDER, [('accessibilityLabel={t(GLYPH_NAMES[each])}', 'accessibilityLabel={each}')]),
    ('T18', "the preview's light tint in dark mode (M4)", TRAY, RENDER,
     [('colors.raised : tileTint(draft.color, colors.isDark) }}', 'colors.raised : tileTint(draft.color, false) }}')]),
    ('T19', "the swatches' light tints in dark mode (M4)", TRAY, RENDER, [('backgroundColor: tileTint(swatch, colors.isDark) }}', 'backgroundColor: tileTint(swatch, false) }}')]),
    ('T20', 'no way back from the archive question (m6)', TRAY, RENDER,
     [("onBack={step === 'archive' && !frozen ? () => setSession((now) => ({ ...now, step: 'edit' })) : undefined}", 'onBack={undefined}')]),
    ('T21', 'archive sends an unarchive (m6)', TRAY, RENDER, [("void commands.send([archiveCommand(base, 'archive')]", "void commands.send([archiveCommand(base, 'unarchive')]")]),
    ('T22', "a new opening shows the last one's failure (m3)", TRAY, RENDER,
     [('      commands.setMessage(null);\n      commands.setConflict(null);\n    }\n  }\n\n  const { draft, glyph', '      commands.setConflict(null);\n    }\n  }\n\n  const { draft, glyph')]),
    ('T23', 'a draft changed elsewhere still offers Save', TRAY, RENDER, [('const stale = gone || commands.conflict !== null;', 'const stale = commands.conflict !== null;')]),
    ('T24', 'a version conflict still offers Save', TRAY, RENDER, [('const stale = gone || commands.conflict !== null;', 'const stale = gone;')]),
    ('T25', 'the limit switch off keeps the limit', TRAY, RENDER,
     [("onPress={() => edit({ limitText: limitOn ? '' : draft.limitText },", 'onPress={() => edit({ limitText: draft.limitText },')]),
    ('T26', 'the name field unnamed (B3)', TRAY, RENDER, [("                accessibilityLabel={t('categories.name')}\n", '')]),
    ('T27', 'the limit field unnamed (B3)', TRAY, RENDER, [("                        accessibilityLabel={t('categories.limitField')}\n", '')]),
    ('T28', "private mode: Save says planSave's refusal, with amounts (M9)", TRAY, RENDER,
     [('      setSession((now) => ({ ...now, errors: problems() }));\n', '      setSession((now) => ({ ...now, errors: plan.errors }));\n')]),
    ('T29', 'no word when the month has no budget', TRAY, RENDER,
     [("          ) : draft.type === 'expense' ? (\n            <WalletText testID=\"category-no-budget\"", "          ) : false ? (\n            <WalletText testID=\"category-no-budget\"")]),
    ('T30', 'the tray never rebased: an accepted category sent again', TRAY, RENDER,
     [('    rebase: (draft) => setSession((now) => ({ ...now, draft })),\n', '    rebase: () => undefined,\n')]),
    ('T31', "a refusal of the fields not said beside them", TRAY, RENDER,
     [('    fieldErrors: (errors) => setSession((now) => ({ ...now, errors })),\n', '    fieldErrors: () => undefined,\n')]),
    ('T32', 'a failed archive stays on its question (M1, as the sheet)', TRAY, RENDER,
     [("    stopped: () => setSession((now) => ({ ...now, step: 'edit' })),\n", '    stopped: () => undefined,\n')]),
    ('T33', 'the glyphs pickable while unconfirmed (B4)', TRAY, RENDER,
     [('<GlyphPicker glyph={glyph} disabled={frozen}', '<GlyphPicker glyph={glyph} disabled={false}')]),
    ('T34', 'the swatches pickable while unconfirmed (B4)', TRAY, RENDER, [('<SwatchPicker color={draft.color} disabled={frozen}', '<SwatchPicker color={draft.color} disabled={false}')]),
    ('T35', 'the type changeable while unconfirmed (B4)', TRAY, RENDER, [('<TypeSegments type={draft.type} disabled={frozen}', '<TypeSegments type={draft.type} disabled={false}')]),
    ('T37', "a conflict stays for the next opening (m3)", TRAY, RENDER,
     [('      commands.setConflict(null);\n    }\n  }\n\n  const { draft, glyph', '    }\n  }\n\n  const { draft, glyph')]),
    ('T38', 'Save not busy while it sends', TRAY, RENDER,
     [('          busy={saving}\n          busyLabel={tc(\'Saving…\')}\n          disabled={commands.blocked}\n          onPress={submit}',
       '          busy={false}\n          busyLabel={tc(\'Saving…\')}\n          disabled={commands.blocked}\n          onPress={submit}')]),
    ('T39', 'a budget with 100 limits refused in the wrong words', TRAY, RENDER,
     [("fits.problem === 'too_many' ? tc(LIMIT_PROBLEM_TEXT.too_many)", "fits.problem === 'too_many' ? tc(LIMIT_PROBLEM_TEXT.too_large)")]),
    ('T40', 'Save offered while blocked', TRAY, RENDER,
     [('          disabled={commands.blocked}\n          onPress={submit}', '          disabled={false}\n          onPress={submit}')]),
    ('T41', 'Archive offered while blocked', TRAY, RENDER,
     [("busyLabel={tc('Saving…')} disabled={commands.blocked} onPress={archive} />", "busyLabel={tc('Saving…')} disabled={false} onPress={archive} />")]),
    ('T42', "the tray's segments never stack at AX5 (m5)", TRAY, RENDER,
     [("flexDirection: large ? 'column' : 'row', gap: 2, padding: 4, borderRadius: 14, backgroundColor: colors.raised", "flexDirection: 'row', gap: 2, padding: 4, borderRadius: 14, backgroundColor: colors.raised")]),
    ('T43', 'a total with no limit typed', TRAY, RENDER,
     [('const total = showLimit && fits?.ok && read.ok && read.minor !== null ?', 'const total = showLimit && fits?.ok && read.ok ?')]),
    ('T44', 'a name problem stays as it is typed (M10)', TRAY, RENDER,
     [("errors: { label: 'label' in patch ? undefined : now.errors.label,", 'errors: { label: now.errors.label,')]),
    ('T45', 'a limit problem stays when the type changes', TRAY, RENDER,
     [("limit: 'limitText' in patch || 'type' in patch ? undefined : now.errors.limit", "limit: 'limitText' in patch ? undefined : now.errors.limit")]),
    ('T46', 'a new category titled as a name', TRAY, RENDER, [(": draft.base === null ? t('categories.new') : name;", ': name;')]),
    ('T47', 'Back while the archive sends', TRAY, RENDER, [("onBack={step === 'archive' && !frozen ?", "onBack={step === 'archive' ?")]),
    ('T48', 'the archive link on a stale draft', TRAY, RENDER, [('{draft.base !== null && !frozen && !stale ? (', '{draft.base !== null && !frozen ? (')]),
    ('T49', 'the archive link while a save is out', TRAY, RENDER, [('{draft.base !== null && !frozen && !stale ? (', '{draft.base !== null && !stale ? (')]),
    ('T50', "a new category's swatch not shown as chosen", TRAY, RENDER, [('const checked = swatch === color;', 'const checked = false;')]),
    ('T36', 'the limit switch usable while unconfirmed (B4)', TRAY, RENDER,
     [("                  label={t('categories.setLimit')}\n                  disabled={frozen}\n", "                  label={t('categories.setLimit')}\n                  disabled={false}\n")]),
    # The Thai pack tray
    ('P1', 'every missing item created, not only the picked (the plan)', PACK, RENDER,
     [('packCommands(categories, locale, newId, { only: chosen })', 'packCommands(categories, locale, newId)')]),
    ('P2', 'a row the person has can be picked (R3)', PACK, RENDER, [('const disabled = had || frozen || refused;', 'const disabled = frozen || refused;')]),
    ('P3', 'every item picked at first (n1)', PACK, RENDER,
     [('useState<ReadonlySet<PackKey>>(() => new Set())', 'useState<ReadonlySet<PackKey>>(() => new Set(THAI_EVERYDAY_PACK.map((item) => item.key)))')]),
    ('P4', 'an unconfirmed add dropped when the tray opens again (B4)', PACK, RENDER, [(OPEN_PACK, '    if (visible) {\n      setPicked(new Set());')]),
    ('P5', 'Add offered while unconfirmed (B4)', PACK, RENDER,
     [("      {commands.status === 'unconfirmed' ? (\n        <PrimaryButton testID=\"thai-pack-retry\"", "      {false ? (\n        <PrimaryButton testID=\"thai-pack-retry\"")]),
    ('P6', 'the pack tray not locked while it adds (M8)', PACK, RENDER, [("locked={commands.status === 'saving'} testID=\"thai-pack-tray\"", 'locked={false} testID="thai-pack-tray"')]),
    ('P7', 'a refused add offers Add again', PACK, RENDER, [('const refused = !frozen && (commands.message !== null || commands.conflict !== null);', 'const refused = false;')]),
    ('P8', 'the items named in Thai in every language', PACK, RENDER, [("const name = locale === 'th' ? item.th : item.en;", 'const name = item.th;')]),
    ('P9', 'one item said as เพิ่ม 1 หมวด in the plural line', PACK, RENDER, [("chosen.length === 1 ? t('categories.packAddOne') : ", '')]),
    ('P10', 'a row the person has is not marked มีแล้ว', PACK, RENDER, [('              {had ? (\n', '              {false ? (\n')]),
    ('P11', "a new opening shows the last add's failure (m3)", PACK, RENDER, [('      setPicked(new Set());\n      commands.setMessage(null);\n', '      setPicked(new Set());\n')]),
    ('P12', 'Add with nothing picked', PACK, RENDER, [('disabled={chosen.length === 0 || commands.blocked}', 'disabled={commands.blocked}')]),
    ('P13', "a conflict stays for the next opening (m3)", PACK, RENDER,
     [('      commands.setConflict(null);\n    }\n  }\n\n  const missing', '    }\n  }\n\n  const missing')]),
    ('P14', 'the rows pickable after a refusal', PACK, RENDER, [('const disabled = had || frozen || refused;', 'const disabled = had || frozen;')]),
    ('P15', 'Add offered while blocked', PACK, RENDER, [('disabled={chosen.length === 0 || commands.blocked}', 'disabled={chosen.length === 0}')]),
    ('P16', 'a picked item the person now has is still added', PACK, RENDER,
     [('.filter((item) => picked.has(item.key) && missing.has(item.key))', '.filter((item) => picked.has(item.key))')]),
    ('P17', 'Add not busy while it sends', PACK, RENDER, [("          busy={commands.status === 'saving'}\n", '          busy={false}\n')]),
    # The route (W1)
    ('R1', 'the wallet area shows the Bun diary screen', ROUTE, ROUTES,
     [('<SpendV1Provider resources={getSharedV1Resources()}><WalletCategoriesScreen /></SpendV1Provider>', '<SpendV1Provider resources={getSharedV1Resources()}><CategoriesScreen /></SpendV1Provider>')]),
    ('R2', 'the legacy build opens a redesign screen', ROUTE, ROUTES, [("  if (isLegacySpendEnabled()) return <Redirect href=\"/spend\" />;\n", '')]),
    ('R3', 'the wallet area needs the planning area', ROUTE, ROUTES, [("if (isRedesignEnabled('wallet'))", "if (isRedesignEnabled('wallet') && isRedesignEnabled('planning'))")]),
    # The catalogue (B2, M11, M12)
    ('C1', "the screen loaded with the wallet catalogue's list (B2)", SECTIONS, KIT,
     [("const WalletCategoriesScreen = lazy(() => import('@mobile/wallet/categories/WalletCategoriesScreen').then((module) => ({ default: module.WalletCategoriesScreen })));\n",
       "import { WalletCategoriesScreen } from '@mobile/wallet/categories/WalletCategoriesScreen';\nvoid lazy;\n")]),
    ('C2', "a section in Thai whatever the catalogue's language (M11)", SECTIONS, RENDER,
     [("import { lazy, Suspense } from 'react';\n", "import { lazy, Suspense } from 'react';\nimport { LanguageProvider } from '@mobile/i18n/LanguageProvider';\n"),
      ('    <WalletLooksProvider>\n      <Suspense fallback={null}>\n        <WalletCategoriesScreen now={CATALOGUE_NOW} />\n      </Suspense>\n    </WalletLooksProvider>\n',
       '    <LanguageProvider device="th"><WalletLooksProvider>\n      <Suspense fallback={null}>\n        <WalletCategoriesScreen now={CATALOGUE_NOW} />\n      </Suspense>\n    </WalletLooksProvider></LanguageProvider>\n')]),
    ('C3', "the board's month without its spending (M11: ฿0 everywhere)", SECTIONS, RENDER, [('    resources: withTotals(createFakeResources(', '    resources: (createFakeResources(')]),
    ('C4', 'the sections left out of the catalogue (M12)', INDEX, RENDER, [('  ...WALLET_CATEGORY_SECTIONS,\n', '')]),
    # The plan's copy
    ('Y1', "the plan's และอีก {n} หมวด changed", COPY, RENDER, [("'categories.packMore': { th: 'และอีก {n} หมวด'", "'categories.packMore': { th: 'อีก {n} หมวด'")]),
]

SUMMARY = re.compile(r'^\s*Tests\s+(.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+\S+\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
NODE_COUNT = re.compile(r'^ℹ (tests|pass|fail) (\d+)', re.M)
NODE_FAILED = re.compile(r'^✖ (.+?) \([\d.]+ms\)$', re.M)
ANSI = re.compile(r'\x1b\[[0-9;]*m')


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def main():
    root, logs = sys.argv[1], sys.argv[2]
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    wanted = set(sys.argv[3:])
    unexpected = 0
    killed = survived = 0
    for ident, description, rel, command, edits in MUTANTS:
        if wanted and ident not in wanted:
            continue
        path = os.path.join(root, rel)
        with open(path, 'rb') as handle:
            original = handle.read()
        before = hashlib.sha256(original).hexdigest()
        text = original.decode('utf-8')
        for old, new in edits:
            count = text.count(old)
            if count != 1:
                print(f'{ident} SETUP ERROR: {count} matches for {old!r} in {rel}', flush=True)
                sys.exit(2)
            text = text.replace(old, new)
        try:
            with open(path, 'wb') as handle:
                handle.write(text.encode('utf-8'))
            run = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=1200)
            output = ANSI.sub('', run.stdout + run.stderr)
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        if command in NODE:
            totals = dict(NODE_COUNT.findall(output))
            summary = f"{totals.get('fail', '?')} failed | {totals.get('pass', '?')} passed ({totals.get('tests', '?')})"
            failed = [name for name in NODE_FAILED.findall(output) if name != 'failing tests:']
        else:
            found = SUMMARY.findall(output)
            summary = found[-1] if found else 'no summary'
            failed = FAILED.findall(output)
        assertions = output.count('AssertionError')
        outcome = 'killed' if run.returncode != 0 else 'survived'
        if outcome == 'killed':
            killed += 1
        else:
            survived += 1
        mark = 'KILLED' if outcome == 'killed' else 'SURVIVED'
        first = f' -> {failed[0].strip()}' if failed else ''
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        print(f'{ident} {mark}: {description}{first} [{os.path.basename(rel)}; Tests {summary}; AssertionError x{assertions}; {restored}]', flush=True)
        if outcome != 'killed' or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()
