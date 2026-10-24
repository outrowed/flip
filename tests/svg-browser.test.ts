import { beforeAll, expect, it } from "vitest";
import { chromium } from "playwright";
import { generateFlipDotSvg, generateStillFlipDotSvg } from "../core/svg.ts";
import { loadResourcesSync } from "../core/resources-node.ts";

beforeAll(() => loadResourcesSync());

it("keeps inactive dots uniform across frame holds, sweeps, and loop boundaries", async () => {
    const texts = [
        "hello $[color=amber, background=#10141d, align=left]",
        "world $[color=cyan, background=emerald, shape=square, italic=false, duration=2.5, pitch=16]",
        "bye $[theme=crimson, align=right]",
    ];
    const { svg, rows, cols } = generateFlipDotSvg({ texts });
    expect(svg).not.toContain("<path class=\"d z");
    const browser = await chromium.launch({ args: ["--no-sandbox"] });

    try {
        const page = await browser.newPage();
        await page.setContent(svg);
        expect(await page.locator("#flip-dot-matrix > rect").count()).toBe(rows * cols);

        for (const time of [3000, 6000, 9000, 12500, 17100]) {
            const groups = await page.evaluate((ms) => {
                for (const animation of document.getAnimations()) {
                    animation.pause();
                    animation.currentTime = ms;
                }

                const frame = ms === 6000 ? 1 : ms === 9000 ? 2 : -1;
                const dots = [...document.querySelectorAll("#flip-dot-matrix > rect")];
                return dots.filter((dot) => {
                    const pattern = dot.classList.value.match(/p-([01]+)/)?.[1];
                    return !pattern || (frame === -1 ? !pattern[0] || pattern[0] === "0" : pattern[frame] === "0");
                }).map((dot) => {
                    const style = getComputedStyle(dot);
                    return [style.fill, style.stroke, style.rx].join("|");
                });
            }, time);
            expect(new Set(groups).size).toBe(1);
        }

        // Before any text lights up, every disc follows the same sweep as its
        // coordinate, independent of whether it participates in a later word.
        for (const time of [4700, 5100, 5500]) {
            const consistent = await page.evaluate((ms) => {
                const dots = [...document.querySelectorAll("#flip-dot-matrix > rect")];
                const reference = document.querySelector(".z-bg");

                if (!reference) return false;

                const animation = reference.getAnimations()[0];

                if (!animation) return false;

                return dots.filter(dot => dot.classList.contains("p-001")).every((dot) => {
                    const own = dot.getAnimations()[0];
                    const delay = Number.parseFloat(getComputedStyle(dot).animationDelay) * 1000;

                    if (!own) return false;

                    own.currentTime = ms;
                    animation.currentTime = ms - delay + Number.parseFloat(getComputedStyle(reference).animationDelay) * 1000;
                    const actual = getComputedStyle(dot);
                    const expected = getComputedStyle(reference);
                    return actual.fill === expected.fill && actual.stroke === expected.stroke && actual.rx === expected.rx;
                });
            }, time);
            expect(consistent).toBe(true);
        }
    }
    finally {
        await browser.close();
    }
}, 30_000);

it.each(["#000", "#fff", "#10141d", "#10141d80", "#abcd"])("keeps custom background discs visible for %s", (background) => {
    const { svg } = generateStillFlipDotSvg({
        texts: ["hello"],
        background,
    });
    const fill = svg.match(/\.z\s*\{\s*fill: ([^;]+);/)?.[1];
    expect(fill).toBeTruthy();
    expect(fill).not.toBe(background);
});
