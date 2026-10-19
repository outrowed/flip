import { describe, it, expect } from "vitest";
import { variants } from "./variants.ts";
import { generateFlipDotSvg } from "../engine/svg.ts";

describe("SVG lab representation experiments", () => {
    for (const dotShape of ["circle", "square"]) {
        it(`keeps original output untouched for ${dotShape}`, () => {
            const options = {
                dotShape,
                texts: ["hello", "world"],
            };
            const output = variants(options);
            expect(output[0].svg).toBe(generateFlipDotSvg({
                ...options,
                renderTech: "original",
            }).svg);
            expect(output.length).toBeGreaterThanOrEqual(8);

            for (const v of output) {
                expect(v.svg).toContain("prefers-reduced-motion: reduce");
                expect(v.svg).not.toContain("<script");
            }

            const before = (output[0].svg.match(/<(circle|rect) class="d z"/g) || []).length;
            const after = (output[2].svg.match(/<(circle|rect) class="d z"/g) || []).length; // path variant
            expect(before).toBeGreaterThan(0);
            expect(after).toBe(0);
            expect(output[2].svg).toContain("<path class=\"d z\"");
        });
    }
});
