/**
 * The kinds of plant, defined as data, and the petal colours that swap into their palettes.
 * The rose is the only kind for now. To add another, define it and list it in `plantKinds`;
 * nothing else needs to change.
 */
import { petalColours, type PetalColour } from './petals';
import { rose } from './rose';
import type { PlantKind } from './types';

export {
  defaultPetalColour,
  isPetalColour,
  petalColourName,
  petalColourOrder,
  petalColours,
} from './petals';
export type { PetalColour } from './petals';
export type { PaletteEntry, PetalShade, PixelGrid, PlantKind } from './types';

export const plantKinds = { rose } as const satisfies Record<string, PlantKind>;

export type PlantKindId = keyof typeof plantKinds;

/** The kind every plant is, until there is a way to choose. */
export const defaultPlantKind: PlantKindId = 'rose';

/** A plant kind's palette as grid character to colour, with the petal entries swapped in. */
export function resolvePalette(kind: PlantKind, petalColour: PetalColour): Record<string, string> {
  const petals = petalColours[petalColour];
  const resolved: Record<string, string> = {};
  for (const [character, entry] of Object.entries(kind.palette)) {
    resolved[character] = 'fixed' in entry ? entry.fixed : petals[entry.petal];
  }
  return resolved;
}
