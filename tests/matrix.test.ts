import { beforeAll, describe, expect, it } from "vitest";
import { FONT_HEIGHT, getItalicShift } from "../core/font.ts";
import { layoutFlipDotMatrix, renderMatrixAscii } from "../core/matrix.ts";
import { loadResourcesSync } from "../core/resources-node.ts";

beforeAll(() => loadResourcesSync());

describe("flip-dot matrix layout & italic shear", () => {
    it("computes a forward italic shear from top row (+4) to bottom row (+0)", () => {
        expect(getItalicShift(0, FONT_HEIGHT, true)).toBe(4);
        expect(getItalicShift(4, FONT_HEIGHT, true)).toBe(2);
        expect(getItalicShift(FONT_HEIGHT - 1, FONT_HEIGHT, true)).toBe(0);
        expect(getItalicShift(0, FONT_HEIGHT, false)).toBe(0);
    });

    it("lays out an italicized 'hello world' centered on a wide 96x15 matrix", () => {
        const italicLayout = layoutFlipDotMatrix({
            text: "hello world",
            italic: true,
            minCols: 96,
            rows: 15,
        });
        const uprightLayout = layoutFlipDotMatrix({
            text: "hello world",
            italic: false,
            minCols: 96,
            rows: 15,
        });

        expect(italicLayout.rows).toBe(15);
        expect(italicLayout.cols).toBe(96);
        expect(italicLayout.activeCount).toBeGreaterThan(180);
        expect(italicLayout.activeCount).toBe(uprightLayout.activeCount);

        const topRow = italicLayout.textBounds.startRow;
        const bottomRow = italicLayout.textBounds.endRow;

        const firstLitTopItalic = italicLayout.grid[topRow].indexOf(true);
        const firstLitBottomItalic = italicLayout.grid[bottomRow].indexOf(true);
        const firstLitTopUpright = uprightLayout.grid[topRow].indexOf(true);
        const firstLitBottomUpright = uprightLayout.grid[bottomRow].indexOf(true);

        const italicDelta = firstLitTopItalic - firstLitBottomItalic;
        const uprightDelta = firstLitTopUpright - firstLitBottomUpright;

        expect(italicDelta - uprightDelta).toBe(4);
    });

    it("renders a deterministic ASCII preview with matching dimensions", () => {
        const layout = layoutFlipDotMatrix({
            text: "hi",
            minCols: 28,
            rows: 11,
            padY: 1,
        });
        const ascii = renderMatrixAscii(layout.grid);
        const lines = ascii.split("\n");

        expect(lines).toHaveLength(11);
        expect(lines[0]).toHaveLength(28);
        expect(ascii).toContain("#");
    });

    it("supports left, center, and right horizontal text alignment on a wider board", () => {
        const left = layoutFlipDotMatrix({
            text: "hi",
            align: "left",
            minCols: 80,
            padX: 3,
        });
        const center = layoutFlipDotMatrix({
            text: "hi",
            align: "center",
            minCols: 80,
            padX: 3,
        });
        const right = layoutFlipDotMatrix({
            text: "hi",
            align: "right",
            minCols: 80,
            padX: 3,
        });

        expect(left.textBounds.startCol).toBe(3);
        expect(center.textBounds.startCol).toBe(Math.floor((80 - center.textBounds.shearedWidth) / 2));
        expect(right.textBounds.startCol).toBe(80 - 3 - right.textBounds.shearedWidth);
        expect(right.textBounds.endCol).toBe(80 - 3 - 1);
    });
});
