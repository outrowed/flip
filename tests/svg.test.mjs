import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateFlipDotSvg,
  generateStillFlipDotSvg,
  generateStillFlipDotFrames
} from "../src/svg.mjs";

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

  it("generates static still frame SVGs without CSS animation keyframes", () => {
    const texts = ["hello world", "its me", "taruna", "outrowed", "peace out~"];
    const frames = generateStillFlipDotFrames({ texts, italic: true });

    assert.equal(frames.length, 5);
    for (let i = 0; i < frames.length; i += 1) {
      const frame = frames[i];
      assert.equal(frame.frameIndex, i);
      assert.equal(frame.text, texts[i]);
      assert.ok(frame.svg.startsWith("<svg "));
      assert.ok(frame.svg.trim().endsWith("</svg>"));
      assert.ok(frame.activeCount > 0);
      // Still frames must NOT have @keyframes animation
      assert.ok(!frame.svg.includes("@keyframes"));
      assert.ok(!frame.svg.includes("animation:"));
    }
  });

  it("generates a specific still frame with generateStillFlipDotSvg", () => {
    const frame = generateStillFlipDotSvg({
      texts: ["hello world", "outrowed"],
      frameIndex: 1
    });

    assert.equal(frame.frameIndex, 1);
    assert.equal(frame.text, "outrowed");
    assert.ok(frame.svg.includes("<title>outrowed</title>"));
    assert.ok(!frame.svg.includes("@keyframes"));
  });
});

