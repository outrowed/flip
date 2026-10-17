import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateFlipDotSvg,
  generateStillFlipDotSvg,
  generateStillFlipDotFrames,
  PALETTES,
  DEFAULT_ROTATING_TEXTS
} from "./svg.mjs";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");
const rootDir = resolve(__dirname, "..");
const publicDir = resolve(rootDir, "public");
const defaultSvgPath = resolve(rootDir, "dist/flip-dots-hello-world.svg");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function parseQuery(urlStr) {
  const qIdx = urlStr.indexOf("?");
  if (qIdx === -1) return { pathname: urlStr, params: new URLSearchParams() };
  return {
    pathname: urlStr.slice(0, qIdx),
    params: new URLSearchParams(urlStr.slice(qIdx + 1))
  };
}

export function createFlipServer() {
  return createServer(async (req, res) => {
    const { pathname, params } = parseQuery(req.url);

    // Health check
    if (pathname === "/health" || pathname === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", app: "FLIP", name: "Flip-dot Letter & Image Playground" }));
      return;
    }

    // Dynamic SVG generation API (GET /api/svg, GET /api/frame, or prebuilt alias)
    if (
      pathname === "/api/svg" ||
      pathname === "/api/frame" ||
      pathname === "/flip-dots-hello-world.svg" ||
      pathname === "/flip.svg"
    ) {
      try {
        const textParam = params.get("text");
        const textsParam = params.get("texts");
        let texts;

        if (textsParam) {
          texts = textsParam.split(",").map((s) => s.trim()).filter(Boolean);
        } else if (textParam) {
          texts = [textParam];
        } else if (pathname === "/flip-dots-hello-world.svg" && existsSync(defaultSvgPath) && !params.toString()) {
          // Serve pre-built default if untouched
          const defaultSvg = readFileSync(defaultSvgPath, "utf8");
          res.writeHead(200, {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": "public, max-age=60"
          });
          res.end(defaultSvg);
          return;
        }

        const dotShape = params.get("shape") === "square" ? "square" : "circle";
        const theme = params.get("theme") || "amber";
        const italic = params.get("italic") !== "false";
        const durationPerText = Number.parseFloat(params.get("duration")) || 3.8;
        const cellPitch = Number.parseFloat(params.get("pitch")) || 14;
        const dotSize = Number.parseFloat(params.get("dotSize")) || (dotShape === "square" ? 12 : 12);
        const resolvedTexts = texts && texts.length > 0 ? texts : DEFAULT_ROTATING_TEXTS;

        // Check if still (static non-animated frame) is requested
        const isStill = pathname === "/api/frame" || params.get("still") === "true" || params.has("frame");
        let resultSvg;

        if (isStill) {
          const frameIndex = Number.parseInt(params.get("frame") || "0", 10) || 0;
          const stillResult = generateStillFlipDotSvg({
            texts: resolvedTexts,
            frameIndex,
            dotShape,
            theme,
            italic,
            cellPitch,
            dotSize
          });
          resultSvg = stillResult.svg;
        } else {
          const animResult = generateFlipDotSvg({
            texts: resolvedTexts,
            dotShape,
            theme,
            italic,
            durationPerText,
            cellPitch,
            dotSize
          });
          resultSvg = animResult.svg;
        }

        res.writeHead(200, {
          "Content-Type": "image/svg+xml; charset=utf-8",
          "Cache-Control": "public, max-age=30",
          "Access-Control-Allow-Origin": "*"
        });
        res.end(resultSvg);
        return;
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
        return;
      }
    }

    // POST /api/generate: returns JSON with animated SVG, telemetry metadata, and all still frames
    if (pathname === "/api/generate" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1e6) req.destroy();
      });
      req.on("end", () => {
        try {
          const payload = body ? JSON.parse(body) : {};
          const texts = Array.isArray(payload.texts) && payload.texts.length > 0
            ? payload.texts
            : (payload.text ? [payload.text] : DEFAULT_ROTATING_TEXTS);

          const commonOptions = {
            texts,
            dotShape: payload.dotShape === "square" ? "square" : "circle",
            theme: payload.theme || "amber",
            italic: payload.italic !== false,
            durationPerText: Number.parseFloat(payload.durationPerText) || 3.8,
            cellPitch: Number.parseFloat(payload.cellPitch) || 14,
            dotSize: Number.parseFloat(payload.dotSize) || 12,
            minCols: Number.parseInt(payload.minCols, 10) || 86,
            rows: Number.parseInt(payload.rows, 10) || 13
          };

          const animResult = generateFlipDotSvg(commonOptions);
          const stillFrames = generateStillFlipDotFrames(commonOptions);

          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
          });
          res.end(JSON.stringify({
            ok: true,
            svg: animResult.svg,
            width: animResult.width,
            height: animResult.height,
            cols: animResult.cols,
            rows: animResult.rows,
            textCount: animResult.layouts.length,
            frames: stillFrames.map((f) => ({
              index: f.frameIndex,
              text: f.text,
              svg: f.svg,
              width: f.width,
              height: f.height,
              activeCount: f.activeCount
            }))
          }));
        } catch (err) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }

    // Static asset serving from public/
    let filePath = pathname === "/" ? resolve(publicDir, "index.html") : resolve(publicDir, `.${pathname}`);

    if (existsSync(filePath)) {
      const ext = extname(filePath).toLowerCase();
      const mime = MIME_TYPES[ext] || "application/octet-stream";
      res.writeHead(200, { "Content-Type": mime });
      res.end(readFileSync(filePath));
      return;
    }

    // Fallback: 404
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
  });
}

// Self-run when invoked directly
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || "0.0.0.0";
  const port = Number(process.env.PORT || 4329);
  const server = createFlipServer();
  server.listen(port, host, () => {
    console.log(`FLIP Server listening on http://${host}:${port}`);
  });
}
