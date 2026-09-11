import type { PetalShade } from './types';

/**
 * The seven petal colours, each in the three shades a plant's palette can ask for. Swapping the
 * petal colour swaps only these; everything else in the plant keeps its colour.
 */
export const petalColours = {
  red: { base: '#E8303F', light: '#FF8A94', dark: '#961424' },
  orange: { base: '#FF7B1C', light: '#FFB878', dark: '#B24A06' },
  yellow: { base: '#FFD43A', light: '#FFF1A6', dark: '#C29A0A' },
  /** Brighter than the stem, so it reads as petals and not more leaf. */
  green: { base: '#62E85A', light: '#B4FFA6', dark: '#2E9E34' },
  blue: { base: '#3E8FFF', light: '#96CBFF', dark: '#1D52B8' },
  pink: { base: '#FF6DB8', light: '#FFB4DC', dark: '#C42B7E' },
  violet: { base: '#9D5FFF', light: '#CCA8FF', dark: '#5F30B6' },
} as const satisfies Record<string, Record<PetalShade, string>>;

export type PetalColour = keyof typeof petalColours;

/** The colours in the order the picker shows them. */
export const petalColourOrder: readonly PetalColour[] = [
  'red',
  'orange',
  'yellow',
  'green',
  'blue',
  'pink',
  'violet',
];

export const defaultPetalColour: PetalColour = 'red';

export function isPetalColour(value: unknown): value is PetalColour {
  return typeof value === 'string' && Object.hasOwn(petalColours, value);
}

/**
 * The colour a saved name stands for: the default when there is none, or when the name is one
 * this version of the app does not know (a colour a newer version added, say).
 */
export function petalColourOrDefault(name: string | null | undefined): PetalColour {
  return isPetalColour(name) ? name : defaultPetalColour;
}

/** The colour's name as the picker shows it, e.g. "Red". */
export function petalColourName(colour: PetalColour): string {
  return colour.charAt(0).toUpperCase() + colour.slice(1);
}
