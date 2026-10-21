import { beforeAll, describe, expect, it } from "vitest";
import { layoutFlipDotMatrix } from "../core/matrix.ts";
import {
    generateFlipDotSvg,
    generateStillFlipDotFrames,
    generateStillFlipDotSvg,
    PALETTES,
    parseFrameMarkup,
    splitFrameTexts,
} from "../core/svg.ts";
import { loadResourcesSync } from "../core/resources-node.ts";

beforeAll(() => loadResourcesSync());

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

describe("frame-by-frame markup ($[key=value, ...])", () => {
    it("splits comma- and newline-delimited texts while preserving commas inside $[...]", () => {
        const raw = "frame 1, frame 2 $[theme=emerald, shape=square, italic=false], frame 3 $[duration=2.5, pitch=16]";
        const frames = splitFrameTexts(raw);
        expect(frames).toEqual([
            "frame 1",
            "frame 2 $[theme=emerald, shape=square, italic=false]",
            "frame 3 $[duration=2.5, pitch=16]",
        ]);
    });

    it("parses display configuration keys and strips markup from frame text while excluding renderTech", () => {
        const parsed = parseFrameMarkup(
            "frame 2 $[theme=emerald, shape=square, typography=upright, hold=2.4s, pitch=16px, dotSize=14, dotRadius=3, letterSpacing=2, wordSpacing=5, renderTech=original]",
        );

        expect(parsed.text).toBe("frame 2");
        expect(parsed.overrides).toEqual({
            theme: "emerald",
            dotShape: "square",
            italic: false,
            durationPerText: 2.4,
            cellPitch: 16,
            dotSize: 14,
            dotRadius: 3,
            letterSpacing: 2,
            wordSpacing: 5,
        });
        expect("renderTech" in parsed.overrides).toBe(false);
    });

    it("applies per-frame theme, shape, typography, hold duration, and pitch overrides in animated and still SVGs", () => {
        const texts = [
            "frame 1",
            "frame 2 $[theme=emerald, shape=square, italic=false, duration=2.0, pitch=16]",
            "frame 3 $[theme=crimson, duration=1.5]",
        ];

        const anim = generateFlipDotSvg({
            texts,
            theme: "amber",
            dotShape: "circle",
            italic: true,
            durationPerText: 3.8,
            cellPitch: 14,
        });

        // Clean label without $[...] markup
        expect(anim.svg).toContain("<title>frame 1 • frame 2 • frame 3</title>");
        expect(anim.svg).not.toContain("$[");

        // Extra theme gradients and glow filters injected for emerald and crimson
        expect(anim.svg).toContain("id=\"active-dot-grad-emerald\"");
        expect(anim.svg).toContain("id=\"dot-glow-emerald\"");
        expect(anim.svg).toContain("id=\"active-dot-grad-crimson\"");
        expect(anim.svg).toContain("url(#active-dot-grad-emerald)");
        expect(anim.svg).toContain("url(#active-dot-grad-crimson)");

        // Mixed circle + square shapes morph rx in keyframes
        expect(anim.svg).toContain("rx: 2.2px;");
        expect(anim.svg).toContain("rx: 7px;");

        // Frame 1 is italic, Frame 2 is upright (shearedWidth of upright is smaller than italic for "frame 2")
        const uprightRef = layoutFlipDotMatrix({
            text: "frame 2",
            italic: false,
            rows: anim.rows,
            minCols: anim.cols,
        });
        const italicRef = layoutFlipDotMatrix({
            text: "frame 2",
            italic: true,
            rows: anim.rows,
            minCols: anim.cols,
        });
        expect(anim.layouts[1].textBounds.shearedWidth).toBe(uprightRef.textBounds.shearedWidth);
        expect(anim.layouts[1].textBounds.shearedWidth).toBeLessThan(italicRef.textBounds.shearedWidth);

        // Custom cycle duration: initialHold (0.8) + 3.8 + 2.0 + 1.5 + 3.2 = 11.3s
        expect(anim.svg).toContain("11.3s cubic-bezier");

        // Still frames reflect each frame's individual overrides
        const stills = generateStillFlipDotFrames({
            texts,
            theme: "amber",
            dotShape: "circle",
            italic: true,
        });

        expect(stills).toHaveLength(3);
        expect(stills[0].text).toBe("frame 1");
        expect(stills[0].svg).toContain(PALETTES.amber.activeDot);
        expect(stills[0].svg).toContain("<circle ");

        expect(stills[1].text).toBe("frame 2");
        expect(stills[1].svg).toContain(PALETTES.emerald.activeDot);
        expect(stills[1].svg).toContain("<rect ");
        expect(stills[1].overrides.theme).toBe("emerald");
        expect(stills[1].overrides.dotShape).toBe("square");
        expect(stills[1].overrides.italic).toBe(false);

        expect(stills[2].text).toBe("frame 3");
        expect(stills[2].svg).toContain(PALETTES.crimson.activeDot);
    });
});
