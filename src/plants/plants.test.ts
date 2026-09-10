/**
 * Plant data tests: every kind's grids are complete and well formed, and the petal colours
 * swap cleanly into a palette.
 */
import type { Look } from '@/core';
import {
  defaultPetalColour,
  defaultPlantKind,
  isPetalColour,
  petalColourName,
  petalColourOrder,
  petalColours,
  plantKinds,
  resolvePalette,
  type PlantKind,
} from '@/plants';

const ALIVE_LOOKS: Look[] = ['wilting', 'drooping', 'bud', 'opening', 'full-bloom'];
const ALL_GRIDS: (Look | 'dirt')[] = ['dirt', 'dead', ...ALIVE_LOOKS];

const kinds: PlantKind[] = Object.values(plantKinds);

describe.each(kinds)('the $name', (kind) => {
  it('has a grid for every look and one with only dirt, all the same size', () => {
    for (const grid of ALL_GRIDS) {
      expect(kind.grids[grid]).toHaveLength(kind.rows);
      for (const row of kind.grids[grid]) expect(row).toHaveLength(kind.columns);
    }
  });

  it('uses only characters its palette knows, and never lists the empty one', () => {
    expect(kind.palette['.']).toBeUndefined();
    for (const grid of ALL_GRIDS) {
      for (const row of kind.grids[grid]) {
        for (const character of row) {
          if (character !== '.') expect(Object.keys(kind.palette)).toContain(character);
        }
      }
    }
  });

  it('shows petals in every alive look, and none in the dirt or on the dead plant', () => {
    const petalCharacters = Object.entries(kind.palette)
      .filter(([, entry]) => 'petal' in entry)
      .map(([character]) => character);
    expect(petalCharacters.length).toBeGreaterThan(0);
    const hasPetals = (grid: Look | 'dirt') =>
      kind.grids[grid].some((row) => petalCharacters.some((character) => row.includes(character)));
    for (const look of ALIVE_LOOKS) expect(hasPetals(look)).toBe(true);
    expect(hasPetals('dirt')).toBe(false);
    expect(hasPetals('dead')).toBe(false);
  });

  it('draws something in every grid', () => {
    for (const grid of ALL_GRIDS) {
      expect(kind.grids[grid].some((row) => /[^.]/.test(row))).toBe(true);
    }
  });
});

describe('the kinds of plant', () => {
  it('include the rose, which every plant is for now', () => {
    expect(defaultPlantKind).toBe('rose');
    expect(plantKinds[defaultPlantKind].name).toBe('Rose');
  });
});

describe('petal colours', () => {
  it('are the seven from the spec, in the order the picker shows them, with red as the default', () => {
    expect(petalColourOrder).toEqual(['red', 'orange', 'yellow', 'green', 'blue', 'pink', 'violet']);
    expect(Object.keys(petalColours).sort()).toEqual([...petalColourOrder].sort());
    expect(defaultPetalColour).toBe('red');
  });

  it('are recognised by name and nothing else', () => {
    expect(isPetalColour('violet')).toBe(true);
    expect(isPetalColour('mauve')).toBe(false);
    expect(isPetalColour(3)).toBe(false);
    expect(isPetalColour(undefined)).toBe(false);
    expect(isPetalColour('toString')).toBe(false);
  });

  it('have a name for the picker', () => {
    expect(petalColourName('red')).toBe('Red');
    expect(petalColourName('violet')).toBe('Violet');
  });

  it('swap only the petal entries of a palette', () => {
    const rose = plantKinds.rose;
    const red = resolvePalette(rose, 'red');
    const blue = resolvePalette(rose, 'blue');
    expect(red.P).toBe(petalColours.red.base);
    expect(red.h).toBe(petalColours.red.light);
    expect(red.p).toBe(petalColours.red.dark);
    expect(blue.P).toBe(petalColours.blue.base);
    for (const [character, entry] of Object.entries(rose.palette)) {
      if ('fixed' in entry) {
        expect(red[character]).toBe(entry.fixed);
        expect(blue[character]).toBe(entry.fixed);
      }
    }
    expect(Object.keys(red).sort()).toEqual(Object.keys(rose.palette).sort());
  });

  it('give green petals that are brighter than the stem', () => {
    const stem = plantKinds.rose.palette.S;
    if (!('fixed' in stem)) throw new Error('The stem should be a fixed colour.');
    expect(brightness(petalColours.green.base)).toBeGreaterThan(brightness(stem.fixed) * 1.5);
    expect(brightness(petalColours.green.dark)).toBeGreaterThan(brightness(stem.fixed));
  });
});

/** Relative luminance of a "#RRGGBB" colour, from 0 for black to 1 for white. */
function brightness(hex: string): number {
  const channel = (i: number) => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
