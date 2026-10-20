/**
 * 9-row upright bitmap font for flip-dot matrix signs,
 * paired with a horizontal shear helper that converts any upright glyph
 * or assembled message into an italicized forward-slanted matrix.
 *
 * Exclusively loads glyph tables from static/data/glyphs.json.
 * No embedded fallback glyph tables.
 */

import { getLoadedGlyphs } from "./resources.ts";

export const FONT_HEIGHT = 9;

/**
 * Returns the 9-row upright bitmap for a single character from static glyph data,
 * falling back to lowercase lookup or a space glyph when the character is unknown.
 */
export function getGlyph(char: string): string[] {
    const glyphs = getLoadedGlyphs();

    if (glyphs[char]) {
        return glyphs[char];
    }

    const lower = char.toLowerCase();

    if (glyphs[lower]) {
        return glyphs[lower];
    }

    if (glyphs[" "]) {
        return glyphs[" "];
    }

    throw new Error(`Missing glyph for ${JSON.stringify(char)} and no space glyph in static/data/glyphs.json`);
}

/**
 * Computes the horizontal italic shear offset (in columns to the right)
 * for a given row index in a glyph of `height` rows.
 * Top rows shift right (+4 at row 0) while the bottom row stays at +0,
 * producing a crisp forward italic slant (~24 degrees).
 */
export function getItalicShift(row: number, height = FONT_HEIGHT, italic = true) {
    if (!italic) {
        return 0;
    }

    return Math.floor((height - 1 - row) / 2);
}
