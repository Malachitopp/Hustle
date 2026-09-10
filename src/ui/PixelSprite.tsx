import { StyleSheet, View, type ColorValue } from 'react-native';

type Props = {
  /** One string per row. '#' is a lit pixel; anything else is empty. */
  rows: readonly string[];
  color: ColorValue;
  /** Screen size of one pixel, in points. */
  scale?: number;
};

/** Draws a small one-colour bitmap as a grid of squares, so it stays crisp at any size. */
export function PixelSprite({ rows, color, scale = 3 }: Props) {
  return (
    <View>
      {rows.map((row, y) => (
        <View key={y} style={styles.row}>
          {Array.from(row).map((cell, x) => (
            <View
              key={x}
              style={{ width: scale, height: scale, backgroundColor: cell === '#' ? color : 'transparent' }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
  },
});
