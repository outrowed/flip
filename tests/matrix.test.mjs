import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FONT_HEIGHT, getItalicShift } from "../src/font.mjs";
import { layoutFlipDotMatrix, renderMatrixAscii } from "../src/matrix.mjs";

describe("flip-dot matrix layout & italic shear", () => {
  it("computes a forward italic shear from top row (+4) to bottom row (+0)", () => {
    assert.equal(getItalicShift(0, FONT_HEIGHT, true), 4);
    assert.equal(getItalicShift(4, FONT_HEIGHT, true), 2);
    assert.equal(getItalicShift(FONT_HEIGHT - 1, FONT_HEIGHT, true), 0);
    assert.equal(getItalicShift(0, FONT_HEIGHT, false), 0);
  });

  it("lays out an italicized 'hello world' centered on a wide 96x15 matrix", () => {
    const italicLayout = layoutFlipDotMatrix({
      text: "hello world",
      italic: true,
      minCols: 96,
      rows: 15
    });
    const uprightLayout = layoutFlipDotMatrix({
      text: "hello world",
      italic: false,
      minCols: 96,
      rows: 15
    });

    assert.equal(italicLayout.rows, 15);
    assert.equal(italicLayout.cols, 96);
    assert.ok(italicLayout.activeCount > 180);
    assert.equal(italicLayout.activeCount, uprightLayout.activeCount);

    // Top active row of the glyph must be shifted further right in italic mode than bottom row
    const topRow = italicLayout.textBounds.startRow;
    const bottomRow = italicLayout.textBounds.endRow;

    const firstLitTopItalic = italicLayout.grid[topRow].indexOf(true);
    const firstLitBottomItalic = italicLayout.grid[bottomRow].indexOf(true);
    const firstLitTopUpright = uprightLayout.grid[topRow].indexOf(true);
    const firstLitBottomUpright = uprightLayout.grid[bottomRow].indexOf(true);

    const italicDelta = firstLitTopItalic - firstLitBottomItalic;
    const uprightDelta = firstLitTopUpright - firstLitBottomUpright;

    assert.equal(italicDelta - uprightDelta, 4);
  });

  it("renders a deterministic ASCII preview with matching dimensions", () => {
    const layout = layoutFlipDotMatrix({ text: "hi", minCols: 28, rows: 11, padY: 1 });
    const ascii = renderMatrixAscii(layout.grid);
    const lines = ascii.split("\n");

    assert.equal(lines.length, 11);
    assert.equal(lines[0].length, 28);
    assert.ok(ascii.includes("#"));
  });
});
