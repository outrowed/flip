/**
 * Assembles text strings onto a 2D boolean flip-dot matrix with optional
 * italic forward-shear, customizable padding, and character spacing.
 */

import { FONT_HEIGHT, getGlyph, getItalicShift } from "./font.ts";

export const DEFAULT_MATRIX_OPTIONS = {
    text: "hello world",
    italic: true,
    letterSpacing: 2,
    wordSpacing: 5,
    padX: 3,
    padY: 2,
    minCols: 80,
    rows: 13,
};

/**
 * Renders the requested text into an upright 2D array of booleans
 * of height `FONT_HEIGHT` before italic shearing or board framing.
 */
export function buildUprightTextBitmap(text: string, options: Partial<typeof DEFAULT_MATRIX_OPTIONS> = {}) {
    const letterSpacing = options.letterSpacing ?? DEFAULT_MATRIX_OPTIONS.letterSpacing;
    const wordSpacing = options.wordSpacing ?? DEFAULT_MATRIX_OPTIONS.wordSpacing;
    const chars = Array.from(text || "");

    const rows: boolean[][] = Array.from({ length: FONT_HEIGHT }, () => []);

    chars.forEach((ch, idx) => {
        const isSpace = ch === " ";
        const glyph = isSpace
            ? Array.from({ length: FONT_HEIGHT }, () => ".".repeat(wordSpacing))
            : getGlyph(ch);

        for (let r = 0; r < FONT_HEIGHT; r += 1) {
            const line = glyph[r] || "";

            for (let c = 0; c < line.length; c += 1) {
                rows[r].push(line[c] === "#");
            }

            if (idx < chars.length - 1 && !isSpace && chars[idx + 1] !== " ") {
                for (let s = 0; s < letterSpacing; s += 1) {
                    rows[r].push(false);
                }
            }
        }
    });

    return rows;
}

/**
 * Applies the italic horizontal shear across the 9-row upright text bitmap
 * and centers it inside a full flip-dot matrix of `[totalRows][totalCols]`.
 */
export function layoutFlipDotMatrix(options: Partial<typeof DEFAULT_MATRIX_OPTIONS> = {}) {
    const merged = {
        ...DEFAULT_MATRIX_OPTIONS,
        ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)),
    };
    const upright = buildUprightTextBitmap(merged.text, merged);
    const uprightWidth = upright[0]?.length ?? 0;
    const maxShear = getItalicShift(0, FONT_HEIGHT, merged.italic);
    const shearedWidth = uprightWidth + maxShear;

    const totalRows = Math.max(merged.rows, FONT_HEIGHT + merged.padY * 2);
    const totalCols = Math.max(merged.minCols, shearedWidth + merged.padX * 2);

    const startRow = Math.floor((totalRows - FONT_HEIGHT) / 2);
    const startCol = Math.floor((totalCols - shearedWidth) / 2);

    const grid = Array.from({ length: totalRows }, () =>
        Array.from({ length: totalCols }, () => false),
    );

    let activeCount = 0;

    for (let r = 0; r < FONT_HEIGHT; r += 1) {
        const shift = getItalicShift(r, FONT_HEIGHT, merged.italic);
        const targetRow = startRow + r;

        for (let c = 0; c < uprightWidth; c += 1) {
            if (upright[r][c]) {
                const targetCol = startCol + c + shift;

                if (
                    targetRow >= 0
                    && targetRow < totalRows
                    && targetCol >= 0
                    && targetCol < totalCols
                ) {
                    grid[targetRow][targetCol] = true;
                    activeCount += 1;
                }
            }
        }
    }

    return {
        grid,
        rows: totalRows,
        cols: totalCols,
        activeCount,
        textBounds: {
            startRow,
            endRow: startRow + FONT_HEIGHT - 1,
            startCol,
            endCol: startCol + shearedWidth - 1,
            shearedWidth,
        },
    };
}

/**
 * Formats a boolean matrix as an ASCII art preview (`#` for active, `.` for zero-state)
 * for CLI inspection and snapshot testing.
 */
export function renderMatrixAscii(grid: boolean[][]) {
    return grid
        .map(row => row.map(cell => (cell ? "#" : ".")).join(""))
        .join("\n");
}
