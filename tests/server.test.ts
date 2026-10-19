import { describe, expect, it } from "vitest";
import { createFlipApp } from "../src/server/app.ts";

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
        }
        finally {
            await app.close();
        }
    });
});
