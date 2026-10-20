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
} from "../core/svg.ts";
import { loadResourcesAsync } from "../core/resources-node.ts";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const rootDir = resolve(__dirname, "..");

interface SvgQuery {
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
    const app = Fastify({ logger: options.logger ?? false });
    const staticRoot = options.staticRoot ?? resolve(rootDir, "dist");

    await app.register(cors, {
        origin: true,
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
        let texts: string[] | undefined;

        if (params.texts) {
            texts = params.texts
                .split(",")
                .map(s => s.trim())
                .filter(Boolean);
        }
        else if (params.text) {
            texts = [params.text];
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
        }

        reply.header("Content-Type", "image/svg+xml; charset=utf-8");
        reply.header("Cache-Control", "public, max-age=30");
        return reply.send(resultSvg);
    };

    app.get("/api/svg", handleSvgRequest);
    app.get("/api/frame", handleSvgRequest);
    app.get("/flip.svg", handleSvgRequest);

    // POST /api/generate
    app.post<{ Body: GenerateBody }>("/api/generate", async (request, reply) => {
        const payload = request.body || {};
        const texts = Array.isArray(payload.texts) && payload.texts.length > 0
            ? payload.texts
            : payload.text
                ? [payload.text]
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
