/** Shared cache and browser loader for files under static/. */

export interface PaletteDef {
    name: string;
    casingOuter: string;
    casingInner: string;
    casingStroke: string;
    recessBg: string;
    zeroDot: string;
    zeroDotStroke: string;
    zeroHighlight: string;
    flipFlash: string;
    activeDot: string;
    activeDotBright: string;
    activeDotStroke: string;
    screwFill: string;
    screwSlot: string;
}

export type PalettesMap = Record<string, PaletteDef>;
export type GlyphsMap = Record<string, string[]>;

export interface VariantMeta {
    id: string;
    title: string;
    note: string;
    template: string;
}

export interface LoadedResources {
    glyphs: GlyphsMap;
    palettes: PalettesMap;
    boardTemplate: string;
    placeholderTemplate: string;
    variants: VariantMeta[];
    variantTemplates: Record<string, string>;
}

let resources: LoadedResources | null = null;

export function setLoadedResources(value: LoadedResources): LoadedResources {
    resources = value;
    return value;
}

function loaded(): LoadedResources {
    if (!resources) throw new Error("Static resources not loaded. Await loadResourcesAsync() first.");

    return resources;
}

export const PALETTES: PalettesMap = new Proxy({} as PalettesMap, {
    get(_target, prop) {
        return loaded().palettes[prop as string];
    },
    ownKeys() {
        return Reflect.ownKeys(loaded().palettes);
    },
    getOwnPropertyDescriptor(_target, prop) {
        const palettes = loaded().palettes;

        if (!(prop in palettes)) return undefined;

        return {
            value: palettes[prop as string],
            writable: false,
            enumerable: true,
            configurable: true,
        };
    },
});

export function getLoadedGlyphs(): GlyphsMap {
    return loaded().glyphs;
}

export function getLoadedPalettes(): PalettesMap {
    return loaded().palettes;
}

export function getLoadedBoardTemplate(): string {
    return loaded().boardTemplate;
}

export function getLoadedPlaceholderTemplate(): string {
    return loaded().placeholderTemplate;
}

export function getLoadedVariants(): VariantMeta[] {
    return loaded().variants;
}

export function getLoadedVariantTemplates(): Record<string, string> {
    return loaded().variantTemplates;
}

export async function loadResourcesAsync(base = "/static"): Promise<LoadedResources> {
    if (resources) return resources;

    const urls = [
        `${base}/data/glyphs.json`,
        `${base}/data/palettes.json`,
        `${base}/templates/board.svg`,
        `${base}/templates/placeholder.svg`,
        `${base}/data/variants.json`,
    ];
    const [glyphsResponse, palettesResponse, boardResponse, placeholderResponse, variantsResponse] = await Promise.all(urls.map(url => fetch(url)));

    for (const [response, url] of [
        [glyphsResponse, urls[0]],
        [palettesResponse, urls[1]],
        [boardResponse, urls[2]],
        [placeholderResponse, urls[3]],
        [variantsResponse, urls[4]],
    ] as const) {
        if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
    }

    const [glyphs, palettes, boardTemplate, placeholderTemplate, variants] = await Promise.all([
        glyphsResponse.json() as Promise<GlyphsMap>,
        palettesResponse.json() as Promise<PalettesMap>,
        boardResponse.text(),
        placeholderResponse.text(),
        variantsResponse.json() as Promise<VariantMeta[]>,
    ]);

    const variantTemplates = Object.fromEntries(await Promise.all(variants.map(async ({ id, template }) => {
        const url = `${base}/templates/${template}`;
        const response = await fetch(url);

        if (!response.ok) throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);

        return [id, await response.text()] as const;
    })));

    const result = {
        glyphs,
        palettes,
        boardTemplate,
        placeholderTemplate,
        variants,
        variantTemplates,
    };
    setLoadedResources(result);
    return result;
}
