/**
 * FLIP - Flip-dot Letter & Image Playground
 *
 * Generates self-contained animated SVGs of electromechanical flip-dot
 * display boards compatible with GitHub README Markdown (`<img>` / `![]()`).
 *
 * Supports single-text or rotating multi-text sequences, circular or square
 * flip-dots, customizable color palettes, per-frame `$[key=value, ...]` markup
 * overrides, and realistic solenoid-flip animations.
 */

import { layoutFlipDotMatrix } from "./matrix.ts";

export { PALETTES } from "./resources.ts";
import { PALETTES, type PaletteDef, getLoadedBoardTemplate } from "./resources.ts";

export type RenderTech = "compound-path" | "original";

export const DEFAULT_ROTATING_TEXTS = [
    "hello world",
    "its me",
    "taruna",
    "outrowed",
    "peace out~",
];

export const DEFAULT_SVG_OPTIONS = {
    text: DEFAULT_ROTATING_TEXTS[0],
    texts: DEFAULT_ROTATING_TEXTS,
    dotShape: "circle", // "circle" | "square"
    renderTech: "compound-path" as RenderTech,
    italic: true,
    rows: 13,
    minCols: 86,
    cellPitch: 14,
    dotSize: 12,
    dotRadius: 2.2,
    boardPaddingX: 28,
    boardPaddingY: 26,
    cycleSeconds: 24,
    durationPerText: 3.8,
    initialHold: 0.8,
    flipDuration: 0.35,
    sweepMax: 0.85,
    theme: "amber",
};

export type Palette = PaletteDef;
export type SvgOptions = Partial<Omit<typeof DEFAULT_SVG_OPTIONS, "palette">> & {
    palette?: Partial<Palette>;
    color?: string;
    background?: string;
    frameIndex?: number;
    letterSpacing?: number;
    wordSpacing?: number;
    padX?: number;
    padY?: number;
    renderTech?: RenderTech;
};

/**
 * Per-frame configuration overrides parsed from `$[key=value, ...]` markup.
 * Note: `renderTech` is intentionally excluded from per-frame customization.
 */
export interface FrameOverrides {
    color?: string;
    background?: string;
    theme?: string;
    dotShape?: "circle" | "square";
    italic?: boolean;
    durationPerText?: number;
    cellPitch?: number;
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

export interface ParsedFrameSpec {
    raw: string;
    text: string;
    overrides: FrameOverrides;
}

const VALID_THEMES = new Set(["amber", "emerald", "white", "cyan", "crimson"]);

function parseNumericToken(rawVal: string, allowMilliseconds = false): number | undefined {
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

function isValidColorToken(val: string): boolean {
    return VALID_THEMES.has(val) || /^#[0-9a-f]{3,8}$/i.test(val);
}

/**
 * Splits a comma- or newline-delimited `texts` string into individual frame lines
 * while preserving commas inside `$[key=value, ...]` markup blocks.
 */
export function splitFrameTexts(input: string): string[] {
    const result: string[] = [];
    let current = "";
    let depth = 0;

    for (let i = 0; i < input.length; i += 1) {
        const ch = input[i];

        if (ch === "$" && input[i + 1] === "[") {
            depth += 1;
            current += "$[";
            i += 1;
            continue;
        }

        if (ch === "]" && depth > 0) {
            depth -= 1;
            current += ch;
            continue;
        }

        if ((ch === "," || ch === "\n" || ch === "\r") && depth === 0) {
            const trimmed = current.trim();

            if (trimmed) result.push(trimmed);

            current = "";
            continue;
        }

        current += ch;
    }

    const tail = current.trim();

    if (tail) result.push(tail);

    return result;
}

/**
 * Parses a single frame line containing optional `$[key=value, ...]` markup.
 */
export function parseFrameMarkup(rawLine: string): ParsedFrameSpec {
    const raw = String(rawLine ?? "");
    const overrides: FrameOverrides = {};
    const matches = [...raw.matchAll(/\$\[([^\]]*)\]/g)];

    if (matches.length === 0) {
        return {
            raw,
            text: raw,
            overrides,
        };
    }

    for (const match of matches) {
        const body = match[1] ?? "";
        const pairs = body.split(",");

        for (const pair of pairs) {
            const eqIdx = pair.indexOf("=");

            if (eqIdx < 0) continue;

            const normKey = pair
                .slice(0, eqIdx)
                .trim()
                .toLowerCase()
                .replace(/[\s_-]+/g, "");
            const rawVal = pair.slice(eqIdx + 1).trim();
            const valLower = rawVal.toLowerCase();

            if (!normKey || !rawVal) continue;

            switch (normKey) {
                case "color":
                case "dotcolor":
                case "textcolor":
                case "fg":

                case "foreground": {
                    if (isValidColorToken(valLower)) {
                        overrides.color = valLower;
                    }

                    break;
                }

                case "background":
                case "bg":
                case "bgcolor":

                case "boardbg": {
                    if (isValidColorToken(valLower)) {
                        overrides.background = valLower;
                    }

                    break;
                }

                case "theme":
                case "colortheme":

                case "palette": {
                    if (VALID_THEMES.has(valLower)) {
                        overrides.theme = valLower;
                        overrides.color = valLower;
                        overrides.background = valLower;
                    }

                    break;
                }

                case "shape":

                case "dotshape": {
                    if (valLower === "circle" || valLower === "round") {
                        overrides.dotShape = "circle";
                    }
                    else if (valLower === "square" || valLower === "rect") {
                        overrides.dotShape = "square";
                    }

                    break;
                }

                case "italic":
                case "typography":
                case "fontstyle":
                case "style":

                case "slant": {
                    if (["true", "1", "yes", "on", "italic", "slanted", "oblique"].includes(valLower)) {
                        overrides.italic = true;
                    }
                    else if (["false", "0", "no", "off", "upright", "normal", "regular", "roman"].includes(valLower)) {
                        overrides.italic = false;
                    }

                    break;
                }

                case "duration":
                case "hold":
                case "holdduration":
                case "durationpertext":

                case "time": {
                    const sec = parseNumericToken(rawVal, true);

                    if (sec !== undefined && sec >= 0.2 && sec <= 60) {
                        overrides.durationPerText = sec;
                    }

                    break;
                }

                case "pitch":
                case "dotpitch":

                case "cellpitch": {
                    const pitch = parseNumericToken(rawVal);

                    if (pitch !== undefined && pitch >= 4 && pitch <= 64) {
                        overrides.cellPitch = pitch;
                    }

                    break;
                }

                case "dotsize":

                case "size": {
                    const size = parseNumericToken(rawVal);

                    if (size !== undefined && size >= 2 && size <= 64) {
                        overrides.dotSize = size;
                    }

                    break;
                }

                case "dotradius":
                case "radius":

                case "rx": {
                    const radius = parseNumericToken(rawVal);

                    if (radius !== undefined && radius >= 0 && radius <= 32) {
                        overrides.dotRadius = radius;
                    }

                    break;
                }

                case "letterspacing":

                case "tracking": {
                    const ls = parseNumericToken(rawVal);

                    if (ls !== undefined && ls >= 0 && ls <= 20) {
                        overrides.letterSpacing = Math.round(ls);
                    }

                    break;
                }

                case "wordspacing": {
                    const ws = parseNumericToken(rawVal);

                    if (ws !== undefined && ws >= 1 && ws <= 40) {
                        overrides.wordSpacing = Math.round(ws);
                    }

                    break;
                }

                case "padx":

                case "paddingx": {
                    const px = parseNumericToken(rawVal);

                    if (px !== undefined && px >= 0 && px <= 40) {
                        overrides.padX = Math.round(px);
                    }

                    break;
                }

                case "pady":

                case "paddingy": {
                    const py = parseNumericToken(rawVal);

                    if (py !== undefined && py >= 0 && py <= 40) {
                        overrides.padY = Math.round(py);
                    }

                    break;
                }

                case "rows":

                case "height": {
                    const r = parseNumericToken(rawVal);

                    if (r !== undefined && r >= 9 && r <= 64) {
                        overrides.rows = Math.round(r);
                    }

                    break;
                }

                case "mincols":
                case "cols":

                case "columns": {
                    const c = parseNumericToken(rawVal);

                    if (c !== undefined && c >= 1 && c <= 300) {
                        overrides.minCols = Math.round(c);
                    }

                    break;
                }

                case "flipduration": {
                    const fd = parseNumericToken(rawVal, true);

                    if (fd !== undefined && fd >= 0.05 && fd <= 5) {
                        overrides.flipDuration = fd;
                    }

                    break;
                }

                case "sweepmax":

                case "sweep": {
                    const sm = parseNumericToken(rawVal, true);

                    if (sm !== undefined && sm >= 0 && sm <= 5) {
                        overrides.sweepMax = sm;
                    }

                    break;
                }

                default:
                    // Explicitly ignore renderTech and unknown keys
                    break;
            }
        }
    }

    const cleanedText = raw.replace(/\s*\$\[[^\]]*\]/g, "").trim();

    return {
        raw,
        text: cleanedText,
        overrides,
    };
}

function resolveColorPalette(token: string | undefined, defaultTheme: string): {
    key: string;
    palette: PaletteDef;
} {
    const key = token?.trim() ? token.trim().toLowerCase() : defaultTheme;

    if (PALETTES[key]) {
        return {
            key,
            palette: PALETTES[key],
        };
    }

    if (/^#[0-9a-f]{3,8}$/i.test(key)) {
        const base = PALETTES[defaultTheme] ?? PALETTES.amber;
        return {
            key,
            palette: {
                ...base,
                activeDot: key,
                activeDotBright: key,
                activeDotStroke: key,
                flipFlash: "#ffffff",
                zeroHighlight: key,
            },
        };
    }

    const fallbackKey = VALID_THEMES.has(defaultTheme) ? defaultTheme : "amber";
    return {
        key: fallbackKey,
        palette: PALETTES[fallbackKey] ?? PALETTES.amber,
    };
}

function resolveBgPalette(token: string | undefined, defaultTheme: string): {
    key: string;
    palette: PaletteDef;
} {
    const key = token?.trim() ? token.trim().toLowerCase() : defaultTheme;

    if (PALETTES[key]) {
        return {
            key,
            palette: PALETTES[key],
        };
    }

    if (/^#[0-9a-f]{3,8}$/i.test(key)) {
        const base = PALETTES[defaultTheme] ?? PALETTES.amber;
        return {
            key,
            palette: {
                ...base,
                recessBg: key,
                zeroDot: key,
                zeroDotStroke: key,
                casingOuter: key,
            },
        };
    }

    const fallbackKey = VALID_THEMES.has(defaultTheme) ? defaultTheme : "amber";
    return {
        key: fallbackKey,
        palette: PALETTES[fallbackKey] ?? PALETTES.amber,
    };
}

interface ResolvedFrameConfig {
    colorKey: string;
    bgKey: string;
    colorPalette: PaletteDef;
    bgPalette: PaletteDef;
    palette: PaletteDef;
    dotShape: "circle" | "square";
    italic: boolean;
    durationPerText: number;
    cellPitch: number;
    dotSize: number;
    dotRadius: number;
    letterSpacing?: number;
    wordSpacing?: number;
    padX?: number;
    padY?: number;
    rows: number;
    minCols: number;
    flipDuration: number;
    sweepMax: number;
}

function resolveFrameConfig(
    baseConfig: typeof DEFAULT_SVG_OPTIONS & SvgOptions & { palette: PaletteDef },
    overrides: FrameOverrides,
): ResolvedFrameConfig {
    const defaultTheme = baseConfig.theme || "amber";
    const baseColorKey = baseConfig.color || defaultTheme;
    const baseBgKey = baseConfig.background || defaultTheme;

    const frameColorToken = overrides.color ?? overrides.theme ?? baseColorKey;
    const frameBgToken = overrides.background ?? overrides.theme ?? baseBgKey;

    const { key: colorKey, palette: colorPalette } = resolveColorPalette(frameColorToken, baseColorKey);
    const { key: bgKey, palette: bgPalette } = resolveBgPalette(frameBgToken, baseBgKey);

    const mergedPalette: PaletteDef = {
        ...bgPalette,
        activeDot: colorPalette.activeDot,
        activeDotBright: colorPalette.activeDotBright,
        activeDotStroke: colorPalette.activeDotStroke,
        flipFlash: colorPalette.flipFlash,
        zeroHighlight: colorPalette.zeroHighlight,
    };

    const cellPitch = overrides.cellPitch ?? baseConfig.cellPitch;
    const dotSize = overrides.dotSize ?? (overrides.cellPitch !== undefined ? Math.max(2, cellPitch - 2) : baseConfig.dotSize);

    return {
        colorKey,
        bgKey,
        colorPalette,
        bgPalette,
        palette: mergedPalette,
        dotShape: (overrides.dotShape ?? baseConfig.dotShape) === "square" ? "square" : "circle",
        italic: overrides.italic ?? baseConfig.italic,
        durationPerText: overrides.durationPerText ?? baseConfig.durationPerText ?? 3.8,
        cellPitch,
        dotSize,
        dotRadius: overrides.dotRadius ?? baseConfig.dotRadius ?? 2.2,
        letterSpacing: overrides.letterSpacing ?? baseConfig.letterSpacing,
        wordSpacing: overrides.wordSpacing ?? baseConfig.wordSpacing,
        padX: overrides.padX ?? baseConfig.padX,
        padY: overrides.padY ?? baseConfig.padY,
        rows: overrides.rows ?? baseConfig.rows,
        minCols: overrides.minCols ?? baseConfig.minCols,
        flipDuration: overrides.flipDuration ?? baseConfig.flipDuration ?? 0.35,
        sweepMax: overrides.sweepMax ?? baseConfig.sweepMax ?? 0.85,
    };
}

function escapeXml(value: string) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function dotJitter(row: number, col: number) {
    const seed = Math.sin((row + 1) * 12.9898 + (col + 1) * 78.233) * 43758.5453;
    return seed - Math.floor(seed);
}

function sanitizeId(val: string): string {
    return val.replace(/[^a-z0-9_-]+/gi, "-");
}

function renderBoardTemplate(values: Record<string, string | number | PaletteDef | Partial<PaletteDef>>): string {
    const template = getLoadedBoardTemplate();
    const palette = values.palette as PaletteDef;
    const replacements: Record<string, string> = {};

    for (const [key, value] of Object.entries(values)) {
        if (key !== "palette") replacements[key] = String(value);
    }

    for (const [key, value] of Object.entries(palette)) {
        replacements[`palette.${key}`] = String(value);
    }

    return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
        if (!(key in replacements)) throw new Error(`Missing board template value: ${key}`);

        return replacements[key];
    });
}

/**
 * Builds the complete animated SVG document string and layout metadata.
 */
export function generateFlipDotSvg(options: SvgOptions = {}) {
    const config = {
        ...DEFAULT_SVG_OPTIONS,
        ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined && value !== null)),
    } as typeof DEFAULT_SVG_OPTIONS & SvgOptions & { palette: PaletteDef };

    const baseTheme = config.theme || "amber";
    const basePalette = PALETTES[baseTheme] ?? PALETTES.amber;

    if (!basePalette) {
        throw new Error(`Unknown palette: ${config.theme}`);
    }

    config.palette = {
        ...basePalette,
        ...(options.palette || {}),
    };

    const rawTextList = Array.isArray(config.texts) && config.texts.length > 0
        ? config.texts
        : [config.text || "hello world"];

    const parsedFrames = rawTextList.map(parseFrameMarkup);
    const numTexts = parsedFrames.length;
    const frameConfigs = parsedFrames.map(f => resolveFrameConfig(config, f.overrides));

    // Initial pass to find common board dimensions across all frames
    const initialLayouts = parsedFrames.map((f, idx) =>
        layoutFlipDotMatrix({
            text: f.text,
            italic: frameConfigs[idx].italic,
            rows: frameConfigs[idx].rows,
            minCols: frameConfigs[idx].minCols,
            letterSpacing: frameConfigs[idx].letterSpacing,
            wordSpacing: frameConfigs[idx].wordSpacing,
            padX: frameConfigs[idx].padX,
            padY: frameConfigs[idx].padY,
        }),
    );

    const totalRows = Math.max(...initialLayouts.map(l => l.rows));
    const totalCols = Math.max(...initialLayouts.map(l => l.cols));

    // Re-center any frame layout whose dimensions were smaller than the shared board matrix
    const layouts = initialLayouts.map((layout, idx) => {
        if (layout.rows === totalRows && layout.cols === totalCols) {
            return layout;
        }

        return layoutFlipDotMatrix({
            text: parsedFrames[idx].text,
            italic: frameConfigs[idx].italic,
            rows: totalRows,
            minCols: totalCols,
            letterSpacing: frameConfigs[idx].letterSpacing,
            wordSpacing: frameConfigs[idx].wordSpacing,
            padX: frameConfigs[idx].padX,
            padY: frameConfigs[idx].padY,
        });
    });

    // Resolve board-level pitch and dot size
    const boardCellPitch = Math.max(...frameConfigs.map(fc => fc.cellPitch));
    const boardDotSize = Math.max(...frameConfigs.map(fc => fc.dotSize));

    const gridWidth = totalCols * boardCellPitch;
    const gridHeight = totalRows * boardCellPitch;

    const width = gridWidth + config.boardPaddingX * 2;
    const height = gridHeight + config.boardPaddingY * 2;

    const gridOriginX = config.boardPaddingX;
    const gridOriginY = config.boardPaddingY;

    // Board background palette (from frame 0 or common background)
    const allSameBg = frameConfigs.every(fc => fc.bgKey === frameConfigs[0].bgKey);
    const boardBgPalette = allSameBg ? frameConfigs[0].bgPalette : config.palette;
    const boardColorPalette = frameConfigs[0].colorPalette;
    const boardPalette: PaletteDef = {
        ...boardBgPalette,
        activeDot: boardColorPalette.activeDot,
        activeDotBright: boardColorPalette.activeDotBright,
        activeDotStroke: boardColorPalette.activeDotStroke,
        flipFlash: boardColorPalette.flipFlash,
        zeroHighlight: boardColorPalette.zeroHighlight,
    };

    const dotRadius = boardDotSize / 2;
    const dotCenterOffset = boardCellPitch / 2;
    const dotSquareOffset = (boardCellPitch - boardDotSize) / 2;

    const allCircle = frameConfigs.every(fc => fc.dotShape !== "square");
    const allSquare = frameConfigs.every(fc => fc.dotShape === "square");
    const hasMixedShapes = !allCircle && !allSquare;
    const isCircle = allCircle;

    // Build extra SVG defs for any active dot color gradients used across frames
    const colorDefsMap = new Map<string, PaletteDef>();

    for (const fc of frameConfigs) {
        if (!colorDefsMap.has(fc.colorKey)) {
            colorDefsMap.set(fc.colorKey, fc.colorPalette);
        }
    }

    const defsExtra = [...colorDefsMap.entries()]
        .map(([cKey, pal]) => {
            const safeKey = sanitizeId(cKey);
            return `    <linearGradient id="active-dot-grad-${safeKey}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${pal.flipFlash}"/>
      <stop offset="28%" stop-color="${pal.activeDotBright}"/>
      <stop offset="100%" stop-color="${pal.activeDot}"/>
    </linearGradient>
    <filter id="dot-glow-${safeKey}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="1.35" flood-color="${pal.activeDotBright}" flood-opacity="0.45"/>
    </filter>`;
        })
        .join("\n");

    const initialHold = config.initialHold ?? 0.8;
    const sweepMax = Math.max(...frameConfigs.map(fc => fc.sweepMax));

    // Transition timeline using each frame's individual durationPerText
    const numTransitions = numTexts + 1;
    const tTrans: number[] = [];
    let currT = initialHold;

    for (let i = 0; i < numTexts; i += 1) {
        tTrans.push(+currT.toFixed(2));
        currT += frameConfigs[i].durationPerText;
    }

    tTrans.push(+currT.toFixed(2));

    const hasCustomDuration = options.durationPerText !== undefined
        || parsedFrames.some(f => f.overrides.durationPerText !== undefined);
    const cycleSeconds = options.cycleSeconds
        ?? (!hasCustomDuration && numTexts === 5 ? config.cycleSeconds : +(currT + 3.2).toFixed(2));

    // Compute boolean state sequence for every (row, col)
    const patternMap = new Map<string, {
        r: number;
        c: number;
    }[]>();
    const dotPattern = Array.from({ length: totalRows }, () =>
        Array.from({ length: totalCols }, () => "0".repeat(numTexts)),
    );

    for (let r = 0; r < totalRows; r += 1) {
        for (let c = 0; c < totalCols; c += 1) {
            const seq = layouts.map(l => (l.grid[r]?.[c] ? "1" : "0")).join("");
            dotPattern[r][c] = seq;

            if (!patternMap.has(seq)) {
                patternMap.set(seq, []);
            }

            patternMap.get(seq)?.push({
                r,
                c,
            });
        }
    }

    const gradIdForFrame = (idx: number) => {
        const fc = frameConfigs[idx];
        return fc ? `active-dot-grad-${sanitizeId(fc.colorKey)}` : "active-dot-grad";
    };

    const glowIdForFrame = (idx: number) => {
        const fc = frameConfigs[idx];
        return fc ? `dot-glow-${sanitizeId(fc.colorKey)}` : "dot-glow";
    };

    const scaleForFrame = (idx: number) => {
        const fc = frameConfigs[idx];
        return fc ? +(fc.dotSize / boardDotSize).toFixed(3) : 1;
    };

    const rxCssForFrame = (idx: number) => {
        const fc = frameConfigs[idx];

        if (!hasMixedShapes || !fc) return "";

        const rxVal = fc.dotShape === "square"
            ? Math.min(fc.dotRadius, boardDotSize / 2)
            : dotRadius;
        return ` rx: ${+rxVal.toFixed(2)}px;`;
    };

    // Build keyframes for all unique non-zero patterns
    const keyframes = [];

    for (const seq of patternMap.keys()) {
        if (seq === "0".repeat(numTexts)) {
            continue;
        }

        const S = [0, ...seq.split("").map(Number), 0];
        const kfSteps = [];

        kfSteps.push(
            `  0% { fill: ${frameConfigs[0].bgPalette.zeroDot}; stroke: ${frameConfigs[0].bgPalette.zeroDotStroke}; transform: scaleY(1) scaleX(1); filter: none;${rxCssForFrame(0)} }`,
        );

        for (let i = 0; i < numTransitions; i += 1) {
            const t0 = tTrans[i];
            const prev = S[i];
            const next = S[i + 1];
            const prevIdx = Math.max(0, i - 1);
            const nextIdx = Math.min(numTexts - 1, i);
            const flipDuration = frameConfigs[nextIdx]?.flipDuration ?? config.flipDuration ?? 0.35;

            const prevColorPal = frameConfigs[prevIdx]?.colorPalette ?? boardPalette;
            const nextColorPal = frameConfigs[nextIdx]?.colorPalette ?? boardPalette;
            const prevBgPal = frameConfigs[prevIdx]?.bgPalette ?? boardPalette;
            const nextBgPal = frameConfigs[nextIdx]?.bgPalette ?? boardPalette;

            const prevGrad = gradIdForFrame(prevIdx);
            const nextGrad = gradIdForFrame(nextIdx);
            const prevGlow = glowIdForFrame(prevIdx);
            const nextGlow = glowIdForFrame(nextIdx);
            const prevScale = scaleForFrame(prevIdx);
            const nextScale = scaleForFrame(nextIdx);
            const prevRx = rxCssForFrame(prevIdx);
            const nextRx = rxCssForFrame(nextIdx);

            if (prev === 0 && next === 1) {
                const p0 = +(t0 / cycleSeconds * 100).toFixed(2);
                const p1 = +((t0 + flipDuration * 0.45) / cycleSeconds * 100).toFixed(2);
                const p2 = +((t0 + flipDuration * 0.75) / cycleSeconds * 100).toFixed(2);
                const p3 = +((t0 + flipDuration) / cycleSeconds * 100).toFixed(2);
                const flashScaleY = +(1.08 * nextScale).toFixed(3);
                const flashScaleX = +(1.04 * nextScale).toFixed(3);

                kfSteps.push(
                    `  ${p0}% { fill: ${prevBgPal.zeroDot}; stroke: ${prevBgPal.zeroDotStroke}; transform: scaleY(1) scaleX(1); filter: none;${prevRx} }`,
                );
                kfSteps.push(
                    `  ${p1}% { fill: ${nextColorPal.zeroHighlight}; stroke: ${nextColorPal.activeDotStroke}; transform: scaleY(0.08) scaleX(0.92) skewX(-8deg); filter: none;${nextRx} }`,
                );
                kfSteps.push(
                    `  ${p2}% { fill: ${nextColorPal.flipFlash}; stroke: #ffffff; transform: scaleY(${flashScaleY}) scaleX(${flashScaleX}); filter: url(#${nextGlow});${nextRx} }`,
                );
                kfSteps.push(
                    `  ${p3}% { fill: url(#${nextGrad}); stroke: ${nextColorPal.activeDotStroke}; transform: scaleY(${nextScale}) scaleX(${nextScale}); filter: url(#${nextGlow});${nextRx} }`,
                );
            }
            else if (prev === 1 && next === 0) {
                const p0 = +(t0 / cycleSeconds * 100).toFixed(2);
                const p1 = +((t0 + flipDuration * 0.5) / cycleSeconds * 100).toFixed(2);
                const p2 = +((t0 + flipDuration) / cycleSeconds * 100).toFixed(2);

                kfSteps.push(
                    `  ${p0}% { fill: url(#${prevGrad}); stroke: ${prevColorPal.activeDotStroke}; transform: scaleY(${prevScale}) scaleX(${prevScale}); filter: url(#${prevGlow});${prevRx} }`,
                );
                kfSteps.push(
                    `  ${p1}% { fill: ${prevColorPal.zeroHighlight}; stroke: ${nextBgPal.zeroDotStroke}; transform: scaleY(0.08) scaleX(0.92) skewX(8deg); filter: none;${nextRx} }`,
                );
                kfSteps.push(
                    `  ${p2}% { fill: ${nextBgPal.zeroDot}; stroke: ${nextBgPal.zeroDotStroke}; transform: scaleY(1) scaleX(1); filter: none;${nextRx} }`,
                );
            }
            else if (prev === 1 && next === 1) {
                const p0 = +(t0 / cycleSeconds * 100).toFixed(2);
                const p1 = +((t0 + flipDuration * 0.5) / cycleSeconds * 100).toFixed(2);
                const p2 = +((t0 + flipDuration) / cycleSeconds * 100).toFixed(2);
                const dipScaleY = +(0.72 * nextScale).toFixed(3);
                const dipScaleX = +(0.96 * nextScale).toFixed(3);

                kfSteps.push(
                    `  ${p0}% { fill: url(#${prevGrad}); stroke: ${prevColorPal.activeDotStroke}; transform: scaleY(${prevScale}) scaleX(${prevScale}); filter: url(#${prevGlow});${prevRx} }`,
                );
                kfSteps.push(
                    `  ${p1}% { fill: url(#${nextGrad}); stroke: ${nextColorPal.activeDotStroke}; transform: scaleY(${dipScaleY}) scaleX(${dipScaleX}); filter: url(#${nextGlow});${nextRx} }`,
                );
                kfSteps.push(
                    `  ${p2}% { fill: url(#${nextGrad}); stroke: ${nextColorPal.activeDotStroke}; transform: scaleY(${nextScale}) scaleX(${nextScale}); filter: url(#${nextGlow});${nextRx} }`,
                );
            }
            else {
                // prev === 0 && next === 0
                const p0 = +(t0 / cycleSeconds * 100).toFixed(2);
                const p2 = +((t0 + flipDuration) / cycleSeconds * 100).toFixed(2);

                if (prevBgPal.zeroDot !== nextBgPal.zeroDot || prevRx !== nextRx) {
                    kfSteps.push(
                        `  ${p0}% { fill: ${prevBgPal.zeroDot}; stroke: ${prevBgPal.zeroDotStroke}; transform: scaleY(1) scaleX(1); filter: none;${prevRx} }`,
                    );
                    kfSteps.push(
                        `  ${p2}% { fill: ${nextBgPal.zeroDot}; stroke: ${nextBgPal.zeroDotStroke}; transform: scaleY(1) scaleX(1); filter: none;${nextRx} }`,
                    );
                }
            }
        }

        kfSteps.push(
            `  100% { fill: ${frameConfigs[0].bgPalette.zeroDot}; stroke: ${frameConfigs[0].bgPalette.zeroDotStroke}; transform: scaleY(1) scaleX(1); filter: none;${rxCssForFrame(0)} }`,
        );

        keyframes.push(
            `    @keyframes k-${seq} {\n${kfSteps.join("\n")}\n    }\n    .p-${seq} {\n      animation: k-${seq} ${cycleSeconds}s cubic-bezier(0.22, 1, 0.36, 1) infinite;\n    }`,
        );
    }

    // Build background animation for recess bezel and zero-dots if backgrounds vary across frames
    let bgAnimationStyles = "";
    const hasVaryingBg = frameConfigs.some(fc => fc.bgKey !== frameConfigs[0].bgKey);

    if (hasVaryingBg) {
        const recessSteps = [];
        const zeroSteps = [];

        recessSteps.push(`  0% { fill: ${frameConfigs[0].bgPalette.recessBg}; }`);
        zeroSteps.push(`  0% { fill: ${frameConfigs[0].bgPalette.zeroDot}; stroke: ${frameConfigs[0].bgPalette.zeroDotStroke}; }`);

        for (let i = 0; i < numTransitions; i += 1) {
            const t0 = tTrans[i];
            const nextIdx = Math.min(numTexts - 1, i);
            const flipDuration = frameConfigs[nextIdx]?.flipDuration ?? config.flipDuration ?? 0.35;
            const p0 = +(t0 / cycleSeconds * 100).toFixed(2);
            const p2 = +((t0 + flipDuration) / cycleSeconds * 100).toFixed(2);
            const pal = frameConfigs[nextIdx].bgPalette;

            recessSteps.push(`  ${p0}% { fill: ${pal.recessBg}; }`);
            recessSteps.push(`  ${p2}% { fill: ${pal.recessBg}; }`);

            zeroSteps.push(`  ${p0}% { fill: ${pal.zeroDot}; stroke: ${pal.zeroDotStroke}; }`);
            zeroSteps.push(`  ${p2}% { fill: ${pal.zeroDot}; stroke: ${pal.zeroDotStroke}; }`);
        }

        recessSteps.push(`  100% { fill: ${frameConfigs[0].bgPalette.recessBg}; }`);
        zeroSteps.push(`  100% { fill: ${frameConfigs[0].bgPalette.zeroDot}; stroke: ${frameConfigs[0].bgPalette.zeroDotStroke}; }`);

        bgAnimationStyles = `\n    @keyframes k-recess-bg {\n${recessSteps.join("\n")}\n    }\n    .recess-bezel {\n      animation: k-recess-bg ${cycleSeconds}s cubic-bezier(0.22, 1, 0.36, 1) infinite;\n    }\n    @keyframes k-zero-bg {\n${zeroSteps.join("\n")}\n    }\n    .z-bg {\n      animation: k-zero-bg ${cycleSeconds}s cubic-bezier(0.22, 1, 0.36, 1) infinite;\n    }`;
    }

    // Render flip-dots (circles or rounded square rects)
    const dotElements = [];
    const compoundDots: string[] = [];
    const baseRx = allSquare
        ? frameConfigs[0]?.dotRadius ?? config.dotRadius ?? 2
        : frameConfigs[0]?.dotShape === "square"
            ? Math.min(frameConfigs[0]?.dotRadius ?? 2, boardDotSize / 2)
            : dotRadius;

    const zeroStaticClass = hasVaryingBg ? "d z z-bg" : "d z";

    for (let r = 0; r < totalRows; r += 1) {
        for (let c = 0; c < totalCols; c += 1) {
            const seq = dotPattern[r][c];
            const isZeroAll = seq === "0".repeat(numTexts);
            const normalizedSweep = (c + r * 1.35) / (totalCols + totalRows * 1.35);
            const jitter = (dotJitter(r, c) - 0.5) * 0.08;
            const delay = +(normalizedSweep * sweepMax + jitter).toFixed(3);

            if (isCircle && !hasMixedShapes) {
                const cx = +(gridOriginX + c * boardCellPitch + dotCenterOffset).toFixed(2);
                const cy = +(gridOriginY + r * boardCellPitch + dotCenterOffset).toFixed(2);

                if (isZeroAll && config.renderTech === "compound-path") {
                    compoundDots.push(`M${(cx - dotRadius).toFixed(2)} ${cy}a${dotRadius} ${dotRadius} 0 1 0 ${dotRadius * 2} 0a${dotRadius} ${dotRadius} 0 1 0 ${-dotRadius * 2} 0`);
                }
                else {
                    const cls = isZeroAll ? zeroStaticClass : `d z p-${seq}`;
                    const style = isZeroAll ? "" : ` style="animation-delay:${delay}s"`;
                    dotElements.push(`    <circle class="${cls}" cx="${cx}" cy="${cy}" r="${dotRadius}"${style}/>`);
                }
            }
            else {
                const x = +(gridOriginX + c * boardCellPitch + dotSquareOffset).toFixed(2);
                const y = +(gridOriginY + r * boardCellPitch + dotSquareOffset).toFixed(2);
                const rx = +baseRx.toFixed(2);

                if (isZeroAll && config.renderTech === "compound-path") {
                    const radius = Math.min(rx, boardDotSize / 2);
                    compoundDots.push(`M${(x + radius).toFixed(2)} ${y}h${boardDotSize - 2 * radius}a${radius} ${radius} 0 0 1 ${radius} ${radius}v${boardDotSize - 2 * radius}a${radius} ${radius} 0 0 1 ${-radius} ${radius}h${-boardDotSize + 2 * radius}a${radius} ${radius} 0 0 1 ${-radius} ${-radius}v${-boardDotSize + 2 * radius}a${radius} ${radius} 0 0 1 ${radius} ${-radius}z`);
                }
                else {
                    const cls = isZeroAll ? zeroStaticClass : `d z p-${seq}`;
                    const style = isZeroAll ? "" : ` style="animation-delay:${delay}s"`;
                    dotElements.push(`    <rect class="${cls}" x="${x}" y="${y}" width="${boardDotSize}" height="${boardDotSize}" rx="${rx}"${style}/>`);
                }
            }
        }
    }

    const screwPositions = [
        [14, 14],
        [width - 14, 14],
        [14, height - 14],
        [width - 14, height - 14],
    ];

    if (compoundDots.length > 0) dotElements.unshift(`    <path class="${zeroStaticClass}" d="${compoundDots.join("")}"/>`);

    const screwsSvg = screwPositions
        .map(
            ([sx, sy]) =>
                `    <g transform="translate(${sx},${sy})">
      <circle r="4.5" fill="${boardPalette.screwFill}" stroke="${boardPalette.casingStroke}" stroke-width="1"/>
      <line x1="-2.6" y1="-1.5" x2="2.6" y2="1.5" stroke="${boardPalette.screwSlot}" stroke-width="1.2" stroke-linecap="round"/>
    </g>`,
        )
        .join("\n");

    const safeLabel = escapeXml(parsedFrames.map(f => f.text).join(" • "));

    const svg = renderBoardTemplate({
        width,
        height,
        safeLabel,
        palette: boardPalette,
        defsExtra,
        styles: `    .d {
      transform-box: fill-box;
      transform-origin: center;
      stroke-width: 0.75px;
    }
    .z {
      fill: ${boardPalette.zeroDot};
      stroke: ${boardPalette.zeroDotStroke};
    }
${keyframes.join("\n")}${bgAnimationStyles}
    @media (prefers-reduced-motion: reduce) {
      .d[class*="p-"] {
        animation: none;
        fill: url(#active-dot-grad-${sanitizeId(frameConfigs[0].colorKey)});
        stroke: ${boardPalette.activeDotStroke};
        filter: url(#dot-glow-${sanitizeId(frameConfigs[0].colorKey)});
      }
    }`,
        frameWidth: width - 2,
        frameHeight: height - 2,
        recessX: gridOriginX - 8,
        recessY: gridOriginY - 8,
        recessWidth: gridWidth + 16,
        recessHeight: gridHeight + 16,
        screwsSvg,
        dotElements: dotElements.join("\n"),
    });

    return {
        svg,
        width,
        height,
        matrix: layouts[0],
        layouts,
        frames: parsedFrames,
        cols: totalCols,
        rows: totalRows,
    };
}

/**
 * Builds a single static (non-animated) still SVG of the settled flip-dot display
 * for a specific frame, without any transition animation keyframes or delays.
 */
export function generateStillFlipDotSvg(options: SvgOptions = {}) {
    const config = {
        ...DEFAULT_SVG_OPTIONS,
        ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined && value !== null)),
    } as typeof DEFAULT_SVG_OPTIONS & SvgOptions & { palette: PaletteDef };

    const baseTheme = config.theme || "amber";
    const basePalette = PALETTES[baseTheme] ?? PALETTES.amber;

    if (!basePalette) {
        throw new Error(`Unknown palette: ${config.theme}`);
    }

    config.palette = {
        ...basePalette,
        ...(options.palette || {}),
    };

    const rawTextList = Array.isArray(config.texts) && config.texts.length > 0
        ? config.texts
        : [config.text || "hello world"];

    const parsedFrames = rawTextList.map(parseFrameMarkup);
    const frameConfigs = parsedFrames.map(f => resolveFrameConfig(config, f.overrides));

    const frameIndex = Math.max(
        0,
        Math.min(
            typeof options.frameIndex === "number" ? options.frameIndex : 0,
            parsedFrames.length - 1,
        ),
    );
    const currentFrame = parsedFrames[frameIndex];
    const targetConfig = frameConfigs[frameIndex];

    // Lay out each message to determine common board dimensions
    const initialLayouts = parsedFrames.map((f, idx) =>
        layoutFlipDotMatrix({
            text: f.text,
            italic: frameConfigs[idx].italic,
            rows: frameConfigs[idx].rows,
            minCols: frameConfigs[idx].minCols,
            letterSpacing: frameConfigs[idx].letterSpacing,
            wordSpacing: frameConfigs[idx].wordSpacing,
            padX: frameConfigs[idx].padX,
            padY: frameConfigs[idx].padY,
        }),
    );

    const totalRows = Math.max(...initialLayouts.map(l => l.rows));
    const totalCols = Math.max(...initialLayouts.map(l => l.cols));

    const targetLayout = initialLayouts[frameIndex].rows === totalRows && initialLayouts[frameIndex].cols === totalCols
        ? initialLayouts[frameIndex]
        : layoutFlipDotMatrix({
                text: currentFrame.text,
                italic: targetConfig.italic,
                rows: totalRows,
                minCols: totalCols,
                letterSpacing: targetConfig.letterSpacing,
                wordSpacing: targetConfig.wordSpacing,
                padX: targetConfig.padX,
                padY: targetConfig.padY,
            });

    const gridWidth = totalCols * targetConfig.cellPitch;
    const gridHeight = totalRows * targetConfig.cellPitch;

    const width = gridWidth + config.boardPaddingX * 2;
    const height = gridHeight + config.boardPaddingY * 2;

    const gridOriginX = config.boardPaddingX;
    const gridOriginY = config.boardPaddingY;

    const { palette } = targetConfig;
    const dotRadius = targetConfig.dotSize / 2;
    const dotCenterOffset = targetConfig.cellPitch / 2;
    const dotSquareOffset = (targetConfig.cellPitch - targetConfig.dotSize) / 2;
    const isCircle = targetConfig.dotShape !== "square";

    const dotElements = [];
    let activeCount = 0;

    const compoundDots: string[] = [];

    for (let r = 0; r < totalRows; r += 1) {
        for (let c = 0; c < totalCols; c += 1) {
            const isLit = targetLayout.grid[r]?.[c];

            if (isLit) activeCount += 1;

            const cls = isLit ? "d a" : "d z";

            if (isCircle) {
                const cx = +(gridOriginX + c * targetConfig.cellPitch + dotCenterOffset).toFixed(2);
                const cy = +(gridOriginY + r * targetConfig.cellPitch + dotCenterOffset).toFixed(2);

                if (!isLit && config.renderTech === "compound-path") {
                    compoundDots.push(`M${(cx - dotRadius).toFixed(2)} ${cy}a${dotRadius} ${dotRadius} 0 1 0 ${dotRadius * 2} 0a${dotRadius} ${dotRadius} 0 1 0 ${-dotRadius * 2} 0`);
                }
                else {
                    dotElements.push(`    <circle class="${cls}" cx="${cx}" cy="${cy}" r="${dotRadius}"/>`);
                }
            }
            else {
                const x = +(gridOriginX + c * targetConfig.cellPitch + dotSquareOffset).toFixed(2);
                const y = +(gridOriginY + r * targetConfig.cellPitch + dotSquareOffset).toFixed(2);
                const rx = targetConfig.dotRadius ?? 2;

                if (!isLit && config.renderTech === "compound-path") {
                    const radius = Math.min(rx, targetConfig.dotSize / 2);
                    compoundDots.push(`M${(x + radius).toFixed(2)} ${y}h${targetConfig.dotSize - 2 * radius}a${radius} ${radius} 0 0 1 ${radius} ${radius}v${targetConfig.dotSize - 2 * radius}a${radius} ${radius} 0 0 1 ${-radius} ${radius}h${-targetConfig.dotSize + 2 * radius}a${radius} ${radius} 0 0 1 ${-radius} ${-radius}v${-targetConfig.dotSize + 2 * radius}a${radius} ${radius} 0 0 1 ${radius} ${-radius}z`);
                }
                else {
                    dotElements.push(`    <rect class="${cls}" x="${x}" y="${y}" width="${targetConfig.dotSize}" height="${targetConfig.dotSize}" rx="${rx}"/>`);
                }
            }
        }
    }

    const screwPositions = [
        [14, 14],
        [width - 14, 14],
        [14, height - 14],
        [width - 14, height - 14],
    ];

    if (compoundDots.length > 0) dotElements.unshift(`    <path class="d z" d="${compoundDots.join("")}"/>`);

    const screwsSvg = screwPositions
        .map(
            ([sx, sy]) =>
                `    <g transform="translate(${sx},${sy})">
      <circle r="4.5" fill="${palette.screwFill}" stroke="${palette.casingStroke}" stroke-width="1"/>
      <line x1="-2.6" y1="-1.5" x2="2.6" y2="1.5" stroke="${palette.screwSlot}" stroke-width="1.2" stroke-linecap="round"/>
    </g>`,
        )
        .join("\n");

    const safeLabel = escapeXml(currentFrame.text);

    const svg = renderBoardTemplate({
        width,
        height,
        safeLabel,
        palette,
        defsExtra: "",
        styles: `    .d {
      transform-box: fill-box;
      transform-origin: center;
      stroke-width: 0.75px;
    }
    .z {
      fill: ${palette.zeroDot};
      stroke: ${palette.zeroDotStroke};
    }
    .a {
      fill: url(#active-dot-grad);
      stroke: ${palette.activeDotStroke};
      filter: url(#dot-glow);
    }`,
        frameWidth: width - 2,
        frameHeight: height - 2,
        recessX: gridOriginX - 8,
        recessY: gridOriginY - 8,
        recessWidth: gridWidth + 16,
        recessHeight: gridHeight + 16,
        screwsSvg,
        dotElements: dotElements.join("\n"),
    });

    return {
        svg,
        width,
        height,
        text: currentFrame.text,
        rawText: currentFrame.raw,
        overrides: currentFrame.overrides,
        frameIndex,
        cols: totalCols,
        rows: totalRows,
        activeCount,
    };
}

/**
 * Builds static still SVGs for all frames in the rotation sequence.
 */
export function generateStillFlipDotFrames(options: SvgOptions = {}) {
    const textList = Array.isArray(options.texts) && options.texts.length > 0
        ? options.texts
        : [options.text || "hello world"];

    return textList.map((_, idx) =>
        generateStillFlipDotSvg({
            ...options,
            texts: textList,
            frameIndex: idx,
        }),
    );
}
