import { describe, expect, it } from "vitest";
import {
    generateFlipDotSvg,
    generateStillFlipDotFrames,
    generateStillFlipDotSvg,
} from "../src/engine/svg.ts";

describe("animated flip-dot SVG generator", () => {
    it("generates a wide flip-dot SVG starting in zero-state and rotating through texts", () => {
        const { svg, width, height, cols, rows, layouts } = generateFlipDotSvg({
            texts: ["hello world", "its me", "taruna", "outrowed", "peace out~"],
            italic: true,
        });

        expect(width).toBeGreaterThan(height * 4);
        expect(svg.startsWith("<svg ")).toBe(true);
        expect(svg.trim().endsWith("</svg>")).toBe(true);
        expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);

        expect(svg).toContain("<path class=\"d z\"");
        expect((svg.match(/<circle class="d z"/g) || []).length).toBe(0);
        const original = generateFlipDotSvg({
            texts: ["hello world", "its me", "taruna", "outrowed", "peace out~"],
            italic: true,
            renderTech: "original",
        });
        expect((original.svg.match(/<circle class="d z"/g) || []).length).toBeGreaterThan(0);
        expect((original.svg.match(/<circle /g) || []).length).toBe(rows * cols + 4);
        expect(layouts).toHaveLength(5);
        expect(svg).toContain("@keyframes k-");
        expect(svg).toContain("prefers-reduced-motion: reduce");
    });

    it("escapes XML special characters in custom label text", () => {
        const { svg } = generateFlipDotSvg({ texts: ["a < b & c"] });
        expect(svg).toContain("a &lt; b &amp; c");
        expect(svg).not.toContain("a < b & c");
    });

    it("generates static still frame SVGs without CSS animation keyframes", () => {
        const texts = ["hello world", "its me", "taruna", "outrowed", "peace out~"];
        const frames = generateStillFlipDotFrames({
            texts,
            italic: true,
        });

        expect(frames).toHaveLength(5);

        for (let i = 0; i < frames.length; i += 1) {
            const frame = frames[i];
            expect(frame.frameIndex).toBe(i);
            expect(frame.text).toBe(texts[i]);
            expect(frame.svg.startsWith("<svg ")).toBe(true);
            expect(frame.svg.trim().endsWith("</svg>")).toBe(true);
            expect(frame.activeCount).toBeGreaterThan(0);
            expect(frame.svg).not.toContain("@keyframes");
            expect(frame.svg).not.toContain("animation:");
        }
    });

    it("generates a specific still frame with generateStillFlipDotSvg", () => {
        const frame = generateStillFlipDotSvg({
            texts: ["hello world", "outrowed"],
            frameIndex: 1,
        });

        expect(frame.frameIndex).toBe(1);
        expect(frame.text).toBe("outrowed");
        expect(frame.svg).toContain("<title>outrowed</title>");
        expect(frame.svg).not.toContain("@keyframes");
    });
});

describe("render technologies", () => {
    for (const dotShape of ["circle", "square"]) {
        for (const generate of [generateFlipDotSvg, generateStillFlipDotSvg]) {
            it(`packs only inactive ${dotShape} dots in ${generate.name}`, () => {
                const options = {
                    texts: ["hello", "world"],
                    dotShape,
                };
                const original = generate({
                    ...options,
                    renderTech: "original",
                }).svg;
                const compound = generate(options).svg;
                const inactive = original.match(/<(circle|rect) class="d z" [^>]+\/>/g) ?? [];
                const path = compound.match(/<path class="d z" d="([^"]+)"\/>/g) ?? [];
                expect(path).toHaveLength(1);
                expect((path[0]?.match(/M/g) ?? []).length).toBe(inactive.length);

                const strip = (svg: string) => svg.replace(/<(circle|rect) class="d z" [^>]+\/>/g, "").replace(/<path class="d z" d="[^"]+"\/>/g, "").replace(/\s+/g, " ");

                expect(strip(compound)).toBe(strip(original));
            });
        }
    }
});
