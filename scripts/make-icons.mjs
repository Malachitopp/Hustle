/**
 * Draws the App Store icon and the launch image from the rose's own pixel grids, so the tile on
 * the home screen and the plant the app draws are the same artwork. Run it with `npm run icons`
 * after changing the rose or the petal colours; it overwrites assets/icon.png and
 * assets/splash-icon.png.
 *
 * Node reads the plant data straight from the TypeScript source (it strips the types), so there
 * is one copy of the rose, not two.
 */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

import { petalColours } from '../src/plants/petals.ts';
import { rose } from '../src/plants/rose.ts';

/** The icon's petals are the app's default colour, the one a new plant starts with. */
const PETAL_COLOUR = 'red';

/** The icon is 1024 square, as the App Store asks, with the rose across most of it. */
const ICON_SIZE = 1024;
const ICON_FILL = 0.82;

/**
 * The icon is the bloom and a little stem: at the size a home screen draws it, the whole plant
 * would shrink the flower to nothing. The launch image is the whole plant, dirt and all.
 */
const ICON_ROWS = rose.grids['full-bloom'].slice(1, 17);
const SPLASH_ROWS = rose.grids['full-bloom'];
const SPLASH_SCALE = 40;

const black = { r: 0, g: 0, b: 0, a: 255 };
const clear = { r: 0, g: 0, b: 0, a: 0 };

/** The rose on black, filling the tile. iOS wants no transparency in an app icon. */
function drawIcon() {
  const ink = inkBox(ICON_ROWS);
  const room = Math.round(ICON_SIZE * ICON_FILL);
  const scale = Math.max(1, Math.min(Math.floor(room / ink.width), Math.floor(room / ink.height)));
  const canvas = blank(ICON_SIZE, ICON_SIZE, black);
  draw(canvas, ICON_ROWS, {
    scale,
    left: Math.round((ICON_SIZE - ink.width * scale) / 2) - ink.x * scale,
    top: Math.round((ICON_SIZE - ink.height * scale) / 2) - ink.y * scale,
  });
  return canvas;
}

/**
 * The whole plant, with nothing behind it: the splash screen plugin paints the black, and a
 * transparent image leaves no edge whatever size the phone draws it at.
 */
function drawSplash() {
  const canvas = blank(rose.columns * SPLASH_SCALE, rose.rows * SPLASH_SCALE, clear);
  draw(canvas, SPLASH_ROWS, { scale: SPLASH_SCALE, left: 0, top: 0 });
  return canvas;
}

/** The colour a grid character is drawn in, or null where the grid is empty. */
function colourOf(character) {
  const entry = rose.palette[character];
  if (entry === undefined) return null;
  return 'fixed' in entry ? entry.fixed : petalColours[PETAL_COLOUR][entry.petal];
}

/** The smallest box holding every drawn pixel of a grid. */
function inkBox(rows) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  rows.forEach((row, y) => {
    Array.from(row).forEach((character, x) => {
      if (colourOf(character) === null) return;
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    });
  });
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

function blank(width, height, fill) {
  const pixels = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 4] = fill.r;
    pixels[i * 4 + 1] = fill.g;
    pixels[i * 4 + 2] = fill.b;
    pixels[i * 4 + 3] = fill.a;
  }
  return { width, height, pixels };
}

/** Paints a grid onto a canvas, one square of `scale` by `scale` pixels per grid pixel. */
function draw(canvas, rows, { scale, left, top }) {
  rows.forEach((row, gridY) => {
    Array.from(row).forEach((character, gridX) => {
      const colour = colourOf(character);
      if (colour === null) return;
      const { r, g, b } = rgb(colour);
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          const px = left + gridX * scale + x;
          const py = top + gridY * scale + y;
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
          const at = (py * canvas.width + px) * 4;
          canvas.pixels[at] = r;
          canvas.pixels[at + 1] = g;
          canvas.pixels[at + 2] = b;
          canvas.pixels[at + 3] = 255;
        }
      }
    });
  });
}

function rgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

/** A PNG of the canvas: 8 bits a channel, no filtering, which is all pixel art needs. */
function writePng(path, canvas) {
  const stride = canvas.width * 4;
  const raw = Buffer.alloc((stride + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    raw[y * (stride + 1)] = 0;
    canvas.pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(canvas.width, 0);
  header.writeUInt32BE(canvas.height, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // colour type: RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  console.log(`${path.pathname.split('/').pop()}: ${canvas.width}x${canvas.height}`);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

writePng(new URL('../assets/icon.png', import.meta.url), drawIcon());
writePng(new URL('../assets/splash-icon.png', import.meta.url), drawSplash());
