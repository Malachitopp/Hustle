import { useMemo } from 'react';
import { View, type ColorValue, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  /** One string per row, one character per pixel. */
  rows: readonly string[];
  /** The colour for each character. A character that is not listed is an empty pixel. */
  palette: Readonly<Record<string, ColorValue>>;
  /** Screen size of one pixel, in points. Whole points keep the edges crisp. */
  scale: number;
  style?: StyleProp<ViewStyle>;
};

/** A horizontal run of pixels of one colour. */
type Run = { x: number; y: number; length: number; color: ColorValue };

/**
 * Draws a pixel grid as coloured squares, so it stays crisp at any size with no blurry scaling.
 * Neighbouring pixels of the same colour share one View, which keeps a 24 by 32 plant to a few
 * hundred views rather than a few hundred per row.
 */
export function PixelArt({ rows, palette, scale, style }: Props) {
  const runs = useMemo(() => toRuns(rows, palette), [rows, palette]);
  const columns = useMemo(() => rows.reduce((widest, row) => Math.max(widest, row.length), 0), [rows]);
  return (
    <View style={[{ width: columns * scale, height: rows.length * scale }, style]}>
      {runs.map((run, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: run.x * scale,
            top: run.y * scale,
            width: run.length * scale,
            height: scale,
            backgroundColor: run.color,
          }}
        />
      ))}
    </View>
  );
}

function toRuns(rows: readonly string[], palette: Readonly<Record<string, ColorValue>>): Run[] {
  const runs: Run[] = [];
  for (let y = 0; y < rows.length; y++) {
    const cells = Array.from(rows[y]);
    let run: Run | null = null;
    for (let x = 0; x < cells.length; x++) {
      const color = palette[cells[x]];
      if (color === undefined) {
        run = null;
      } else if (run !== null && run.color === color) {
        run.length += 1;
      } else {
        run = { x, y, length: 1, color };
        runs.push(run);
      }
    }
  }
  return runs;
}
