# P3-T14's mutants: one per guard, each run on the test that should kill it.
#   python3 -I mutants.py --tree <worktree> --out <dir>
# For each mutant: the file must equal the kit's real/ copy (sha256); one exact
# replacement is made (its old text must occur once); its command runs in
# <tree>/apps/app with its output in <out>/<id>.log; then the file is copied
# back from real/ and its sha256 checked again. A mutant is killed when its
# command fails: "killed (assertion)" when the log holds an assertion failure,
# "killed (error)" otherwise. Prints one line per mutant, then
# "<k> of <n> killed; survivors [...]; not restored [...]". Exit 0 only when
# every mutant is killed and every file is restored.
import argparse
import hashlib
import shutil
import subprocess
import sys
from pathlib import Path

KIT = Path(__file__).resolve().parent
EN_DASH = chr(0x2013)
SPARKLES = chr(0x2728)

APP = 'apps/app/'
AREA = APP + 'src/wallet/bunai/aiArea.ts'
FLAGS = APP + 'src/config/featureFlags.ts'
DRAFTS = APP + 'src/wallet/bunai/drafts.ts'
COPY = APP + 'src/wallet/bunai/useBunAiCopy.ts'
CONSENT = APP + 'src/wallet/bunai/aiConsent.ts'
CONTENT = APP + 'src/wallet/bunai/AiConsentContent.tsx'
TRAY = APP + 'src/wallet/bunai/AiConsentTray.tsx'
SCREEN = APP + 'src/wallet/bunai/WalletAiSettingsScreen.tsx'
SETTINGS = APP + 'src/screens/redesign/account/SettingsScreen.tsx'
COMPANION = APP + 'src/screens/redesign/account/CompanionSettings.tsx'
SHEET = APP + 'src/screens/redesign/ai/AiConsentSheet.tsx'
ROUTE = APP + 'app/settings/ai.tsx'
INDEX = APP + 'src/dev/catalogue/wallet/index.ts'
STAGE = APP + 'src/dev/catalogue/wallet/bunaiScreens.tsx'

FLAGS_TEST = ('node', ['src/config/featureFlags.test.ts'], None)
DRAFTS_TEST = ('node', ['src/wallet/bunai/drafts.test.ts'], None)


def consent(name):
    return ('render', ['src/wallet/bunai/AiConsent.render.test.tsx'], name)


def settings(name):
    return ('render', ['src/wallet/bunai/WalletAiSettings.render.test.tsx'], name)


SETTINGS_ROW = ('render', ['src/screens/redesign/account/SettingsScreen.render.test.tsx'], 'บันและ AI')
ROUTES = ('render', ['src/screens/redesign/account/AccountRoutes.render.test.tsx'], '/settings/ai')

# (id, what it breaks, file, old, new, test)
MUTANTS = [
    ('A1', 'the area needs only one of wallet and bunai', AREA,
     "return isRedesignEnabled('wallet') && isRedesignEnabled('bunai');", "return isRedesignEnabled('wallet') || isRedesignEnabled('bunai');", FLAGS_TEST),
    ('A2', 'the area ignores the wallet area', AREA,
     "return isRedesignEnabled('wallet') && isRedesignEnabled('bunai');", "return isRedesignEnabled('bunai');", FLAGS_TEST),
    ('A3', 'the area ignores the bunai area', AREA,
     "return isRedesignEnabled('wallet') && isRedesignEnabled('bunai');", "return isRedesignEnabled('wallet');", FLAGS_TEST),
    ('A4', 'useBunAiArea is always on', AREA,
     "export function useBunAiArea(): boolean {\n  return bunAiAreaOn();", "export function useBunAiArea(): boolean {\n  return true;", FLAGS_TEST),
    ('A5', 'usePhotosArea is always on', AREA,
     "export function usePhotosArea(): boolean {\n  return bunAiAreaOn();", "export function usePhotosArea(): boolean {\n  return true;", FLAGS_TEST),
    ('F1', 'bunai is approved, so on by default', FLAGS,
     "'import', 'companion'];", "'import', 'companion', 'bunai'];", FLAGS_TEST),
    ('D1', "the consent drops B8's wallet and category names", DRAFTS,
     ' ชื่อกระเป๋าและหมวดให้บันเลือก', '', consent('the consent names')),
    ('D2', 'the consent drops the notes a person wrote', DRAFTS,
     ' และโน้ตที่จดไว้', '', consent('the consent names')),
    ('D3', 'the consent drops the kept receipt', DRAFTS,
     ' ยกเว้นรูปใบเสร็จที่คุณแนบไว้กับรายการ', '', consent('the consent names')),
    ('D4', 'a draft line uses a dash as punctuation', DRAFTS,
     "'bunai.consentNotNow': { th: 'ไม่ใช่ตอนนี้', en: 'Not now' }", "'bunai.consentNotNow': { th: 'ไม่ใช่ตอนนี้', en: 'Not now " + EN_DASH + " later' }", DRAFTS_TEST),
    ('D5', "a draft line's placeholders differ between Thai and English", DRAFTS,
     "'bunai.usesOf': { th: '{left} / {limit}', en: '{left} / {limit}' }", "'bunai.usesOf': { th: '{left} / {limit}', en: '{left} / {max}' }", DRAFTS_TEST),
    ('D6', 'a draft line has an emoji', DRAFTS,
     "'bunai.consentOn': { th: 'เปิดใช้', en: 'Turn on' }", "'bunai.consentOn': { th: 'เปิดใช้', en: 'Turn on " + SPARKLES + "' }", DRAFTS_TEST),
    ('U1', 'vi reads Thai', COPY,
     "locale === 'th' ? line.th : line.en", "locale !== 'en' ? line.th : line.en", settings('bunAiText')),
    ('U2', 'an unsupplied token reads undefined', COPY,
     'return value === undefined ? token : String(value);', 'return String(value);', settings('bunAiText')),
    ('U3', 'an unknown key reads as nothing', COPY,
     'line === undefined ? key :', "line === undefined ? '' :", settings('bunAiText')),
    ('U4', "the reader ignores the app's language", COPY,
     'bunAiText(table, key, locale, values)', "bunAiText(table, key, 'th', values)", settings('the screen shows presence')),
    ('C1', 'the event is sent before the server answers (the plan\'s mutant)', CONSENT,
     "      const saved = await update(on ? { companion: true, notice_version: AI_NOTICE_VERSION } : { companion: false });\n"
     "      getAnalytics()?.setCommon({ ai_enabled: saved.companion && saved.available });\n"
     "      trackAiConsentChanged();\n",
     "      getAnalytics()?.setCommon({ ai_enabled: on });\n"
     "      trackAiConsentChanged();\n"
     "      await update(on ? { companion: true, notice_version: AI_NOTICE_VERSION } : { companion: false });\n",
     consent('a turn-on that fails')),
    ('C2', 'the common ai_enabled is not set before the event', CONSENT,
     "      getAnalytics()?.setCommon({ ai_enabled: saved.companion && saved.available });\n", '', consent('turns AI on with the current notice')),
    ('C3', "ai_enabled ignores the service's rest", CONSENT,
     'ai_enabled: saved.companion && saved.available', 'ai_enabled: saved.companion', consent('rests')),
    ('C4', 'turning on sends no notice', CONSENT,
     'on ? { companion: true, notice_version: AI_NOTICE_VERSION } :', 'on ? { companion: true } :', consent('turns AI on with the current notice')),
    ('C5', 'turning off turns on', CONSENT,
     'const turnOff = useCallback(() => change(false), [change]);', 'const turnOff = useCallback(() => change(true), [change]);', settings('turning AI off is immediate')),
    ('C6', 'a change never says it is waiting', CONSENT,
     '    setBusy(true);\n', '', consent('while turning on waits')),
    ('C7', 'a change is still waiting after a failure', CONSENT,
     '      setBusy(false);\n', '', consent('a turn-on that fails')),
    ('N1', 'the note is off unless stored on', CONSENT,
     "setOn(stored !== 'off')", "setOn(stored === 'on')", settings('the note switch is kept')),
    ('N2', 'the stored note overwrites a choice made before it was read', CONSENT,
     "      if (!chosen.current) setOn(stored !== 'off');", "      setOn(stored !== 'off');", settings('the note setting')),
    ('N3', 'a note store that cannot be read is never ready', CONSENT,
     '.catch(() => null).then(', '.then(', settings('the note setting')),
    ('N4', 'a note store that cannot be written throws', CONSENT,
     "next ? 'on' : 'off').catch(() => undefined);", "next ? 'on' : 'off');", settings('the note setting')),
    ('N5', 'the note is stored the wrong way round', CONSENT,
     "next ? 'on' : 'off'", "next ? 'off' : 'on'", settings('the note switch is kept')),
    ('N6', 'a note choice does not make the setting ready', CONSENT,
     '    setOn(next);\n    setReady(true);\n', '    setOn(next);\n', settings('the note setting')),
    ('K1', 'read-only shows the answers', CONTENT,
     '{readOnly ? null : (', '{false ? null : (', consent('read-only')),
    ('K2', 'ไม่ใช่ตอนนี้ works while turning on waits', CONTENT,
     'if (!busy) onNotNow();', 'onNotNow();', consent('while turning on waits')),
    ('K3', 'อ่านรายละเอียด works while turning on waits', CONTENT,
     'if (!busy) onDetails();', 'onDetails();', consent('while turning on waits')),
    ('K4', 'the main button never says it is busy', CONTENT,
     "label={t('bunai.consentOn')} busy={busy}", "label={t('bunai.consentOn')} busy={false}", consent('while turning on waits')),
    ('K5', 'a failure is never said', CONTENT,
     '{problem ? <WalletText testID="ai-consent-problem"', '{false ? <WalletText testID="ai-consent-problem"', consent('a turn-on that fails')),
    ('K6', 'the consent drops who reads it', CONTENT,
     "        <PromiseRow testID=\"ai-consent-who\" icon=\"who\" label={t('bunai.consentWho')} line={t('bunai.consentWhoLine')} />\n", '', consent('the consent names')),
    ('T1', 'read-only is still named as the consent', TRAY,
     "t(readOnly ? 'bunai.whatAiSees' : 'bunai.consentTitle')", "t('bunai.consentTitle')", consent('read-only')),
    ('T2', 'the tray closes while turning on waits', TRAY,
     'locked={busy}', 'locked={false}', consent('while turning on waits')),
    ('T3', 'agreeing leaves the tray open', TRAY,
     '    onAgreed?.();\n    onClose();\n  };', '    onAgreed?.();\n  };', consent('turns AI on with the current notice')),
    ('T4', 'agreeing never tells the host', TRAY,
     '    onAgreed?.();\n', '', consent('turns AI on with the current notice')),
    ('T5', 'a failed turn-on says nothing', TRAY,
     "      setProblem(t('bunai.consentFailed'));\n", '', consent('a turn-on that fails')),
    ('T6', "a failure's line stays when the tray opens again", TRAY,
     '    if (visible) setProblem(null);\n', '', settings('is not still said')),
    ('T7', 'Privacy and data opens while the tray is still leaving', TRAY,
     '    detailsNext.current = true;\n', "    router.push('/settings/privacy');\n", consent('closes the tray, then opens Privacy')),
    ('T8', 'the host never hears that the tray has gone', TRAY,
     '    onClosed?.();\n', '', consent('closes the tray, then opens Privacy')),
    ('T9', 'a failed turn-on plays no failure tap', TRAY,
     "      playHaptic('saveFailed');\n", '', consent('a turn-on that fails')),
    ('W1', 'the uses show while the service rests', SCREEN,
     'const remaining = enabled ? preferences?.remaining : undefined;', 'const remaining = preferences?.remaining;', settings('rests')),
    ('W2', "a use's limit is not the day's limit", SCREEN,
     'limit: AI_DAILY_LIMITS[feature]', 'limit: remaining[feature]', settings('the screen shows presence')),
    ('W3', 'the switch turns AI on without the consent', SCREEN,
     '      onConsent();\n      return;', '      return;', settings('opens the consent first')),
    ('W4', 'a failed turn-off says nothing', SCREEN,
     "      setProblem(tc(\"This couldn't be changed right now. Try again when you're online.\"));\n", '', settings('a turn-off the server never took')),
    ('W5', 'the AI switch takes a second press while it waits', SCREEN,
     'on={on} busy={busy} onPress', 'on={on} busy={false} onPress', settings('while turning off waits')),
    ('W6', 'the resting line is never said', SCREEN,
     '{preferences && !preferences.available ? (', '{false ? (', settings('rests')),
    ('W7', 'สิ่งที่ AI เห็น opens the consent with its answers', SCREEN,
     'onSeen={() => setTray({ open: true, readOnly: true })}', 'onSeen={() => setTray({ open: true, readOnly: false })}', settings('opens the consent read-only')),
    ('W8', 'the note switch always reads on', SCREEN,
     'on={note.on} onPress', 'on={true} onPress', settings('the note switch is kept')),
    ('W9', 'the chosen presence is set again', SCREEN,
     'if (!checked) setIntensity(value);', 'setIntensity(value);', settings("presence is the app's bun intensity")),
    ('W10', 'the chosen haptics setting answers again', SCREEN,
     '                if (checked) return;\n', '', settings("presence is the app's bun intensity")),
    ('W11', 'a new haptics setting plays no tap', SCREEN,
     "                // The new setting answers for itself, so the person feels what they chose.\n                playHaptic('saveLanded');\n", '', settings("presence is the app's bun intensity")),
    ('W12', 'back never falls back to Settings', SCREEN,
     "    if (router.canGoBack()) router.back();\n    else router.replace('/settings');", '    router.back();', settings('back goes')),
    ('W13', 'the presence cards never stack', SCREEN,
     "style={{ flexDirection: large ? 'column' : 'row', gap: 8 }}", "style={{ flexDirection: 'row', gap: 8 }}", settings('controls are 44 pt')),
    ('W14', 'the uses never stack', SCREEN,
     "<View style={{ flexDirection: large ? 'column' : 'row', gap: 6 }}>", "<View style={{ flexDirection: 'row', gap: 6 }}>", settings('controls are 44 pt')),
    ('W15', 'the haptics segments never stack', SCREEN,
     "style={{ flexDirection: large ? 'column' : 'row', gap: 4, padding: 4", "style={{ flexDirection: 'row', gap: 4, padding: 4", settings('controls are 44 pt')),
    ('W16', 'controls under 44 pt', SCREEN,
     'const TOUCH = 44;', 'const TOUCH = 40;', settings('controls are 44 pt')),
    ('W17', 'a turn-off plays no tap', SCREEN,
     "    playHaptic('saveLanded');\n  };\n\n  const remaining", '  };\n\n  const remaining', settings('turning AI off is immediate')),
    ('W18', 'the note switch only ever turns the note off', SCREEN,
     'void note.set(!note.on)', 'void note.set(false)', settings('the note switch is kept')),
    ('S1', 'Settings shows the row without the area', SETTINGS,
     '{bunAi ? <BunAiRow /> : null}', '<BunAiRow />', SETTINGS_ROW),
    ('S2', "Settings keeps Bun's AI help with the area on", SETTINGS,
     '<CompanionSettings showAi={!bunAi} />', '<CompanionSettings />', SETTINGS_ROW),
    ('S3', 'Settings replaces all of CompanionSettings (the plan\'s mutant)', SETTINGS,
     "{isRedesignEnabled('companion') ? <CompanionSettings showAi={!bunAi} /> : null}", "{isRedesignEnabled('companion') && !bunAi ? <CompanionSettings /> : null}", SETTINGS_ROW),
    ('S4', 'the row opens Settings, not AI settings', SETTINGS,
     "router.push('/settings/ai')", "router.push('/settings')", SETTINGS_ROW),
    ('O1', "today's settings turn AI off around useAiConsentChange", COMPANION,
     'else void change(turnOff);', 'else void change(() => update({ companion: false }));', consent('the old settings')),
    ('O2', "today's settings ignore showAi", COMPANION,
     '{showAi ? (', '{true ? (', SETTINGS_ROW),
    ('H1', "today's sheet never turns AI on through useAiConsentChange", SHEET,
     '      await turnOn();', '      await Promise.resolve();', consent('the old settings')),
    ('R1', '/settings/ai shows the screen without the area', ROUTE,
     '  if (!useBunAiArea()) return <Redirect href="/settings" />;\n', '', ROUTES),
    ('R2', '/settings/ai sends elsewhere than Settings', ROUTE,
     '<Redirect href="/settings" />', '<Redirect href="/spend" />', ROUTES),
    ('G1', "the catalogue lists no Bun AI section", INDEX,
     '  ...WALLET_BUNAI_SECTIONS,\n', '', settings('the catalogue lists')),
    ('G2', "the Bun AI sections come before the lock's", INDEX,
     '  ...WALLET_LOCK_SECTIONS,\n  ...WALLET_BUNAI_SECTIONS,\n', '  ...WALLET_BUNAI_SECTIONS,\n  ...WALLET_LOCK_SECTIONS,\n', settings('the catalogue lists')),
    ('G3', "bw-ai-settings shows AI help off", STAGE,
     'companion: true, notice_version: AI_NOTICE_VERSION, remaining: BOARD_USES', 'companion: false, notice_version: AI_NOTICE_VERSION, remaining: BOARD_USES', settings('the catalogue lists')),
]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def command(test):
    kind, files, name = test
    if kind == 'node':
        return ['node', 'scripts/test-unit.mjs', *files]
    cmd = ['npx', 'vitest', 'run', '--config', 'vitest.render.config.ts', *files]
    if name:
        cmd += ['-t', name]
    return cmd


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('--tree', required=True)
    parser.add_argument('--out', required=True)
    parser.add_argument('--only', nargs='*')
    args = parser.parse_args()
    tree = Path(args.tree).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    ids = [m[0] for m in MUTANTS]
    if len(set(ids)) != len(ids):
        print('duplicate mutant ids')
        return 2
    survivors, unrestored, killed = [], [], 0
    chosen = [m for m in MUTANTS if not args.only or m[0] in args.only]
    for mid, what, rel, old, new, test in chosen:
        target = tree / rel
        real = KIT / 'real' / rel
        if sha(target) != sha(real):
            print(f'{mid} NOT RUN: {rel} differs from real/ before the mutant')
            unrestored.append(mid)
            continue
        text = target.read_text(encoding='utf-8')
        count = text.count(old)
        if count != 1:
            print(f'{mid} BAD MUTANT: its old text occurs {count} times in {rel}')
            survivors.append(mid)
            continue
        target.write_text(text.replace(old, new), encoding='utf-8')
        log = out / f'{mid}.log'
        try:
            with log.open('w', encoding='utf-8') as sink:
                done = subprocess.run(command(test), cwd=tree / 'apps/app', stdout=sink, stderr=subprocess.STDOUT, timeout=600)
            rc = done.returncode
        except subprocess.TimeoutExpired:
            rc = 124
        finally:
            shutil.copyfile(real, target)
        restored = sha(target) == sha(real)
        if not restored:
            unrestored.append(mid)
        body = log.read_text(encoding='utf-8', errors='replace')
        if rc == 0:
            survivors.append(mid)
            verdict = 'SURVIVED'
        else:
            killed += 1
            verdict = 'killed (assertion)' if ('AssertionError' in body or 'ERR_ASSERTION' in body) else 'killed (error)'
        print(f'{mid} {verdict}: {what} [{rel}] rc={rc}; restored {"sha256 equal" if restored else "NOT EQUAL"}', flush=True)
    print(f'{killed} of {len(chosen)} killed; survivors {survivors}; not restored {unrestored}')
    return 0 if not survivors and not unrestored and killed == len(chosen) else 1


if __name__ == '__main__':
    sys.exit(main())
