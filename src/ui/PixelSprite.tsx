import { useMemo } from 'react';
import type { ColorValue } from 'react-native';

import { PixelArt } from '@/ui/PixelArt';

type Props = {
  /** One string per row. '#' is a lit pixel; anything else is empty. */
  rows: readonly string[];
  color: ColorValue;
  /** Screen size of one pixel, in points. */
  scale?: number;
};

/** Draws a small one-colour bitmap, such as a tab icon, crisply at any size. */
export function PixelSprite({ rows, color, scale = 3 }: Props) {
  const palette = useMemo(() => ({ '#': color }), [color]);
  return <PixelArt rows={rows} palette={palette} scale={scale} />;
}
