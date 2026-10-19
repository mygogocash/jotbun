// R7: the import journey (plan §6.5), behind the `import` area until E2
// checkpoint 5; uploads stay off on the server (IMPORT_UPLOADS_ENABLED) until
// the import release. Built on the P3 client: importReview.ts holds the
// journey, its commands and keys, and the device draft; importModel.ts says
// what the screen shows. This file only runs the steps and draws.
//
// The journey:
//   1. The expectation sheet: what import can do and what it won't, and
//      "nothing is saved until you confirm".
//   2. Pick a file (the injectable picker port), checked on the phone, then
//      upload it. A 404 means uploads are off on the server: the screen says
//      so and offers nothing that pretends to work.
//   3. Reading: staged progress with the box bun. A file still unread after
//      the checks (today's Node 24 server never starts reading it) or a
//      reader that can't run is said plainly; nothing was saved.
//   4. Review, calm data: the label step, then the rows with their flags,
//      choosing rows with an exact running total, bulk fixes and each row's
//      own sheet. Probable duplicates are flagged and kept like any row.
//   5. Continue saves corrections, then freezes the selection: "Ready to save
//      342 records". Freezing saves nothing.
//   6. Save confirms the frozen selection in batches (up to 500 rows each)
//      with staged progress, then the server's committed, remaining and
//      conflicted counts. A batch whose answer is lost is resent as itself
//      (same key and body), after a restart too, so nothing is saved twice.
// A kept device draft is offered on reopening. Offline never blocks the
// screen: the import is kept and Try again is offered.
import type { CategoryDto } from '@gogospend/contracts';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { useCopy } from '@mobile/i18n/useCopy';
import {
  awaitPreview,
  chooseReceipt,
  confirmBatches,
  discardImport,
  freezeSelection,
  mapCategory,
  mapWallet,
  newJourney,
  receiptImage,
  reloadPreview,
  resumeImport,
  saveCorrections,
  selectRows,
  startUpload,
} from '@mobile/spend/v1/importReview';
import type { ImportDeps, ImportDraftStore, ImportJourney } from '@mobile/spend/v1/importReview';
import type { ImportFile } from '@mobile/spend/v1/imports';
import {
  REFUSAL_WORDS,
  backToReview,
  blockerLines,
  blockerSummary,
  bulkCategory,
  bulkType,
  bulkWallet,
  canContinue,
  checkPickedFile,
  clearSelection,
  confirmStages,
  fileIssueLines,
  frozenSummary,
  importPhase,
  isResumable,
  labelsToMap,
  leaveOutUnsaveable,
  markChecked,
  parseStages,
  problemNotice,
  resultCounts,
  resumeSummary,
  selectAll,
  setRowDate,
  uploadRefusal,
} from '@mobile/spend/v1/redesign/import/importModel';
import type { ImportPhase, ImportPorts, ImportUi, PickProblem, ReviewFilter } from '@mobile/spend/v1/redesign/import/importModel';
import { classifyLoadProblem } from '@mobile/spend/v1/redesign/homeModel';
import { say } from '@mobile/spend/v1/redesign/shared';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { categoryName, todayInBangkok } from '@mobile/spend/v1/viewModels';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE, POLITE_LIVE_REGION } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { ConfirmSheet, Sheet } from '@mobile/ui/Sheet';
import type { WalletChoice } from '@mobile/ui/WalletPicker';
import { useLoad } from '../../v1/parts';
import { ActionRow } from '../ActionFooter';
import { HISTORY_ROUTE, LoadingBlock, useGoBack } from '../HistoryParts';
import { createDeviceImportPorts } from './ImportDeviceParts';
import { BoxBun, CountLine, ExpectationContent, ImportNotice, ImportPage, MoneyLine, PageHeading, ProgressCard, grouped } from './ImportParts';
import { BulkSheet, LabelStep, MatchSheet, RowSheet, RowsStep, useRowWords } from './ImportReviewParts';
import type { BulkKind, ImportRefs, MatchTarget } from './ImportReviewParts';

export type ImportScreenProps = {
  /** The device and server ports; the app's own when left out. */
  ports?: ImportPorts;
  /** The clock, for tests; today is its Bangkok date. */
  now?: Date;
};

type Running = ImportUi['running'];
type SheetState =
  | { kind: 'expect' }
  | { kind: 'match'; target: MatchTarget }
  | { kind: 'bulk'; what: BulkKind; ids: string[] }
  | { kind: 'row'; id: string }
  | { kind: 'start_over' };
type Step = 'labels' | 'rows';

/** Rows drawn at once; Load more shows the next page. */
const PAGE = 50;
/** Batches one Save runs through before it stops to ask (a bound, never reached by a 5,000-row file). */
const MAX_ROUNDS = 10_000;

const hasLabels = (journey: ImportJourney) => {
  const labels = labelsToMap(journey);
  return labels.wallets.length + labels.expense.length + labels.income.length > 0;
};

export function ImportScreen({ ports: given, now }: ImportScreenProps) {
  const [ports] = useState<ImportPorts>(() => given ?? createDeviceImportPorts());
  const tc = useCopy();
  const router = useRouter();
  const goBack = useGoBack('/spend');
  const resources = useSpendV1();
  const today = todayInBangkok(now ?? new Date());
  const refsLoad = useLoad(async (): Promise<ImportRefs> => {
    const [wallets, categories] = await Promise.all([resources.wallets(), resources.ensureBuiltinCategories()]);
    // Balances don't matter for matching a label, so the choices are names only.
    const choices: WalletChoice[] = wallets.filter((wallet) => !wallet.archived).map(({ id, name, archived }) => ({ id, name, archived }));
    return { wallets: choices, categories: categories.filter((category) => !category.archived) };
  }, [resources]);
  const refs: ImportRefs = refsLoad.state === 'ready' ? refsLoad.data : { wallets: [], categories: [] };

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const [journey, setJourney] = useState<ImportJourney | null>(null);
  const current = useRef<ImportJourney | null>(null);
  const store = useRef<ImportDraftStore | null>(null);
  const [opening, setOpening] = useState(true);
  const [openFailed, setOpenFailed] = useState(false);
  const [resumeOffered, setResumeOffered] = useState(false);
  const [picking, setPicking] = useState(false);
  const [running, setRunningState] = useState<Running>(null);
  const runningRef = useRef<Running>(null);
  const [parseWaiting, setParseWaiting] = useState(false);
  const [pickProblem, setPickProblem] = useState<PickProblem | null>(null);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [step, setStep] = useState<Step>('labels');
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const [shown, setShown] = useState(PAGE);
  /** The picked file, so an upload whose answer was lost can be resent as itself. */
  const file = useRef<ImportFile | null>(null);
  /** The person changed the review on the phone since the draft was last saved. */
  const dirty = useRef(false);

  const show = useCallback((next: ImportJourney | null) => {
    current.current = next;
    if (alive.current) setJourney(next);
  }, []);
  const setRunning = (next: Running) => {
    runningRef.current = next;
    if (alive.current) setRunningState(next);
  };
  const deps = (): ImportDeps => ({ resources: ports.resources, store: store.current as ImportDraftStore, newId: ports.newId, pollMs: ports.pollMs, maxPolls: ports.maxPolls });

  /** Runs one step at a time; a second press while one runs does nothing. */
  async function run(kind: NonNullable<Running>, step: () => Promise<void>) {
    if (runningRef.current) return;
    setRunning(kind);
    try {
      await step();
    } finally {
      setRunning(null);
    }
  }

  /** A change the person makes on the phone (choose, fix, match): kept in the draft when no step is running. */
  const edit = (change: (journey: ImportJourney) => ImportJourney) => {
    const from = current.current;
    if (!from || runningRef.current) return;
    dirty.current = true;
    show(change(from));
  };
  useEffect(() => {
    if (!dirty.current || running !== null || !journey || !store.current) return;
    dirty.current = false;
    void store.current.save(journey).catch(() => undefined);
  }, [journey, running]);

  const open = useCallback(async () => {
    setOpening(true);
    setOpenFailed(false);
    try {
      const opened = await ports.openDraftStore();
      const kept = await resumeImport({ store: opened });
      if (!alive.current) return;
      store.current = opened;
      if (isResumable(kept)) {
        show(kept);
        setResumeOffered(true);
      } else {
        show(null);
        setSheet({ kind: 'expect' });
      }
    } catch {
      if (alive.current) setOpenFailed(true);
    } finally {
      if (alive.current) setOpening(false);
    }
  }, [ports, show]);
  useEffect(() => { void open(); }, [open]);

  const ui: ImportUi = { opening: opening || openFailed, resumeOffered, picking, running, parseWaiting };
  const phase: ImportPhase = importPhase(journey, ui);

  // -------------------------------------------------------------------------
  // Steps

  async function poll() {
    const from = current.current;
    if (!from || !store.current) return;
    setParseWaiting(false);
    await run('parse', async () => {
      const next = await awaitPreview(from, deps());
      show(next);
      if (next.stage === 'parsing' && !next.problem) setParseWaiting(true);
      if (next.stage === 'review') setStep(hasLabels(next) ? 'labels' : 'rows');
    });
  }

  async function upload(picked: ImportFile, base: ImportJourney) {
    if (!store.current) return;
    await run('upload', async () => {
      show(await startUpload(base, picked, deps()));
    });
    const next = current.current;
    if (next?.stage === 'parsing' && !next.problem) await poll();
  }

  async function choose(fresh = false) {
    if (runningRef.current || picking) return;
    setSheet(null);
    setPickProblem(null);
    setPicking(true);
    let picked: Awaited<ReturnType<ImportPorts['pickFile']>>;
    try {
      picked = await ports.pickFile();
    } catch {
      picked = { ok: false, reason: 'unavailable' };
    }
    if (!alive.current) return;
    setPicking(false);
    if (!picked.ok) {
      if (picked.reason !== 'canceled') setPickProblem(picked.reason);
      return;
    }
    const problem = checkPickedFile(picked.file);
    if (problem) {
      setPickProblem(problem);
      return;
    }
    file.current = picked.file;
    const kept = current.current;
    // An upload whose outcome is unknown keeps its key: the same file is sent as the same command.
    const pending = !fresh && kept && kept.pendingUpload && (kept.stage === 'uploading' || kept.stage === 'idle');
    await upload(picked.file, pending ? kept : newJourney());
  }

  async function continueToFrozen() {
    await run('save', async () => {
      let next = current.current as ImportJourney;
      if (Object.keys(next.edits).length > 0 || next.pendingPatch) {
        next = await saveCorrections(next, deps());
        show(next);
        if (next.problem) return;
      }
      show(await freezeSelection(next, deps()));
    });
  }

  async function confirm() {
    await run('confirm', async () => {
      let next = current.current as ImportJourney;
      for (let round = 0; round < MAX_ROUNDS && alive.current; round += 1) {
        const before = next;
        next = await confirmBatches(next, deps(), { maxBatches: 1 });
        show(next);
        if (next.stage === 'done' || next.problem) break;
        const moved = next.committed.length !== before.committed.length || next.conflicted.length !== before.conflicted.length
          || next.remaining.length !== before.remaining.length || next.batchSize !== before.batchSize;
        if (!moved) break;
      }
    });
  }

  async function reload() {
    const from = current.current;
    if (!from) return;
    if (from.stage === 'parsing' || from.stage === 'uploading') {
      await poll();
      return;
    }
    await run('save', async () => { show(await reloadPreview(from, deps())); });
  }

  async function retry() {
    const from = current.current;
    if (!from) return;
    if (from.stage === 'uploading' || (from.stage === 'idle' && from.pendingUpload)) {
      if (file.current) await upload(file.current, from);
      else await choose();
    } else if (from.stage === 'confirming') {
      await confirm();
    } else if (from.stage === 'review') {
      await continueToFrozen();
    } else if (from.stage === 'parsing') {
      await poll();
    }
  }

  async function startOver(explain: boolean) {
    setSheet(null);
    if (store.current) await discardImport({ store: store.current }).catch(() => undefined);
    file.current = null;
    dirty.current = false;
    show(null);
    setResumeOffered(false);
    setParseWaiting(false);
    setPickProblem(null);
    setFilter('all');
    setShown(PAGE);
    setStep('labels');
    if (explain && alive.current) setSheet({ kind: 'expect' });
  }

  function resume() {
    setResumeOffered(false);
    setStep('labels');
    if (current.current?.stage === 'parsing') void poll();
  }

  function anotherFile() {
    file.current = null;
    show(null);
    setFilter('all');
    setShown(PAGE);
    setStep('labels');
  }

  // -------------------------------------------------------------------------
  // Drawing

  // A request whose outcome is unknown is said so even when the draft was kept before its problem was (a restart mid-request).
  const unknown = phase === 'upload_unconfirmed' || phase === 'unconfirmed';
  const problem = journey ? problemNotice(journey.problem ?? (unknown ? { kind: 'unconfirmed' } : null), phase) : null;
  const problemAction = problem?.action
    ? {
        label: problem.action === 'without_receipt'
          ? tc('Save without the photo')
          : problem.action === 'reload' && journey?.problem?.kind === 'review_changed'
            ? tc('Reload')
            : phase === 'upload_unconfirmed' && !file.current ? tc('Choose the file again') : tc('Try again'),
        busy: running !== null,
        onPress: () => {
          if (problem.action === 'without_receipt') {
            const from = current.current;
            if (from) show(chooseReceipt(from, false));
            void confirm();
          } else if (problem.action === 'reload') void reload();
          else void retry();
        },
      }
    : undefined;
  const problemView = problem ? (
    <ImportNotice testID={journey?.problem?.kind === 'offline' ? 'import-offline' : 'import-problem'} message={say(tc, problem.text)} tone={problem.tone} action={problemAction} />
  ) : null;

  const sheets = (
    <ImportSheets
      sheet={sheet}
      journey={journey}
      refs={refs}
      today={today}
      onClose={() => setSheet(null)}
      onChoose={() => void choose()}
      onStartOver={() => void startOver(true)}
      edit={edit}
      openBulk={(what, ids) => setSheet({ kind: 'bulk', what, ids })}
    />
  );

  if (phase === 'opening') {
    return (
      <ImportPage>
        {openFailed ? (
          <ImportNotice
            testID="import-offline"
            tone="status"
            message={tc("Couldn't reach Jotbun. Import needs a connection; your import is kept on this phone.")}
            action={{ label: tc('Try again'), onPress: () => void open() }}
          />
        ) : <LoadingBlock label={tc('Opening your import')} />}
      </ImportPage>
    );
  }

  if (phase === 'resume' && journey) {
    const summary = resumeSummary(journey);
    return (
      <ImportPage footer={<ActionRow secondary={<PillButton kind="secondary" label={tc('Start over')} onPress={() => setSheet({ kind: 'start_over' })} />} primary={<PillButton label={tc('Continue')} onPress={resume} />} />}>
        <Card testID="import-resume">
          <PageHeading>{tc('Pick up where you left off?')}</PageHeading>
          {summary ? <BunText>{say(tc, summary)}</BunText> : null}
          {journey.pendingBatch ? <BunText tone="muted">{tc("The last batch wasn't confirmed. Continuing checks it first, so nothing is saved twice.")}</BunText> : null}
        </Card>
        {sheets}
      </ImportPage>
    );
  }

  if (phase === 'start' || phase === 'picking') {
    const refusal = journey ? uploadRefusal(journey.problem) : null;
    const words = pickProblem && pickProblem !== 'canceled' ? REFUSAL_WORDS[pickProblem] : refusal && refusal !== 'uploads_off' ? REFUSAL_WORDS[refusal] : null;
    const footer = phase === 'picking' ? undefined : (
      <ActionRow
        secondary={<PillButton kind="secondary" label={tc('What import does')} onPress={() => setSheet({ kind: 'expect' })} />}
        primary={<PillButton label={tc('Choose a file')} onPress={() => void choose()} />}
      />
    );
    return (
      <ImportPage footer={footer}>
        <View testID="import-start" style={{ gap: BUN_SPACE.md }}>
          <BoxBun />
          <PageHeading>{tc('Bring in your records')}</PageHeading>
          <BunText>{tc('Import an export from another money app, or a photo of a receipt. You check every row before anything is saved.')}</BunText>
          {phase === 'picking' ? (
            <View {...POLITE_LIVE_REGION}>
              <LoadingBlock label={tc('Opening your files…')} />
            </View>
          ) : null}
          {words ? <ImportNotice tone="alert" message={tc(words)} /> : null}
          {problemView}
        </View>
        {sheets}
      </ImportPage>
    );
  }

  if (phase === 'uploads_off') {
    return (
      <ImportPage footer={<PillButton label={tc('Done')} onPress={goBack} />}>
        <Card testID="import-uploads-off">
          <PageHeading>{tc("Import isn't switched on yet")}</PageHeading>
          <BunText>{tc("Jotbun isn't taking files right now, so your file wasn't uploaded and nothing was saved. Import will open in a later update.")}</BunText>
        </Card>
      </ImportPage>
    );
  }

  if (phase === 'uploading' || phase === 'upload_unconfirmed' || phase === 'parsing' || phase === 'parse_waiting') {
    const footer = phase === 'parse_waiting' ? <PillButton label={tc('Check again')} onPress={() => void poll()} /> : undefined;
    return (
      <ImportPage footer={footer}>
        <ProgressCard stages={parseStages(phase)} title={tc('Reading your file')} bun nothingSaved />
        {phase === 'parse_waiting' ? (
          <View {...POLITE_LIVE_REGION}>
            <BunText>{tc("Your file is uploaded but hasn't been read yet. Jotbun's file reader may be paused on our side. Nothing has been saved. Check again later: the file is kept for 24 hours.")}</BunText>
          </View>
        ) : null}
        {problemView}
      </ImportPage>
    );
  }

  if (phase === 'parse_failed') {
    return (
      <ImportPage footer={<ActionRow secondary={<PillButton kind="secondary" label={tc('Start over')} onPress={() => void startOver(false)} />} primary={<PillButton label={tc('Done')} onPress={goBack} />} />}>
        <View testID="import-parse-failed" style={{ gap: BUN_SPACE.md }}>
          <ProgressCard stages={parseStages(phase)} title={tc('Reading your file')} />
          <Card>
            <PageHeading>{tc("Your file wasn't read")}</PageHeading>
            <BunText>{tc("Jotbun couldn't read your file because its file reader isn't running on our side right now. It's not a problem with your file. Nothing was saved.")}</BunText>
          </Card>
        </View>
      </ImportPage>
    );
  }

  if (phase === 'rejected' && journey) {
    return (
      <ImportPage footer={<PillButton label={tc('Choose another file')} onPress={() => { void startOver(false).then(() => choose(true)); }} />}>
        <Card testID="import-rejected">
          <PageHeading>{tc("This file couldn't be read")}</PageHeading>
          {fileIssueLines(journey).map((line) => <BunText key={line.text}>{say(tc, line)}</BunText>)}
          <BunText tone="muted">{tc('Nothing was saved.')}</BunText>
        </Card>
      </ImportPage>
    );
  }

  if (phase === 'expired' && journey) {
    const saved = journey.committed.length;
    return (
      <ImportPage footer={<PillButton label={tc('Start over')} onPress={() => void startOver(false)} />}>
        <Card testID="import-expired">
          <PageHeading>{tc('This import has expired')}</PageHeading>
          <BunText>{tc('Nothing more can be saved from it. Import the file again to start over.')}</BunText>
          {saved > 0 ? <BunText tone="muted">{saved === 1 ? tc('1 record was saved before it expired.') : tc('{count} records were saved before it expired.', { count: grouped(saved) })}</BunText> : null}
        </Card>
      </ImportPage>
    );
  }

  if (phase === 'review' && journey) {
    const refsProblem = refsLoad.state === 'error' ? classifyLoadProblem(refsLoad.error, tc) : null;
    const refsNotice = refsProblem ? <ImportNotice tone="alert" message={refsProblem.message} action={refsProblem.retry ? { label: tc('Try again'), onPress: refsLoad.reload } : undefined} /> : null;
    if (step === 'labels') {
      return (
        <ImportPage footer={<>{problemView}<PillButton label={tc('Next: check rows')} onPress={() => { setStep('rows'); }} /></>}>
          {refsNotice}
          {refsLoad.state === 'loading' ? <LoadingBlock label={tc('Loading your wallets')} /> : null}
          <LabelStep journey={journey} refs={refs} onOpen={(target) => setSheet({ kind: 'match', target })} />
          {sheets}
        </ImportPage>
      );
    }
    const lines = blockerLines(blockerSummary(journey));
    const unsaveable = blockerSummary(journey).missing + blockerSummary(journey).transfer;
    const footer = (
      <>
        {problemView}
        {lines.length > 0 ? (
          <View {...POLITE_LIVE_REGION} style={{ gap: BUN_SPACE.xxs }}>
            {lines.map((line) => <BunText key={line.text} variant="caption" tone="muted">{say(tc, line)}</BunText>)}
          </View>
        ) : null}
        <ActionRow
          secondary={<PillButton kind="secondary" label={tc('Match labels')} onPress={() => setStep('labels')} />}
          primary={<PillButton label={tc('Continue')} busy={running === 'save'} busyLabel={tc('Saving your changes…')} disabled={!canContinue(journey)} onPress={() => void continueToFrozen()} />}
        />
      </>
    );
    return (
      <ImportPage footer={footer}>
        {refsNotice}
        <RowsStep
          journey={journey}
          refs={refs}
          today={today}
          filter={filter}
          onFilter={(next) => { setFilter(next); setShown(PAGE); }}
          shown={shown}
          onMore={() => setShown((count) => count + PAGE)}
          onToggle={(id) => edit((from) => selectRows(from, [id], !from.selected.includes(id)))}
          onOpenRow={(id) => setSheet({ kind: 'row', id })}
          onSelectAll={() => edit(selectAll)}
          onClear={() => edit(clearSelection)}
          onBulk={(what) => setSheet({ kind: 'bulk', what, ids: [...journey.selected] })}
          onMarkChecked={() => edit((from) => markChecked(from, from.selected))}
          onLeaveOut={() => edit(leaveOutUnsaveable)}
          unsaveable={unsaveable}
        />
        {sheets}
      </ImportPage>
    );
  }

  if (phase === 'frozen' && journey) {
    const summary = frozenSummary(journey);
    const receipt = receiptImage(journey);
    const footer = (
      <>
        {problemView}
        <ActionRow
          secondary={<PillButton kind="secondary" label={tc('Back to review')} onPress={() => {
            const back = backToReview(journey);
            if (!back) return;
            dirty.current = true;
            show(back);
            setStep('rows');
          }} />}
          primary={<PillButton label={summary.count === 1 ? tc('Save 1 record') : tc('Save {count} records', { count: grouped(summary.count) })} onPress={() => void confirm()} />}
        />
      </>
    );
    return (
      <ImportPage footer={footer}>
        <View testID="import-frozen" style={{ gap: BUN_SPACE.md }}>
          <PageHeading>{summary.count === 1 ? tc('Ready to save 1 record') : tc('Ready to save {count} records', { count: grouped(summary.count) })}</PageHeading>
          <Card>
            <MoneyLine label={tc('Money out')} spoken={(amount) => tc('Money out {amount}', { amount })} minor={summary.outMinor} />
            <MoneyLine label={tc('Money in')} spoken={(amount) => tc('Money in {amount}', { amount })} minor={summary.inMinor} />
          </Card>
          {receipt ? <ReceiptChoice keep={journey.keepReceipt} onToggle={() => edit((from) => chooseReceipt(from, !from.keepReceipt))} /> : null}
          <BunText tone="muted">{tc('Nothing is saved yet. Records are saved in batches of up to 500; if the connection drops, nothing is saved twice.')}</BunText>
        </View>
      </ImportPage>
    );
  }

  if ((phase === 'confirming' || phase === 'unconfirmed' || phase === 'paused') && journey) {
    const counts = resultCounts(journey);
    // Paused with nothing pending: Continue saving sends the next batch (a refused one saved nothing, so it may go again).
    const footer = phase === 'paused' && !problem?.action ? <PillButton label={tc('Continue saving')} onPress={() => void confirm()} /> : undefined;
    return (
      <ImportPage footer={footer}>
        <View testID={phase === 'unconfirmed' ? 'import-unconfirmed' : 'import-confirming'} style={{ gap: BUN_SPACE.md }}>
          <ProgressCard stages={confirmStages(journey, phase === 'confirming')} title={tc('Saving your records')} />
          {phase === 'paused' ? (
            <BunText tone="muted">{tc('Saving stopped at {committed} of {total}. The rest are kept for when you continue.', { committed: grouped(counts.committed), total: grouped(counts.total) })}</BunText>
          ) : null}
          {problemView}
        </View>
      </ImportPage>
    );
  }

  if (phase === 'done' && journey) {
    return (
      <ImportPage footer={<ActionRow secondary={<PillButton kind="secondary" label={tc('Import another file')} onPress={anotherFile} />} primary={<PillButton label={tc('See them in History')} onPress={() => router.replace(HISTORY_ROUTE)} />} />}>
        <ResultView journey={journey} refs={refs} today={today} />
      </ImportPage>
    );
  }

  // A state with nothing to draw yet (the journey just changed).
  return <ImportPage><LoadingBlock label={tc('Opening your import')} /></ImportPage>;
}

/** The person's explicit choice to keep the receipt photo with its record (never chosen for them). */
function ReceiptChoice({ keep, onToggle }: { keep: boolean; onToggle: () => void }) {
  const tc = useCopy();
  const colors = useBunColors();
  const label = tc('Keep the receipt photo with this record. It stays until you remove it, delete the record for good (30 days after deleting it) or delete your account.');
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: keep }}
      aria-checked={keep}
      onPress={onToggle}
      style={{ minHeight: BUN_TOUCH, flexDirection: 'row', alignItems: 'flex-start', gap: BUN_SPACE.sm }}
    >
      <View
        {...DECORATIVE}
        style={{ width: 24, height: 24, borderRadius: BUN_RADIUS.chip / 2, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, backgroundColor: keep ? colors.ink : 'transparent', alignItems: 'center', justifyContent: 'center' }}
      >
        {keep ? <BunText variant="caption" tone="onInk">✓</BunText> : null}
      </View>
      <BunText style={{ flex: 1 }}>{label}</BunText>
    </Pressable>
  );
}

/** The result: the server's committed, remaining and conflicted counts, and the rows that weren't saved. */
function ResultView({ journey, refs, today }: { journey: ImportJourney; refs: ImportRefs; today: string }) {
  const tc = useCopy();
  const rowWords = useRowWords(refs, today);
  const counts = resultCounts(journey);
  const heading = counts.conflicted > 0 || counts.remaining > 0
    ? tc('Saved {committed} of {total} records', { committed: grouped(counts.committed), total: grouped(counts.total) })
    : counts.committed === 1 ? tc('Saved 1 record') : tc('Saved {count} records', { count: grouped(counts.committed) });
  return (
    <View testID="import-result" style={{ gap: BUN_SPACE.md }}>
      <View {...POLITE_LIVE_REGION}>
        <PageHeading>{heading}</PageHeading>
      </View>
      <ProgressCard stages={confirmStages(journey, false)} />
      <Card>
        <CountLine label={tc('Saved')} spoken={tc('Saved: {count}', { count: grouped(counts.committed) })} count={counts.committed} />
        <CountLine label={tc('Still to save')} spoken={tc('Still to save: {count}', { count: grouped(counts.remaining) })} count={counts.remaining} />
        <CountLine label={tc("Couldn't save")} spoken={tc("Couldn't save: {count}", { count: grouped(counts.conflicted) })} count={counts.conflicted} />
      </Card>
      {counts.conflicted > 0 ? (
        <View style={{ gap: BUN_SPACE.xs }}>
          <BunText>
            {counts.conflicted === 1
              ? tc("1 record wasn't saved because its wallet or category was archived after you chose it. Add it by hand if you still want it.")
              : tc("{count} records weren't saved because their wallet or category was archived after you chose them. Add them by hand if you still want them.", { count: grouped(counts.conflicted) })}
          </BunText>
          <View role="list" accessibilityLabel={tc("Records that weren't saved")}>
            {journey.conflicted.map((id) => {
              const words = rowWords(journey, id);
              return words ? (
                <View key={id} role="listitem" accessible accessibilityLabel={words.spoken} style={{ flexDirection: 'row', gap: BUN_SPACE.sm, paddingVertical: BUN_SPACE.xs }}>
                  <BunText style={{ flex: 1 }}>{words.title}</BunText>
                  <BunText variant="label" style={{ fontVariant: ['tabular-nums'] }}>{words.amount}</BunText>
                </View>
              ) : null;
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Every sheet the journey opens; at most one shows at a time. */
function ImportSheets({
  sheet, journey, refs, today, onClose, onChoose, onStartOver, edit, openBulk,
}: {
  sheet: SheetState | null;
  journey: ImportJourney | null;
  refs: ImportRefs;
  today: string;
  onClose: () => void;
  onChoose: () => void;
  onStartOver: () => void;
  edit: (change: (journey: ImportJourney) => ImportJourney) => void;
  openBulk: (what: BulkKind, ids: string[]) => void;
}) {
  const tc = useCopy();
  if (!sheet) return null;
  if (sheet.kind === 'expect') {
    return (
      <Sheet visible onClose={onClose} title={tc('What import does')}>
        <ExpectationContent onChoose={onChoose} />
      </Sheet>
    );
  }
  if (sheet.kind === 'start_over') {
    return (
      <ConfirmSheet
        visible
        destructive
        title={tc('Start over?')}
        consequence={tc("This import's review is removed from this phone. Records already saved stay saved.")}
        confirmLabel={tc('Start over')}
        onConfirm={onStartOver}
        onCancel={onClose}
      />
    );
  }
  if (!journey) return null;
  const nameOf = (category: CategoryDto) => categoryName(category, tc);
  if (sheet.kind === 'match') {
    const { target } = sheet;
    return (
      <MatchSheet
        journey={journey}
        target={target}
        refs={refs}
        onClose={onClose}
        onMatch={(id) => {
          edit((from) => (target.kind === 'wallet' ? mapWallet(from, target.label, id) : mapCategory(from, target.kind, target.label, id)));
          onClose();
        }}
      />
    );
  }
  if (sheet.kind === 'bulk') {
    const { ids } = sheet;
    return (
      <BulkSheet
        journey={journey}
        kind={sheet.what}
        ids={ids}
        refs={refs}
        onClose={onClose}
        onType={(type) => {
          edit((from) => bulkType(from, ids, type));
          onClose();
        }}
        onCategory={(category) => {
          if (category.type !== 'expense' && category.type !== 'income') return;
          const type = category.type;
          edit((from) => bulkCategory(from, ids, { id: category.id, type }, nameOf(category)).journey);
          onClose();
        }}
        onWallet={(wallet) => {
          edit((from) => bulkWallet(from, ids, { id: wallet.id }, wallet.name));
          onClose();
        }}
      />
    );
  }
  const { id } = sheet;
  return (
    <RowSheet
      journey={journey}
      id={id}
      refs={refs}
      today={today}
      onClose={onClose}
      onDate={(date) => edit((from) => setRowDate(from, id, date))}
      onType={(type) => edit((from) => bulkType(from, [id], type))}
      onCategory={() => openBulk('category', [id])}
      onWallet={() => openBulk('wallet', [id])}
      onToggle={() => edit((from) => selectRows(from, [id], !from.selected.includes(id)))}
      onChecked={() => {
        edit((from) => markChecked(from, [id]));
        onClose();
      }}
    />
  );
}
