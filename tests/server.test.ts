import { describe, expect, it } from "vitest";
import { createFlipApp } from "../server/app.ts";

describe("render tech API", () => {
    it("uses compound by default and honors original for animated, still, and POST exports", async () => {
        const app = await createFlipApp();

        try {
            for (const route of ["/api/svg", "/api/frame", "/flip.svg"]) {
                const compound = await app.inject(`${route}?text=hello`);
                const original = await app.inject(`${route}?text=hello&renderTech=original`);
                expect(compound.statusCode).toBe(200);
                expect(compound.body).toContain("<path class=\"d z\"");
                expect(original.body).not.toContain("<path class=\"d z\"");
                expect(original.body).toMatch(/<(circle|rect) class="d z"/);
            }

            const invalid = await app.inject("/api/svg?format=gif");
            expect(invalid.statusCode).toBe(400);
            const cached = await app.inject("/api/svg?text=cache");
            const conditional = await app.inject({
                url: "/api/svg?text=cache",
                headers: { "if-none-match": cached.headers.etag as string },
            });
            expect(conditional.statusCode).toBe(304);
            const raster = await app.inject("/api/frame?text=hello&format=webp");
            expect(raster.statusCode).toBe(200);
            expect(raster.headers["content-type"]).toBe("image/webp");

            // Animated raster returns immediate placeholder on cold cache
            const coldAnim = await app.inject("/api/svg?text=cold-test&format=webp");
            expect(coldAnim.statusCode).toBe(200);
            expect(coldAnim.headers["content-type"]).toBe("image/webp");
            expect(coldAnim.headers["cache-control"]).toContain("max-age=4");
            expect(coldAnim.headers.etag).toMatch(/^W\/"placeholder-/);

            const response = await app.inject({
                method: "POST",
                url: "/api/generate",
                payload: {
                    text: "hello",
                    renderTech: "original",
                },
            });
            expect(response.statusCode).toBe(200);
            expect(response.json().svg).not.toContain("<path class=\"d z\"");

            // APNG format placeholder and sync export verification
            const coldApng = await app.inject("/api/svg?text=cold-apng&format=apng");
            expect(coldApng.statusCode).toBe(200);
            expect(coldApng.headers["content-type"]).toBe("image/apng");
            expect(coldApng.headers["cache-control"]).toContain("max-age=4");
            expect(coldApng.headers.etag).toMatch(/^W\/"placeholder-/);

            // Synchronous still export on frame route passes through without placeholder
            const stillApng = await app.inject("/api/frame?text=still-hello&format=apng");
            expect(stillApng.statusCode).toBe(200);
            expect(stillApng.headers["content-type"]).toBe("image/apng");
            expect(stillApng.headers["cache-control"]).toContain("max-age=60");
            expect(stillApng.headers.etag).not.toMatch(/^W\/"placeholder-/);
        }
        finally {
            await app.close();
        }
    });

    it("supports sync=true to synchronously await completed raster rendering", async () => {
        const app = await createFlipApp();

        try {
            const syncRes = await app.inject("/api/frame?text=sync-test&format=webp&sync=true");
            expect(syncRes.statusCode).toBe(200);
            expect(syncRes.headers["content-type"]).toBe("image/webp");
            expect(syncRes.headers["cache-control"]).toContain("max-age=60");
            expect(syncRes.headers.etag).not.toMatch(/^W\/"placeholder-/);
        }
        finally {
            await app.close();
        }
    });

    it("parses comma-separated per-frame $[...] markup in GET /api/svg, GET /api/frame, and POST /api/generate", async () => {
        const app = await createFlipApp();

        try {
            const query = encodeURIComponent("frame 1, frame 2 $[theme=emerald, shape=square, italic=false, duration=2.0], frame 3");
            const animRes = await app.inject(`/api/svg?texts=${query}`);
            expect(animRes.statusCode).toBe(200);
            expect(animRes.body).toContain("<title>frame 1 • frame 2 • frame 3</title>");
            expect(animRes.body).toContain("id=\"active-dot-grad-emerald\"");
            expect(animRes.body).not.toContain("$[");

            const frameRes = await app.inject(`/api/frame?texts=${query}&frame=1`);
            expect(frameRes.statusCode).toBe(200);
            expect(frameRes.body).toContain("<title>frame 2</title>");
            expect(frameRes.body).toContain("<rect ");

            const genRes = await app.inject({
                method: "POST",
                url: "/api/generate",
                payload: {
                    texts: [
                        "frame 1",
                        "frame 2 $[theme=emerald, shape=square, italic=false, align=left]",
                    ],
                },
            });
            expect(genRes.statusCode).toBe(200);
            const json = genRes.json();
            expect(json.textCount).toBe(2);
            expect(json.frames[1].text).toBe("frame 2");
            expect(json.frames[1].overrides).toEqual({
                theme: "emerald",
                shape: "square",
                italic: false,
                align: "left",
            });
        }
        finally {
            await app.close();
        }
    });
});
