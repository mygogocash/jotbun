#!/usr/bin/env python3
"""P2-T11 mutation check. Usage: python3 -I mutants.py <worktree root> <log dir> [ids...]

Applies each mutant alone to the worktree, runs its tests (the two Node tests
for the pure modules and the drawings' move, the render files that hold each
component's rules for the rest), restores the file byte for byte (sha256
checked) and prints one line per mutant. Exits 0 only when every mutant ends
as expected: killed.
"""
import hashlib
import os
import re
import subprocess
import sys

LOOKS_TS = 'apps/app/src/wallet/looks/walletLooks.ts'
GLYPHS = 'apps/app/src/wallet/looks/categoryGlyphs.ts'
ICONS = 'apps/app/src/wallet/looks/categoryIcons.ts'
DRAWINGS = 'apps/app/src/ui/categoryDrawings.ts'
PROVIDER = 'apps/app/src/wallet/looks/WalletLooksProvider.tsx'
FACE = 'apps/app/src/wallet/looks/BunFace.tsx'
MATERIAL = 'apps/app/src/wallet/looks/MaterialFill.tsx'
TILE = 'apps/app/src/wallet/looks/WalletCategoryIcon.tsx'
CARD = 'apps/app/src/wallet/card/WalletCard.tsx'
KIT = 'apps/app/src/dev/catalogue/wallet/kitSections.tsx'
HARNESS = 'apps/app/src/wallet/testing/walletHarness.tsx'

NODE = ['npm', 'run', 'test:unit', '--', 'src/wallet/looks/walletLooks.test.ts', 'src/wallet/looks/categoryIcons.test.ts']


def render(*files):
    # One file after the other: lighter on a shared machine.
    return ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', '--reporter=verbose', '--no-file-parallelism', *files]


CARD_TEST = 'src/wallet/card/WalletCard.render.test.tsx'
LOOKS_TEST = 'src/wallet/looks/WalletLooks.render.test.tsx'
HARNESS_TEST = 'src/wallet/testing/walletHarness.render.test.tsx'
R_ALL = render(LOOKS_TEST, CARD_TEST, HARNESS_TEST)
R_LOOKS = render(LOOKS_TEST)
R_CARD = render(CARD_TEST)
R_HARNESS = render(HARNESS_TEST, CARD_TEST)

# Shared anchors.
DERIVED_KIND = '    kind: null,\n'
KIND_CHECK = 'if (kind !== null && !isOneOf(WALLET_KINDS, kind))'
MATERIAL_FACE = 'if (!isOneOf(WALLET_MATERIALS, material) || !isOneOf(BUN_FACES, face))'
ORDER_KEEP = "[...new Set(value.filter((id): id is string => typeof id === 'string'))]"
ICON_RULE = '  return kept[category.id] ?? (pack === null ? category.builtin_key : PACK_GLYPH[pack]);\n'
LOAD_READ = '      const read: Kept = { accountId, looks: parseLooks(looks?.raw ?? null), order: parseOrder(order?.raw ?? null), icons: parseIcons(icons?.raw ?? null) };\n'
LOAD_PUBLISH = '      setState((now) => (now.accountId === accountId ? read : now));\n'
CHANGE_PUBLISH = '      setState((now) => (now.accountId === accountId ? slot.put(now, value ?? change(slot.of(now))) : now));\n'
SPENDING = "(wallet.balanceMinor === '0' || wallet.balanceMinor.startsWith('-'))"
STACK_PENDING = '            {words.pendingLine === null ? null : <WalletText role="caption" style={{ color: paint.quietText }}>{words.pendingLine}</WalletText>}\n'
KIND_LINE = '{full && words.kindLine !== null ?'
WORTH = "minor === undefined || minor === null || minor === '0' ? null : minor"
SPINE_NAME = "        <WalletText role=\"body\" style={{ fontWeight: '700' }}>{wallet.name}</WalletText>\n"

# (id, description, file, tests, [(old, new), ...]); each old must occur exactly once when it is applied.
MUTANTS = [
    # walletLooks.ts: the Node tests
    ('LK1', 'the FNV offset basis is zero', LOOKS_TS, NODE, [('  let hash = 0x811c9dc5;\n', '  let hash = 0;\n')]),
    ('LK2', 'another FNV prime', LOOKS_TS, NODE, [('Math.imul(hash, 0x01000193)', 'Math.imul(hash, 0x01000191)')]),
    ('LK3', 'the face from the same bits as the material', LOOKS_TS, NODE, [('BUN_FACES[(hash >>> 8) % BUN_FACES.length]', 'BUN_FACES[hash % BUN_FACES.length]')]),
    ('LK4', "UTF-8 bytes instead of the id's UTF-16 code units", LOOKS_TS, NODE, [('  for (let index = 0; index < text.length; index += 1) {\n    hash ^= text.charCodeAt(index);\n', '  for (const byte of new TextEncoder().encode(text)) {\n    hash ^= byte;\n')]),
    ('LK5', 'a signed hash', LOOKS_TS, NODE, [('  return hash >>> 0;\n', '  return hash | 0;\n')]),
    ('LK6', 'a derived look has a kind', LOOKS_TS, NODE, [(DERIVED_KIND, "    kind: 'cash',\n")]),
    ('LK7', "a kept look's kind is not checked", LOOKS_TS, NODE, [(f'  {KIND_CHECK} return null;\n', '')]),
    ('LK8', 'a kept look with no kind reads as having none', LOOKS_TS, NODE, [(KIND_CHECK, 'if (kind != null && !isOneOf(WALLET_KINDS, kind))')]),
    ('LK9', "a kept look's material is not checked", LOOKS_TS, NODE, [(MATERIAL_FACE, 'if (!isOneOf(BUN_FACES, face))')]),
    ('LK10', "a kept look's face is not checked", LOOKS_TS, NODE, [(MATERIAL_FACE, 'if (!isOneOf(WALLET_MATERIALS, material))')]),
    ('LK11', 'a kept list reads as kept looks', LOOKS_TS, NODE, [("value !== null && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value) : []", "value !== null && typeof value === 'object' ? Object.entries(value) : []")]),
    ('LK12', 'kept text that is not JSON throws', LOOKS_TS, NODE, [('  try {\n    return JSON.parse(raw);\n  } catch {\n    return undefined;\n  }\n', '  return JSON.parse(raw);\n')]),
    ('LK13', 'the order keeps a repeated id', LOOKS_TS, NODE, [(ORDER_KEEP, "value.filter((id): id is string => typeof id === 'string')")]),
    ('LK14', 'the order keeps anything', LOOKS_TS, NODE, [(ORDER_KEEP, '[...new Set(value)]')]),
    # categoryGlyphs.ts
    ('GL1', "the picker's food draws the board's food, not the built-in", GLYPHS, NODE, [('const BOARD_GLYPHS: Readonly<Record<BoardGlyph, readonly DrawingShape[]>> = {\n', "const BOARD_GLYPHS: Readonly<Record<BoardGlyph, readonly DrawingShape[]>> = {\n  food: [{ d: 'M4 11h16a8 8 0 0 1-16 0Z M9 7c0-1 1-2 1-3M14 7c0-1 1-2 1-3' }],\n")]),
    ('GL2', "the car's dots are rings", GLYPHS, NODE, [('    { circle: [8, 14, 1.2], filled: true },\n    { circle: [16, 14, 1.2], filled: true },\n', '    { circle: [8, 14, 1.2] },\n    { circle: [16, 14, 1.2] },\n')]),
    ('GL3', "the phone's own corner dropped", GLYPHS, NODE, [('{ rect: [6.5, 2.5, 11, 19], rx: 2.5 }', '{ rect: [6.5, 2.5, 11, 19] }')]),
    ('GL4', 'heart and lotus swap places in the picker', GLYPHS, NODE, [("'receipt', 'heart', 'lotus', 'gift'", "'receipt', 'lotus', 'heart', 'gift'")]),
    ('GL5', 'any text names a glyph', GLYPHS, NODE, [("return typeof value === 'string' && (isBoardGlyph(value) || Object.hasOwn(CATEGORY_DRAWINGS, value));", "return typeof value === 'string';")]),
    ('GL6', "an object's inherited names count as glyphs", GLYPHS, NODE, [('=> Object.hasOwn(BOARD_GLYPHS, key);', '=> key in BOARD_GLYPHS;')]),
    ('GL7', 'built-in keys are no kept glyphs', GLYPHS, NODE, [('(isBoardGlyph(value) || Object.hasOwn(CATEGORY_DRAWINGS, value))', 'isBoardGlyph(value)')]),
    # categoryIcons.ts
    ('IC1', 'a kept icon ignored', ICONS, NODE, [(ICON_RULE, '  return pack === null ? category.builtin_key : PACK_GLYPH[pack];\n')]),
    ('IC2', "the pack's glyph beats a kept icon", ICONS, NODE, [(ICON_RULE, '  return pack === null ? (kept[category.id] ?? category.builtin_key) : PACK_GLYPH[pack];\n')]),
    ('IC3', 'the pack not recognised', ICONS, NODE, [(ICON_RULE, '  return kept[category.id] ?? category.builtin_key;\n')]),
    ('IC4', 'a built-in draws nothing', ICONS, NODE, [(ICON_RULE, '  return kept[category.id] ?? (pack === null ? null : PACK_GLYPH[pack]);\n')]),
    ('IC5', "merit's glyph is the heart", ICONS, NODE, [("  merit: 'lotus',\n", "  merit: 'heart',\n")]),
    ('IC6', 'damaged kept icons are kept', ICONS, NODE, [('Object.fromEntries(keptEntries(raw).filter((entry): entry is [string, GlyphKey] => isGlyphKey(entry[1])))', 'Object.fromEntries(keptEntries(raw))')]),
    # categoryDrawings.ts: the move
    ('MV1', 'a drawing changed in the move', DRAWINGS, NODE, [("  food: [{ d: 'M4 12h16a8 8 0 0 1-16 0z' }, { d: 'M13 9l3-6' }, { d: 'M16 9l4-5' }],\n", "  food: [{ d: 'M4 12h16a8 8 0 0 1-16 0z' }, { d: 'M13 9l3-6' }],\n")]),
    # WalletLooksProvider.tsx: the looks, card and harness render tests
    ('PR1', 'the store is never read', PROVIDER, R_ALL, [(LOAD_READ, '      const read: Kept = { accountId, looks: parseLooks(null), order: parseOrder(null), icons: parseIcons(null) };\n')]),
    ('PR2', 'setLook keeps nothing', PROVIDER, R_ALL, [('  const setLook = useCallback((walletId: string, look: WalletLook) => keep(LOOKS, (looks) => ({ ...looks, [walletId]: look })), [keep]);\n', '  const setLook = useCallback((_walletId: string, _look: WalletLook) => Promise.resolve(), []);\n')]),
    ('PR3', 'setOrder keeps nothing', PROVIDER, R_ALL, [('  const setOrder = useCallback((ids: readonly string[]) => keep(ORDER, () => [...new Set(ids)]), [keep]);\n', '  const setOrder = useCallback((_ids: readonly string[]) => Promise.resolve(), []);\n')]),
    ('PR4', 'setIcon keeps nothing', PROVIDER, R_ALL, [('  const setIcon = useCallback((categoryId: string, icon: GlyphKey) => keep(ICONS, (icons) => ({ ...icons, [categoryId]: icon })), [keep]);\n', '  const setIcon = useCallback((_categoryId: string, _icon: GlyphKey) => Promise.resolve(), []);\n')]),
    ('PR5', 'changes run at once, not one after another', PROVIDER, R_ALL, [('    const run = queue.current.then(step);\n', '    const run = step();\n')]),
    ('PR6', "the account's first read does not wait its turn", PROVIDER, R_ALL, [('    void enqueue(async () => {\n      const [looks, order, icons]', '    void (async () => {\n      const [looks, order, icons]'), (LOAD_PUBLISH + '    });\n', LOAD_PUBLISH + '    })();\n')]),
    ('PR7', 'nothing resets when the account changes', PROVIDER, R_ALL, [('    setState((now) => (now.accountId === accountId ? now : nothingKept(accountId)));\n', '')]),
    ('PR8', "the last account's looks show for a render after the switch", PROVIDER, R_ALL, [('  const kept = useMemo(() => (state.accountId === accountId ? state : nothingKept(accountId)), [state, accountId]);\n', '  const kept = state;\n')]),
    ('PR9', 'a late first read lands on the next account', PROVIDER, R_ALL, [(LOAD_PUBLISH, '      setState(read);\n')]),
    ('PR10', 'a late change shows under the next account', PROVIDER, R_ALL, [(CHANGE_PUBLISH, '      setState((now) => slot.put(now, value ?? change(slot.of(now))));\n')]),
    ('PR11', 'an unreadable name is written over', PROVIDER, R_ALL, [('      const value = stored === null ? null : change(slot.parse(stored.raw));\n', '      const value = change(slot.parse(stored?.raw ?? null));\n')]),
    ('PR12', 'a change to an unreadable name does not show', PROVIDER, R_ALL, [('slot.put(now, value ?? change(slot.of(now)))', 'slot.put(now, value ?? slot.of(now))')]),
    ('PR13', 'a write that fails is not caught', PROVIDER, R_ALL, [('      if (value !== null) await store.set(slot.name, JSON.stringify(value)).catch(() => undefined);\n', '      if (value !== null) await store.set(slot.name, JSON.stringify(value));\n')]),
    ('PR14', 'a read that fails is not caught', PROVIDER, R_ALL, [('store.get(name).then((raw) => ({ raw }), () => null)', 'store.get(name).then((raw) => ({ raw }))')]),
    ('PR15', 'setOrder keeps a repeated id', PROVIDER, R_ALL, [('keep(ORDER, () => [...new Set(ids)])', 'keep(ORDER, () => [...ids])')]),
    ('PR16', 'with no account open a change is kept anyway', PROVIDER, R_ALL, [('    if (accountId === null) return Promise.resolve();\n', '')]),
    ('PR17', 'lookOf ignores what was kept', PROVIDER, R_ALL, [('    lookOf: (walletId: string) => kept.looks[walletId] ?? derivedLook(walletId),\n', '    lookOf: (walletId: string) => derivedLook(walletId),\n')]),
    ('PR18', 'the kept order is not given', PROVIDER, R_ALL, [('    order: kept.order,\n', '    order: [],\n')]),
    ('PR19', 'iconOf ignores what was kept', PROVIDER, R_ALL, [('iconOf: (category) => iconFor(category, icons)', 'iconOf: (category) => iconFor(category, {})')]),
    ('PR20', 'icons kept under another name', PROVIDER, R_ALL, [("export const CATEGORY_ICONS_NAME = 'category-icons';", "export const CATEGORY_ICONS_NAME = 'category-icon';")]),
    # BunFace.tsx
    ('FA1', 'no ink outline', FACE, R_LOOKS, [('<Path d={BODY} fill={CREAM} stroke={INK} strokeWidth={3} />', '<Path d={BODY} fill={CREAM} />')]),
    ('FA2', 'smile and wink swapped', FACE, R_LOOKS, [("  wink: [LEFT_EYE, { stroke: 'M37 30h7', width: 3 }", "  smile: [LEFT_EYE, { stroke: 'M37 30h7', width: 3 }"), ('  smile: [LEFT_EYE, RIGHT_EYE, { cheek: [18.5, 36] }', '  wink: [LEFT_EYE, RIGHT_EYE, { cheek: [18.5, 36] }')]),
    ('FA3', 'cheeks in ink', FACE, R_LOOKS, [('fill={BLUSH}', 'fill={INK}')]),
    ('FA4', "calm's mouth drawn thicker", FACE, R_LOOKS, [("{ stroke: 'M29 37Q32 39 35 37', width: 2.6 }", "{ stroke: 'M29 37Q32 39 35 37', width: 3 }")]),
    ('FA5', 'a mouth stroked, not filled', FACE, R_LOOKS, [('  return <Path key={index} d={feature.mouth} fill={INK} />;\n', '  return <Path key={index} d={feature.mouth} fill="none" stroke={INK} />;\n')]),
    ('FA6', "the face's height ignores the board's box", FACE, R_LOOKS, [('height={(size * 50) / 56}', 'height={size}')]),
    ('FA7', 'the face shown to screen readers', FACE, R_LOOKS, [('    <View {...DECORATIVE}>\n      <Svg width={size}', '    <View>\n      <Svg width={size}')]),
    # MaterialFill.tsx
    ('MA1', 'the gradient runs down, not corner to corner', MATERIAL, R_LOOKS, [('x1="0" y1="0" x2="1" y2="1"', 'x1="0" y1="0" x2="0" y2="1"')]),
    ('MA2', 'one gradient id for every material', MATERIAL, R_LOOKS, [("const id = `wallet-material-${material}-${isDark ? 'dark' : 'light'}`;", "const id = `wallet-material-${isDark ? 'dark' : 'light'}`;")]),
    ('MA3', "the mode's stops ignored", MATERIAL, R_LOOKS, [('const paint = materialPaint(material, isDark);', 'const paint = materialPaint(material, false);')]),
    ('MA4', 'no edge', MATERIAL, R_LOOKS, [('      {paint.edge === null ? null : <View style={{ ...FILL, borderRadius: radius, borderWidth: 1, borderColor: paint.edge }} />}\n', '')]),
    ('MA5', 'an edge on every material', MATERIAL, R_LOOKS, [('{paint.edge === null ? null : <View style={{ ...FILL, borderRadius: radius, borderWidth: 1, borderColor: paint.edge }} />}', "{<View style={{ ...FILL, borderRadius: radius, borderWidth: 1, borderColor: paint.edge ?? 'transparent' }} />}")]),
    ('MA6', "the edge ignores the card's corner", MATERIAL, R_LOOKS, [('borderRadius: radius, borderWidth: 1', 'borderWidth: 1')]),
    ('MA7', 'square corners', MATERIAL, R_LOOKS, [('rx={radius}', 'rx={0}')]),
    ('MA8', 'the material shown to screen readers', MATERIAL, R_LOOKS, [('    <View {...DECORATIVE} style={BEHIND}>\n', '    <View style={BEHIND}>\n')]),
    ('MA9', 'touches stop at the material', MATERIAL, R_LOOKS, [("const BEHIND = { ...FILL, pointerEvents: 'none' } as const;", 'const BEHIND = { ...FILL } as const;')]),
    # WalletCategoryIcon.tsx
    ('TI1', 'the glyph in quiet text, not ink', TILE, R_LOOKS, [('<CategoryGlyph glyph={glyph} size={size / 2} color={colors.ink} />', '<CategoryGlyph glyph={glyph} size={size / 2} color={colors.quiet} />')]),
    ('TI2', 'the hue not tinted for the mode', TILE, R_LOOKS, [('tileTint(category.color, colors.isDark)', 'category.color')]),
    ('TI3', 'no colour sits on the card colour, not raised', TILE, R_LOOKS, [('category.color === null ? colors.raised :', 'category.color === null ? colors.card :')]),
    ('TI4', 'the corner does not scale', TILE, R_LOOKS, [('borderRadius: Math.round((size * 11) / 36),', 'borderRadius: 11,')]),
    ('TI5', 'the glyph does not scale', TILE, R_LOOKS, [('size={size / 2}', 'size={18}')]),
    ('TI6', 'the initial does not scale', TILE, R_LOOKS, [('const initial = Math.round((size * 15) / 36);', 'const initial = 15;')]),
    ('TI7', 'a rectangle with no corner of its own is square', TILE, R_LOOKS, [('rx={shape.rx ?? 2}', 'rx={shape.rx ?? 0}')]),
    ('TI8', "the board's own corner ignored", TILE, R_LOOKS, [('rx={shape.rx ?? 2}', 'rx={2}')]),
    ('TI9', 'a filled dot drawn as a ring', TILE, R_LOOKS, [('return shape.filled ? <Circle', 'return false ? <Circle')]),
    ('TI10', 'the kept icon, the pack and the built-in ignored', TILE, R_LOOKS, [('  const glyph = iconOf(category);\n', '  const glyph = category.builtin_key === null ? iconOf(category) && null : category.builtin_key;\n')]),
    ('TI11', 'the tile shown to screen readers', TILE, R_LOOKS, [('    <View\n      {...DECORATIVE}\n      style={{\n', '    <View\n      style={{\n')]),
    ('TI12', 'the initial at weight 500', TILE, R_LOOKS, [("fontWeight: '700' }}>", "fontWeight: '500' }}>")]),
    ('TI13', "strokes at the board's 1.8, not 2 pt", TILE, R_LOOKS, [('strokeWidth: 2, strokeLinecap', 'strokeWidth: 1.8, strokeLinecap')]),
    # WalletCard.tsx: the card render test
    ('CA1', "a credit card shows its balance, not what was spent (the plan's mutant)", CARD, R_CARD, [(f'  const spending = look.kind === \'credit_card\' && {SPENDING};\n', '  const spending = false;\n')]),
    ('CA2', "numberOfLines={1} on the name (the plan's mutant)", CARD, R_CARD, [(SPINE_NAME, "        <WalletText role=\"body\" numberOfLines={1} style={{ fontWeight: '700' }}>{wallet.name}</WalletText>\n")]),
    ('CA3', "the pending line hidden on stack cards (the plan's mutant)", CARD, R_CARD, [(STACK_PENDING, '            {full && words.pendingLine !== null ? <WalletText role="caption" style={{ color: paint.quietText }}>{words.pendingLine}</WalletText> : null}\n')]),
    ('CA4', 'a new credit card reads as a balance', CARD, R_CARD, [(SPENDING, "wallet.balanceMinor.startsWith('-')")]),
    ('CA5', 'a credit card paid ahead reads as spent', CARD, R_CARD, [(SPENDING, 'true')]),
    ('CA6', 'a balance below zero loses its minus', CARD, R_CARD, [("  const sign = words.amountPrefix === null ? 'balance' : 'none';\n", "  const sign = 'none';\n")]),
    ('CA7', 'the spending said as what is left', CARD, R_CARD, [("t(spending ? 'card.spokenSpent' : 'card.spokenLeft',", "t('card.spokenLeft',")]),
    ('CA8', 'the pending total not said', CARD, R_CARD, [("        ...(pending === null ? [] : [t('card.spokenPending', { amount: spokenMoney(size(pending), t) })]),\n", '')]),
    ('CA9', "today's money out not said", CARD, R_CARD, [("        ...(today === null ? [] : [t('card.spokenToday', { amount: spokenMoney(size(today), t) })]),\n", '')]),
    ('CA10', 'private mode says the amounts', CARD, R_CARD, [('  const said = hidden\n', '  const said = false\n')]),
    ('CA11', 'the pending amount shown in private mode', CARD, R_CARD, [("t('card.pending', { amount: hidden ? HIDDEN_AMOUNT : walletMoneyText(pending) })", "t('card.pending', { amount: walletMoneyText(pending) })")]),
    ('CA12', "today's amount shown in private mode", CARD, R_CARD, [("t('card.todayOut', { amount: hidden ? HIDDEN_AMOUNT : walletMoneyText(today, { sign: 'expense' }) })", "t('card.todayOut', { amount: walletMoneyText(today, { sign: 'expense' }) })")]),
    ('CA13', 'private mode drops the lines', CARD, R_CARD, [('  const pendingLine = pending === null ? null', '  const pendingLine = pending === null || hidden ? null'), ('  const todayLine = today === null ? null', '  const todayLine = today === null || hidden ? null')]),
    ('CA14', 'the kind line on every card', CARD, R_CARD, [(KIND_LINE, '{words.kindLine !== null ?')]),
    ('CA15', 'the kind line missing on the full card', CARD, R_CARD, [(KIND_LINE, '{false && words.kindLine !== null ?')]),
    ('CA16', 'a zero total draws a line', CARD, R_CARD, [(WORTH, 'minor === undefined || minor === null ? null : minor')]),
    ('CA17', 'an unset total draws a line', CARD, R_CARD, [(WORTH, "minor === null || minor === '0' ? null : minor")]),
    ('CA18', "the name in ink, not the material's text", CARD, R_CARD, [("style={{ flex: 1, fontWeight: '700', color: paint.text }}", "style={{ flex: 1, fontWeight: '700' }}")]),
    ('CA19', "ใช้ไป in the material's text, not its quiet text", CARD, R_CARD, [('<WalletText role="caption" style={{ color: paint.quietText }}>{words.amountPrefix}</WalletText>', '<WalletText role="caption" style={{ color: paint.text }}>{words.amountPrefix}</WalletText>')]),
    ('CA20', "the amount in the palette's ink, not the material's text", CARD, R_CARD, [('sign={sign} size={full ? 22 : 16} color={paint.text} />', 'sign={sign} size={full ? 22 : 16} />')]),
    ('CA21', 'the card shorter than 200 pt', CARD, R_CARD, [('style = { minHeight: CARD_HEIGHT,', 'style = { minHeight: 180,')]),
    ('CA22', 'the spine has no minimum height', CARD, R_CARD, [('style = { minHeight: 44, borderRadius', 'style = { borderRadius')]),
    ('CA23', 'the card is no button', CARD, R_CARD, [('<Pressable accessibilityRole="button" accessibilityLabel', '<Pressable accessibilityLabel')]),
    ('CA24', 'a tap does nothing', CARD, R_CARD, [('onPress={onPress} style={style}>{content}</Pressable>', 'style={style}>{content}</Pressable>')]),
    ('CA25', 'the button does not say its words', CARD, R_CARD, [('<Pressable accessibilityRole="button" accessibilityLabel={words.spoken}', '<Pressable accessibilityRole="button"')]),
    ('CA26', 'a card without onPress says nothing', CARD, R_CARD, [('<View accessible accessibilityLabel={words.spoken} style={style}>', '<View accessible style={style}>')]),
    ('CA27', 'the spine draws a face', CARD, R_CARD, [(SPINE_NAME, '        <BunFace face={look.face} size={28} />\n' + SPINE_NAME)]),
    ('CA28', 'the spine has no material', CARD, R_CARD, [('          <MaterialFill material={look.material} radius={6} />\n', '')]),
    ('CA29', 'the spine on the ground colour, not the card colour', CARD, R_CARD, [('backgroundColor: colors.card, paddingTop', 'backgroundColor: colors.ground, paddingTop')]),
    ('CA30', "today's money out without its minus", CARD, R_CARD, [("walletMoneyText(today, { sign: 'expense' })", 'walletMoneyText(today)')]),
    ('CA31', 'a spending card says minus', CARD, R_CARD, [('{ amount: spokenMoney(amountMinor, t) }', '{ amount: spokenMoney(wallet.balanceMinor, t) }')]),
    ('CA32', "the stack and full card's name clamped to two lines", CARD, R_CARD, [("<WalletText role=\"label\" style={{ flex: 1, fontWeight: '700', color: paint.text }}>", "<WalletText role=\"label\" numberOfLines={2} style={{ flex: 1, fontWeight: '700', color: paint.text }}>")]),
    ('CA33', "the spine's strip is not 12 pt", CARD, R_CARD, [('left: 10, top: 14, bottom: 14, width: 12 }', 'left: 10, top: 14, bottom: 14, width: 16 }')]),
    ('CA34', 'ใช้ไป missing from the spine', CARD, R_CARD, [('{words.amountPrefix === null ? null : <WalletText role="caption" tone="quiet">{words.amountPrefix}</WalletText>}', '{null}')]),
    # kitSections.tsx
    ('KS1', "the card section's private card on the phone's own setting", KIT, R_LOOKS, [('        <PrivateModeProvider store={hiddenStore}>\n          <WalletCard wallet={SAVING_WALLET}', '        <PrivateModeProvider>\n          <WalletCard wallet={SAVING_WALLET}')]),
    ('KS2', "the card section's private card not pinned hidden", KIT, R_LOOKS, [("useState(() => memoryStore({ [PRIVATE_MODE_NAME]: '1' }));\n  return (\n    <WalletGround>\n      <Specimen label=\"Cash\">", "useState(() => memoryStore({}));\n  return (\n    <WalletGround>\n      <Specimen label=\"Cash\">")]),
    ('KS3', 'bw-materials left out of the kit', KIT, R_LOOKS, [("  { id: 'bw-materials', title: 'Bun Wallet: materials and faces', group: 'Kit', render: () => <MaterialsSection /> },\n", '')]),
    # walletHarness.tsx: the harness and card render tests
    ('HA1', 'no looks provider in the harness', HARNESS, R_HARNESS, [('<WalletLooksProvider>{children}</WalletLooksProvider>', '{children}')]),
    ('HA2', "no BunIntensityProvider (P2-T8's E2)", HARNESS, R_HARNESS, [('              <BunIntensityProvider>\n', ''), ('              </BunIntensityProvider>\n', '')]),
    ('HA3', "no inner IntlProvider (P2-T8's E3)", HARNESS, R_HARNESS, [('        <IntlProvider locale={locale}>\n', ''), ('        </IntlProvider>\n', '')]),
    ('HA4', "the phone's answer given once (P2-T8's X2)", HARNESS, R_HARNESS, [(".mockReturnValue(answer);", '.mockReturnValueOnce(answer);')]),
    ('HA5', 'the looks provider above the diary', HARNESS, R_HARNESS, [('                    <SpendV1Provider resources={resources}>\n', '                    <WalletLooksProvider><SpendV1Provider resources={resources}>\n'), ('                    </SpendV1Provider>\n', '                    </SpendV1Provider></WalletLooksProvider>\n'), ('<WalletLooksProvider>{children}</WalletLooksProvider>', '{children}')]),
]

# vitest's totals line ("      Tests  1 failed | 13 passed (14)"); Node's "ℹ fail N" line.
SUMMARY = re.compile(r'^\s*Tests  (.+?)\s*$', re.M)
FAILED = re.compile(r'^\s*×\s+(\S+)\s+>\s+(.+?)\s+\d+ms\s*$', re.M)
NODE_COUNT = re.compile(r'^ℹ (tests|pass|fail) (\d+)', re.M)
NODE_FAILED = re.compile(r'^✖ (.+?) \([\d.]+ms\)$', re.M)
UNHANDLED = re.compile(r'Errors\s+(\d+) errors?')


def sha(path):
    with open(path, 'rb') as handle:
        return hashlib.sha256(handle.read()).hexdigest()


def main():
    root, logs = sys.argv[1], sys.argv[2]
    os.makedirs(logs, exist_ok=True)
    app = os.path.join(root, 'apps/app')
    wanted = set(sys.argv[3:])
    unexpected = killed = survived = 0
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
            run = subprocess.run(command, cwd=app, capture_output=True, text=True, timeout=900)
            output = run.stdout + run.stderr
        finally:
            with open(path, 'wb') as handle:
                handle.write(original)
        after = sha(path)
        with open(os.path.join(logs, f'{ident}.log'), 'w', encoding='utf-8') as handle:
            handle.write(output)
        if command is NODE:
            totals = dict(NODE_COUNT.findall(output))
            summary = f"{totals.get('fail', '?')} failed | {totals.get('pass', '?')} passed ({totals.get('tests', '?')})"
            failed = NODE_FAILED.findall(output)
        else:
            found = SUMMARY.findall(output)
            summary = found[-1] if found else 'no summary'
            failed = [name for _, name in FAILED.findall(output)]
        errors = UNHANDLED.findall(output)
        outcome = 'killed' if run.returncode != 0 else 'survived'
        if outcome == 'killed':
            killed += 1
        else:
            survived += 1
        mark = 'KILLED' if outcome == 'killed' else 'SURVIVED'
        first = f'; first failing: "{failed[0].strip()}"' if failed else ''
        unhandled = f'; unhandled errors {errors[-1]}' if errors else ''
        restored = 'restored sha256 equal' if after == before else f'RESTORE MISMATCH {after}'
        print(f'{ident} {mark}: {description} [{os.path.basename(rel)}] -> Tests {summary}{first}{unhandled}; AssertionError x{output.count("AssertionError")}; {restored}', flush=True)
        if outcome != 'killed' or after != before:
            unexpected += 1
    print(f'{killed} killed, {survived} survived, {unexpected} not as expected')
    sys.exit(1 if unexpected else 0)


if __name__ == '__main__':
    main()
