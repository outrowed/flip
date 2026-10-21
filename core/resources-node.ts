/** Node-only resource loaders for CLI (sync) and Fastify (async). */

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { LoadedResources, GlyphsMap, PalettesMap, VariantMeta } from "./resources.ts";
import { setLoadedResources } from "./resources.ts";

function findStaticDir(): string {
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const candidates = [
        resolve(process.cwd(), "static"),
        resolve(process.cwd(), "../static"),
        resolve(moduleDir, "../static"),
        resolve(moduleDir, "../../static"),
        resolve(moduleDir, "../..", "static"),
    ];

    const found = candidates.find(dir => existsSync(resolve(dir, "data/glyphs.json")));

    if (!found) throw new Error(`Cannot locate static/ directory. Searched: ${candidates.join(", ")}`);

    return found;
}

function readResourceSet(staticDir: string): LoadedResources {
    const glyphs = JSON.parse(readFileSync(resolve(staticDir, "data/glyphs.json"), "utf8")) as GlyphsMap;
    const palettes = JSON.parse(readFileSync(resolve(staticDir, "data/palettes.json"), "utf8")) as PalettesMap;
    const boardTemplate = readFileSync(resolve(staticDir, "templates/board.svg"), "utf8");
    const placeholderTemplate = readFileSync(resolve(staticDir, "templates/placeholder.svg"), "utf8");
    const variants = JSON.parse(readFileSync(resolve(staticDir, "data/variants.json"), "utf8")) as VariantMeta[];
    const variantTemplates = Object.fromEntries(variants.map(({ id, template }) => [
        id,
        readFileSync(resolve(staticDir, "templates", template), "utf8"),
    ]));
    return {
        glyphs,
        palettes,
        boardTemplate,
        placeholderTemplate,
        variants,
        variantTemplates,
    };
}

/** Synchronous loading is reserved for the CLI. */
export function loadResourcesSync(): LoadedResources {
    return setLoadedResources(readResourceSet(findStaticDir()));
}

/** Asynchronous loading for the server, with resources read from disk. */
export async function loadResourcesAsync(): Promise<LoadedResources> {
    const staticDir = findStaticDir();
    const [glyphsRaw, palettesRaw, boardTemplate, placeholderTemplate, variantsRaw] = await Promise.all([
        readFile(resolve(staticDir, "data/glyphs.json"), "utf8"),
        readFile(resolve(staticDir, "data/palettes.json"), "utf8"),
        readFile(resolve(staticDir, "templates/board.svg"), "utf8"),
        readFile(resolve(staticDir, "templates/placeholder.svg"), "utf8"),
        readFile(resolve(staticDir, "data/variants.json"), "utf8"),
    ]);
    const glyphs = JSON.parse(glyphsRaw) as GlyphsMap;
    const palettes = JSON.parse(palettesRaw) as PalettesMap;
    const variants = JSON.parse(variantsRaw) as VariantMeta[];
    const variantTemplates = Object.fromEntries(await Promise.all(variants.map(async ({ id, template }) => [
        id,
        await readFile(resolve(staticDir, "templates", template), "utf8"),
    ] as const)));
    return setLoadedResources({
        glyphs,
        palettes,
        boardTemplate,
        placeholderTemplate,
        variants,
        variantTemplates,
    });
}
