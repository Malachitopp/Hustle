import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import type { Look } from '@/core';
import { resolvePalette, type PetalColour, type PlantKind } from '@/plants';
import { PixelArt } from '@/ui/PixelArt';

type Props = {
  kind: PlantKind;
  /** Which grid to draw: a look, or 'dirt' before the first plant. */
  look: Look | 'dirt';
  petalColour: PetalColour;
  /**
   * Screen size of one pixel, in points. Leave it out to fill the box the picture is given,
   * using the largest whole number of points per pixel that fits, up to `maxScale`.
   */
  scale?: number;
  maxScale?: number;
  style?: StyleProp<ViewStyle>;
};

/** A plant kind drawn in one of its looks, with the chosen petal colour swapped in. */
export function PlantPicture({ kind, look, petalColour, scale, maxScale = 14, style }: Props) {
  const palette = useMemo(() => resolvePalette(kind, petalColour), [kind, petalColour]);
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((previous) =>
      previous && previous.width === width && previous.height === height ? previous : { width, height },
    );
  };

  const fitted =
    scale ??
    (box === null
      ? 0
      : Math.max(1, Math.min(maxScale, Math.floor(box.width / kind.columns), Math.floor(box.height / kind.rows))));

  return (
    <View
      style={[styles.box, style]}
      onLayout={scale === undefined ? onLayout : undefined}
      accessibilityRole="image"
      accessibilityLabel={look === 'dirt' ? 'Dirt, with nothing planted yet' : `${kind.name}, ${lookName(look)}`}
    >
      {fitted > 0 ? <PixelArt rows={kind.grids[look]} palette={palette} scale={fitted} /> : null}
    </View>
  );
}

function lookName(look: Look): string {
  return look.replace('-', ' ');
}

const styles = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
