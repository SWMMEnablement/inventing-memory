// 9x9 bitmap glyphs spelling HOPFIELD.
// '#' = on (+1), '.' = off (-1).

export const GLYPH_W = 9;
export const GLYPH_H = 9;

const RAW: Record<string, string> = {
  H: `
#.......#
#.......#
#.......#
#.......#
#########
#.......#
#.......#
#.......#
#.......#`,
  O: `
.#######.
##.....##
#.......#
#.......#
#.......#
#.......#
#.......#
##.....##
.#######.`,
  P: `
########.
#.......#
#.......#
#.......#
########.
#........
#........
#........
#........`,
  F: `
#########
#........
#........
#........
#######..
#........
#........
#........
#........`,
  I: `
#########
....#....
....#....
....#....
....#....
....#....
....#....
....#....
#########`,
  E: `
#########
#........
#........
#........
#######..
#........
#........
#........
#########`,
  L: `
#........
#........
#........
#........
#........
#........
#........
#........
#########`,
  D: `
#######..
#......#.
#.......#
#.......#
#.......#
#.......#
#.......#
#......#.
#######..`,
};

export const LETTERS = ["H", "O", "P", "F", "I", "E", "L", "D"] as const;
export type Letter = (typeof LETTERS)[number];

function parse(s: string): Int8Array {
  const rows = s.trim().split("\n");
  const out = new Int8Array(GLYPH_W * GLYPH_H);
  for (let y = 0; y < GLYPH_H; y++) {
    const row = rows[y];
    for (let x = 0; x < GLYPH_W; x++) {
      out[y * GLYPH_W + x] = row[x] === "#" ? 1 : -1;
    }
  }
  return out;
}

export const GLYPHS: Record<Letter, Int8Array> = Object.fromEntries(
  LETTERS.map((l) => [l, parse(RAW[l])]),
) as Record<Letter, Int8Array>;

export const PATTERNS: Int8Array[] = LETTERS.map((l) => GLYPHS[l]);

/** Add random bit flips to seed a recall. */
export function corrupt(p: Int8Array, prob: number): Int8Array {
  const out = new Int8Array(p);
  for (let i = 0; i < out.length; i++) if (Math.random() < prob) out[i] = -out[i];
  return out;
}

/** Random ±1 vector. */
export function randomState(n: number): Int8Array {
  const o = new Int8Array(n);
  for (let i = 0; i < n; i++) o[i] = Math.random() < 0.5 ? -1 : 1;
  return o;
}
