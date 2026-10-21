import { createHash } from "node:crypto";
import { chromium, type Browser } from "playwright";
import sharp from "sharp";
import UPNG from "upng-js";
import { PALETTES, type PaletteDef } from "../core/resources.ts";

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

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="casing-grad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#141923"/>
      <stop offset="100%" stop-color="${palette.casingOuter}"/>
    </linearGradient>
  </defs>
  <rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="12" fill="url(#casing-grad)" stroke="${palette.casingStroke}" stroke-width="2"/>
  <rect x="12" y="12" width="${Math.max(1, width - 24)}" height="${Math.max(1, height - 24)}" rx="6" fill="${palette.recessBg}" stroke="#1b2230" stroke-width="1.5"/>
  <circle cx="20" cy="20" r="3" fill="${palette.screwFill}" stroke="${palette.screwSlot}" stroke-width="0.75"/>
  <circle cx="${width - 20}" cy="20" r="3" fill="${palette.screwFill}" stroke="${palette.screwSlot}" stroke-width="0.75"/>
  <circle cx="20" cy="${height - 20}" r="3" fill="${palette.screwFill}" stroke="${palette.screwSlot}" stroke-width="0.75"/>
  <circle cx="${width - 20}" cy="${height - 20}" r="3" fill="${palette.screwFill}" stroke="${palette.screwSlot}" stroke-width="0.75"/>
  <text x="${width / 2}" y="${yCenter - 9}" font-family="system-ui, -apple-system, sans-serif" font-size="${titleSize}" font-weight="700" fill="${palette.activeDotBright}" letter-spacing="1.2" text-anchor="middle" dominant-baseline="middle">GENERATING FLIP-DOT ANIMATION...</text>
  <text x="${width / 2}" y="${yCenter + 14}" font-family="system-ui, -apple-system, sans-serif" font-size="${subSize}" fill="#94a3b8" letter-spacing="0.4" text-anchor="middle" dominant-baseline="middle">Please wait for a moment • Reload from time to time to view</text>
</svg>`;

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

let renderQueue = Promise.resolve() as Promise<unknown>;
let queuedJobs = 0;
const MAX_CONCURRENT_QUEUE = 5;

async function executeRasterize(
    svg: string,
    format: "apng" | "webp",
    width: number,
    height: number,
    count: number,
    frameDurationMs: number,
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

        for (let index = 0; index < count; index += 1) {
            if (Date.now() > deadline) throw new Error("Raster rendering timed out");

            await page.evaluate((time) => {
                for (const animation of document.getAnimations()) {
                    animation.pause();
                    animation.currentTime = time;
                }
            }, Math.round(index * frameDurationMs));
            const shot = await page.screenshot({
                omitBackground: true,
                timeout: 10_000,
            });
            const frame = await sharp(shot).ensureAlpha().raw().toBuffer();
            const delay = Math.round((index + 1) * frameDurationMs) - Math.round(index * frameDurationMs);

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

        if (format === "apng") {
            return Buffer.from(UPNG.encode(frames.map(frame => Uint8Array.from(frame).buffer), width, height, 0, delays));
        }

        return await sharp(Buffer.concat(frames), {
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
        return executeRasterize(svg, format, width, height, count, frameDurationMs);
    }

    if (queuedJobs >= MAX_CONCURRENT_QUEUE) {
        throw new Error("Raster renderer busy. Retry shortly.");
    }

    queuedJobs += 1;

    const run = () => executeRasterize(svg, format, width, height, count, frameDurationMs);

    const task = renderQueue.then(run, run);

    renderQueue = task.then(() => {}, () => {});

    return task.finally(() => {
        queuedJobs -= 1;
    });
}
