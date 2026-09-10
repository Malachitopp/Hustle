import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors } from '@/theme';

type Props = {
  /** How full the bar is, from 0 to 1. Anything above 1 shows as full. */
  fraction: number;
  color?: string;
  segments?: number;
  style?: StyleProp<ViewStyle>;
};

/** A chunky progress bar: a bordered row of blocks that light up from the left. */
export function PixelBar({ fraction, color = colors.yellow, segments = 20, style }: Props) {
  const clamped = Math.min(1, Math.max(0, fraction));
  // Any progress at all lights the first block, so a goal that has started never looks empty.
  const lit = clamped === 0 ? 0 : Math.max(1, Math.floor(clamped * segments));
  return (
    <View style={[styles.box, style]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}>
      {Array.from({ length: segments }, (_, i) => (
        <View key={i} style={[styles.segment, i < lit && { backgroundColor: color }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    borderWidth: 2,
    borderColor: colors.text,
    padding: 2,
    gap: 2,
    height: 18,
  },
  segment: {
    flex: 1,
  },
});
