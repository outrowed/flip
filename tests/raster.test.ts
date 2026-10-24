import { beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";
import UPNG from "upng-js";
import { generatePlaceholder, OutputCache, rasterize } from "../server/raster.ts";
import { loadResourcesSync } from "../core/resources-node.ts";
import { generateFlipDotSvg } from "../core/svg.ts";

beforeAll(() => loadResourcesSync());

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><style>@keyframes k-1{from{fill:red}to{fill:blue}}rect{animation: k-1 0.2s linear infinite}</style><rect width="16" height="16"/></svg>`;

describe("raster output", () => {
    it("encodes real animation frames in APNG and WebP", async () => {
        const apng = await rasterize(svg, "apng");
        const decoded = UPNG.decode(Uint8Array.from(apng).buffer);
        expect(decoded.frames).toHaveLength(5);
        const frames = UPNG.toRGBA8(decoded);
        expect(Buffer.from(frames[0]).equals(Buffer.from(frames[1]))).toBe(false);
        const webp = await rasterize(svg, "webp");
        const metadata = await sharp(webp, { animated: true }).metadata();
        expect(metadata.pages).toBe(5);
        expect(metadata.delay).toEqual([42, 41, 42, 42, 41]);
    }, 30_000);

    it("skips static holds in flip-dot animations and enforces Camo size limits", async () => {
        const multiTextSvg = generateFlipDotSvg({
            texts: ["alpha", "beta"],
            theme: "amber",
            minCols: 40,
            rows: 11,
            cellPitch: 14,
            dotSize: 12,
        });

        // 2 texts with durationPerText 3.8 = ~10.8s cycle. At 24 FPS that's ~260 frames linearly.
        // With hold skipping, static hold periods collapse into single frames with extended delays.
        const apng = await rasterize(multiTextSvg.svg, "apng");
        expect(apng.length).toBeLessThan(5 * 1024 * 1024);

        // Verify valid APNG structure ending with IEND
        const tail = apng.subarray(-12);
        expect(tail.subarray(4, 8).toString("ascii")).toBe("IEND");

        const decoded = UPNG.decode(Uint8Array.from(apng).buffer);
        expect(decoded.frames.length).toBeLessThan(100);

        // Verify extended hold delays were retained
        const maxDelay = Math.max(...decoded.frames.map(f => f.delay));
        expect(maxDelay).toBeGreaterThan(1000);
    }, 30_000);

    it("deduplicates, evicts by bytes, and retries failed generation", async () => {
        const cache = new OutputCache(4);
        let calls = 0;

        const generate = async () => {
            calls += 1;
            return Buffer.from("abc");
        };

        const [first, second] = await Promise.all([cache.get("a", generate), cache.get("a", generate)]);
        expect(first).toBe(second);
        expect(calls).toBe(1);
        await cache.get("b", generate);
        await cache.get("a", generate);
        expect(calls).toBe(3);
        expect(cache.peek("a")?.data.toString()).toBe("abc");
        expect(cache.peek("non-existent")).toBeUndefined();
        expect(cache.isPending("non-existent")).toBe(false);

        await expect(cache.get("error", async () => { throw new Error("failed"); })).rejects.toThrow("failed");
        await expect(cache.get("error", generate)).resolves.toHaveProperty("data");
    });

    it("generates placeholders with exact dimensions and proper format encoding", async () => {
        const testUrl = "https://flip.taruna.me/api/svg?texts=hello+world&format=webp";
        const progress = {
            percent: 45,
            elapsedMs: 3200,
        };
        const pWebp = await generatePlaceholder(640, 180, "webp", "amber", testUrl, progress);
        const pPng = await generatePlaceholder(640, 180, "apng", "emerald");
        const pSvg = await generatePlaceholder(640, 180, "svg", "amber", testUrl, progress);

        const svgContent = pSvg.toString("utf8");
        expect(svgContent).toContain("https://flip.taruna.me/api/svg?texts=hello+world&amp;format=webp");
        expect(svgContent).toContain("45%");
        expect(svgContent).toContain("3.2s");
        expect(svgContent).toContain("id=\"progress-bar-clip\"");

        const metaWebp = await sharp(pWebp).metadata();
        expect(metaWebp.width).toBe(640);
        expect(metaWebp.height).toBe(180);
        expect(metaWebp.format).toBe("webp");

        const metaPng = await sharp(pPng).metadata();
        expect(metaPng.width).toBe(640);
        expect(metaPng.height).toBe(180);
        expect(metaPng.format).toBe("png");
    });

    it("serializes concurrent rasterize calls without throwing busy errors", async () => {
        const [r1, r2] = await Promise.all([
            rasterize(svg, "webp", true),
            rasterize(svg, "webp", true),
        ]);
        expect(r1.length).toBeGreaterThan(0);
        expect(r2.length).toBeGreaterThan(0);
    }, 30_000);
});
