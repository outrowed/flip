/**
 * Shared display and per-frame parameter schema, parser, resolver, and URL serializer.
 *
 * Ensures that URL query parameters (`/api/svg?...`), POST payloads (`/api/generate`),
 * display configuration state, and inline per-frame markup (`$[key=value, ...]`)
 * share identical canonical keys and value validation rules.
 */

export type DotShape = "circle" | "square";
export type TextAlign = "left" | "center" | "right";

export const VALID_THEMES = new Set(["amber", "emerald", "white", "cyan", "crimson"]);
export const VALID_ALIGNMENTS = new Set<TextAlign>(["left", "center", "right"]);

/**
 * Canonical display parameter store shared across URL query parameters,
 * board display configuration, and per-frame `$[...]` overrides.
 * Note: `renderTech` is board-wide and intentionally excluded from per-frame parameters.
 */
export interface DisplayParams {
    theme?: string;
    color?: string;
    background?: string;
    shape?: DotShape;
    italic?: boolean;
    align?: TextAlign;
    duration?: number;
    pitch?: number;
    dotSize?: number;
    dotRadius?: number;
    letterSpacing?: number;
    wordSpacing?: number;
    padX?: number;
    padY?: number;
    rows?: number;
    minCols?: number;
    flipDuration?: number;
    sweepMax?: number;
}

export interface ResolvedDisplayParams {
    theme: string;
    color: string;
    background: string;
    shape: DotShape;
    italic: boolean;
    align: TextAlign;
    duration: number;
    pitch: number;
    dotSize: number;
    dotRadius: number;
    letterSpacing: number;
    wordSpacing: number;
    padX: number;
    padY: number;
    rows: number;
    minCols: number;
    flipDuration: number;
    sweepMax: number;
}

export const DEFAULT_DISPLAY_PARAMS: ResolvedDisplayParams = {
    theme: "amber",
    color: "amber",
    background: "amber",
    shape: "circle",
    italic: true,
    align: "center",
    duration: 3.8,
    pitch: 14,
    dotSize: 12,
    dotRadius: 2.2,
    letterSpacing: 2,
    wordSpacing: 5,
    padX: 3,
    padY: 2,
    rows: 13,
    minCols: 86,
    flipDuration: 0.35,
    sweepMax: 0.85,
};

export function isValidColorToken(val: string): boolean {
    return VALID_THEMES.has(val) || /^#[0-9a-f]{3,8}$/i.test(val);
}

export function parseNumericToken(rawVal: unknown, allowMilliseconds = false): number | undefined {
    if (typeof rawVal === "number") {
        return Number.isFinite(rawVal) ? rawVal : undefined;
    }

    if (typeof rawVal !== "string") return undefined;

    const lower = rawVal.trim().toLowerCase();

    if (!lower) return undefined;

    if (allowMilliseconds && lower.endsWith("ms")) {
        const ms = Number.parseFloat(lower.slice(0, -2));
        return Number.isFinite(ms) ? ms / 1000 : undefined;
    }

    const cleaned = lower.replace(/(px|s|deg)$/, "").trim();
    const num = Number.parseFloat(cleaned);
    return Number.isFinite(num) ? num : undefined;
}

/**
 * Normalizes and validates a single key-value pair from URL query params,
 * configuration objects, or `$[key=value]` markup, storing it on `store`
 * under its canonical URL parameter key.
 */
export function applyDisplayParam(store: DisplayParams, rawKey: string, rawVal: unknown): boolean {
    if (rawVal === undefined || rawVal === null || rawVal === "") return false;

    const normKey = String(rawKey)
        .trim()
        .toLowerCase()
        .replace(/[\s_-]+/g, "");

    if (!normKey) return false;

    const valStr = String(rawVal).trim();
    const valLower = valStr.toLowerCase();

    if (!valStr) return false;

    switch (normKey) {
        case "color":
        case "dotcolor":
        case "textcolor":
        case "fg":

        case "foreground": {
            if (isValidColorToken(valLower)) {
                store.color = valLower;
                return true;
            }

            return false;
        }

        case "background":
        case "bg":
        case "bgcolor":

        case "boardbg": {
            if (isValidColorToken(valLower)) {
                store.background = valLower;
                return true;
            }

            return false;
        }

        case "theme":
        case "colortheme":

        case "palette": {
            if (isValidColorToken(valLower)) {
                store.theme = valLower;
                return true;
            }

            return false;
        }

        case "shape":

        case "dotshape": {
            if (valLower === "circle" || valLower === "round") {
                store.shape = "circle";
                return true;
            }

            if (valLower === "square" || valLower === "rect") {
                store.shape = "square";
                return true;
            }

            return false;
        }

        case "italic":
        case "typography":
        case "fontstyle":
        case "style":

        case "slant": {
            if (typeof rawVal === "boolean") {
                store.italic = rawVal;
                return true;
            }

            if (["true", "1", "yes", "on", "italic", "slanted", "oblique"].includes(valLower)) {
                store.italic = true;
                return true;
            }

            if (["false", "0", "no", "off", "upright", "normal", "regular", "roman"].includes(valLower)) {
                store.italic = false;
                return true;
            }

            return false;
        }

        case "align":
        case "textalign":
        case "alignment":

        case "justify": {
            if (valLower === "left" || valLower === "start") {
                store.align = "left";
                return true;
            }

            if (valLower === "center" || valLower === "middle") {
                store.align = "center";
                return true;
            }

            if (valLower === "right" || valLower === "end") {
                store.align = "right";
                return true;
            }

            return false;
        }

        case "duration":
        case "hold":
        case "holdduration":
        case "durationpertext":

        case "time": {
            const sec = parseNumericToken(rawVal, true);

            if (sec !== undefined && sec >= 0.2 && sec <= 60) {
                store.duration = sec;
                return true;
            }

            return false;
        }

        case "pitch":
        case "dotpitch":

        case "cellpitch": {
            const pitch = parseNumericToken(rawVal);

            if (pitch !== undefined && pitch >= 4 && pitch <= 64) {
                store.pitch = pitch;
                return true;
            }

            return false;
        }

        case "dotsize":

        case "size": {
            const size = parseNumericToken(rawVal);

            if (size !== undefined && size >= 2 && size <= 64) {
                store.dotSize = size;
                return true;
            }

            return false;
        }

        case "dotradius":
        case "radius":

        case "rx": {
            const radius = parseNumericToken(rawVal);

            if (radius !== undefined && radius >= 0 && radius <= 32) {
                store.dotRadius = radius;
                return true;
            }

            return false;
        }

        case "letterspacing":

        case "tracking": {
            const ls = parseNumericToken(rawVal);

            if (ls !== undefined && ls >= 0 && ls <= 20) {
                store.letterSpacing = Math.round(ls);
                return true;
            }

            return false;
        }

        case "wordspacing": {
            const ws = parseNumericToken(rawVal);

            if (ws !== undefined && ws >= 1 && ws <= 40) {
                store.wordSpacing = Math.round(ws);
                return true;
            }

            return false;
        }

        case "padx":

        case "paddingx": {
            const px = parseNumericToken(rawVal);

            if (px !== undefined && px >= 0 && px <= 40) {
                store.padX = Math.round(px);
                return true;
            }

            return false;
        }

        case "pady":

        case "paddingy": {
            const py = parseNumericToken(rawVal);

            if (py !== undefined && py >= 0 && py <= 40) {
                store.padY = Math.round(py);
                return true;
            }

            return false;
        }

        case "rows":

        case "height": {
            const r = parseNumericToken(rawVal);

            if (r !== undefined && r >= 9 && r <= 64) {
                store.rows = Math.round(r);
                return true;
            }

            return false;
        }

        case "mincols":
        case "cols":

        case "columns": {
            const c = parseNumericToken(rawVal);

            if (c !== undefined && c >= 1 && c <= 300) {
                store.minCols = Math.round(c);
                return true;
            }

            return false;
        }

        case "flipduration": {
            const fd = parseNumericToken(rawVal, true);

            if (fd !== undefined && fd >= 0.05 && fd <= 5) {
                store.flipDuration = fd;
                return true;
            }

            return false;
        }

        case "sweepmax":

        case "sweep": {
            const sm = parseNumericToken(rawVal, true);

            if (sm !== undefined && sm >= 0 && sm <= 5) {
                store.sweepMax = sm;
                return true;
            }

            return false;
        }

        default:
            // Explicitly ignore renderTech and non-display keys
            return false;
    }
}

/**
 * Parses any key-value source (`URLSearchParams`, query/body object, `SvgOptions`,
 * or `[key, value]` entries) into a canonical `DisplayParams` store.
 */
export function parseDisplayParams(
    source: URLSearchParams | Record<string, unknown> | Iterable<[string, unknown]> | null | undefined,
): DisplayParams {
    const store: DisplayParams = {};

    if (!source) return store;

    if (source instanceof URLSearchParams) {
        for (const [k, v] of source.entries()) {
            applyDisplayParam(store, k, v);
        }

        return store;
    }

    if (typeof (source as Iterable<[string, unknown]>)[Symbol.iterator] === "function") {
        for (const [k, v] of source as Iterable<[string, unknown]>) {
            applyDisplayParam(store, k, v);
        }

        return store;
    }

    for (const [k, v] of Object.entries(source)) {
        applyDisplayParam(store, k, v);
    }

    return store;
}

/**
 * Merges base display parameters and per-frame overrides with `DEFAULT_DISPLAY_PARAMS`
 * to produce a complete `ResolvedDisplayParams` configuration.
 */
export function resolveDisplayParams(
    base?: DisplayParams | Record<string, unknown>,
    overrides?: DisplayParams | Record<string, unknown>,
): ResolvedDisplayParams {
    const normBase = base ? parseDisplayParams(base as Record<string, unknown>) : {};
    const normOver = overrides ? parseDisplayParams(overrides as Record<string, unknown>) : {};

    const theme = normOver.theme ?? normBase.theme ?? DEFAULT_DISPLAY_PARAMS.theme;
    const color = normOver.color ?? normOver.theme ?? normBase.color ?? normBase.theme ?? theme;
    const background = normOver.background ?? normOver.theme ?? normBase.background ?? normBase.theme ?? theme;
    const pitch = normOver.pitch ?? normBase.pitch ?? DEFAULT_DISPLAY_PARAMS.pitch;

    const dotSize = normOver.dotSize
        ?? (normOver.pitch !== undefined
            ? Math.max(2, pitch - 2)
            : normBase.dotSize
                ?? (normBase.pitch !== undefined ? Math.max(2, pitch - 2) : DEFAULT_DISPLAY_PARAMS.dotSize));

    return {
        theme,
        color,
        background,
        shape: normOver.shape ?? normBase.shape ?? DEFAULT_DISPLAY_PARAMS.shape,
        italic: normOver.italic ?? normBase.italic ?? DEFAULT_DISPLAY_PARAMS.italic,
        align: normOver.align ?? normBase.align ?? DEFAULT_DISPLAY_PARAMS.align,
        duration: normOver.duration ?? normBase.duration ?? DEFAULT_DISPLAY_PARAMS.duration,
        pitch,
        dotSize,
        dotRadius: normOver.dotRadius ?? normBase.dotRadius ?? DEFAULT_DISPLAY_PARAMS.dotRadius,
        letterSpacing: normOver.letterSpacing ?? normBase.letterSpacing ?? DEFAULT_DISPLAY_PARAMS.letterSpacing,
        wordSpacing: normOver.wordSpacing ?? normBase.wordSpacing ?? DEFAULT_DISPLAY_PARAMS.wordSpacing,
        padX: normOver.padX ?? normBase.padX ?? DEFAULT_DISPLAY_PARAMS.padX,
        padY: normOver.padY ?? normBase.padY ?? DEFAULT_DISPLAY_PARAMS.padY,
        rows: normOver.rows ?? normBase.rows ?? DEFAULT_DISPLAY_PARAMS.rows,
        minCols: normOver.minCols ?? normBase.minCols ?? DEFAULT_DISPLAY_PARAMS.minCols,
        flipDuration: normOver.flipDuration ?? normBase.flipDuration ?? DEFAULT_DISPLAY_PARAMS.flipDuration,
        sweepMax: normOver.sweepMax ?? normBase.sweepMax ?? DEFAULT_DISPLAY_PARAMS.sweepMax,
    };
}

/**
 * Serializes a `DisplayParams` store into canonical URL query string key-value pairs,
 * omitting parameters that match `defaults`.
 */
export function serializeDisplayParams(
    params: DisplayParams | Record<string, unknown>,
    defaults: ResolvedDisplayParams = DEFAULT_DISPLAY_PARAMS,
): Record<string, string> {
    const norm = parseDisplayParams(params as Record<string, unknown>);
    const out: Record<string, string> = {};

    if (norm.shape && norm.shape !== defaults.shape) out.shape = norm.shape;

    if (norm.theme && norm.theme !== defaults.theme) out.theme = norm.theme;

    if (norm.color && norm.color !== (norm.theme ?? defaults.color)) out.color = norm.color;

    if (norm.background && norm.background !== (norm.theme ?? defaults.background)) out.background = norm.background;

    if (norm.italic !== undefined && norm.italic !== defaults.italic) out.italic = String(norm.italic);

    if (norm.align && norm.align !== defaults.align) out.align = norm.align;

    if (norm.duration !== undefined && norm.duration !== defaults.duration) out.duration = String(norm.duration);

    if (norm.pitch !== undefined && norm.pitch !== defaults.pitch) out.pitch = String(norm.pitch);

    const expectedDotSize = (norm.pitch ?? defaults.pitch) - 2;

    if (norm.dotSize !== undefined && norm.dotSize !== expectedDotSize && norm.dotSize !== defaults.dotSize) {
        out.dotSize = String(norm.dotSize);
    }

    if (norm.dotRadius !== undefined && norm.dotRadius !== defaults.dotRadius) out.dotRadius = String(norm.dotRadius);

    if (norm.letterSpacing !== undefined && norm.letterSpacing !== defaults.letterSpacing) {
        out.letterSpacing = String(norm.letterSpacing);
    }

    if (norm.wordSpacing !== undefined && norm.wordSpacing !== defaults.wordSpacing) {
        out.wordSpacing = String(norm.wordSpacing);
    }

    if (norm.padX !== undefined && norm.padX !== defaults.padX) out.padX = String(norm.padX);

    if (norm.padY !== undefined && norm.padY !== defaults.padY) out.padY = String(norm.padY);

    if (norm.rows !== undefined && norm.rows !== defaults.rows) out.rows = String(norm.rows);

    if (norm.minCols !== undefined && norm.minCols !== defaults.minCols) out.minCols = String(norm.minCols);

    if (norm.flipDuration !== undefined && norm.flipDuration !== defaults.flipDuration) {
        out.flipDuration = String(norm.flipDuration);
    }

    if (norm.sweepMax !== undefined && norm.sweepMax !== defaults.sweepMax) out.sweepMax = String(norm.sweepMax);

    return out;
}

/**
 * Appends canonical non-default `DisplayParams` onto a `URLSearchParams` instance.
 */
export function appendDisplaySearchParams(
    searchParams: URLSearchParams,
    params: DisplayParams | Record<string, unknown>,
    defaults: ResolvedDisplayParams = DEFAULT_DISPLAY_PARAMS,
): URLSearchParams {
    const serialized = serializeDisplayParams(params, defaults);

    for (const [k, v] of Object.entries(serialized)) {
        searchParams.set(k, v);
    }

    return searchParams;
}
