// Layout pieces the catalogue's sections share (redesign R2c, development only).
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { useBunIntensity } from '@mobile/mascot/BunIntensityProvider';
import { BunText } from '@mobile/ui/BunText';
import { BUN_SPACE } from '@mobile/ui/layout';

/** The catalogue's page padding; `FullBleed` undoes it. */
export const PAGE_PADDING = BUN_SPACE.md;

/** A small muted name for the variant beside or above it. Catalogue chrome, so plain English. */
export function SpecimenLabel({ children }: { children: string }) {
  return <BunText variant="caption" tone="muted">{children}</BunText>;
}

/** One variant: its name above it. */
export function Specimen({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: BUN_SPACE.xxs }}>
      <SpecimenLabel>{label}</SpecimenLabel>
      {children}
    </View>
  );
}

/** One variant on a line: its name on the left, the component on the right. */
export function SpecimenRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: BUN_SPACE.sm }}>
      <View style={{ width: 92 }}>
        <SpecimenLabel>{label}</SpecimenLabel>
      </View>
      <View style={{ flex: 1, alignItems: 'flex-start' }}>{children}</View>
    </View>
  );
}

/** Spans the page edge to edge, as a header or tab bar does on a screen. */
export function FullBleed({ children }: { children: ReactNode }) {
  return <View style={{ marginHorizontal: -PAGE_PADDING }}>{children}</View>;
}

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Bars that pad by the safe area (the stage header, the tab bar) sit mid-page
 * here, not under the status bar or above the home indicator, so they see no
 * insets.
 */
export function NoInsets({ children }: { children: ReactNode }) {
  return <SafeAreaInsetsContext.Provider value={NO_INSETS}>{children}</SafeAreaInsetsContext.Provider>;
}

/** Says why a mascot section looks empty at the current bun intensity. */
export function IntensityNote({ needs }: { needs: 'bun' | 'bubble' }) {
  const { intensity } = useBunIntensity();
  const hidden = needs === 'bubble' ? intensity !== 'full' : intensity === 'off';
  if (!hidden) return null;
  return (
    <BunText variant="caption" tone="muted">
      {needs === 'bubble' ? `Bun is ${intensity === 'off' ? 'Off' : 'Quiet'}: speech bubbles show only at Full.` : 'Bun is Off: no bun anywhere. Choose Full or Quiet to see it.'}
    </BunText>
  );
}
