# Planner only: makes the note-setting probe await set() with .resolves, so a
# set() that throws fails the case on an assertion (mutant N4), not as an
# unhandled rejection. Edits the given WalletAiSettings.render.test.tsx in place.
import sys
from pathlib import Path

p = Path(sys.argv[1])
s = p.read_text(encoding='utf-8')
pairs = [
    ("import { Pressable, Text } from 'react-native';\n", "import { Text } from 'react-native';\n"),
    ("import { useDailyNoteSetting } from './aiConsent';\n", "import { useDailyNoteSetting } from './aiConsent';\nimport type { DailyNoteSetting } from './aiConsent';\n"),
    ("""/** Reads the note setting the way a screen does, and turns it off on a tap. */
function NoteProbe() {
  const note = useDailyNoteSetting();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="turn the note off" onPress={() => void note.set(false)}>
      <Text testID="note-probe">{`${note.on ? 'on' : 'off'} ${note.ready ? 'ready' : 'reading'}`}</Text>
    </Pressable>
  );
}
""", """/** The note setting as the probe last read it, so a case can call its set() and await it. */
let probed: DailyNoteSetting | null = null;

/** Reads the note setting the way a screen does, and says what it read. */
function NoteProbe() {
  const note = useDailyNoteSetting();
  probed = note;
  return <Text testID="note-probe">{`${note.on ? 'on' : 'off'} ${note.ready ? 'ready' : 'reading'}`}</Text>;
}

/** Turns the note off through the probe's setting; the change must settle without throwing. */
async function turnNoteOff() {
  const note = probed;
  expect(note, 'the probe has read the setting').not.toBeNull();
  await act(async () => { await expect(note?.set(false)).resolves.toBeUndefined(); });
  await settle();
}
"""),
]
for old, new in pairs:
    if s.count(old) != 1:
        sys.exit(f'not found once: {old[:60]}')
    s = s.replace(old, new)
old_press = "  await press(named('button', 'turn the note off'));\n"
if s.count(old_press) != 2:
    sys.exit(f'expected two presses, found {s.count(old_press)}')
s = s.replace(old_press, '  await turnNoteOff();\n')
p.write_text(s, encoding='utf-8')
print('probe: set() is awaited in both places')
