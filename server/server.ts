import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFlipApp } from "./app.ts";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
// When bundled into dist/server.js, staticRoot is __dirname (/app/dist).
// In development, staticRoot is ../../dist.
const staticDir = existsSync(resolve(__dirname, "index.html"))
    ? __dirname
    : resolve(__dirname, "../dist");

const port = Number(process.env.PORT || 4329);
const host = process.env.HOST || "0.0.0.0";

const app = await createFlipApp({
    staticRoot: staticDir,
    logger: process.env.NODE_ENV !== "test",
});

await app.listen({
    port,
    host,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, async () => {
        await app.close();
        process.exit(0);
    });
}
