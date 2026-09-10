import type { Look } from '@/core';

/**
 * A pixel grid: one string per row, one character per pixel. '.' is empty (the background
 * shows through); every other character is an index into the plant kind's palette.
 */
export type PixelGrid = readonly string[];

/** What a palette index stands for: a fixed colour, or one of the three petal shades. */
export type PaletteEntry = { fixed: string } | { petal: PetalShade };

/** The three shades every petal colour comes in. A petal colour is a swap of these. */
export type PetalShade = 'base' | 'light' | 'dark';

/**
 * A kind of plant, defined entirely as data: one grid per look, plus a dirt-only grid for
 * before the first session, all the same size so the plant never jumps. New kinds slot in by
 * adding one of these to the registry.
 */
export type PlantKind = {
  id: string;
  /** Shown to the user, e.g. "Rose". */
  name: string;
  columns: number;
  rows: number;
  /** What each grid character stands for. '.' is never listed: it is always empty. */
  palette: Readonly<Record<string, PaletteEntry>>;
  /** The grids, one per look and one with only dirt. */
  grids: Readonly<Record<Look | 'dirt', PixelGrid>>;
};
