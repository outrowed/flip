import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateFlipDotSvg } from "../src/svg.mjs";

describe("animated flip-dot SVG generator", () => {
  it("generates a wide flip-dot SVG starting in zero-state and rotating through texts", () => {
    const { svg, width, height, cols, rows, layouts } = generateFlipDotSvg({
      texts: ["hello world", "its me", "taruna", "outrowed", "peace out~"],
      italic: true
    });

    assert.ok(width > height * 4, "banner should have a wide aspect ratio");
    assert.ok(svg.startsWith("<svg "));
    assert.ok(svg.trim().endsWith("</svg>"));
    assert.ok(svg.includes(`viewBox="0 0 ${width} ${height}"`));

    // Total round dot <circle> elements equals rows * cols + 4 corner screw circles
    const circleMatches = svg.match(/<circle /g) || [];
    assert.equal(circleMatches.length, rows * cols + 4);

    // Number of animated rotating patterns is tracked
    assert.equal(layouts.length, 5);

    // Zero-state initial keyframe & prefers-reduced-motion accessibility
    assert.ok(svg.includes("@keyframes k-"));
    assert.ok(svg.includes("prefers-reduced-motion: reduce"));
  });

  it("escapes XML special characters in custom label text", () => {
    const { svg } = generateFlipDotSvg({ texts: ["a < b & c"] });
    assert.ok(svg.includes("a &lt; b &amp; c"));
    assert.ok(!svg.includes("a < b & c"));
  });
});
