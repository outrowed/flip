import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import {
    DEFAULT_ROTATING_TEXTS,
    generateFlipDotSvg,
    generateStillFlipDotFrames,
    generateStillFlipDotSvg,
    parseFrameMarkup,
    splitFrameTexts,
} from "../core/svg.ts";
import { loadResourcesAsync } from "../core/resources-node.ts";
import { generatePlaceholder, OutputCache, rasterize } from "./raster.ts";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const rootDir = resolve(__dirname, "..");

interface SvgQuery {
    format?: string;
    text?: string;
    texts?: string;
    shape?: string;
    renderTech?: "original" | "compound-path";
    theme?: string;
    italic?: string;
    duration?: string;
    pitch?: string;
    dotSize?: string;
    still?: string;
    frame?: string;
    sync?: string;
}

interface GenerateBody {
    text?: string;
    texts?: string[];
    dotShape?: "square" | "circle";
    renderTech?: "original" | "compound-path";
    theme?: "amber" | "emerald" | "white" | "cyan" | "crimson";
    italic?: boolean;
    durationPerText?: number;
    cellPitch?: number;
    dotSize?: number;
    minCols?: number;
    rows?: number;
}

export async function createFlipApp(options: {
    staticRoot?: string;
    logger?: boolean;
} = {}): Promise<FastifyInstance> {
    await loadResourcesAsync();
    const cache = new OutputCache();
    const app = Fastify({ logger: options.logger ?? false });
    const staticRoot = options.staticRoot ?? resolve(rootDir, "dist");

    await app.register(cors, {
        origin: true,
        exposedHeaders: ["ETag", "X-Raster-Status", "Cache-Control", "Retry-After"],
    });

    // Health checks
    const healthHandler = async () => ({
        status: "ok",
        app: "FLIP",
        name: "Flip-dot Letter & Image Playground",
    });

    app.get("/health", healthHandler);
    app.get("/api/health", healthHandler);

    // SVG generation handler
    const handleSvgRequest = async (request: FastifyRequest<{ Querystring: SvgQuery }>, reply: FastifyReply) => {
        const params = request.query;
        const format = params.format ?? "svg";

        if (!["svg", "apng", "webp"].includes(format)) {
            return reply.code(400).send({ error: "format must be svg, apng, or webp" });
        }

        let texts: string[] | undefined;

        if (params.texts) {
            texts = splitFrameTexts(params.texts);
        }
        else if (params.text) {
            texts = params.text.includes("\n")
                ? splitFrameTexts(params.text)
                : [params.text];
        }

        const totalDisplayTextLength = (texts ?? [])
            .map(line => parseFrameMarkup(line).text.length)
            .reduce((sum, len) => sum + len, 0);

        if (totalDisplayTextLength > 500 || (params.text?.length ?? params.texts?.length ?? 0) > 2000) {
            return reply.code(400).send({ error: "Text is limited to 500 characters" });
        }

        const dotShape = params.shape === "square" ? "square" : "circle";
        const theme = (params.theme || "amber") as "amber" | "emerald" | "white" | "cyan" | "crimson";
        const italic = params.italic !== "false";
        const durationPerText = Number.parseFloat(params.duration || "3.8") || 3.8;
        const cellPitch = Number.parseFloat(params.pitch || "14") || 14;
        const dotSize = Number.parseFloat(params.dotSize || "12") || 12;
        const resolvedTexts = texts && texts.length > 0 ? texts : DEFAULT_ROTATING_TEXTS;

        const isStill = request.url.startsWith("/api/frame")
            || params.still === "true"
            || params.frame !== undefined;

        let resultSvg: string;
        let boardWidth: number;
        let boardHeight: number;

        if (isStill) {
            const frameIndex = Number.parseInt(params.frame || "0", 10) || 0;
            const stillResult = generateStillFlipDotSvg({
                texts: resolvedTexts,
                frameIndex,
                dotShape,
                renderTech: params.renderTech,
                theme,
                italic,
                cellPitch,
                dotSize,
            });
            resultSvg = stillResult.svg;
            boardWidth = stillResult.width;
            boardHeight = stillResult.height;
        }
        else {
            const animResult = generateFlipDotSvg({
                texts: resolvedTexts,
                dotShape,
                renderTech: params.renderTech,
                theme,
                italic,
                durationPerText,
                cellPitch,
                dotSize,
            });
            resultSvg = animResult.svg;
            boardWidth = animResult.width;
            boardHeight = animResult.height;
        }

        const key = createHash("sha256").update(`${format}:${isStill}:${resultSvg}`).digest("hex");

        try {
            if (format === "svg") {
                const output = await cache.get(key, () => Promise.resolve(Buffer.from(resultSvg)));
                reply.header("Content-Type", "image/svg+xml; charset=utf-8");
                reply.header("Cache-Control", "public, max-age=60, s-maxage=300");
                reply.header("ETag", output.etag);

                if (request.headers["if-none-match"]?.split(",").map(tag => tag.trim().replace(/^W\//, "")).some(tag => tag === output.etag || tag === "*")) {
                    return reply.code(304).send();
                }

                return reply.send(output.data);
            }

            // For raster formats (WebP, APNG)
            const rasterFormat = format as "apng" | "webp";
            const isSync = params.sync === "true";

            // If it's a still frame or explicit sync request, rasterize synchronously
            if (isStill || isSync) {
                const output = await cache.get(key, () => rasterize(resultSvg, rasterFormat, isStill));
                reply.header("Content-Type", `image/${rasterFormat}`);
                reply.header("Cache-Control", "public, max-age=60, s-maxage=300");
                reply.header("ETag", output.etag);
                reply.header("X-Raster-Status", "ready");

                if (request.headers["if-none-match"]?.split(",").map(tag => tag.trim().replace(/^W\//, "")).some(tag => tag === output.etag || tag === "*")) {
                    return reply.code(304).send();
                }

                return reply.send(output.data);
            }

            // For animated raster formats: check if already in cache
            const cached = cache.peek(key);

            if (cached) {
                reply.header("Content-Type", `image/${rasterFormat}`);
                reply.header("Cache-Control", "public, max-age=60, s-maxage=300");
                reply.header("ETag", cached.etag);
                reply.header("X-Raster-Status", "ready");

                if (request.headers["if-none-match"]?.split(",").map(tag => tag.trim().replace(/^W\//, "")).some(tag => tag === cached.etag || tag === "*")) {
                    return reply.code(304).send();
                }

                return reply.send(cached.data);
            }

            // Cache miss: trigger background generation if not already pending
            void cache.trigger(key, () => rasterize(resultSvg, rasterFormat, false)).catch((err) => {
                request.log.error(err, "Background rasterization failed");
            });

            // Return a 1-frame placeholder immediately matching exact board dimensions
            const proto = (request.headers["x-forwarded-proto"] as string) || "https";
            const host = (request.headers["x-forwarded-host"] as string) || request.headers.host || "flip.taruna.me";
            const fullUrl = `${proto}://${host}${request.raw.url || request.url}`;
            const placeholder = await generatePlaceholder(boardWidth, boardHeight, rasterFormat, theme, fullUrl);
            const placeholderEtag = `W/"placeholder-${key.slice(0, 16)}"`;

            reply.header("Content-Type", `image/${rasterFormat}`);
            // Short TTL so Camo and browsers re-check quickly once rendering finishes
            reply.header("Cache-Control", "public, max-age=4, s-maxage=4, must-revalidate");
            reply.header("ETag", placeholderEtag);
            reply.header("X-Raster-Status", "rendering");
            return reply.send(placeholder);
        }
        catch (error) {
            if (error instanceof RangeError) return reply.code(400).send({ error: error.message });

            reply.header("Retry-After", "5");
            request.log.error(error);
            return reply.code(503).send({ error: "Raster rendering unavailable. Retry shortly or use SVG." });
        }
    };

    app.get("/api/svg", handleSvgRequest);
    app.get("/api/frame", handleSvgRequest);
    app.get("/flip.svg", handleSvgRequest);

    // Dedicated developer endpoint to inspect the placeholder directly
    app.get<{
        Querystring: {
            width?: string;
            height?: string;
            theme?: string;
            format?: string;
        };
    }>("/api/placeholder", async (request, reply) => {
        const query = request.query;
        const width = Number.parseInt(query.width || "1260", 10) || 1260;
        const height = Number.parseInt(query.height || "234", 10) || 234;
        const theme = (query.theme || "amber") as "amber" | "emerald" | "white" | "cyan" | "crimson";
        const format = (query.format || "webp") as "webp" | "apng" | "svg" | "png";

        if (width <= 0 || width > 3000 || height <= 0 || height > 1000) {
            return reply.code(400).send({ error: "Invalid width or height dimensions" });
        }

        const proto = (request.headers["x-forwarded-proto"] as string) || "https";
        const host = (request.headers["x-forwarded-host"] as string) || request.headers.host || "flip.taruna.me";
        const fullUrl = `${proto}://${host}${request.raw.url || request.url}`;

        const placeholder = await generatePlaceholder(
            width,
            height,
            format === "svg" ? "svg" : format === "apng" ? "apng" : format === "png" ? "png" : "webp",
            theme,
            fullUrl,
        );

        const contentType = format === "svg"
            ? "image/svg+xml; charset=utf-8"
            : format === "webp"
                ? "image/webp"
                : "image/png";

        reply.header("Content-Type", contentType);
        reply.header("Cache-Control", "no-cache");
        return reply.send(placeholder);
    });

    // POST /api/generate
    app.post<{ Body: GenerateBody }>("/api/generate", async (request, reply) => {
        const payload = request.body || {};
        const texts = Array.isArray(payload.texts) && payload.texts.length > 0
            ? payload.texts.flatMap(entry => (entry.includes("\n") ? splitFrameTexts(entry) : [entry.trim()]).filter(Boolean))
            : payload.text
                ? splitFrameTexts(payload.text)
                : DEFAULT_ROTATING_TEXTS;

        const commonOptions = {
            texts,
            renderTech: payload.renderTech,
            dotShape: (payload.dotShape === "square" ? "square" : "circle") as "square" | "circle",
            theme: (payload.theme || "amber") as "amber" | "emerald" | "white" | "cyan" | "crimson",
            italic: payload.italic !== false,
            durationPerText: Number.parseFloat(String(payload.durationPerText || "3.8")) || 3.8,
            cellPitch: Number.parseFloat(String(payload.cellPitch || "14")) || 14,
            dotSize: Number.parseFloat(String(payload.dotSize || "12")) || 12,
            minCols: Number.parseInt(String(payload.minCols || "86"), 10) || 86,
            rows: Number.parseInt(String(payload.rows || "13"), 10) || 13,
        };

        const animResult = generateFlipDotSvg(commonOptions);
        const stillFrames = generateStillFlipDotFrames(commonOptions);

        return reply.send({
            ok: true,
            svg: animResult.svg,
            width: animResult.width,
            height: animResult.height,
            cols: animResult.cols,
            rows: animResult.rows,
            textCount: animResult.layouts.length,
            frames: stillFrames.map(f => ({
                index: f.frameIndex,
                text: f.text,
                rawText: f.rawText,
                overrides: f.overrides,
                svg: f.svg,
                width: f.width,
                height: f.height,
                activeCount: f.activeCount,
            })),
        });
    });

    // Serve dynamic static assets from static/ if it exists
    const staticDir = resolve(rootDir, "static");

    if (existsSync(staticDir)) {
        await app.register(fastifyStatic, {
            root: staticDir,
            prefix: "/static/",
            decorateReply: false,
        });
    }

    // Static SPA serving when staticRoot exists
    if (existsSync(staticRoot)) {
        await app.register(fastifyStatic, {
            root: staticRoot,
            prefix: "/",
            wildcard: false,
        });

        // SPA fallback: return index.html for non-API client routes
        const distIndex = resolve(staticRoot, "index.html");

        if (existsSync(distIndex)) {
            app.setNotFoundHandler(async (request, reply) => {
                if (request.url.startsWith("/api/")) {
                    return reply.code(404).send({ error: "API endpoint not found" });
                }

                reply.header("Content-Type", "text/html; charset=utf-8");
                return reply.sendFile("index.html");
            });
        }
    }

    return app;
}
