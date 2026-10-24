export interface RasterProgress {
    percent: number;
    elapsedMs: number;
}

/**
 * Calculates deterministic raster progress based on elapsed time and phrase count,
 * matching the asymptotic estimation model in the web playground.
 */
export function calculateRasterProgress(elapsedMs: number, textsCount: number): RasterProgress {
    const safeTexts = Math.max(1, textsCount);
    const estimatedMs = Math.max(3000, safeTexts * 3600);
    const ratio = elapsedMs / estimatedMs;
    const percent = Math.min(
        95,
        Math.round(88 * (1 - Math.exp(-2 * ratio)) + (ratio > 1 ? (1 - Math.exp(-0.4 * (ratio - 1))) * 7 : 0)),
    );

    return {
        percent: Math.max(0, percent),
        elapsedMs: Math.max(0, elapsedMs),
    };
}
