"""Writes real/AddTray.render.test.tsx from orig/ (P2-T17's version) by exact substitutions."""
import sys

K = '/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/p3-t13-planner'
REL = 'apps/app/src/wallet/add/AddTray.render.test.tsx'
src = open(f'{K}/orig/{REL}', encoding='utf-8').read()

HELPERS = '''
/** An AI draft handed to the host as P3-T17's slip read and P3-T18's tell step will (applyAiDraft); then its content shows. */
function aiDraft(draft: AiDraft, meta: AiDraftMeta) {
  act(() => { tray().applyAiDraft(draft, meta); });
  startAnimations();
}
/** A photo Bun read with Haiku, and a sentence Opus read after Haiku: each draft's word on itself. */
const HAIKU_PHOTO: AiDraftMeta = { source: 'photo', model: 'claude-haiku-5-5', escalated: false };
const OPUS_TELL: AiDraftMeta = { source: 'tell_bun', model: 'claude-opus-5-5', escalated: true };
/** An event's own properties, without the ones every event carries. */
const own = (properties: Recorded['properties']) => Object.fromEntries(Object.entries(properties).filter(([key]) => key !== 'origin' && !(key in COMMON_RULES)));
/** Each ai_draft_reviewed sent (P3-T5's review), by its own properties. */
const reviews = (sent: readonly Recorded[]) => sent.filter((event) => event.name === 'ai_draft_reviewed').map(({ properties }) => own(properties));
/** Each record_saved's source and photo flag. */
const savedAs = (sent: readonly Recorded[]) => sent.filter((event) => event.name === 'record_saved').map(({ properties }) => [properties.source, properties.has_photo]);
/** The review of each AI draft below: kept, edited with a count, or dropped, with its model and whether Opus answered. */
const reviewOf = (outcome: string, fieldsEdited: number, meta: AiDraftMeta) => ({ outcome, fields_edited: fieldsEdited, model: meta.model, escalated: meta.escalated });
'''

CASES = '''
test('a typed save sends source typed', async () => {
  const recorded = await recordAnalytics();
  try {
    // Kept on the phone: the outbox entry says typed.
    const diary = readyDiary();
    await mount(<Host />, { diary: diary.diary });
    await openTray();
    press('5', '0');
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    expect(diary.saves).toEqual([expect.objectContaining({ amount_minor: '5000', source: 'typed' })]);
    cleanup();
    // Sent online, from a quick chip (the person's own entry, logged before): the create says typed too.
    const fake = resources({ records: OFTEN });
    await mount(<Host />, { resources: fake.resources, diary: null });
    await openTray();
    tap(named('button', 'วิน 20 บาท'));
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    expect(fake.callsOf('createTransaction').map((call) => (call.args[0] as Record<string, unknown>).source)).toEqual(['typed']);
    // record_saved says typed, with no photo (until P3-T15), and nothing is reviewed.
    expect([savedAs(recorded.sent), reviews(recorded.sent)]).toEqual([[['typed', false], ['typed', false]], []]);
  } finally {
    recorded.restore();
  }
});

test('a Tell Bun sheet draft saves as tell_bun without a review', async () => {
  const recorded = await recordAnalytics();
  try {
    const diary = readyDiary();
    await mount(<Host />, { ai: bunOn(), diary: diary.diary });
    await openTray();
    tap(named('button', 'บอกบัน'));
    useBun(BUN_DRAFT);
    tap(named('button', 'ถัดไป'));
    // The person changes every row Bun filled, so no guess of Bun's stands: the record still says tell_bun, since
    // the entry's origin decides it, not a guess still standing (P2's rule; followups, P2-T16's reviews).
    tap(found('confirm-row-category'));
    tap(radio('อาหาร'));
    tap(found('confirm-row-wallet'));
    tap(walletRadio(MAIN.name));
    tap(found('confirm-row-date'));
    tap(named('button', translateCopy('Previous day', 'th')));
    tap(found('pick-date-done'));
    expect(rowLabels().filter((row) => row?.includes('บันเดา'))).toEqual([]);
    tap(named('button', 'บันทึก'));
    await settle();
    expect(diary.saves).toEqual([expect.objectContaining({ category_id: FOOD.id, wallet_id: MAIN.id, occurred_on: addDays(TODAY, -1), source: 'tell_bun' })]);
    // The sheet does not say which model read the sentence, so nothing is reviewed.
    expect([savedAs(recorded.sent), reviews(recorded.sent)]).toEqual([[['tell_bun', false]], []]);
  } finally {
    recorded.restore();
  }
});

test('an AI draft saved as filled is reviewed kept, and one changed is edited with its count', async () => {
  const recorded = await recordAnalytics();
  try {
    // A photo Bun read with Haiku: the draft fills the entry as the sheet's does, each row it filled Bun's guess.
    const diary = readyDiary();
    await mount(<Host />, { diary: diary.diary });
    await openTray();
    aiDraft(BUN_DRAFT, HAIKU_PHOTO);
    expect(text('add-amount')).toBe('฿65');
    tap(named('button', 'ถัดไป'));
    expect([text('confirm-title'), rowLabels()]).toEqual(['วิน', ['หมวด การเดินทาง บันเดา', 'กระเป๋า เงินสด บันเดา', 'วันที่ วันนี้ บันเดา', 'โน้ต เพิ่มโน้ต']]);
    tap(named('button', 'บันทึก'));
    await settle();
    // Saved as filled: the record says photo, and the draft is reviewed kept, once.
    expect(diary.saves).toEqual([expect.objectContaining({ amount_minor: '6500', category_id: TRAVEL.id, wallet_id: CASH.id, merchant: 'วิน', source: 'photo' })]);
    expect([savedAs(recorded.sent), reviews(recorded.sent)]).toEqual([[['photo', false]], [reviewOf('kept', 0, HAIKU_PHOTO)]]);
    cleanup();
    // The same draft with its category changed: edited, one field.
    const changed = readyDiary();
    await mount(<Host />, { diary: changed.diary });
    await openTray();
    aiDraft(BUN_DRAFT, HAIKU_PHOTO);
    tap(named('button', 'ถัดไป'));
    tap(found('confirm-row-category'));
    tap(radio('อาหาร'));
    tap(named('button', 'บันทึก'));
    await settle();
    expect(changed.saves).toEqual([expect.objectContaining({ amount_minor: '6500', category_id: FOOD.id, source: 'photo' })]);
    expect(reviews(recorded.sent)).toEqual([reviewOf('kept', 0, HAIKU_PHOTO), reviewOf('edited', 1, HAIKU_PHOTO)]);
    cleanup();
    // A sentence Opus read after Haiku, saved online with its amount and note changed: edited, two fields, and the
    // create says tell_bun.
    const fake = resources();
    await mount(<Host />, { resources: fake.resources, diary: null });
    await openTray();
    aiDraft(BUN_DRAFT, OPUS_TELL);
    press('7', '0');
    expect(text('add-amount')).toBe('฿70');
    tap(named('button', 'ถัดไป'));
    tap(found('confirm-row-note'));
    fireEvent.change(named('textbox', 'โน้ต'), { target: { value: 'ข้าวกลางวัน' } });
    tap(found('pick-note-done'));
    tap(named('button', 'บันทึก'));
    await settle();
    expect(fake.callsOf('createTransaction').map((call) => call.args[0])).toEqual([expect.objectContaining({ amount_minor: '7000', note: 'ข้าวกลางวัน', source: 'tell_bun' })]);
    expect(reviews(recorded.sent)).toEqual([reviewOf('kept', 0, HAIKU_PHOTO), reviewOf('edited', 1, HAIKU_PHOTO), reviewOf('edited', 2, OPUS_TELL)]);
    cleanup();
    // Bun read no amount: the amount the person had typed stays, and saved as the draft left it, the draft is kept.
    const typed = readyDiary();
    await mount(<Host />, { diary: typed.diary });
    await openTray();
    press('4', '5');
    aiDraft({ ...BUN_DRAFT, amount_minor: null, flags: ['amount_unclear'] }, HAIKU_PHOTO);
    expect(text('add-amount')).toBe('฿45');
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    expect(typed.saves).toEqual([expect.objectContaining({ amount_minor: '4500', category_id: TRAVEL.id, source: 'photo' })]);
    expect(reviews(recorded.sent)[3]).toEqual(reviewOf('kept', 0, HAIKU_PHOTO));
    expect(savedAs(recorded.sent)).toEqual([['photo', false], ['photo', false], ['tell_bun', false], ['photo', false]]);
    // No amount, place, note or wallet reaches analytics (1D-T7's allow-list is the boundary), and the host reviews
    // only through useDraftReview, the one way to the development tally (P3-T5's review, m2).
    const json = JSON.stringify(recorded.sent);
    for (const secret of ['6500', '7000', '4500', 'วิน', 'ข้าวกลางวัน', CASH.name]) expect(json).not.toContain(secret);
    expect(source('AddTrayHost.tsx')).not.toMatch(/draftTally|trackAiDraftReviewed/);
  } finally {
    recorded.restore();
  }
});

test('closing the tray with an unsaved AI draft reviews it dropped, once', async () => {
  const recorded = await recordAnalytics();
  try {
    const diary = readyDiary();
    const view = await mount(<Host />, { diary: diary.diary });
    await openTray();
    aiDraft(BUN_DRAFT, HAIKU_PHOTO);
    tap(named('button', 'ถัดไป'));
    // Closed unsaved: dropped at once, with its model. Drawn again while the tray leaves, and once it has gone,
    // nothing more is sent.
    fireEvent.click(named('button', 'ปิด'));
    expect(reviews(recorded.sent)).toEqual([reviewOf('dropped', 0, HAIKU_PHOTO)]);
    view.rerender(<Host />);
    await wait(250);
    expect(reviews(recorded.sent)).toEqual([reviewOf('dropped', 0, HAIKU_PHOTO)]);
    // A typed entry closed unsaved has nothing to review.
    await openTray();
    press('5');
    fireEvent.click(named('button', 'ปิด'));
    await wait(250);
    expect(reviews(recorded.sent)).toHaveLength(1);
    // Escape closes it the same way: the next AI draft is dropped too, once, and nothing was kept.
    await openTray();
    aiDraft(BUN_DRAFT, OPUS_TELL);
    escape();
    await wait(250);
    expect(reviews(recorded.sent)).toEqual([reviewOf('dropped', 0, HAIKU_PHOTO), reviewOf('dropped', 0, OPUS_TELL)]);
    expect([diary.saves, savedAs(recorded.sent)]).toEqual([[], []]);
  } finally {
    recorded.restore();
  }
});

test('a second AI draft over an unsaved one reviews the first dropped', async () => {
  const recorded = await recordAnalytics();
  try {
    const diary = readyDiary();
    await mount(<Host />, { ai: bunOn(), diary: diary.diary });
    await openTray();
    aiDraft(BUN_DRAFT, HAIKU_PHOTO);
    // The second fills the entry, and the first, never saved, is dropped at once.
    aiDraft({ ...BUN_DRAFT, amount_minor: '12000', category_id: FOOD.id, merchant: 'ข้าวมันไก่' }, OPUS_TELL);
    expect([text('add-amount'), reviews(recorded.sent)]).toEqual(['฿120', [reviewOf('dropped', 0, HAIKU_PHOTO)]]);
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    // Saved as the second filled it: its source, and reviewed kept with its own model.
    expect(diary.saves).toEqual([expect.objectContaining({ amount_minor: '12000', category_id: FOOD.id, merchant: 'ข้าวมันไก่', source: 'tell_bun' })]);
    expect(reviews(recorded.sent)).toEqual([reviewOf('dropped', 0, HAIKU_PHOTO), reviewOf('kept', 0, OPUS_TELL)]);
    cleanup();
    // P2's sheet over an unsaved AI draft: the AI draft is dropped, and the sheet's is saved as tell_bun, unreviewed.
    const sheetDiary = readyDiary();
    await mount(<Host />, { ai: bunOn(), diary: sheetDiary.diary });
    await openTray();
    aiDraft(BUN_DRAFT, HAIKU_PHOTO);
    tap(named('button', 'บอกบัน'));
    useBun({ ...BUN_DRAFT, amount_minor: '8000' });
    expect(reviews(recorded.sent)).toEqual([reviewOf('dropped', 0, HAIKU_PHOTO), reviewOf('kept', 0, OPUS_TELL), reviewOf('dropped', 0, HAIKU_PHOTO)]);
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    expect(sheetDiary.saves).toEqual([expect.objectContaining({ amount_minor: '8000', source: 'tell_bun' })]);
    expect([reviews(recorded.sent).length, savedAs(recorded.sent)]).toEqual([3, [['tell_bun', false], ['tell_bun', false]]]);
  } finally {
    recorded.restore();
  }
});

test('an AI draft handed over while a save is on its way, or while its answer is unknown, changes nothing', async () => {
  const recorded = await recordAnalytics();
  try {
    // A save on its way online: a second draft is not taken, and the first is reviewed once it lands.
    const fake = resources();
    const release = fake.hold('createTransaction');
    await mount(<Host />, { resources: fake.resources, diary: null });
    await openTray();
    aiDraft(BUN_DRAFT, HAIKU_PHOTO);
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    aiDraft({ ...BUN_DRAFT, amount_minor: '9900', category_id: FOOD.id }, OPUS_TELL);
    expect([text('confirm-amount'), reviews(recorded.sent)]).toEqual(['฿65', []]);
    await act(async () => {
      release();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(fake.callsOf('createTransaction').map((call) => call.args[0])).toEqual([expect.objectContaining({ amount_minor: '6500', category_id: TRAVEL.id, source: 'photo' })]);
    expect(reviews(recorded.sent)).toEqual([reviewOf('kept', 0, HAIKU_PHOTO)]);
    cleanup();
    // An answer lost: the same; Try again resends the first draft, which is then reviewed.
    const lost = resources();
    lost.fail('createTransaction', 'network');
    await mount(<Host />, { resources: lost.resources, diary: null });
    await openTray();
    aiDraft(BUN_DRAFT, HAIKU_PHOTO);
    tap(named('button', 'ถัดไป'));
    tap(named('button', 'บันทึก'));
    await settle();
    aiDraft({ ...BUN_DRAFT, amount_minor: '9900' }, OPUS_TELL);
    expect([text('confirm-amount'), reviews(recorded.sent)]).toEqual(['฿65', [reviewOf('kept', 0, HAIKU_PHOTO)]]);
    tap(named('button', 'ลองอีกครั้ง'));
    await settle();
    expect(lost.callsOf('createTransaction').map((call) => (call.args[0] as Record<string, unknown>).amount_minor)).toEqual(['6500', '6500']);
    expect(reviews(recorded.sent)).toEqual([reviewOf('kept', 0, HAIKU_PHOTO), reviewOf('kept', 0, HAIKU_PHOTO)]);
  } finally {
    recorded.restore();
  }
});
'''

EDITS = [
    ("""// a case asks (`dismissals.hold`), as UIKit may.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
""",
     """// a case asks (`dismissals.hold`), as UIKit may.
//
// P3-T13 adds how each record was made: the source a save carries (typed, the
// sheet's tell_bun, or an AI draft's own) and the review each AI draft gets
// once (kept, edited with its count, or dropped). A case hands the host an AI
// draft through the probe's useAddTray().applyAiDraft, as P3-T17's slip read
// and P3-T18's tell step will. The suite defines __DEV__, so each review also
// counts in the draft tally (P3-T5), which no case reads.
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
"""),
    ("""import type { AddRequest, AddTray, SavedContext } from './AddTrayHost';
""",
     """import type { AddRequest, AddTray, AiDraftMeta, SavedContext } from './AddTrayHost';
"""),
    ("""    sheet().onUse(draft);
    sheet().onClose();
  });
  startAnimations();
}
""",
     """    sheet().onUse(draft);
    sheet().onClose();
  });
  startAnimations();
}
""" + HELPERS),
    ("""test("Tell Bun's sheet opens inside the tray", async () => {
""",
     CASES.lstrip('\n') + """
test("Tell Bun's sheet opens inside the tray", async () => {
"""),
]

for old, new in EDITS:
    count = src.count(old)
    if count != 1:
        sys.exit(f'{count} matches for {old[:80]!r}')
    src = src.replace(old, new)
open(f'{K}/real/{REL}', 'w', encoding='utf-8').write(src)
print('real AddTray.render.test.tsx written')
