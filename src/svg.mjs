/**
 * Generates a self-contained animated SVG of a wide electromechanical
 * flip-dot display board compatible with GitHub README Markdown (`<img>` / `![]()`).
 *
 * Supports single text mode or multi-text rotating sequence. All dots begin
 * in the dark "zero"-state (`0` / unflipped) and mechanically flip along a diagonal
 * electromagnetic wave through each message in the rotation sequence, followed by a
 * wipe back to the dark zero state before looping.
 */

import { layoutFlipDotMatrix } from "./matrix.mjs";

export const DEFAULT_ROTATING_TEXTS = [
  "hello world",
  "its me",
  "taruna",
  "outrowed",
  "peace out~"
];

export const DEFAULT_SVG_OPTIONS = {
  text: DEFAULT_ROTATING_TEXTS[0],
  texts: DEFAULT_ROTATING_TEXTS,
  italic: true,
  rows: 13,
  minCols: 86,
  cellPitch: 14,
  dotSize: 12,
  boardPaddingX: 28,
  boardPaddingY: 26,
  cycleSeconds: 24,
  durationPerText: 3.8,
  initialHold: 0.8,
  flipDuration: 0.35,
  sweepMax: 0.85,
  palette: {
    casingOuter: "#090b10",
    casingInner: "#10141d",
    casingStroke: "#232a38",
    recessBg: "#0b0e15",
    zeroDot: "#161b26",
    zeroDotStroke: "#202736",
    zeroHighlight: "#263042",
    flipFlash: "#fef08a",
    activeDot: "#f59e0b",
    activeDotBright: "#fbbf24",
    activeDotStroke: "#fcd34d",
    screwFill: "#1a202c",
    screwSlot: "#090b10"
  }
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Deterministic hash in [0, 1) for subtle per-dot mechanical jitter so the
 * flip wave feels like physical solenoids rather than a flat digital wipe.
 */
function dotJitter(row, col) {
  const seed = Math.sin((row + 1) * 12.9898 + (col + 1) * 78.233) * 43758.5453;
  return seed - Math.floor(seed);
}

/**
 * Builds the complete animated SVG document string and layout metadata.
 */
export function generateFlipDotSvg(options = {}) {
  const config = { ...DEFAULT_SVG_OPTIONS };
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && key !== "palette") {
      config[key] = value;
    }
  }
  config.palette = {
    ...DEFAULT_SVG_OPTIONS.palette,
    ...(options.palette || {})
  };

  const textList = Array.isArray(config.texts) && config.texts.length > 0
    ? config.texts
    : [config.text || "hello world"];

  const numTexts = textList.length;

  // Lay out each message to determine common board dimensions
  const layouts = textList.map((txt) =>
    layoutFlipDotMatrix({
      text: txt,
      italic: config.italic,
      rows: config.rows,
      minCols: config.minCols,
      letterSpacing: config.letterSpacing,
      wordSpacing: config.wordSpacing,
      padX: config.padX,
      padY: config.padY
    })
  );

  const totalRows = Math.max(...layouts.map((l) => l.rows));
  const totalCols = Math.max(...layouts.map((l) => l.cols));

  const gridWidth = totalCols * config.cellPitch;
  const gridHeight = totalRows * config.cellPitch;

  const width = gridWidth + config.boardPaddingX * 2;
  const height = gridHeight + config.boardPaddingY * 2;

  const gridOriginX = config.boardPaddingX;
  const gridOriginY = config.boardPaddingY;

  const { palette } = config;
  const dotRadius = config.dotSize / 2;
  const dotCenterOffset = config.cellPitch / 2;

  // Total cycle duration and transition timeline
  const durationPerText = config.durationPerText ?? 3.8;
  const initialHold = config.initialHold ?? 0.8;
  const flipDuration = config.flipDuration ?? 0.35;
  const sweepMax = config.sweepMax ?? 0.85;

  // One transition per text, plus final reset transition to zero
  const numTransitions = numTexts + 1;
  const cycleSeconds = config.cycleSeconds ?? (initialHold + numTexts * durationPerText + 3.2);

  const tTrans = [];
  let currT = initialHold;
  for (let i = 0; i < numTexts; i += 1) {
    tTrans.push(+currT.toFixed(2));
    currT += durationPerText;
  }
  // Final transition back to dark zero
  tTrans.push(+currT.toFixed(2));

  // Compute the boolean state sequence for every (row, col)
  const patternMap = new Map();
  const dotPattern = Array.from({ length: totalRows }, () =>
    Array.from({ length: totalCols }, () => "0".repeat(numTexts))
  );

  for (let r = 0; r < totalRows; r += 1) {
    for (let c = 0; c < totalCols; c += 1) {
      const seq = layouts.map((l) => (l.grid[r] && l.grid[r][c] ? "1" : "0")).join("");
      dotPattern[r][c] = seq;
      if (!patternMap.has(seq)) {
        patternMap.set(seq, []);
      }
      patternMap.get(seq).push({ r, c });
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
      `  0% { fill: ${palette.zeroDot}; stroke: ${palette.zeroDotStroke}; transform: scaleY(1) scaleX(1); filter: none; }`
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
          `  ${p0}% { fill: ${palette.zeroDot}; stroke: ${palette.zeroDotStroke}; transform: scaleY(1) scaleX(1); filter: none; }`
        );
        kfSteps.push(
          `  ${p1}% { fill: ${palette.zeroHighlight}; stroke: ${palette.activeDotStroke}; transform: scaleY(0.08) scaleX(0.92) skewX(-8deg); filter: none; }`
        );
        kfSteps.push(
          `  ${p2}% { fill: ${palette.flipFlash}; stroke: #ffffff; transform: scaleY(1.08) scaleX(1.04); filter: url(#amber-glow); }`
        );
        kfSteps.push(
          `  ${p3}% { fill: url(#active-dot-grad); stroke: ${palette.activeDotStroke}; transform: scaleY(1) scaleX(1); filter: url(#amber-glow); }`
        );
      } else if (prev === 1 && next === 0) {
        const p0 = +(t0 / cycleSeconds * 100).toFixed(2);
        const p1 = +((t0 + flipDuration * 0.5) / cycleSeconds * 100).toFixed(2);
        const p2 = +((t0 + flipDuration) / cycleSeconds * 100).toFixed(2);

        kfSteps.push(
          `  ${p0}% { fill: url(#active-dot-grad); stroke: ${palette.activeDotStroke}; transform: scaleY(1) scaleX(1); filter: url(#amber-glow); }`
        );
        kfSteps.push(
          `  ${p1}% { fill: ${palette.zeroHighlight}; stroke: ${palette.zeroDotStroke}; transform: scaleY(0.08) scaleX(0.92) skewX(8deg); filter: none; }`
        );
        kfSteps.push(
          `  ${p2}% { fill: ${palette.zeroDot}; stroke: ${palette.zeroDotStroke}; transform: scaleY(1) scaleX(1); filter: none; }`
        );
      } else if (prev === 1 && next === 1) {
        const p0 = +(t0 / cycleSeconds * 100).toFixed(2);
        const p1 = +((t0 + flipDuration * 0.5) / cycleSeconds * 100).toFixed(2);
        const p2 = +((t0 + flipDuration) / cycleSeconds * 100).toFixed(2);

        kfSteps.push(
          `  ${p0}% { fill: url(#active-dot-grad); stroke: ${palette.activeDotStroke}; transform: scaleY(1) scaleX(1); filter: url(#amber-glow); }`
        );
        kfSteps.push(
          `  ${p1}% { fill: url(#active-dot-grad); stroke: ${palette.activeDotStroke}; transform: scaleY(0.72) scaleX(0.96); filter: url(#amber-glow); }`
        );
        kfSteps.push(
          `  ${p2}% { fill: url(#active-dot-grad); stroke: ${palette.activeDotStroke}; transform: scaleY(1) scaleX(1); filter: url(#amber-glow); }`
        );
      }
    }

    kfSteps.push(
      `  100% { fill: ${palette.zeroDot}; stroke: ${palette.zeroDotStroke}; transform: scaleY(1) scaleX(1); filter: none; }`
    );

    keyframes.push(
      `    @keyframes k-${seq} {\n${kfSteps.join("\n")}\n    }\n    .p-${seq} {\n      animation: k-${seq} ${cycleSeconds}s cubic-bezier(0.22, 1, 0.36, 1) infinite;\n    }`
    );
  }

  // Render circular dots
  const circles = [];

  for (let r = 0; r < totalRows; r += 1) {
    for (let c = 0; c < totalCols; c += 1) {
      const seq = dotPattern[r][c];
      const isZeroAll = seq === "0".repeat(numTexts);
      const cx = +(gridOriginX + c * config.cellPitch + dotCenterOffset).toFixed(2);
      const cy = +(gridOriginY + r * config.cellPitch + dotCenterOffset).toFixed(2);

      // Diagonal sweep wave delay across board
      const normalizedSweep = (c + r * 1.35) / (totalCols + totalRows * 1.35);
      const jitter = (dotJitter(r, c) - 0.5) * 0.08;
      const delay = +(normalizedSweep * sweepMax + jitter).toFixed(3);

      if (isZeroAll) {
        circles.push(
          `    <circle class="d z" cx="${cx}" cy="${cy}" r="${dotRadius}"/>`
        );
      } else {
        circles.push(
          `    <circle class="d z p-${seq}" cx="${cx}" cy="${cy}" r="${dotRadius}" style="animation-delay:${delay}s"/>`
        );
      }
    }
  }

  const screwPositions = [
    [14, 14],
    [width - 14, 14],
    [14, height - 14],
    [width - 14, height - 14]
  ];

  const screwsSvg = screwPositions
    .map(
      ([sx, sy]) =>
        `    <g transform="translate(${sx},${sy})">
      <circle r="4.5" fill="${palette.screwFill}" stroke="${palette.casingStroke}" stroke-width="1"/>
      <line x1="-2.6" y1="-1.5" x2="2.6" y2="1.5" stroke="${palette.screwSlot}" stroke-width="1.2" stroke-linecap="round"/>
    </g>`
    )
    .join("\n");

  const safeLabel = escapeXml(textList.join(" &#8226; "));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${safeLabel}">
  <title>${safeLabel}</title>
  <defs>
    <linearGradient id="casing-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#141923"/>
      <stop offset="100%" stop-color="${palette.casingOuter}"/>
    </linearGradient>
    <linearGradient id="active-dot-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${palette.flipFlash}"/>
      <stop offset="28%" stop-color="${palette.activeDotBright}"/>
      <stop offset="100%" stop-color="${palette.activeDot}"/>
    </linearGradient>
    <filter id="amber-glow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="0" stdDeviation="1.35" flood-color="${palette.activeDotBright}" flood-opacity="0.45"/>
    </filter>
  </defs>
  <style>
    .d {
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
        filter: url(#amber-glow);
      }
    }
  </style>

  <!-- Outer anodized aluminum frame -->
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="12" fill="url(#casing-grad)" stroke="${palette.casingStroke}" stroke-width="2"/>

  <!-- Inner recessed bezel -->
  <rect x="${gridOriginX - 8}" y="${gridOriginY - 8}" width="${gridWidth + 16}" height="${gridHeight + 16}" rx="6" fill="${palette.recessBg}" stroke="#1b2230" stroke-width="1.5"/>

  <!-- Corner mounting screws -->
${screwsSvg}

  <!-- Flip-dot array -->
  <g id="flip-dot-matrix">
${circles.join("\n")}
  </g>
</svg>
`;

  return {
    svg,
    width,
    height,
    matrix: layouts[0],
    layouts,
    cols: totalCols,
    rows: totalRows
  };
}
