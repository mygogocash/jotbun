// The reminder's words, one wording per weekday, with Bun speaking (approved
// by the owner on 24 October 2026). A daily trigger repeats one text, so the
// service schedules a weekly reminder per day and asks here for each day's.
// Each line stands alone, since a person may choose any days, and none needs
// Bun's AI help, which can be off.
import type { ReminderContent, Weekday } from './reminders.ts';

const WORDING: Readonly<Record<Weekday, { readonly title: string; readonly body: string }>> = {
  1: { title: "Bun's ready for a new week", body: 'Start it with what you spent today.' },
  2: { title: 'Bun saved you a fresh page', body: 'Add what you spent today in Jotbun.' },
  3: { title: 'Halfway there, says Bun', body: "A minute now keeps this week's total right." },
  4: { title: "Bun's all ears", body: 'Coffee, a ride, a top-up: each takes seconds to add.' },
  5: { title: "Bun says it's Friday!", body: "Note today's spending before the weekend starts." },
  6: { title: 'Bun likes weekends too', body: "Big or small, today's spending counts." },
  7: { title: "Bun's wrapping up the week", body: "Add today's spending to make it complete." },
};

/** `day`'s reminder (ISO: Monday = 1 … Sunday = 7), each line through `tc` (English copy in, the active language out). */
export function reminderWording(day: Weekday, tc: (english: string) => string): ReminderContent {
  const { title, body } = WORDING[day];
  return { title: tc(title), body: tc(body) };
}
