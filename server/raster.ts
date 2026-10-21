import { createHash } from "node:crypto";
import { chromium, type Browser } from "playwright";
import sharp from "sharp";
import UPNG from "upng-js";
import { PALETTES, type PaletteDef, getLoadedPlaceholderTemplate } from "../core/resources.ts";

export type OutputType = "svg" | "apng" | "webp";

export interface CacheEntry {
    data: Buffer;
    etag: string;
}

/** Byte-bounded LRU with single-flight generation and synchronous cache inspection. */
export class OutputCache {
    private entries = new Map<string, CacheEntry>();
    private pending = new Map<string, Promise<CacheEntry>>();
    private bytes = 0;

    private readonly maxBytes: number;

    constructor(maxBytes = 64 * 1024 * 1024) {
        this.maxBytes = maxBytes;
    }

    peek(key: string): CacheEntry | undefined {
        const cached = this.entries.get(key);

        if (cached) {
            this.entries.delete(key);
            this.entries.set(key, cached);
            return cached;
        }

        return undefined;
    }

    isPending(key: string): boolean {
        return this.pending.has(key);
    }

    set(key: string, data: Buffer): CacheEntry {
        const entry: CacheEntry = {
            data,
            etag: `"${createHash("sha256").update(data).digest("hex")}"`,
        };

        if (data.length <= this.maxBytes) {
            while (this.bytes + data.length > this.maxBytes) {
                const oldest = this.entries.keys().next().value;

                if (oldest === undefined) break;

                this.bytes -= (this.entries.get(oldest)?.data.length ?? 0);
                this.entries.delete(oldest);
            }

            this.entries.set(key, entry);
            this.bytes += data.length;
        }

        return entry;
    }

    trigger(key: string, generate: () => Promise<Buffer>): Promise<CacheEntry> {
        const cached = this.peek(key);

        if (cached) return Promise.resolve(cached);

        const pending = this.pending.get(key);

        if (pending) return pending;

        const task = generate()
            .then(data => this.set(key, data))
            .finally(() => this.pending.delete(key));

        this.pending.set(key, task);
        return task;
    }

    async get(key: string, generate: () => Promise<Buffer>): Promise<CacheEntry> {
        const cached = this.peek(key);

        if (cached) return cached;

        return this.trigger(key, generate);
    }
}

/** Creates a 1-frame placeholder image sized identically to the final board. */
export async function generatePlaceholder(
    width: number,
    height: number,
    format: "apng" | "webp" | "svg" | "png" = "webp",
    theme = "amber",
): Promise<Buffer> {
    const palette: PaletteDef = PALETTES[theme] || PALETTES.amber;
    const titleSize = Math.min(18, Math.max(11, Math.floor(Math.min(height / 11, width / 34))));
    const subSize = Math.min(12, Math.max(9, Math.floor(Math.min(height / 17, width / 52))));
    const yCenter = height / 2;

    const template = getLoadedPlaceholderTemplate();
    const replacements: Record<string, string> = {
        width: String(width),
        height: String(height),
        frameWidth: String(width - 2),
        frameHeight: String(height - 2),
        recessWidth: String(Math.max(1, width - 24)),
        recessHeight: String(Math.max(1, height - 24)),
        screwRightX: String(width - 20),
        screwBottomY: String(height - 20),
        centerX: String(width / 2),
        titleY: String(yCenter - 9),
        subY: String(yCenter + 14),
        titleSize: String(titleSize),
        subSize: String(subSize),
    };

    for (const [key, value] of Object.entries(palette)) {
        replacements[`palette.${key}`] = String(value);
    }

    const svg = template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
        if (!(key in replacements)) throw new Error(`Missing placeholder template value: ${key}`);

        return replacements[key];
    });

    const svgBuffer = Buffer.from(svg);

    if (format === "svg") {
        return svgBuffer;
    }

    if (format === "webp") {
        return sharp(svgBuffer).webp({ quality: 80 }).toBuffer();
    }

    return sharp(svgBuffer).png().toBuffer();
}

function extractDurationSeconds(svg: string, still: boolean): number {
    if (still) return 0;

    const classMatches = [...svg.matchAll(/\.p-[01]+\s*\{[^}]*animation:\s*k-[01]+\s+([\d.]+)s/g)];

    if (classMatches.length > 0) {
        return Math.max(...classMatches.map(m => Number(m[1])));
    }

    const genericMatch = svg.match(/animation:\s*[^\s;]+\s+([\d.]+)s/);

    if (genericMatch) {
        return Number(genericMatch[1]);
    }

    return 0;
}

interface ActiveWindow {
    tStart: number;
    tEnd: number;
}

/** Parses active flip-dot transition windows to skip static hold frames. */
function extractActiveWindows(svg: string, duration: number, maxDelay: number): ActiveWindow[] | null {
    const pMatches = [...svg.matchAll(/([\d.]+)%\s*\{/g)].map(m => Number(m[1]));
    const uniqueP = [...new Set(pMatches)].filter(p => p > 0 && p < 100).sort((a, b) => a - b);

    if (uniqueP.length === 0) return null;

    const clusters: number[][] = [];
    let cur = [uniqueP[0]];

    for (let i = 1; i < uniqueP.length; i += 1) {
        if (uniqueP[i] - uniqueP[i - 1] > 2.0) {
            clusters.push(cur);
            cur = [uniqueP[i]];
        }
        else {
            cur.push(uniqueP[i]);
        }
    }

    clusters.push(cur);

    return clusters.map(c => ({
        tStart: Math.max(0, (c[0] / 100) * duration - 0.05),
        tEnd: Math.min(duration, (c[c.length - 1] / 100) * duration + maxDelay + 0.12),
    }));
}

interface SamplePoint {
    index: number;
    timeMs: number;
}

/** Builds timeline sample points, sampling active transitions at 24 FPS and compressing static holds into 1 frame. */
function buildSamplePoints(svg: string, duration: number, count: number, frameDurationMs: number): SamplePoint[] {
    const delayMatches = [...svg.matchAll(/animation-delay:\s*([-\d.]+)s/g)].map(m => Number(m[1]));
    const maxDelay = delayMatches.length > 0 ? Math.max(...delayMatches) : 0;
    const windows = extractActiveWindows(svg, duration, maxDelay);

    if (!windows || windows.length === 0) {
        return Array.from({ length: count }, (_, index) => ({
            index,
            timeMs: Math.round(index * frameDurationMs),
        }));
    }

    const points: SamplePoint[] = [];
    let inHold = false;

    for (let i = 0; i < count; i += 1) {
        const tSec = (i * frameDurationMs) / 1000;
        const isActive = windows.some(w => tSec >= w.tStart && tSec <= w.tEnd);

        if (isActive) {
            points.push({
                index: i,
                timeMs: Math.round(i * frameDurationMs),
            });
            inHold = false;
        }
        else if (!inHold) {
            points.push({
                index: i,
                timeMs: Math.round(i * frameDurationMs),
            });
            inHold = true;
        }
    }

    return points;
}

let renderQueue = Promise.resolve() as Promise<unknown>;
let queuedJobs = 0;
const MAX_CONCURRENT_QUEUE = 5;
const MAX_RASTER_PAYLOAD_BYTES = 5 * 1024 * 1024; // GitHub Camo hard 5MB limit

async function executeRasterize(
    svg: string,
    format: "apng" | "webp",
    width: number,
    height: number,
    count: number,
    frameDurationMs: number,
    duration: number,
    still: boolean,
): Promise<Buffer> {
    let browser: Browser | undefined;

    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage({
            viewport: {
                width,
                height,
            },
            deviceScaleFactor: 1,
            reducedMotion: "no-preference",
        });
        await page.route("**/*", route => route.abort());
        await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${width}px;height:${height}px}</style>${svg}`);
        const frames: Buffer[] = [];
        const delays: number[] = [];
        let previous: Buffer | undefined;
        let retainedBytes = 0;

        const deadline = Date.now() + 90_000;
        const samplePoints = still
            ? [{
                    index: 0,
                    timeMs: 0,
                }]
            : buildSamplePoints(svg, duration, count, frameDurationMs);

        for (let s = 0; s < samplePoints.length; s += 1) {
            if (Date.now() > deadline) throw new Error("Raster rendering timed out");

            const pt = samplePoints[s];
            const nextPt = samplePoints[s + 1];
            const nextIndex = nextPt ? nextPt.index : count;
            const delay = Math.round(nextIndex * frameDurationMs) - Math.round(pt.index * frameDurationMs);

            await page.evaluate((time) => {
                for (const animation of document.getAnimations()) {
                    animation.pause();
                    animation.currentTime = time;
                }
            }, pt.timeMs);

            const shot = await page.screenshot({
                omitBackground: true,
                timeout: 10_000,
            });
            const frame = await sharp(shot).ensureAlpha().raw().toBuffer();

            if (previous?.equals(frame)) {
                delays[delays.length - 1] += delay;
            }
            else {
                retainedBytes += frame.length;

                if (retainedBytes > 256 * 1024 * 1024 || frames.length >= 300) {
                    throw new RangeError("Raster output has too many unique frames for the memory limit.");
                }

                frames.push(frame);
                delays.push(delay);
                previous = frame;
            }
        }

        // Close headless browser eagerly before encoding to free memory
        await browser.close();
        browser = undefined;

        let output: Buffer;

        if (format === "apng") {
            const rawBuffers: ArrayBuffer[] = frames.map(
                f => f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer,
            );
            output = Buffer.from(UPNG.encode(rawBuffers, width, height, 0, delays));
        }
        else {
            output = await sharp(Buffer.concat(frames), {
                raw: {
                    width,
                    height: height * frames.length,
                    channels: 4,
                    pageHeight: height,
                },
            }).webp({
                loop: 0,
                delay: delays,
                quality: 80,
            }).toBuffer();
        }

        if (output.length > MAX_RASTER_PAYLOAD_BYTES) {
            throw new RangeError(`Raster output (${(output.length / 1024 / 1024).toFixed(2)} MB) exceeds GitHub Camo 5 MB limit. Please use WebP or fewer phrases.`);
        }

        return output;
    }
    finally {
        await browser?.close();
    }
}

/** Sample CSS animation deterministically; serializes executions to prevent browser contention. */
export async function rasterize(svg: string, format: "apng" | "webp", still = false): Promise<Buffer> {
    const width = Number(svg.match(/viewBox="0 0 (\d+) /)?.[1]);
    const height = Number(svg.match(/viewBox="0 0 \d+ (\d+)"/)?.[1]);
    const seconds = extractDurationSeconds(svg, still);
    const fps = 24;
    const frameDurationMs = 1000 / fps;
    const count = still ? 1 : Math.ceil(seconds * fps);

    if (!width || !height || width * height > 500_000 || !count || count > 1000 || width * height * count > 300_000_000) {
        throw new RangeError("Raster output exceeds limits (500,000 pixels, 40 seconds, or 300 million sampled pixels).");
    }

    // Still frames take < 200ms and execute directly without head-of-line blocking behind long animation queues
    if (still) {
        return executeRasterize(svg, format, width, height, count, frameDurationMs, seconds, still);
    }

    if (queuedJobs >= MAX_CONCURRENT_QUEUE) {
        throw new Error("Raster renderer busy. Retry shortly.");
    }

    queuedJobs += 1;

    const run = () => executeRasterize(svg, format, width, height, count, frameDurationMs, seconds, still);

    const task = renderQueue.then(run, run);

    renderQueue = task.then(() => {}, () => {});

    return task.finally(() => {
        queuedJobs -= 1;
    });
}
