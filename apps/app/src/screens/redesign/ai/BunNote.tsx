// Bun's daily note on Home (premium plan A4): one or two short, kind
// sentences about today, from the person's own numbers. The server builds the
// facts; with Bun's AI help on, Claude words them, and any number it would add
// is refused, so the note never disagrees with the screen. Every fact in it is
// also on Home (today's records, the month's pace), so Quiet and Off lose
// nothing. Read once per day and language for a while, so a visit back to Home
// never spends another of the day's AI uses.
import type { AiLocale, AiNoteResult } from '@gogospend/contracts';
import { useEffect, useState } from 'react';

import { SpeechBubble } from '@mobile/mascot/SpeechBubble';
import { useAiCompanion } from '@mobile/spend/v1/ai/AiCompanionProvider';
import { BUN_SPACE } from '@mobile/ui/layout';

const KEEP_MS = 2 * 60 * 60 * 1000;
const kept = new Map<string, { at: number; note: AiNoteResult }>();

/** Forgets kept notes (sign-out, tests). */
export function forgetBunNotes(): void {
  kept.clear();
}

export function BunNote({ today, locale, now = Date.now }: { today: string; locale: AiLocale; now?: () => number }) {
  const { resources, enabled } = useAiCompanion();
  const key = `${today}|${locale}|${enabled ? 'ai' : 'facts'}`;
  const [note, setNote] = useState<AiNoteResult | null>(() => kept.get(key)?.note ?? null);

  useEffect(() => {
    if (!resources) return;
    const hit = kept.get(key);
    if (hit && now() - hit.at < KEEP_MS) {
      setNote(hit.note);
      return;
    }
    let active = true;
    resources.note(today, locale).then(
      (read) => {
        kept.set(key, { at: now(), note: read });
        if (active) setNote(read);
      },
      () => undefined, // offline: no note today, and Home says the rest
    );
    return () => { active = false; };
  }, [resources, key, today, locale, now]);

  if (!note || !note.text) return null;
  const amount = /฿[0-9,]+(?:\.[0-9]{2})?/.exec(note.text)?.[0];
  return (
    <SpeechBubble
      testID="home-bun-note"
      fact={note.text}
      highlight={amount}
      pose={note.facts[0]?.kind === 'over_budget' ? 'oops-kind' : note.facts[0]?.kind === 'logged_days_week' ? 'cheer' : 'holding-receipt'}
      style={{ marginBottom: BUN_SPACE.xs }}
    />
  );
}
