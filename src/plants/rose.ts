import type { PlantKind } from './types';

/**
 * The rose, the first kind of plant. 24 pixels wide by 32 tall. The dirt takes the bottom six
 * rows of every grid, so the plant sits on the same ground whatever its look.
 *
 * Grid characters: '.' empty · 'D' dirt · 'd' dark dirt · 'S' stem · 's' stem shadow ·
 * 'L' leaf · 'l' dark leaf · 'P' petal · 'h' petal highlight · 'p' petal shadow ·
 * 'W' withered · 'w' dark withered.
 */

const DIRT = [
  '........DDDDDDDD........',
  '.....DDDDDDDDDDDDDD.....',
  '...DDDDDDdDDDDDDdDDDD...',
  '..DDDdDDDDDDDDDDDDDDDD..',
  '.DDDDDDDDDDDdDDDDDDDDDD.',
  '.dddddddddddddddddddddd.',
] as const;

/** The dirt with an upright stem planted in it. */
const DIRT_WITH_STEM = [
  '........DDDsSDDD........',
  '.....DDDDDDsSDDDDDD.....',
  ...DIRT.slice(2),
] as const;

const EMPTY = '........................';

/** The upright stem and its two leaves, rows 15 to 25. */
const UPRIGHT_STEM = [
  '...........sS...........',
  '...........sS...........',
  '...........sS...........',
  '......LLL..sS...........',
  '....LLLLLLLsS...........',
  '.....lLLLLLsS...........',
  '.......lll.sS...........',
  '...........sSLLL........',
  '...........sSLLLLLLL....',
  '...........sSlLLLLl.....',
  '...........sS.lll.......',
] as const;

export const rose: PlantKind = {
  id: 'rose',
  name: 'Rose',
  columns: 24,
  rows: 32,
  palette: {
    D: { fixed: '#7A4B2A' },
    d: { fixed: '#4E2E18' },
    S: { fixed: '#3D8B37' },
    s: { fixed: '#245C22' },
    L: { fixed: '#5CB04A' },
    l: { fixed: '#2F7A2C' },
    P: { petal: 'base' },
    h: { petal: 'light' },
    p: { petal: 'dark' },
    W: { fixed: '#A3835A' },
    w: { fixed: '#5C4A3B' },
  },
  grids: {
    dirt: [...Array<string>(26).fill(EMPTY), ...DIRT],

    'full-bloom': [
      EMPTY,
      '........PPPPPPP.........',
      '......PPhhPPPPPPP.......',
      '.....PhPPPpppPPPPP......',
      '....PhPPpPPPPPpPPPP.....',
      '....PhPpPPhhPPPpPPP.....',
      '...PPhpPPhPPpPPpPPPP....',
      '...PPPpPPhPpPpPPpPPP....',
      '...PPPpPPPhPPPpPpPPP....',
      '....PPpPPPPpppPPpPP.....',
      '.....PPpPPPPPPPpPP......',
      '......ppPPPPPPPpp.......',
      '........ppppppp.........',
      '.......LlSSSSSlL........',
      '........llSSSll.........',
      ...UPRIGHT_STEM,
      ...DIRT_WITH_STEM,
    ],

    opening: [
      EMPTY,
      EMPTY,
      EMPTY,
      '.........hPPP...........',
      '........hPPPPPP.........',
      '.......hPPpPPPPP........',
      '.......PPpPhPPpPP.......',
      '......PPpPPhPPpPPP......',
      '......PPpPPPPPpPPP......',
      '......PPPpPPPpPPPP......',
      '.......PPpppppPPP.......',
      '........pPPPPPPp........',
      '.........pppppp.........',
      '........LlSSSSlL........',
      '.........llSSll.........',
      ...UPRIGHT_STEM,
      ...DIRT_WITH_STEM,
    ],

    bud: [
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      '..........hPP...........',
      '.........hPPPP..........',
      '.........PPpPPP.........',
      '........PPPpPPPP........',
      '........PPPPpPPP........',
      '........lPPPpPPl........',
      '.........lPPPPl.........',
      '........LllSSllL........',
      '.........llSSll.........',
      '..........lSSl..........',
      ...UPRIGHT_STEM,
      ...DIRT_WITH_STEM,
    ],

    drooping: [
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      '..............SS........',
      '.............sS.Ss......',
      '............sS...lSl....',
      '...........sS...lPPPl...',
      '...........sS...PPpPP...',
      '...........sS...PPpPP...',
      '...........sS....PpP....',
      '...........sS.....p.....',
      '...........sS...........',
      '...........sS...........',
      '........LL.sS...........',
      '......LLLLLsS...........',
      '.....LLlll.sS...........',
      '.....ll....sS...........',
      '...........sSLL.........',
      '...........sSLLLLL......',
      '...........sS.lllLL.....',
      '........DDDsSDDDll......',
      '.....DDDDDDsSDDDDDD.....',
      ...DIRT.slice(2),
    ],

    wilting: [
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      EMPTY,
      '............SS..........',
      '...........sS.Ss........',
      '...........sS..Ss.......',
      '...........sS...Ss......',
      '...........sS...lsl.....',
      '...........sS..lpPPl....',
      '......LL...sS..pPppP....',
      '.....LLLL..sS...ppp.....',
      '....lll....sS....p......',
      '...........sSLL.........',
      '...........sS.LLL.......',
      '...........sS..lll......',
      ...DIRT_WITH_STEM,
    ],

    dead: [
      ...Array<string>(17).fill(EMPTY),
      '...........WW...........',
      '...........WwW..........',
      '...........Ww.W.........',
      '..WW.......Ww..Ww.......',
      '...WWw.....Ww...Ww......',
      '.....ww....Ww....Ww.....',
      '...........Ww...wWWWw...',
      '...........Ww..wWwwwWw..',
      '...........Ww..wwWwwww..',
      '........wwDWwDDDwwwww...',
      '.....DDDDDDWwDDDDDDw....',
      ...DIRT.slice(2),
    ],
  },
};
