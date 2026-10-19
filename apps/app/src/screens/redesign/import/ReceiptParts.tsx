// R7: the parts of a record's receipt photo (plan §6.5) and the ports it
// works through. The panel (RecordReceipt.tsx) gets only the record's id,
// version and receipt id, so everything else comes from here: the attachment
// and upload ports, the photo picker, ids and the clock. Tests and the
// catalogue give their fakes through `ReceiptPortsProvider` (or props); the app
// falls back to `appReceiptPorts()`, which reaches the real API over the
// session seam and loads the native picker only when someone picks a photo.
//
// A receipt is shown from bytes the adapter downloaded and checked against
// its grant, as an in-memory data URI: never a storage URL, never a file on
// the phone. Nothing is drawn until those bytes are there, so a failed or
// expired download shows words and Try again, never a broken image.
import { RESTORE_WINDOW_DAYS } from '@gogospend/contracts';
import * as Crypto from 'expo-crypto';
import { createContext, useContext, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { ActivityIndicator, Animated, Image, Modal, Platform, Pressable, View } from 'react-native';
import type { HostInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createV1Transport } from '@mobile/api/client';
import { v1SessionCredentials } from '@mobile/auth/session';
import { getMobileEnv } from '@mobile/config/env';
import { useReducedMotion } from '@mobile/hooks/useReducedMotion';
import { useCopy } from '@mobile/i18n/useCopy';
import { createAttachmentResources, createReceiptDownload } from '@mobile/spend/v1/attachments';
import type { AttachmentResources } from '@mobile/spend/v1/attachments';
import { createImportResources } from '@mobile/spend/v1/imports';
import type { ImportResources } from '@mobile/spend/v1/imports';
import type { PickResult, ReceiptMode, ReceiptPicker } from '@mobile/spend/v1/redesign/import/receiptModel';
import { runOpacityTiming } from '@mobile/theme/animatedMotion';
import { useBunColors } from '@mobile/theme/ThemeProvider';
import { DECORATIVE, POLITE_LIVE_REGION, moveAccessibilityFocus, useAnnouncement } from '@mobile/ui/a11y';
import { BunText } from '@mobile/ui/BunText';
import { BUN_OUTLINE, BUN_RADIUS, BUN_SPACE, BUN_TOUCH } from '@mobile/ui/layout';
import { PillButton } from '@mobile/ui/PillButton';
import { PromiseList } from '@mobile/ui/PromiseList';
import { Sheet } from '@mobile/ui/Sheet';
import { newId } from '../../v1/parts';

export type ReceiptUploads = Pick<ImportResources, 'upload' | 'preview'>;

export type ReceiptPorts = {
  attachments: AttachmentResources;
  /** The image import a new photo goes through to get its attachment id. */
  uploads: ReceiptUploads;
  picker: ReceiptPicker;
  newId: () => string;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  /** The wait between checks while the server prepares a photo, and how many checks before "Check again". */
  pollMs: number;
  maxPolls: number;
};

const ReceiptPortsContext = createContext<Partial<ReceiptPorts> | null>(null);

/** Hands the receipt panel its ports (fakes in tests and the catalogue). */
export function ReceiptPortsProvider({ ports, children }: { ports: Partial<ReceiptPorts>; children: ReactNode }) {
  return <ReceiptPortsContext.Provider value={ports}>{children}</ReceiptPortsContext.Provider>;
}

/** Props first, then the provider's, then the app's own. */
export function useReceiptPorts(injected?: Partial<ReceiptPorts>): ReceiptPorts {
  const provided = useContext(ReceiptPortsContext);
  return useMemo(() => ({ ...appReceiptPorts(), ...provided, ...injected }), [provided, injected]);
}

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });
const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

let services: Promise<{ attachments: AttachmentResources; uploads: ReceiptUploads }> | null = null;
/**
 * The real API over the app's session, made on first use. The integrator may
 * move this into `api/sharedV1.ts` beside the other shared resources (one
 * transport); `v1ClientVersion` is loaded on demand because it reads native
 * application details.
 */
function appServices() {
  services ??= (async () => {
    const { v1ClientVersion } = await import('@mobile/api/sharedV1');
    const baseUrl = getMobileEnv().v1ApiUrl;
    const client = v1ClientVersion();
    const transport = createV1Transport({ baseUrl, client, credentials: v1SessionCredentials });
    const attachments = createAttachmentResources(transport, {
      download: createReceiptDownload({ baseUrl, client, credentials: v1SessionCredentials }),
      // The download's bytes sit on a plain ArrayBuffer (never shared).
      sha256Hex: async (bytes) => hex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes as Uint8Array<ArrayBuffer>)),
    });
    return { attachments, uploads: createImportResources(transport) };
  })().catch((error: unknown) => {
    // Not kept: the next call tries again.
    services = null;
    throw error;
  });
  return services;
}

/**
 * The photo library, loaded on demand (a build without the native module
 * says so instead of failing). No crop, no EXIF; iOS hands over its most
 * compatible form (JPEG rather than HEIC). Picking sends nothing anywhere.
 */
async function pickFromLibrary(): Promise<PickResult> {
  let ImagePicker: typeof import('expo-image-picker');
  try {
    ImagePicker = await import('expo-image-picker');
  } catch {
    return { kind: 'unavailable' };
  }
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      allowsEditing: false,
      exif: false,
      quality: 0.85,
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    const asset = result.canceled ? undefined : result.assets?.[0];
    if (!asset) return { kind: 'cancelled' };
    const bytes = new Uint8Array(await (await fetch(asset.uri)).arrayBuffer());
    return { kind: 'picked', photo: { bytes, contentType: asset.mimeType ?? 'image/jpeg', uri: asset.uri } };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return /permission/i.test(message) ? { kind: 'denied' } : { kind: 'unavailable' };
  }
}

let appPorts: ReceiptPorts | null = null;
/** The app's own ports: nothing is loaded or created until a method is called. */
export function appReceiptPorts(): ReceiptPorts {
  appPorts ??= {
    attachments: {
      retain: async (...args) => (await appServices()).attachments.retain(...args),
      replace: async (...args) => (await appServices()).attachments.replace(...args),
      remove: async (...args) => (await appServices()).attachments.remove(...args),
      grant: async (...args) => (await appServices()).attachments.grant(...args),
      file: async (...args) => (await appServices()).attachments.file(...args),
    },
    uploads: {
      upload: async (...args) => (await appServices()).uploads.upload(...args),
      preview: async (...args) => (await appServices()).uploads.preview(...args),
    },
    picker: { pick: pickFromLibrary },
    newId,
    now: () => new Date(),
    sleep,
    pollMs: 2_000,
    maxPolls: 30,
  };
  return appPorts;
}

/** A quiet working line: a spinner and what is happening, read politely. */
export function ReceiptWorking({ label }: { label: string }) {
  const colors = useBunColors();
  useAnnouncement(label);
  return (
    <View testID="receipt-working" {...POLITE_LIVE_REGION} style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.xs, minHeight: BUN_TOUCH }}>
      <View {...DECORATIVE}>
        <ActivityIndicator color={colors.ink} />
      </View>
      <BunText style={{ flexShrink: 1 }}>{label}</BunText>
    </View>
  );
}

/** The photo, small, as the button that opens it full screen. */
export function ReceiptThumbnail({ uri, onPress }: { uri: string; onPress: () => void }) {
  const tc = useCopy();
  const colors = useBunColors();
  return (
    <Pressable
      testID="receipt-thumbnail"
      accessibilityRole="button"
      accessibilityLabel={tc('Open the receipt photo')}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 96,
        height: 128,
        minHeight: BUN_TOUCH,
        minWidth: BUN_TOUCH,
        borderRadius: BUN_RADIUS.chip,
        borderWidth: BUN_OUTLINE.control,
        borderColor: colors.ink,
        backgroundColor: colors.paper,
        overflow: 'hidden',
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <View {...DECORATIVE} style={{ flex: 1 }}>
        <Image testID="receipt-thumbnail-image" source={{ uri }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
      </View>
    </Pressable>
  );
}

export type ViewerState = { state: 'loading' } | { state: 'ready'; uri: string } | { state: 'problem'; message: string };

/**
 * The photo full screen, as one named modal dialog (the Sheet's rule): Close,
 * the platform's back, and VoiceOver's escape all close it, and focus moves to
 * its title when it opens. It fades in; under reduced motion it simply
 * appears. The fade is the kit's own opacity timing, like the Sheet's spring,
 * so the modal itself never animates and is active (a dialog) at once.
 */
export function ReceiptViewer({ visible, view, onClose, onRetry }: { visible: boolean; view: ViewerState; onClose: () => void; onRetry: () => void }) {
  const tc = useCopy();
  const colors = useBunColors();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const viewerRef = useRef<HostInstance>(null);
  const titleRef = useRef<HostInstance>(null);
  const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  useEffect(() => {
    if (!visible || reducedMotion) {
      opacity.setValue(reducedMotion ? 1 : 0);
      return undefined;
    }
    const fade = runOpacityTiming(opacity, { toValue: 1 });
    fade.start();
    return () => fade.stop();
  }, [opacity, reducedMotion, visible]);
  const title = tc('Receipt photo');
  const web = Platform.OS === 'web';
  const webDialog = web ? { 'aria-label': title } : null;
  const panelDialog = web ? null : { role: 'dialog' as const, 'aria-modal': true, 'aria-label': title };
  const nativeTitle = web ? null : { accessible: true, accessibilityRole: 'header' as const, accessibilityLabel: title };
  return (
    <Modal
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      onShow={() => moveAccessibilityFocus(web ? viewerRef.current : titleRef.current)}
      statusBarTranslucent
      {...webDialog}
    >
      <Animated.View
        ref={viewerRef}
        testID="receipt-viewer"
        {...panelDialog}
        accessibilityViewIsModal
        onAccessibilityEscape={onClose}
        tabIndex={-1}
        style={{ flex: 1, opacity, backgroundColor: colors.background, paddingTop: insets.top + BUN_SPACE.sm, paddingBottom: insets.bottom + BUN_SPACE.md, paddingHorizontal: BUN_SPACE.md, gap: BUN_SPACE.md }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.sm }}>
          <View ref={titleRef} {...nativeTitle} style={{ flex: 1 }}>
            <BunText variant="heading" role="heading" accessibilityRole="header">{title}</BunText>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tc('Close')}
            onPress={onClose}
            style={{ minHeight: BUN_TOUCH, minWidth: BUN_TOUCH, borderRadius: BUN_RADIUS.pill, borderWidth: BUN_OUTLINE.control, borderColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}
          >
            <View {...DECORATIVE}>
              <BunText variant="heading">×</BunText>
            </View>
          </Pressable>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', borderRadius: BUN_RADIUS.card, borderWidth: BUN_OUTLINE.card, borderColor: colors.ink, backgroundColor: colors.paper, overflow: 'hidden' }}>
          {view.state === 'ready' ? (
            <Image testID="receipt-full-image" accessible accessibilityRole="image" accessibilityLabel={title} source={{ uri: view.uri }} resizeMode="contain" style={{ flex: 1 }} />
          ) : view.state === 'loading' ? (
            <View style={{ padding: BUN_SPACE.md }}>
              <ReceiptWorking label={tc('Loading the receipt photo…')} />
            </View>
          ) : (
            <View accessibilityRole="alert" style={{ padding: BUN_SPACE.md, gap: BUN_SPACE.sm }}>
              <BunText style={{ fontWeight: '700' }}>{view.message}</BunText>
              <PillButton kind="secondary" label={tc('Try again')} onPress={onRetry} />
            </View>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

/**
 * Asked at the moment of attaching, before anything leaves the phone: what is
 * kept, for how long, who can open it, and (replacing) that the current photo
 * goes for good. The facts are the server's (`ATTACHMENT_COPY_REQUIREMENTS`):
 * a cleaned copy (re-encoded, without metadata) stays with the entry until it
 * is removed, the entry is deleted for good (30 days after deleting it) or the
 * account is deleted; grants open it only for the signed-in account.
 */
export function ReceiptConsentSheet({ mode, visible, onKeep, onCancel }: { mode: ReceiptMode; visible: boolean; onKeep: () => void; onCancel: () => void }) {
  const tc = useCopy();
  const replacing = mode === 'replace';
  const items = [
    { key: 'copy', text: tc('Jotbun keeps a cleaned copy of this photo with this entry, without its location or camera details.') },
    { key: 'until', text: tc('It stays until you remove it, delete the entry for good ({days} days after deleting it) or delete your account.', { days: RESTORE_WINDOW_DAYS }) },
    { key: 'who', text: tc('In the app, only your signed-in account can open it.') },
    { key: 'diary', text: tc('Nothing from the photo is added to your diary.') },
  ];
  return (
    <Sheet visible={visible} onClose={onCancel} title={replacing ? tc('Replace the receipt photo?') : tc('Keep this receipt photo?')}>
      <PromiseList items={items} />
      {replacing ? <BunText style={{ fontWeight: '700' }}>{tc("The current photo is deleted for good. This can't be undone.")}</BunText> : null}
      <View style={{ gap: BUN_SPACE.sm }}>
        <PillButton label={replacing ? tc('Keep the new photo') : tc('Keep this photo')} onPress={onKeep} />
        <PillButton kind="secondary" label={tc('Cancel')} onPress={onCancel} />
      </View>
    </Sheet>
  );
}
