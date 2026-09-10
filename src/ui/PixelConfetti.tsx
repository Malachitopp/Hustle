import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { colors } from '@/theme';

type Props = {
  /** How far the pieces fall, in points. The confetti fills the width it is given. */
  height: number;
  count?: number;
};

type Piece = {
  /** Where the piece falls, as a fraction of the width. */
  x: number;
  size: number;
  color: string;
  /** How far through its fall the piece is when the loop starts, so they do not fall in a row. */
  phase: number;
  /** How far it sways from side to side, in points. */
  sway: number;
};

const PALETTE = [colors.yellow, colors.red, '#5AD46A', '#5AA8FF', '#FF7AC8', colors.text];
const CYCLE = 2200;

/**
 * Pixel confetti: square pieces that drift down over and over, for a celebration. The pieces
 * are laid out from a fixed seed, so the same confetti falls every time.
 */
export function PixelConfetti({ height, count = 28 }: Props) {
  const pieces = useMemo(() => layOut(count), [count]);
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: CYCLE, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress]);

  return (
    <View style={styles.box}>
      {pieces.map((piece, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: `${piece.x * 100}%`,
            top: 0,
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.color,
            transform: [
              { translateY: fall(progress, piece.phase, -piece.size, height + piece.size) },
              { translateX: progress.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, piece.sway, 0, -piece.sway, 0] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

/**
 * A fall from `top` to `bottom` that is `phase` of the way down when the loop starts and wraps
 * back to the top partway through, so the piece keeps falling seamlessly cycle after cycle.
 */
function fall(progress: Animated.Value, phase: number, top: number, bottom: number): Animated.AnimatedInterpolation<number> {
  const wrapAt = 1 - phase;
  const atStart = top + (bottom - top) * phase;
  return progress.interpolate({
    inputRange: [0, wrapAt, Math.min(wrapAt + 0.0001, 1), 1],
    outputRange: [atStart, bottom, top, atStart],
  });
}

/** A fixed spread of pieces. A small seeded generator keeps it the same on every render. */
function layOut(count: number): Piece[] {
  let seed = 20260910;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const pieces: Piece[] = [];
  for (let i = 0; i < count; i++) {
    pieces.push({
      x: random() * 0.96,
      size: 5 + Math.floor(random() * 3),
      color: PALETTE[Math.floor(random() * PALETTE.length)],
      phase: random(),
      sway: 4 + random() * 10,
    });
  }
  return pieces;
}

const styles = StyleSheet.create({
  box: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
});
