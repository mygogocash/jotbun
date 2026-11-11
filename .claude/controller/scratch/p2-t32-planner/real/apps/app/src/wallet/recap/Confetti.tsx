// Confetti animation for the month recap (P2-T32).
// 24 pieces, palette colours only, 1.2 s duration.
import { useEffect, useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';

export const CONFETTI_NAME = (month: string) => `recap-confetti-${month}`;

const PALETTE = ['#A891F7', '#F3E2BE', '#FFAE85', '#8CC8F5', '#F6B6CE'] as const;

// Deterministic layout for 24 pieces
const PIECES = Array.from({ length: 24 }, (_, i) => {
  const color = PALETTE[i % PALETTE.length];
  const isCircle = i % 2 === 0;
  const top = 60 + ((i * 27) % 200);
  const left = 20 + ((i * 37) % 320);
  const size = 6 + (i % 5);
  const rotation = `${((i * 35) % 90) - 45}deg`;

  return { id: i, color, isCircle, top, left, size, rotation };
});

export function Confetti({ durationMs = 1200, testID = 'recap-confetti' }: { durationMs?: number; testID?: string }): ReactElement | null {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs]);

  if (!visible) return null;

  return (
    <View pointerEvents="none" testID={testID} style={styles.container} aria-hidden={true}>
      {PIECES.map((piece) => (
        <View
          key={piece.id}
          testID="confetti-piece"
          style={[
            styles.piece,
            {
              top: piece.top,
              left: piece.left,
              width: piece.size,
              height: piece.isCircle ? piece.size : piece.size * 1.5,
              borderRadius: piece.isCircle ? piece.size / 2 : 2,
              backgroundColor: piece.color,
              transform: [{ rotate: piece.rotation }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    zIndex: 999,
  },
  piece: {
    position: 'absolute',
  },
});
