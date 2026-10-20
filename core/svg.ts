/**
 * FLIP - Flip-dot Letter & Image Playground
 *
 * Generates self-contained animated SVGs of electromechanical flip-dot
 * display boards compatible with GitHub README Markdown (`<img>` / `![]()`).
 *
 * Supports single-text or rotating multi-text sequences, circular or square
 * flip-dots, customizable color palettes, and realistic solenoid-flip animations.
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
    frameIndex?: number;
    letterSpacing?: number;
    wordSpacing?: number;
    padX?: number;
    padY?: number;
    renderTech?: RenderTech;
};

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
    } as typeof DEFAULT_SVG_OPTIONS & SvgOptions;

    // Resolve palette preset or custom overrides
    const basePalette = PALETTES[config.theme];

    if (!basePalette) {
        throw new Error(`Unknown palette: ${config.theme}`);
    }

    config.palette = {
        ...basePalette,
        ...(options.palette || {}),
    };

    const textList = Array.isArray(config.texts) && config.texts.length > 0
        ? config.texts
        : [config.text || "hello world"];

    const numTexts = textList.length;

    // Lay out each message to determine common board dimensions
    const layouts = textList.map(txt =>
        layoutFlipDotMatrix({
            text: txt,
            italic: config.italic,
            rows: config.rows,
            minCols: config.minCols,
            letterSpacing: config.letterSpacing,
            wordSpacing: config.wordSpacing,
            padX: config.padX,
            padY: config.padY,
        }),
    );

    const totalRows = Math.max(...layouts.map(l => l.rows));
    const totalCols = Math.max(...layouts.map(l => l.cols));

    const gridWidth = totalCols * config.cellPitch;
    const gridHeight = totalRows * config.cellPitch;

    const width = gridWidth + config.boardPaddingX * 2;
    const height = gridHeight + config.boardPaddingY * 2;

    const gridOriginX = config.boardPaddingX;
    const gridOriginY = config.boardPaddingY;

    const { palette } = config;
    const dotRadius = config.dotSize / 2;
    const dotCenterOffset = config.cellPitch / 2;
    const dotSquareOffset = (config.cellPitch - config.dotSize) / 2;
    const isCircle = config.dotShape !== "square";

    // Total cycle duration and transition timeline
    const durationPerText = config.durationPerText ?? 3.8;
    const initialHold = config.initialHold ?? 0.8;
    const flipDuration = config.flipDuration ?? 0.35;
    const sweepMax = config.sweepMax ?? 0.85;

    // Single text vs multi-text rotation:
    // For 1 text: 2 transitions (0 -> Text, Text -> 0 reset)
    // For N texts: N + 1 transitions (0 -> T0, T0 -> T1, ..., TN-1 -> 0 reset)
    const numTransitions = numTexts + 1;
    const cycleSeconds = config.cycleSeconds ?? (initialHold + numTexts * durationPerText + 3.2);

    const tTrans = [];
    let currT = initialHold;

    for (let i = 0; i < numTexts; i += 1) {
        tTrans.push(+currT.toFixed(2));
        currT += durationPerText;
    }

    tTrans.push(+currT.toFixed(2));

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

    // Build keyframes for all unique non-zero patterns
    const keyframes = [];

    for (const seq of patternMap.keys()) {
        if (seq === "0".repeat(numTexts)) {
            continue;
        }

        const S = [0, ...seq.split("").map(Number), 0];
        const kfSteps = [];

        kfSteps.push(
            `  0% { fill: ${palette.zeroDot}; stroke: ${palette.zeroDotStroke}; transform: scaleY(1) scaleX(1); filter: none; }`,
        );

        for (let i = 0; i < numTransitions; i += 1) {
            const t0 = tTrans[i];
            const prev = S[i];
            const next = S[i + 1];

            if (prev === 0 && next === 1) {
                const p0 = +(t0 / cycleSeconds * 100).toFixed(2);
                const p1 = +((t0 + flipDuration * 0.45) / cycleSeconds * 100).toFixed(2);
                const p2 = +((t0 + flipDuration * 0.75) / cycleSeconds * 100).toFixed(2);
                const p3 = +((t0 + flipDuration) / cycleSeconds * 100).toFixed(2);

                kfSteps.push(
                    `  ${p0}% { fill: ${palette.zeroDot}; stroke: ${palette.zeroDotStroke}; transform: scaleY(1) scaleX(1); filter: none; }`,
                );
                kfSteps.push(
                    `  ${p1}% { fill: ${palette.zeroHighlight}; stroke: ${palette.activeDotStroke}; transform: scaleY(0.08) scaleX(0.92) skewX(-8deg); filter: none; }`,
                );
                kfSteps.push(
                    `  ${p2}% { fill: ${palette.flipFlash}; stroke: #ffffff; transform: scaleY(1.08) scaleX(1.04); filter: url(#dot-glow); }`,
                );
                kfSteps.push(
                    `  ${p3}% { fill: url(#active-dot-grad); stroke: ${palette.activeDotStroke}; transform: scaleY(1) scaleX(1); filter: url(#dot-glow); }`,
                );
            }
            else if (prev === 1 && next === 0) {
                const p0 = +(t0 / cycleSeconds * 100).toFixed(2);
                const p1 = +((t0 + flipDuration * 0.5) / cycleSeconds * 100).toFixed(2);
                const p2 = +((t0 + flipDuration) / cycleSeconds * 100).toFixed(2);

                kfSteps.push(
                    `  ${p0}% { fill: url(#active-dot-grad); stroke: ${palette.activeDotStroke}; transform: scaleY(1) scaleX(1); filter: url(#dot-glow); }`,
                );
                kfSteps.push(
                    `  ${p1}% { fill: ${palette.zeroHighlight}; stroke: ${palette.zeroDotStroke}; transform: scaleY(0.08) scaleX(0.92) skewX(8deg); filter: none; }`,
                );
                kfSteps.push(
                    `  ${p2}% { fill: ${palette.zeroDot}; stroke: ${palette.zeroDotStroke}; transform: scaleY(1) scaleX(1); filter: none; }`,
                );
            }
            else if (prev === 1 && next === 1) {
                const p0 = +(t0 / cycleSeconds * 100).toFixed(2);
                const p1 = +((t0 + flipDuration * 0.5) / cycleSeconds * 100).toFixed(2);
                const p2 = +((t0 + flipDuration) / cycleSeconds * 100).toFixed(2);

                kfSteps.push(
                    `  ${p0}% { fill: url(#active-dot-grad); stroke: ${palette.activeDotStroke}; transform: scaleY(1) scaleX(1); filter: url(#dot-glow); }`,
                );
                kfSteps.push(
                    `  ${p1}% { fill: url(#active-dot-grad); stroke: ${palette.activeDotStroke}; transform: scaleY(0.72) scaleX(0.96); filter: url(#dot-glow); }`,
                );
                kfSteps.push(
                    `  ${p2}% { fill: url(#active-dot-grad); stroke: ${palette.activeDotStroke}; transform: scaleY(1) scaleX(1); filter: url(#dot-glow); }`,
                );
            }
        }

        kfSteps.push(
            `  100% { fill: ${palette.zeroDot}; stroke: ${palette.zeroDotStroke}; transform: scaleY(1) scaleX(1); filter: none; }`,
        );

        keyframes.push(
            `    @keyframes k-${seq} {\n${kfSteps.join("\n")}\n    }\n    .p-${seq} {\n      animation: k-${seq} ${cycleSeconds}s cubic-bezier(0.22, 1, 0.36, 1) infinite;\n    }`,
        );
    }

    // Render flip-dots (circles or rounded square rects)
    const dotElements = [];
    const compoundDots: string[] = [];

    for (let r = 0; r < totalRows; r += 1) {
        for (let c = 0; c < totalCols; c += 1) {
            const seq = dotPattern[r][c];
            const isZeroAll = seq === "0".repeat(numTexts);
            const normalizedSweep = (c + r * 1.35) / (totalCols + totalRows * 1.35);
            const jitter = (dotJitter(r, c) - 0.5) * 0.08;
            const delay = +(normalizedSweep * sweepMax + jitter).toFixed(3);

            if (isCircle) {
                const cx = +(gridOriginX + c * config.cellPitch + dotCenterOffset).toFixed(2);
                const cy = +(gridOriginY + r * config.cellPitch + dotCenterOffset).toFixed(2);

                if (isZeroAll && config.renderTech === "compound-path") {
                    compoundDots.push(`M${(cx - dotRadius).toFixed(2)} ${cy}a${dotRadius} ${dotRadius} 0 1 0 ${dotRadius * 2} 0a${dotRadius} ${dotRadius} 0 1 0 ${-dotRadius * 2} 0`);
                }
                else {
                    const cls = isZeroAll ? "d z" : `d z p-${seq}`;
                    const style = isZeroAll ? "" : ` style="animation-delay:${delay}s"`;
                    dotElements.push(`    <circle class="${cls}" cx="${cx}" cy="${cy}" r="${dotRadius}"${style}/>`);
                }
            }
            else {
                const x = +(gridOriginX + c * config.cellPitch + dotSquareOffset).toFixed(2);
                const y = +(gridOriginY + r * config.cellPitch + dotSquareOffset).toFixed(2);
                const rx = config.dotRadius ?? 2;

                if (isZeroAll && config.renderTech === "compound-path") {
                    const radius = Math.min(rx, config.dotSize / 2);
                    compoundDots.push(`M${(x + radius).toFixed(2)} ${y}h${config.dotSize - 2 * radius}a${radius} ${radius} 0 0 1 ${radius} ${radius}v${config.dotSize - 2 * radius}a${radius} ${radius} 0 0 1 ${-radius} ${radius}h${-config.dotSize + 2 * radius}a${radius} ${radius} 0 0 1 ${-radius} ${-radius}v${-config.dotSize + 2 * radius}a${radius} ${radius} 0 0 1 ${radius} ${-radius}z`);
                }
                else {
                    const cls = isZeroAll ? "d z" : `d z p-${seq}`;
                    const style = isZeroAll ? "" : ` style="animation-delay:${delay}s"`;
                    dotElements.push(`    <rect class="${cls}" x="${x}" y="${y}" width="${config.dotSize}" height="${config.dotSize}" rx="${rx}"${style}/>`);
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

    const safeLabel = escapeXml(textList.join(" &#8226; "));

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
${keyframes.join("\n")}
    @media (prefers-reduced-motion: reduce) {
      .d[class*="p-"] {
        animation: none;
        fill: url(#active-dot-grad);
        stroke: ${palette.activeDotStroke};
        filter: url(#dot-glow);
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
    } as typeof DEFAULT_SVG_OPTIONS & SvgOptions;

    // Resolve palette preset or custom overrides
    const basePalette = PALETTES[config.theme];

    if (!basePalette) {
        throw new Error(`Unknown palette: ${config.theme}`);
    }

    config.palette = {
        ...basePalette,
        ...(options.palette || {}),
    };

    const textList = Array.isArray(config.texts) && config.texts.length > 0
        ? config.texts
        : [config.text || "hello world"];

    const frameIndex = Math.max(
        0,
        Math.min(
            typeof options.frameIndex === "number" ? options.frameIndex : 0,
            textList.length - 1,
        ),
    );
    const currentText = textList[frameIndex];

    // Lay out each message to determine common board dimensions
    const layouts = textList.map(txt =>
        layoutFlipDotMatrix({
            text: txt,
            italic: config.italic,
            rows: config.rows,
            minCols: config.minCols,
            letterSpacing: config.letterSpacing,
            wordSpacing: config.wordSpacing,
            padX: config.padX,
            padY: config.padY,
        }),
    );

    const totalRows = Math.max(...layouts.map(l => l.rows));
    const totalCols = Math.max(...layouts.map(l => l.cols));

    const gridWidth = totalCols * config.cellPitch;
    const gridHeight = totalRows * config.cellPitch;

    const width = gridWidth + config.boardPaddingX * 2;
    const height = gridHeight + config.boardPaddingY * 2;

    const gridOriginX = config.boardPaddingX;
    const gridOriginY = config.boardPaddingY;

    const { palette } = config;
    const dotRadius = config.dotSize / 2;
    const dotCenterOffset = config.cellPitch / 2;
    const dotSquareOffset = (config.cellPitch - config.dotSize) / 2;
    const isCircle = config.dotShape !== "square";

    const targetLayout = layouts[frameIndex];
    const dotElements = [];
    let activeCount = 0;

    const compoundDots: string[] = [];

    for (let r = 0; r < totalRows; r += 1) {
        for (let c = 0; c < totalCols; c += 1) {
            const isLit = targetLayout.grid[r]?.[c];

            if (isLit) activeCount += 1;

            const cls = isLit ? "d a" : "d z";

            if (isCircle) {
                const cx = +(gridOriginX + c * config.cellPitch + dotCenterOffset).toFixed(2);
                const cy = +(gridOriginY + r * config.cellPitch + dotCenterOffset).toFixed(2);

                if (!isLit && config.renderTech === "compound-path") {
                    compoundDots.push(`M${(cx - dotRadius).toFixed(2)} ${cy}a${dotRadius} ${dotRadius} 0 1 0 ${dotRadius * 2} 0a${dotRadius} ${dotRadius} 0 1 0 ${-dotRadius * 2} 0`);
                }
                else {
                    dotElements.push(`    <circle class="${cls}" cx="${cx}" cy="${cy}" r="${dotRadius}"/>`);
                }
            }
            else {
                const x = +(gridOriginX + c * config.cellPitch + dotSquareOffset).toFixed(2);
                const y = +(gridOriginY + r * config.cellPitch + dotSquareOffset).toFixed(2);
                const rx = config.dotRadius ?? 2;

                if (!isLit && config.renderTech === "compound-path") {
                    const radius = Math.min(rx, config.dotSize / 2);
                    compoundDots.push(`M${(x + radius).toFixed(2)} ${y}h${config.dotSize - 2 * radius}a${radius} ${radius} 0 0 1 ${radius} ${radius}v${config.dotSize - 2 * radius}a${radius} ${radius} 0 0 1 ${-radius} ${radius}h${-config.dotSize + 2 * radius}a${radius} ${radius} 0 0 1 ${-radius} ${-radius}v${-config.dotSize + 2 * radius}a${radius} ${radius} 0 0 1 ${radius} ${-radius}z`);
                }
                else {
                    dotElements.push(`    <rect class="${cls}" x="${x}" y="${y}" width="${config.dotSize}" height="${config.dotSize}" rx="${rx}"/>`);
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

    const safeLabel = escapeXml(currentText);

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
        text: currentText,
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
