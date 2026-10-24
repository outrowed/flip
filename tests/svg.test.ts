import { beforeAll, describe, expect, it } from "vitest";
import { layoutFlipDotMatrix } from "../core/matrix.ts";
import {
    generateFlipDotSvg,
    generateStillFlipDotFrames,
    generateStillFlipDotSvg,
    PALETTES,
    parseDisplayParams,
    parseFrameMarkup,
    serializeDisplayParams,
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
            "frame 2 $[theme=emerald, shape=square, typography=upright, align=right, hold=2.4s, pitch=16px, dotSize=14, dotRadius=3, letterSpacing=2, wordSpacing=5, renderTech=original]",
        );

        expect(parsed.text).toBe("frame 2");
        expect(parsed.overrides).toEqual({
            theme: "emerald",
            shape: "square",
            italic: false,
            align: "right",
            duration: 2.4,
            pitch: 16,
            dotSize: 14,
            dotRadius: 3,
            letterSpacing: 2,
            wordSpacing: 5,
        });
        expect("renderTech" in parsed.overrides).toBe(false);
    });

    it("maintains identical canonical key-value stores across URLSearchParams, objects, and frame markup", () => {
        const searchParams = new URLSearchParams(
            "theme=cyan&color=crimson&background=emerald&shape=square&italic=false&align=left&duration=2.5&pitch=16&dotRadius=3",
        );
        const fromUrl = parseDisplayParams(searchParams);
        const fromMarkup = parseFrameMarkup(
            "banner $[theme=cyan, color=crimson, background=emerald, shape=square, italic=false, align=left, duration=2.5, pitch=16, dotRadius=3]",
        ).overrides;

        expect(fromUrl).toEqual(fromMarkup);
        expect(serializeDisplayParams(fromUrl)).toEqual({
            theme: "cyan",
            color: "crimson",
            background: "emerald",
            shape: "square",
            italic: "false",
            align: "left",
            duration: "2.5",
            pitch: "16",
            dotRadius: "3",
        });
    });

    it("applies per-frame color, background, shape, align, typography, hold duration, and pitch overrides", () => {
        const texts = [
            "frame 1 $[align=left]",
            "frame 2 $[color=emerald, background=crimson, shape=square, italic=false, align=right, duration=2.0, pitch=16]",
            "frame 3 with longer background $[color=crimson, background=cyan, duration=1.5]",
        ];

        const anim = generateFlipDotSvg({
            texts,
            theme: "amber",
            shape: "circle",
            italic: true,
            duration: 3.8,
            pitch: 14,
        });

        // Clean label without $[...] markup
        expect(anim.svg).toContain("<title>frame 1 • frame 2 • frame 3 with longer background</title>");
        expect(anim.svg).not.toContain("$[");

        // Color gradients and glow filters are independent from the board background.
        expect(anim.svg).toContain("id=\"active-dot-grad-emerald\"");
        expect(anim.svg).toContain("id=\"dot-glow-emerald\"");
        expect(anim.svg).toContain("id=\"active-dot-grad-crimson\"");
        expect(anim.svg).toContain("url(#active-dot-grad-emerald)");
        expect(anim.svg).toContain("url(#active-dot-grad-crimson)");
        expect(anim.svg).toContain("class=\"recess-bezel\"");
        expect(anim.svg).toContain("@keyframes k-recess-bg");
        expect(anim.svg).toContain(PALETTES.crimson.recessBg);
        expect(anim.svg).toContain(PALETTES.cyan.recessBg);

        // Mixed circle + square shapes morph rx in keyframes
        expect(anim.svg).toContain("rx: 2.2px;");
        expect(anim.svg).toContain("rx: 7px;");

        // Frame 1 is left-aligned (startCol === padX = 3), Frame 2 is right-aligned against the wider board
        expect(anim.layouts[0].textBounds.startCol).toBe(3);
        expect(anim.layouts[1].textBounds.endCol).toBe(anim.cols - 3 - 1);

        // Frame 1 is italic, Frame 2 is upright (shearedWidth of upright is smaller than italic for "frame 2")
        const uprightRef = layoutFlipDotMatrix({
            text: "frame 2",
            italic: false,
            align: "right",
            rows: anim.rows,
            minCols: anim.cols,
        });
        const italicRef = layoutFlipDotMatrix({
            text: "frame 2",
            italic: true,
            align: "right",
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
            shape: "circle",
            italic: true,
        });

        expect(stills).toHaveLength(3);
        expect(stills[0].text).toBe("frame 1");
        expect(stills[0].svg).toContain(PALETTES.amber.activeDot);
        expect(stills[0].svg).toContain("<circle ");

        expect(stills[1].text).toBe("frame 2");
        expect(stills[1].svg).toContain(PALETTES.emerald.activeDot);
        expect(stills[1].svg).toContain(PALETTES.crimson.recessBg);
        expect(stills[1].svg).toContain("<rect ");
        expect(stills[1].overrides.color).toBe("emerald");
        expect(stills[1].overrides.background).toBe("crimson");
        expect(stills[1].overrides.shape).toBe("square");
        expect(stills[1].overrides.align).toBe("right");
        expect(stills[1].overrides.italic).toBe(false);

        expect(stills[2].text).toBe("frame 3 with longer background");
        expect(stills[2].svg).toContain(PALETTES.crimson.activeDot);
        expect(stills[2].svg).toContain(PALETTES.cyan.recessBg);
    });

    it("correctly holds inactive dots and recess bezel at each frame background during multi-frame animation", () => {
        const texts = [
            "hello $[color=amber, background=#10141d, align=left]",
            "world $[color=cyan, background=emerald, shape=square, italic=false, duration=2.5, pitch=16]",
            "bye $[theme=crimson, align=right]",
        ];

        const anim = generateFlipDotSvg({ texts });

        // Ensure keyframe rules for recess and zero background exist
        expect(anim.svg).toContain("@keyframes k-recess-bg");
        expect(anim.svg).toContain("@keyframes k-zero-bg");

        // Helper to extract keyframe step lines
        const getKf = (name: string) => {
            const m = anim.svg.match(new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\}\\n    \\.`));
            return m ? m[1].trim() : "";
        };

        const recessKf = getKf("k-recess-bg");
        const zeroKf = getKf("k-zero-bg");

        // Frame 0 hold (between 8.16% and 32.62%): must hold at Frame 0's background #10141d
        expect(recessKf).toContain("8.16% { fill: #10141d; }");
        expect(recessKf).toContain("32.62% { fill: #10141d; }");
        expect(zeroKf).toContain("8.16% { fill: #1e222b; stroke: #2c3039; rx: 7px; }");
        expect(zeroKf).toContain("32.62% { fill: #1e222b; stroke: #2c3039; rx: 7px; }");

        // Frame 1 hold (between 35.11% and 50.35%): must hold at emerald background
        expect(recessKf).toContain(`35.11% { fill: ${PALETTES.emerald.recessBg}; }`);
        expect(recessKf).toContain(`50.35% { fill: ${PALETTES.emerald.recessBg}; }`);
        expect(zeroKf).toContain(`35.11% { fill: ${PALETTES.emerald.zeroDot}; stroke: ${PALETTES.emerald.zeroDotStroke}; rx: 2.2px; }`);
        expect(zeroKf).toContain(`50.35% { fill: ${PALETTES.emerald.zeroDot}; stroke: ${PALETTES.emerald.zeroDotStroke}; rx: 2.2px; }`);

        // Frame 2 hold (between 52.84% and 77.3%): must hold at crimson background
        expect(recessKf).toContain(`52.84% { fill: ${PALETTES.crimson.recessBg}; }`);
        expect(recessKf).toContain(`77.3% { fill: ${PALETTES.crimson.recessBg}; }`);
        expect(zeroKf).toContain(`52.84% { fill: ${PALETTES.crimson.zeroDot}; stroke: ${PALETTES.crimson.zeroDotStroke}; rx: 7px; }`);
        expect(zeroKf).toContain(`77.3% { fill: ${PALETTES.crimson.zeroDot}; stroke: ${PALETTES.crimson.zeroDotStroke}; rx: 7px; }`);

        // Final blank hold: returns to Frame 0 background and holds until cycle completion
        expect(recessKf).toContain("79.79% { fill: #10141d; }");
        expect(recessKf).toContain("100% { fill: #10141d; }");
        expect(zeroKf).toContain("79.79% { fill: #1e222b; stroke: #2c3039; rx: 7px; }");
        expect(zeroKf).toContain("100% { fill: #1e222b; stroke: #2c3039; rx: 7px; }");

        // Inactive dots across transitions (e.g. dots only lit in 'world' [seq 010])
        // must also match zero background during Frame 0, Frame 2, and blank hold
        const k010 = getKf("k-010");
        expect(k010).toContain("32.62% { fill: #1e222b; stroke: #2c3039;");
        expect(k010).toContain(`52.84% { fill: ${PALETTES.crimson.zeroDot}; stroke: ${PALETTES.crimson.zeroDotStroke};`);
        expect(k010).toContain(`77.3% { fill: ${PALETTES.crimson.zeroDot}; stroke: ${PALETTES.crimson.zeroDotStroke};`);
        expect(k010).toContain("79.79% { fill: #1e222b; stroke: #2c3039;");
    });
});
