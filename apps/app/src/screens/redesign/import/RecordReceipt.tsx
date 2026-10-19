// R7: a record's receipt photo (plan §6.5), behind the `import` area until E2
// checkpoint 5. With the area off it draws nothing, so the approved Record
// screen is unchanged.
//
// Record renders it under the receipt slip with only the record's id and
// version; the panel reads the record itself (which receipt it holds, at
// which version) and takes everything else from its ports (ReceiptParts.tsx).
//
// - View: a thumbnail from bytes downloaded through a five-minute grant and
//   checked against it. Full screen uses the grant while it has time left and
//   asks for a fresh one after that; nothing is drawn until the bytes are
//   there, so an expired grant never shows a broken image.
// - Attach and replace: pick a photo (checked on the phone), then the consent
//   sheet, and only then upload it as an image import, wait for the server's
//   cleaned copy and its attachment id, and retain (or replace) it on the
//   record with the record's version.
// - Remove: a confirm sheet that says it can't be undone, then remove.
// - Every command keeps its key until its outcome is known. An unknown
//   outcome freezes the panel, and Try again resends the same command, key,
//   version and body. A record that changed elsewhere asks for a reload.
import { ATTACHMENT_MAX_BYTES } from '@gogospend/contracts';
import type { AttachmentGrant } from '@gogospend/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { V1Error } from '@mobile/api/client';
import { isRedesignEnabled } from '@mobile/config/featureFlags';
import { useCopy } from '@mobile/i18n/useCopy';
import { FROZEN_WORDS, REFUSED_WORDS, attachableFrom, classifyFailure, dataUriOf, freezes, grantUsable, receiptFile } from '@mobile/spend/v1/redesign/import/receiptModel';
import type { ReceiptCommand, ReceiptMode } from '@mobile/spend/v1/redesign/import/receiptModel';
import type { ImportFile } from '@mobile/spend/v1/imports';
import { useSpendV1 } from '@mobile/spend/v1/SpendV1Context';
import { BunText } from '@mobile/ui/BunText';
import { Card } from '@mobile/ui/Card';
import { BUN_SPACE } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { ConfirmSheet } from '@mobile/ui/Sheet';
import { saveProblem } from '../../v1/parts';
import { Notice } from '../HistoryParts';
import { ReceiptConsentSheet, ReceiptThumbnail, ReceiptViewer, ReceiptWorking, useReceiptPorts } from './ReceiptParts';
import type { ReceiptPorts, ViewerState } from './ReceiptParts';

export type RecordReceiptProps = {
  recordId: string;
  version: number;
  /** Tests and the catalogue: fakes for any port (otherwise the provider's, then the app's). */
  ports?: Partial<ReceiptPorts>;
  /**
   * The record moved on: a receipt was kept, replaced or removed, at this new
   * version. Record reads the record again, so its own Edit and Delete never
   * send the version it held before.
   */
  onChanged?: (version: number) => void;
};

export function RecordReceipt(props: RecordReceiptProps) {
  if (!isRedesignEnabled('import')) return null;
  return <ReceiptPanel {...props} />;
}

/** What the record holds, as last read or acknowledged. */
type Held = { attachmentId: string | null; version: number };
type Step =
  | { kind: 'loading' }
  | { kind: 'load_problem'; message: string }
  | { kind: 'idle' }
  | { kind: 'consent'; mode: ReceiptMode; file: ImportFile }
  | { kind: 'confirm_remove' }
  | { kind: 'working'; label: string }
  /** The outcome is unknown or waits for room: only Try again, with this exact command. */
  | { kind: 'frozen'; command: ReceiptCommand; message: string }
  /** The server is still preparing the photo of this upload. */
  | { kind: 'slow'; mode: ReceiptMode; jobId: string }
  | { kind: 'conflict' }
  | { kind: 'gone' };
type Photo = { state: 'none' } | { state: 'loading' } | { state: 'ready'; uri: string; grant: AttachmentGrant } | { state: 'problem'; message: string };

const MEGABYTE = 1024 * 1024;

/** The panel itself, with no area check (the catalogue draws it directly). */
export function ReceiptPanel({ recordId, version, ports: injected, onChanged }: RecordReceiptProps) {
  const tc = useCopy();
  const resources = useSpendV1();
  const ports = useReceiptPorts(injected);
  const portsRef = useRef(ports);
  portsRef.current = ports;

  const [held, setHeldState] = useState<Held | null>(null);
  const heldRef = useRef<Held | null>(null);
  const [step, setStepState] = useState<Step>({ kind: 'loading' });
  const stepRef = useRef<Step>(step);
  const [photo, setPhoto] = useState<Photo>({ state: 'none' });
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploadsOff, setUploadsOff] = useState(false);
  const alive = useRef(true);
  const readTurn = useRef(0);
  const photoTurn = useRef(0);
  const viewerTurn = useRef(0);
  const acting = useRef(false);

  const setHeld = (next: Held) => {
    heldRef.current = next;
    setHeldState(next);
  };
  const setStep = (next: Step) => {
    stepRef.current = next;
    setStepState(next);
  };
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const photoProblem = useCallback(
    (error: unknown) => (error instanceof V1Error && error.outcome === 'network' ? tc("You're offline. The receipt photo shows when you're back online.") : tc("The receipt photo didn't load.")),
    [tc],
  );

  /** A grant and its checked bytes; a grant that lapses on the way is replaced once with a fresh one. */
  const fetchPhoto = useCallback(async (attachmentId: string): Promise<{ uri: string; grant: AttachmentGrant }> => {
    const { attachments } = portsRef.current;
    for (let attempt = 0; ; attempt += 1) {
      const grant = await attachments.grant(attachmentId);
      try {
        return { uri: dataUriOf(grant.content_type, await attachments.file(grant)), grant };
      } catch (error) {
        if (attempt === 0 && error instanceof V1Error && error.outcome === 'not_found') continue;
        throw error;
      }
    }
  }, []);

  const loadPhoto = useCallback(async (attachmentId: string) => {
    const turn = ++photoTurn.current;
    setPhoto({ state: 'loading' });
    try {
      const got = await fetchPhoto(attachmentId);
      if (alive.current && turn === photoTurn.current) setPhoto({ state: 'ready', ...got });
    } catch (error) {
      if (alive.current && turn === photoTurn.current) setPhoto({ state: 'problem', message: photoProblem(error) });
    }
  }, [fetchPhoto, photoProblem]);

  const clearPhoto = () => {
    photoTurn.current += 1;
    setPhoto({ state: 'none' });
  };

  /** Reads which receipt the record holds now, at which version. */
  const readRecord = useCallback(async () => {
    const turn = ++readTurn.current;
    if (!heldRef.current) setStep({ kind: 'loading' });
    try {
      const record = await resources.transaction(recordId);
      if (!alive.current || turn !== readTurn.current) return;
      const next = { attachmentId: record.attachment_id ?? null, version: record.version };
      setHeld(next);
      setStep({ kind: 'idle' });
      if (next.attachmentId) void loadPhoto(next.attachmentId);
      else clearPhoto();
    } catch (error) {
      if (!alive.current || turn !== readTurn.current) return;
      const outcome = error instanceof V1Error ? error.outcome : undefined;
      if (outcome === 'not_found' || outcome === 'deleted' || outcome === 'purged') setStep({ kind: 'gone' });
      else setStep({ kind: 'load_problem', message: photoProblem(error) });
    }
  }, [resources, recordId, loadPhoto, photoProblem]);

  // The record's version moving (an edit on Record) means another read; never while a command is open.
  useEffect(() => {
    const open = ['consent', 'confirm_remove', 'working', 'frozen', 'slow'].includes(stepRef.current.kind);
    if (!open) void readRecord();
  }, [readRecord, version]);

  function failed(command: ReceiptCommand, error: unknown) {
    const problem = classifyFailure(error, command.kind);
    const frozen = FROZEN_WORDS[problem];
    if (freezes(problem) && frozen) {
      setStep({ kind: 'frozen', command, message: tc(frozen) });
      return;
    }
    if (problem === 'conflict') return setStep({ kind: 'conflict' });
    if (problem === 'gone') return setStep({ kind: 'gone' });
    if (problem === 'uploads_off') setUploadsOff(true);
    else if (problem === 'blocked') setNotice(saveProblem(error, tc).message);
    else if (problem === 'too_large') setNotice(tc('Choose a photo up to {size} MB.', { size: ATTACHMENT_MAX_BYTES / MEGABYTE }));
    else setNotice(tc(REFUSED_WORDS[problem] ?? (REFUSED_WORDS.failed as string)));
    setStep({ kind: 'idle' });
  }

  /** Checks the upload's preview until its photo can be kept, then keeps it on the record. */
  async function waitForPhoto(mode: ReceiptMode, jobId: string) {
    const { uploads, sleep, pollMs, maxPolls, now, newId } = portsRef.current;
    setStep({ kind: 'working', label: tc('Getting the photo ready…') });
    for (let poll = 0; poll < maxPolls; poll += 1) {
      if (poll > 0) await sleep(pollMs);
      if (!alive.current) return;
      let found: ReturnType<typeof attachableFrom>;
      try {
        found = attachableFrom(await uploads.preview(jobId), now());
      } catch (error) {
        if (error instanceof V1Error && error.outcome === 'not_found') found = { kind: 'unusable' };
        else return setStep({ kind: 'slow', mode, jobId });
      }
      if (found.kind === 'unusable') {
        setNotice(tc("Jotbun couldn't use this photo. Try another one."));
        return setStep({ kind: 'idle' });
      }
      if (found.kind === 'attachable') {
        const current = heldRef.current;
        if (!current) return setStep({ kind: 'idle' });
        // A new command for the photo: its own key, on the version the record is at now.
        await run({ kind: mode === 'attach' ? 'retain' : 'replace', key: newId(), version: current.version, attachmentId: found.attachmentId });
        return;
      }
    }
    setStep({ kind: 'slow', mode, jobId });
  }

  async function run(command: ReceiptCommand) {
    const { attachments, uploads } = portsRef.current;
    if (command.kind === 'upload') {
      setStep({ kind: 'working', label: tc('Sending the photo…') });
      let jobId: string;
      try {
        jobId = (await uploads.upload(command.file, command.key)).job_id;
      } catch (error) {
        return failed(command, error);
      }
      return waitForPhoto(command.mode, jobId);
    }
    try {
      if (command.kind === 'remove') {
        setStep({ kind: 'working', label: tc('Removing the photo…') });
        const ack = await attachments.remove(recordId, command.version, command.key);
        setHeld({ attachmentId: null, version: ack.version });
        onChanged?.(ack.version);
        clearPhoto();
        setNotice(tc('Receipt photo removed.'));
        return setStep({ kind: 'idle' });
      }
      setStep({ kind: 'working', label: tc('Saving…') });
      const input = { attachment_id: command.attachmentId };
      const ack = command.kind === 'retain'
        ? await attachments.retain(recordId, command.version, input, command.key)
        : await attachments.replace(recordId, command.version, input, command.key);
      setHeld({ attachmentId: command.attachmentId, version: ack.version });
      onChanged?.(ack.version);
      setStep({ kind: 'idle' });
      void loadPhoto(command.attachmentId);
    } catch (error) {
      failed(command, error);
    }
  }

  /** One action at a time; a frozen command is resent exactly as it was. */
  async function act(work: () => Promise<void>) {
    if (acting.current) return;
    acting.current = true;
    try {
      await work();
    } finally {
      acting.current = false;
    }
  }
  const send = (command: ReceiptCommand) => act(async () => {
    setNotice(null);
    await run(command);
  });

  const startAttach = (mode: ReceiptMode) => act(async () => {
    setNotice(null);
    const picked = await portsRef.current.picker.pick();
    if (picked.kind === 'cancelled') return;
    if (picked.kind !== 'picked') {
      setNotice(picked.kind === 'denied' ? tc('Allow Jotbun to use your photos to attach one.') : tc("Photos aren't available right now."));
      return;
    }
    const checked = receiptFile(picked.photo);
    if (checked.ok) setStep({ kind: 'consent', mode, file: checked.file });
    else if (checked.reason === 'too_large') setNotice(tc('Choose a photo up to {size} MB.', { size: ATTACHMENT_MAX_BYTES / MEGABYTE }));
    else if (checked.reason === 'empty') setNotice(tc('This photo is empty. Choose another one.'));
    else setNotice(tc('Choose a JPEG, PNG or WebP photo.'));
  });

  const keep = () => {
    const current = stepRef.current;
    if (current.kind !== 'consent') return;
    // Consent given: only now does anything leave the phone, under a new key.
    void send({ kind: 'upload', mode: current.mode, key: portsRef.current.newId(), file: current.file });
  };
  const confirmRemove = () => {
    const current = heldRef.current;
    if (!current) return;
    void send({ kind: 'remove', key: portsRef.current.newId(), version: current.version });
  };

  async function showFresh(turn: number) {
    const attachmentId = heldRef.current?.attachmentId;
    if (!attachmentId) return;
    setViewer({ state: 'loading' });
    try {
      const got = await fetchPhoto(attachmentId);
      if (!alive.current || turn !== viewerTurn.current) return;
      photoTurn.current += 1;
      setPhoto({ state: 'ready', ...got });
      setViewer({ state: 'ready', uri: got.uri });
    } catch (error) {
      if (alive.current && turn === viewerTurn.current) setViewer({ state: 'problem', message: photoProblem(error) });
    }
  }
  /** Full screen through a grant with time left; past that, a fresh grant first. */
  const openViewer = () => {
    const turn = ++viewerTurn.current;
    if (photo.state === 'ready' && grantUsable(photo.grant, portsRef.current.now())) setViewer({ state: 'ready', uri: photo.uri });
    else void showFresh(turn);
  };
  const closeViewer = () => {
    viewerTurn.current += 1;
    setViewer(null);
  };

  let content: ReactNode;
  switch (step.kind) {
    case 'loading':
      content = <ReceiptWorking label={tc('Loading the receipt photo…')} />;
      break;
    case 'load_problem':
      content = <Notice tone="alert" message={step.message} action={{ label: tc('Try again'), onPress: () => void readRecord() }} />;
      break;
    case 'gone':
      content = <Notice tone="alert" message={tc("This entry isn't in your diary.")} />;
      break;
    case 'conflict':
      content = <Notice tone="alert" message={tc('This entry changed on another device.')} action={{ label: tc('Reload'), onPress: () => void readRecord() }} />;
      break;
    case 'frozen':
      content = <Notice tone="alert" message={step.message} action={{ label: tc('Try again'), onPress: () => void send(step.command) }} />;
      break;
    case 'working':
      content = <ReceiptWorking label={step.label} />;
      break;
    case 'slow':
      content = <Notice message={tc('Still getting the photo ready.')} action={{ label: tc('Check again'), onPress: () => void act(() => waitForPhoto(step.mode, step.jobId)) }} />;
      break;
    default:
      content = held ? <HeldReceipt held={held} photo={photo} uploadsOff={uploadsOff} onAttach={() => void startAttach('attach')} onReplace={() => void startAttach('replace')}
        onRemove={() => setStep({ kind: 'confirm_remove' })} onOpen={openViewer} onRetryPhoto={() => held.attachmentId && void loadPhoto(held.attachmentId)} /> : null;
  }

  return (
    <Card testID="record-receipt">
      <BunText variant="heading" role="heading" accessibilityRole="header">{tc('Receipt photo')}</BunText>
      {notice ? <Notice message={notice} /> : null}
      {content}
      <ReceiptConsentSheet
        visible={step.kind === 'consent'}
        mode={step.kind === 'consent' ? step.mode : 'attach'}
        onKeep={keep}
        onCancel={() => setStep({ kind: 'idle' })}
      />
      <ConfirmSheet
        visible={step.kind === 'confirm_remove'}
        title={tc('Remove the receipt photo?')}
        consequence={tc("The photo is deleted for good. This can't be undone, and restoring the entry won't bring it back.")}
        confirmLabel={tc('Remove the photo')}
        cancelLabel={tc('Keep it')}
        destructive
        onConfirm={confirmRemove}
        onCancel={() => setStep({ kind: 'idle' })}
      />
      <ReceiptViewer visible={viewer !== null} view={viewer ?? { state: 'loading' }} onClose={closeViewer} onRetry={() => void showFresh(++viewerTurn.current)} />
    </Card>
  );
}

function HeldReceipt({ held, photo, uploadsOff, onAttach, onReplace, onRemove, onOpen, onRetryPhoto }: {
  held: Held; photo: Photo; uploadsOff: boolean; onAttach: () => void; onReplace: () => void; onRemove: () => void; onOpen: () => void; onRetryPhoto: () => void;
}) {
  const tc = useCopy();
  const off = uploadsOff ? <BunText testID="receipt-uploads-off">{tc("Adding receipt photos isn't switched on yet.")}</BunText> : null;
  if (!held.attachmentId) {
    return (
      <View style={{ gap: BUN_SPACE.sm }}>
        <BunText tone="muted">{tc('No receipt photo on this entry.')}</BunText>
        {off ?? <PillButton kind="secondary" label={tc('Attach a receipt photo')} onPress={onAttach} />}
      </View>
    );
  }
  if (photo.state === 'problem') return <Notice tone="alert" message={photo.message} action={{ label: tc('Try again'), onPress: onRetryPhoto }} />;
  if (photo.state !== 'ready') return <ReceiptWorking label={tc('Loading the receipt photo…')} />;
  return (
    <View style={{ flexDirection: 'row', gap: BUN_SPACE.md, alignItems: 'flex-start' }}>
      <ReceiptThumbnail uri={photo.uri} onPress={onOpen} />
      <View style={{ flex: 1, gap: BUN_SPACE.sm }}>
        {off ?? <PillButton kind="secondary" label={tc('Replace photo')} onPress={onReplace} />}
        <PillButton kind="secondary" label={tc('Remove photo')} onPress={onRemove} />
      </View>
    </View>
  );
}
