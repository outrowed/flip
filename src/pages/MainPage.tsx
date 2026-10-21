import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    DEFAULT_ROTATING_TEXTS,
    generateFlipDotSvg,
    generateStillFlipDotFrames,
    PALETTES,
} from "../../core/svg.ts";
import { download, downloadFrames, png } from "../export.ts";

const PRESETS: Record<string, string[]> = {
    rotation: [...DEFAULT_ROTATING_TEXTS],
    single: ["hello world"],
    terminal: ["system online", "all checks green", "ready for input"],
    minimal: ["taruna", "outrowed"],
};

export function MainPage() {
    const [outputType, setOutputType] = useState<"svg" | "apng" | "webp">("svg");
    const [rasterPreviewUrl, setRasterPreviewUrl] = useState<string | null>(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [rasterProgress, setRasterProgress] = useState(0);
    const [rasterElapsed, setRasterElapsed] = useState(0);
    const [isExporting, setIsExporting] = useState(false);
    const [rawText, setRawText] = useState(PRESETS.rotation.join("\n"));
    const [dotShape, setDotShape] = useState<"circle" | "square">("circle");
    const [renderTech, setRenderTech] = useState<"compound-path" | "original">("compound-path");
    const [italic, setItalic] = useState(true);
    const [theme, setTheme] = useState<keyof typeof PALETTES>("amber");
    const [durationPerText, setDurationPerText] = useState(3.8);
    const [cellPitch, setCellPitch] = useState(14);
    const [bgTheme, setBgTheme] = useState<"dark" | "light" | "grid">("dark");
    const [activeTab, setActiveTab] = useState<"markdown" | "html" | "api" | "embed">("markdown");
    const [toast, setToast] = useState<string | null>(null);
    const [isZipping, setIsZipping] = useState(false);
    const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const showToast = useCallback((msg: string) => {
        if (toastTimer.current) {
            clearTimeout(toastTimer.current);
        }

        setToast(msg);
        toastTimer.current = setTimeout(() => {
            setToast(null);
        }, 2200);
    }, []);

    const texts = useMemo(() => {
        const lines = rawText
            .split("\n")
            .map(line => line.trim())
            .filter(Boolean);

        return lines.length > 0 ? lines : ["hello world"];
    }, [rawText]);

    const dotSize = cellPitch - 2;

    // Generated live animated SVG and telemetry
    const generated = useMemo(() => {
        return generateFlipDotSvg({
            texts,
            dotShape,
            renderTech,
            italic,
            theme,
            durationPerText,
            cellPitch,
            dotSize,
        });
    }, [texts, dotShape, renderTech, italic, theme, durationPerText, cellPitch, dotSize]);

    // Data URI for the live preview to guarantee CSS isolation
    const generatedDataUri = useMemo(() => {
        return `data:image/svg+xml;utf8,${encodeURIComponent(generated.svg)}`;
    }, [generated.svg]);

    const previewUrl = outputType === "svg" ? generatedDataUri : rasterPreviewUrl ?? generatedDataUri;

    // Generated settled still frames (no CSS keyframe transitions)
    const stillFrames = useMemo(() => {
        return generateStillFlipDotFrames({
            texts,
            dotShape,
            renderTech,
            italic,
            theme,
            cellPitch,
            dotSize,
        });
    }, [texts, dotShape, renderTech, italic, theme, cellPitch, dotSize]);

    // Data URIs for still frames to prevent CSS class leakage
    const stillFrameDataUris = useMemo(() => {
        return stillFrames.map(f => `data:image/svg+xml;utf8,${encodeURIComponent(f.svg)}`);
    }, [stillFrames]);

    const fileSizeKb = useMemo(() => {
        return (new Blob([generated.svg]).size / 1024).toFixed(1);
    }, [generated.svg]);

    const queryUrl = useMemo(() => {
        if (typeof window === "undefined") {
            return "";
        }

        const origin = window.location.origin;
        const params = new URLSearchParams();

        if (outputType !== "svg") params.set("format", outputType);

        if (texts.length > 1) {
            params.set("texts", texts.join(","));
        }
        else if (texts.length === 1) {
            params.set("text", texts[0]);
        }

        if (dotShape !== "circle") params.set("shape", dotShape);

        if (renderTech !== "compound-path") params.set("renderTech", renderTech);

        if (theme !== "amber") params.set("theme", theme);

        if (!italic) params.set("italic", "false");

        if (durationPerText !== 3.8) params.set("duration", String(durationPerText));

        if (cellPitch !== 14) params.set("pitch", String(cellPitch));

        return `${origin}/api/svg?${params.toString()}`;
    }, [texts, dotShape, renderTech, theme, italic, durationPerText, cellPitch, outputType]);

    const isRasterLoading = (outputType !== "svg" && isPreviewLoading) || isExporting;

    useEffect(() => {
        if (!isRasterLoading) {
            setRasterProgress(0);
            setRasterElapsed(0);
            return;
        }

        const startTime = Date.now();
        const estimatedMs = Math.max(3000, texts.length * 3600);

        const interval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            setRasterElapsed(elapsed);

            const ratio = elapsed / estimatedMs;
            const pct = Math.min(
                95,
                Math.round(88 * (1 - Math.exp(-2 * ratio)) + (ratio > 1 ? (1 - Math.exp(-0.4 * (ratio - 1))) * 7 : 0)),
            );
            setRasterProgress(pct);
        }, 100);

        return () => clearInterval(interval);
    }, [isRasterLoading, texts.length]);

    useEffect(() => {
        if (outputType === "svg") {
            setRasterPreviewUrl(null);
            setIsPreviewLoading(false);
            return;
        }

        const controller = new AbortController();
        let objectUrl: string | null = null;
        setRasterPreviewUrl(null);
        setIsPreviewLoading(true);

        fetch(`${queryUrl}&sync=true`, { signal: controller.signal })
            .then(async (response) => {
                if (!response.ok) throw new Error(`Could not render ${outputType.toUpperCase()} preview (${response.status}).`);

                return response.blob();
            })
            .then((blob) => {
                if (controller.signal.aborted) return;

                setRasterProgress(100);
                objectUrl = URL.createObjectURL(blob);
                setTimeout(() => {
                    if (!controller.signal.aborted) {
                        setRasterPreviewUrl(objectUrl);
                        setIsPreviewLoading(false);
                    }
                }, 150);
            })
            .catch((error) => {
                if (!controller.signal.aborted) {
                    showToast((error as Error).message);
                    setIsPreviewLoading(false);
                }
            });

        return () => {
            controller.abort();

            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [outputType, queryUrl, showToast]);

    const label = texts.join(" • ") || "FLIP Display";
    const liveMarkdownSnippet = `![${label}](${queryUrl})`;

    const snippetText = useMemo(() => {
        if (activeTab === "markdown") {
            return `<!-- Live animated banner from API -->\n${liveMarkdownSnippet}\n\n<!-- Or standalone local file after download -->\n![${label}](./flip.svg)`;
        }

        if (activeTab === "html") {
            return `<!-- Responsive image container using the live API -->\n<p align="center">\n  <a href="${queryUrl}">\n    <img src="${queryUrl}" width="100%" alt="${label}" />\n  </a>\n</p>`;
        }

        if (activeTab === "api") {
            return `# Direct API endpoint (Content-Type: image/svg+xml)\nGET ${queryUrl}\n\n# Single still frame endpoint\nGET ${queryUrl.replace("/api/svg?", "/api/frame?")}&frame=0`;
        }

        return `<!-- React / Next.js / Astro Component Example -->\n<img\n  src="${queryUrl}"\n  alt="${label}"\n  className="w-full h-auto drop-shadow-md"\n  loading="lazy"\n/>`;
    }, [activeTab, label, queryUrl, liveMarkdownSnippet]);

    const handleCopy = useCallback(async (text: string, msg: string) => {
        await navigator.clipboard.writeText(text);
        showToast(msg);
    }, [showToast]);

    const handleDownloadAllZip = useCallback(async (format: "all" | "svg" | "png" = "all") => {
        if (isZipping || stillFrames.length === 0) return;

        try {
            setIsZipping(true);
            await downloadFrames(stillFrames, format);
            const label = format === "svg" ? "SVG frames" : format === "png" ? "PNG frames" : "all frames";
            showToast(`Downloaded ${label} as ZIP!`);
        }
        catch (err) {
            showToast(`ZIP export failed: ${(err as Error).message}`);
        }
        finally {
            setIsZipping(false);
        }
    }, [isZipping, stillFrames, showToast]);

    const handleDownloadFramePng = useCallback(async (frame: typeof stillFrames[number], idx: number) => {
        try {
            const blob = await png(frame);
            const safe = frame.text.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "frame";
            download(blob, `flip-frame-${idx + 1}-${safe}.png`, "image/png");
            showToast(`Downloaded Frame ${idx + 1} (.PNG)`);
        }
        catch (err) {
            showToast(`PNG export failed: ${(err as Error).message}`);
        }
    }, [showToast]);

    const handleReset = useCallback(() => {
        setRawText(PRESETS.rotation.join("\n"));
        setDotShape("circle");
        setRenderTech("compound-path");
        setItalic(true);
        setTheme("amber");
        setDurationPerText(3.8);
        setCellPitch(14);
        showToast("Reset to default rotation");
    }, [showToast]);

    return (
        <div className="grid flex-1 grid-cols-1 gap-6 p-4 sm:p-8 lg:grid-cols-[420px_1fr]">
            {/* Controls Panel */}
            <section className="flex flex-col gap-5 rounded-xl border border-[#202736] bg-[#0f131a] p-6 shadow-xl">
                <div className="border-b border-[#202736] pb-3">
                    <h2 className="text-base font-semibold tracking-wide text-[#f1f5f9]">
                        Display Configuration
                    </h2>
                </div>

                <form onSubmit={e => e.preventDefault()} className="flex flex-col gap-5">
                    {/* Messages Input */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <label htmlFor="textInput" className="text-xs font-medium text-[#94a3b8]">
                                Display Messages
                            </label>
                            <span className="text-[11px] text-[#64748b]">
                                1 line per frame to rotate
                            </span>
                        </div>
                        <textarea
                            id="textInput"
                            rows={5}
                            value={rawText}
                            onChange={e => setRawText(e.target.value)}
                            spellCheck={false}
                            className="w-full rounded-lg border border-[#202736] bg-[#080a0f] p-3 font-mono text-xs text-[#f1f5f9] transition focus:border-[#f59e0b] focus:outline-none"
                            placeholder={"hello world\nits me\ntaruna\noutrowed\npeace out~"}
                        />
                        {/* Preset Pills */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <span className="text-[11px] font-medium text-[#64748b]">
                                Presets:
                            </span>
                            {Object.keys(PRESETS).map(key => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setRawText(PRESETS[key].join("\n"))}
                                    className="rounded border border-[#202736] bg-[#161c26] px-2 py-0.5 text-[11px] text-[#94a3b8] transition hover:border-[#f59e0b] hover:text-[#f1f5f9]"
                                >
                                    {key === "rotation" && "Default Rotation"}
                                    {key === "single" && "Hello World"}
                                    {key === "terminal" && "Status Alert"}
                                    {key === "minimal" && "Personal"}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="outputType" className="text-xs font-medium text-[#94a3b8]">Output type</label>
                        <select id="outputType" value={outputType} onChange={event => setOutputType(event.target.value as "svg" | "apng" | "webp")} className="rounded-lg border border-[#202736] bg-[#080a0f] px-3 py-2 text-xs text-[#f1f5f9]">
                            <option value="svg">SVG (vector, default)</option>
                            <option value="apng">APNG (animated PNG)</option>
                            <option value="webp">WebP (animated, compressed)</option>
                        </select>
                        <p className="text-xs text-[#94a3b8]">Raster exports use the server and are cached. The first request may take a minute. The loading screen remains visible until the animation is ready.</p>
                    </div>

                    {/* Dot Shape & Typography Controls */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-medium text-[#94a3b8]">
                                Dot Shape
                            </span>
                            <div className="grid grid-cols-2 rounded-lg border border-[#202736] bg-[#080a0f] p-1 gap-1">
                                <button
                                    type="button"
                                    onClick={() => setDotShape("circle")}
                                    className={`rounded py-1.5 text-xs font-semibold transition ${dotShape === "circle" ? "bg-[#f59e0b] text-[#080a0f]" : "text-[#94a3b8] hover:text-[#f1f5f9]"}`}
                                >
                                    Round
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setDotShape("square")}
                                    className={`rounded py-1.5 text-xs font-semibold transition ${dotShape === "square" ? "bg-[#f59e0b] text-[#080a0f]" : "text-[#94a3b8] hover:text-[#f1f5f9]"}`}
                                >
                                    Square
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-medium text-[#94a3b8]">
                                Typography
                            </span>
                            <div className="grid grid-cols-2 rounded-lg border border-[#202736] bg-[#080a0f] p-1 gap-1">
                                <button
                                    type="button"
                                    onClick={() => setItalic(true)}
                                    className={`rounded py-1.5 text-xs font-semibold transition ${italic ? "bg-[#f59e0b] text-[#080a0f]" : "text-[#94a3b8] hover:text-[#f1f5f9]"}`}
                                >
                                    <em>
                                        Italic (24°)
                                    </em>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setItalic(false)}
                                    className={`rounded py-1.5 text-xs font-semibold transition ${!italic ? "bg-[#f59e0b] text-[#080a0f]" : "text-[#94a3b8] hover:text-[#f1f5f9]"}`}
                                >
                                    Upright
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label htmlFor="renderTech" className="text-xs font-medium text-[#94a3b8]">
                            Render tech
                        </label>
                        <select
                            id="renderTech"
                            value={renderTech}
                            onChange={e => setRenderTech(e.target.value as "compound-path" | "original")}
                            className="rounded-lg border border-[#202736] bg-[#080a0f] px-3 py-2 text-xs text-[#f1f5f9]"
                        >
                            <option value="compound-path">
                                Compound path
                            </option>
                            <option value="original">
                                Original
                            </option>
                        </select>
                    </div>

                    {/* Palette Swatches */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-[#94a3b8]">
                                Color Theme
                            </span>
                            <span className="text-xs font-medium text-[#f59e0b]">
                                {PALETTES[theme].name}
                            </span>
                        </div>
                        <div className="grid grid-cols-5 gap-2">
                            {(Object.keys(PALETTES) as Array<keyof typeof PALETTES>).map((pKey) => {
                                const pal = PALETTES[pKey];
                                const isActive = theme === pKey;
                                return (
                                    <button
                                        key={pKey}
                                        type="button"
                                        onClick={() => setTheme(pKey)}
                                        className={`group flex flex-col items-center gap-1.5 rounded-lg border p-2 transition ${
                                            isActive
                                                ? "border-[#f59e0b] bg-[#161c26]"
                                                : "border-[#202736] bg-[#080a0f] hover:border-[#38455d]"
                                        }`}
                                        title={pal.name}
                                    >
                                        <div
                                            className="h-5 w-5 rounded-full border shadow-inner transition group-hover:scale-110"
                                            style={{
                                                backgroundColor: pal.activeDot,
                                                borderColor: pal.activeDotStroke,
                                                boxShadow: `0 0 6px ${pal.activeDotBright}66`,
                                            }}
                                        />
                                        <span className="text-[10px] font-medium capitalize text-[#94a3b8] group-hover:text-[#f1f5f9]">
                                            {pKey}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Timing & Pitch Sliders */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <label htmlFor="durationInput" className="text-xs font-medium text-[#94a3b8]">
                                    Hold Duration
                                </label>
                                <span className="font-mono text-xs text-[#f59e0b]">
                                    {durationPerText}
                                    s
                                </span>
                            </div>
                            <input
                                id="durationInput"
                                type="range"
                                min="1.0"
                                max="10.0"
                                step="0.2"
                                value={durationPerText}
                                onChange={e => setDurationPerText(Number.parseFloat(e.target.value))}
                                className="accent-[#f59e0b]"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <label htmlFor="pitchInput" className="text-xs font-medium text-[#94a3b8]">
                                    Dot Pitch
                                </label>
                                <span className="font-mono text-xs text-[#f59e0b]">
                                    {cellPitch}
                                    px
                                </span>
                            </div>
                            <input
                                id="pitchInput"
                                type="range"
                                min="10"
                                max="22"
                                step="1"
                                value={cellPitch}
                                onChange={e => setCellPitch(Number.parseInt(e.target.value, 10))}
                                className="accent-[#f59e0b]"
                            />
                        </div>
                    </div>

                    {/* Reset Button */}
                    <button
                        type="button"
                        onClick={handleReset}
                        className="rounded-lg border border-[#202736] bg-[#161c26] py-2 text-xs font-semibold text-[#94a3b8] transition hover:border-[#f59e0b] hover:text-[#f1f5f9]"
                    >
                        Reset Configuration
                    </button>
                </form>
            </section>

            {/* Stage & Preview Section */}
            <section className="flex flex-col gap-6 overflow-hidden">
                <div className="flex flex-col overflow-hidden rounded-xl border border-[#202736] bg-[#0f131a] shadow-xl">
                    {/* Stage Header / Telemetry Bar */}
                    <div className="flex flex-wrap items-center justify-between border-b border-[#202736] bg-[#0a0d14] px-5 py-3 gap-2">
                        <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-[#94a3b8]">
                            <span className="flex h-2 w-2 rounded-full bg-[#10b981] animate-pulse" />
                            <span>
                                {generated.cols}
                                {" "}
                                ×
                                {" "}
                                {generated.rows}
                                {" "}
                                dots
                            </span>
                            <span className="text-[#64748b]">
                                •
                            </span>
                            <span>
                                {generated.width}
                                {" "}
                                ×
                                {" "}
                                {generated.height}
                                {" "}
                                px
                            </span>
                            <span className="text-[#64748b]">
                                •
                            </span>
                            <span>
                                {texts.length}
                                {" "}
                                {texts.length === 1 ? "frame" : "frames"}
                            </span>
                            <span className="text-[#64748b]">
                                •
                            </span>
                            <span>
                                ~
                                {fileSizeKb}
                                {" "}
                                KB
                            </span>
                        </div>

                        <div className="flex rounded-lg border border-[#202736] bg-[#080a0f] p-0.5 gap-0.5">
                            {(["dark", "light", "grid"] as const).map(mode => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setBgTheme(mode)}
                                    className={`rounded px-2.5 py-1 text-[11px] font-medium capitalize transition ${bgTheme === mode ? "bg-[#161c26] font-semibold text-[#f1f5f9]" : "text-[#94a3b8] hover:text-[#f1f5f9]"}`}
                                >
                                    {mode}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Live Animated Stage Canvas */}
                    <div
                        className={`relative flex min-h-[300px] items-center justify-center p-8 transition-colors ${
                            bgTheme === "dark"
                                ? "bg-[#0b0d13]"
                                : bgTheme === "light"
                                    ? "bg-[#f8fafc]"
                                    : "bg-[#0d1117] bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:28px_28px]"
                        }`}
                    >
                        <img
                            src={previewUrl}
                            alt={label}
                            className={`w-full max-w-5xl rounded-lg shadow-2xl transition-opacity duration-300 ${outputType !== "svg" && isPreviewLoading ? "opacity-20 blur-[1px]" : "opacity-100"}`}
                        />
                        {outputType !== "svg" && isPreviewLoading && (
                            <div className="absolute flex flex-col items-center gap-3 rounded-xl border border-[#202736] bg-[#080a0f]/90 p-6 shadow-2xl backdrop-blur-md max-w-sm w-full mx-4 text-center">
                                <div className="flex items-center gap-2.5">
                                    <svg className="h-4 w-4 animate-spin text-[#f59e0b]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                    </svg>
                                    <span className="text-sm font-semibold text-[#f1f5f9]">
                                        Rendering
                                        {" "}
                                        {outputType.toUpperCase()}
                                        {" "}
                                        Preview
                                    </span>
                                </div>
                                <p className="text-xs text-[#94a3b8]">
                                    Sampling 24 FPS animation across
                                    {" "}
                                    {texts.length}
                                    {" "}
                                    {texts.length === 1 ? "phrase" : "phrases"}
                                    ...
                                </p>
                                <div className="w-full h-2 rounded-full bg-[#161c26] overflow-hidden border border-[#202736]">
                                    <div
                                        className="h-full bg-gradient-to-r from-[#d97706] to-[#fbbf24] transition-all duration-150 ease-out rounded-full"
                                        style={{ width: `${rasterProgress}%` }}
                                    />
                                </div>
                                <div className="flex w-full justify-between text-[11px] font-mono text-[#64748b]">
                                    <span>
                                        {rasterProgress}
                                        %
                                    </span>
                                    <span>
                                        {(rasterElapsed / 1000).toFixed(1)}
                                        s
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Export Bar with Grouped Action Buttons */}
                    <div className="flex flex-wrap items-center justify-between border-t border-[#202736] bg-[#0f131a] px-5 py-3 gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                            {/* SVG output actions */}
                            {outputType === "svg" && (
                                <div className="inline-flex rounded-lg border border-[#202736] bg-[#080a0f] p-0.5 shadow-sm">
                                    <span className="inline-flex items-center rounded-l-md bg-[#f59e0b] px-3 py-1.5 text-xs font-bold text-[#080a0f] tracking-wide select-none">
                                        SVG
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => download(generated.svg, "flip.svg", "image/svg+xml")}
                                        className="border-l border-[#202736] bg-[#161c26] px-3 py-1.5 text-xs font-medium text-[#cbd5e1] transition hover:bg-[#202736] hover:text-white"
                                        title="Download standalone animated SVG"
                                    >
                                        Download Animated
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleCopy(generated.svg, "Raw SVG markup copied!")}
                                        className="rounded-r-md border-l border-[#202736] bg-[#161c26] px-3 py-1.5 text-xs font-medium text-[#cbd5e1] transition hover:bg-[#202736] hover:text-white"
                                        title="Copy raw SVG markup to clipboard"
                                    >
                                        Copy Raw
                                    </button>
                                </div>
                            )}

                            {outputType !== "svg" && (
                                <div key={outputType} className="inline-flex rounded-lg border border-[#202736] bg-[#080a0f] p-0.5 shadow-sm">
                                    <button
                                        type="button"
                                        onClick={() => setOutputType(outputType)}
                                        className="inline-flex items-center rounded-l-md bg-[#f59e0b] px-3 py-1.5 text-xs font-bold text-[#080a0f] tracking-wide"
                                    >
                                        {outputType.toUpperCase()}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isExporting}
                                        onClick={async () => {
                                            setIsExporting(true);

                                            try {
                                                const params = new URLSearchParams(queryUrl.split("?")[1] ?? "");
                                                params.set("format", outputType);
                                                params.set("sync", "true");
                                                const url = `${window.location.origin}/api/svg?${params}`;
                                                const response = await fetch(url);

                                                if (!response.ok) throw new Error(`Could not render ${outputType.toUpperCase()}. Please retry or use SVG.`);

                                                const blob = await response.blob();
                                                download(blob, `flip.${outputType}`, `image/${outputType}`);
                                                showToast(`${outputType.toUpperCase()} downloaded`);
                                            }
                                            catch (error) {
                                                showToast((error as Error).message);
                                            }
                                            finally {
                                                setIsExporting(false);
                                            }
                                        }}
                                        className="rounded-r-md border-l border-[#202736] bg-[#161c26] px-3 py-1.5 text-xs font-medium text-[#cbd5e1] transition hover:bg-[#202736] hover:text-white disabled:opacity-50"
                                    >
                                        {isExporting ? `Rendering ${rasterProgress}%...` : "Download"}
                                    </button>
                                </div>
                            )}

                            {/* Group 2: Live API (Legend: Live API | Copy URL | Copy Markdown URL) */}
                            <div className="inline-flex rounded-lg border border-[#202736] bg-[#080a0f] p-0.5 shadow-sm">
                                <span className="inline-flex items-center rounded-l-md bg-[#38bdf8] px-3 py-1.5 text-xs font-bold text-[#080a0f] tracking-wide select-none">
                                    Live API
                                </span>
                                <button
                                    type="button"
                                    onClick={() => handleCopy(queryUrl, "Direct API URL copied!")}
                                    className="border-l border-[#202736] bg-[#161c26] px-3 py-1.5 text-xs font-medium text-[#cbd5e1] transition hover:bg-[#202736] hover:text-white"
                                    title="Copy raw live API endpoint URL"
                                >
                                    Copy URL
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleCopy(liveMarkdownSnippet, "Live API Markdown copied!")}
                                    className="rounded-r-md border-l border-[#202736] bg-[#161c26] px-3 py-1.5 text-xs font-medium text-[#cbd5e1] transition hover:bg-[#202736] hover:text-white"
                                    title="Copy Markdown code pointing to live API endpoint"
                                >
                                    Copy Markdown URL
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Still Frames Section */}
                    <div className="flex flex-col gap-4 border-t border-[#202736] bg-[#0c1017] p-6">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h3 className="text-sm font-semibold tracking-wide text-[#f1f5f9]">
                                    Still Frames (Static Images)
                                </h3>
                                <p className="text-xs text-[#64748b]">
                                    Settled state per phrase — clean standalone vector &amp; PNG downloads without animation
                                </p>
                            </div>

                            {/* Grouped Still Frame Batch Download: ( Download ZIP | SVG | PNG ) */}
                            <div className="inline-flex rounded-lg border border-[#202736] bg-[#080a0f] p-0.5 shadow-sm">
                                <button
                                    type="button"
                                    onClick={() => handleDownloadAllZip("all")}
                                    disabled={isZipping}
                                    className="inline-flex items-center gap-1.5 rounded-l-md bg-[#f59e0b] px-3 py-1.5 text-xs font-bold text-[#080a0f] tracking-wide transition hover:bg-[#fbbf24] disabled:opacity-50"
                                    title="Download all frames with both SVG and PNG in a ZIP"
                                >
                                    <span>📦</span>
                                    {isZipping ? "Zipping..." : "Download ZIP"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDownloadAllZip("svg")}
                                    disabled={isZipping}
                                    className="border-l border-[#202736] bg-[#161c26] px-3 py-1.5 text-xs font-medium text-[#cbd5e1] transition hover:bg-[#202736] hover:text-white disabled:opacity-50"
                                    title="Download ZIP containing only SVG vector frames"
                                >
                                    SVG
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDownloadAllZip("png")}
                                    disabled={isZipping}
                                    className="rounded-r-md border-l border-[#202736] bg-[#161c26] px-3 py-1.5 text-xs font-medium text-[#cbd5e1] transition hover:bg-[#202736] hover:text-white disabled:opacity-50"
                                    title="Download ZIP containing only high-res PNG raster frames"
                                >
                                    PNG
                                </button>
                            </div>
                        </div>

                        {/* Frame Cards Grid */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {stillFrames.map((frame, idx) => (
                                <div
                                    key={frame.frameIndex}
                                    className="flex flex-col overflow-hidden rounded-lg border border-[#202736] bg-[#080a0f] transition hover:border-[#38455d]"
                                >
                                    <div className="flex min-h-[90px] items-center justify-center border-b border-[#202736] bg-[#090b10] p-3">
                                        <img
                                            src={stillFrameDataUris[idx]}
                                            alt={`Frame ${idx + 1}: "${frame.text}"`}
                                            className="w-full rounded"
                                        />
                                    </div>
                                    <div className="flex items-center justify-between p-3 gap-2">
                                        <div className="flex flex-col overflow-hidden">
                                            <span className="truncate font-mono text-xs font-semibold text-[#f1f5f9]">
                                                Frame
                                                {" "}
                                                {idx + 1}
                                                : &quot;
                                                {frame.text}
                                                &quot;
                                            </span>
                                            <span className="font-mono text-[11px] text-[#64748b]">
                                                {frame.activeCount}
                                                {" "}
                                                dots active
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const safe = frame.text.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "frame";
                                                    download(frame.svg, `flip-frame-${idx + 1}-${safe}.svg`, "image/svg+xml");
                                                    showToast(`Downloaded Frame ${idx + 1} (.SVG)`);
                                                }}
                                                className="rounded border border-[#202736] bg-[#161c26] px-2 py-1 text-[11px] font-semibold text-[#94a3b8] transition hover:border-[#f59e0b] hover:text-[#f1f5f9]"
                                                title="Download standalone SVG"
                                            >
                                                .SVG
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleDownloadFramePng(frame, idx)}
                                                className="rounded border border-[#202736] bg-[#161c26] px-2 py-1 text-[11px] font-semibold text-[#94a3b8] transition hover:border-[#f59e0b] hover:text-[#f1f5f9]"
                                                title="Rasterize and download 2x PNG"
                                            >
                                                .PNG
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Integration Snippets Tabs (Redesigned for end users) */}
                    <div id="quick-start" className="flex flex-col gap-3 border-t border-[#202736] bg-[#080a0f] p-5">
                        <div className="flex items-center justify-between border-b border-[#202736] pb-2">
                            <div className="flex items-center gap-2">
                                {(["markdown", "html", "api", "embed"] as const).map(tab => (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-2.5 py-1 text-xs font-semibold capitalize transition border-b-2 -mb-[9px] ${
                                            activeTab === tab
                                                ? "border-[#f59e0b] text-[#f59e0b]"
                                                : "border-transparent text-[#64748b] hover:text-[#94a3b8]"
                                        }`}
                                    >
                                        {tab === "markdown"
                                            ? "Markdown"
                                            : tab === "html"
                                                ? "HTML <img>"
                                                : tab === "api"
                                                    ? "API Endpoint"
                                                    : "Frontend Embed"}
                                    </button>
                                ))}
                            </div>
                            <button
                                type="button"
                                onClick={() => handleCopy(snippetText, "Snippet copied to clipboard!")}
                                className="rounded border border-[#202736] bg-[#161c26] px-2.5 py-1 text-[11px] font-medium text-[#94a3b8] transition hover:border-[#f59e0b] hover:text-[#f1f5f9]"
                            >
                                Copy Snippet
                            </button>
                        </div>

                        <pre className="overflow-x-auto rounded-lg border border-[#202736] bg-[#0f131a] p-3 font-mono text-xs text-[#cbd5e1] whitespace-pre-wrap break-all">
                            <code>{snippetText}</code>
                        </pre>
                    </div>
                </div>
            </section>

            {/* Toast Notification */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-[#f59e0b] bg-[#161c26] px-4 py-2.5 font-mono text-xs font-semibold text-[#f59e0b] shadow-2xl transition">
                    {toast}
                </div>
            )}
        </div>
    );
}

export default MainPage;
