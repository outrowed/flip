import { useCallback, useMemo, useRef, useState } from "react";
import {
    DEFAULT_ROTATING_TEXTS,
    generateFlipDotSvg,
    generateStillFlipDotFrames,
    PALETTES,
} from "./engine/svg.ts";
import { download, downloadFrames, png } from "./export.ts";

const PRESETS: Record<string, string[]> = {
    rotation: [...DEFAULT_ROTATING_TEXTS],
    single: ["hello world"],
    terminal: ["system online", "all checks green", "ready for input"],
    minimal: ["taruna", "outrowed"],
};

export default function App() {
    const [rawText, setRawText] = useState(PRESETS.rotation.join("\n"));
    const [dotShape, setDotShape] = useState<"circle" | "square">("circle");
    const [italic, setItalic] = useState(true);
    const [theme, setTheme] = useState<keyof typeof PALETTES>("amber");
    const [durationPerText, setDurationPerText] = useState(3.8);
    const [cellPitch, setCellPitch] = useState(14);
    const [bgTheme, setBgTheme] = useState<"dark" | "light" | "grid">("dark");
    const [activeTab, setActiveTab] = useState<"markdown" | "html" | "api" | "brand">("markdown");
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
            italic,
            theme,
            durationPerText,
            cellPitch,
            dotSize,
        });
    }, [texts, dotShape, italic, theme, durationPerText, cellPitch, dotSize]);

    // Data URI for the live preview to guarantee CSS isolation
    const generatedDataUri = useMemo(() => {
        return `data:image/svg+xml;utf8,${encodeURIComponent(generated.svg)}`;
    }, [generated.svg]);

    // Generated settled still frames (no CSS keyframe transitions)
    const stillFrames = useMemo(() => {
        return generateStillFlipDotFrames({
            texts,
            dotShape,
            italic,
            theme,
            cellPitch,
            dotSize,
        });
    }, [texts, dotShape, italic, theme, cellPitch, dotSize]);

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

        if (texts.length > 1) {
            params.set("texts", texts.join(","));
        }
        else if (texts.length === 1) {
            params.set("text", texts[0]);
        }

        if (dotShape !== "circle") params.set("shape", dotShape);

        if (theme !== "amber") params.set("theme", theme);

        if (!italic) params.set("italic", "false");

        if (durationPerText !== 3.8) params.set("duration", String(durationPerText));

        if (cellPitch !== 14) params.set("pitch", String(cellPitch));

        return `${origin}/api/svg?${params.toString()}`;
    }, [texts, dotShape, theme, italic, durationPerText, cellPitch]);

    const label = texts.join(" • ") || "FLIP Display";

    const snippetText = useMemo(() => {
        if (activeTab === "markdown") {
            return `![${label}](./flip.svg)\n\n<!-- Or via live API endpoint: -->\n![${label}](${queryUrl})`;
        }

        if (activeTab === "html") {
            return `<p align="center">\n  <img src="./flip.svg" width="100%" alt="${label}" />\n</p>`;
        }

        if (activeTab === "api") {
            return `# Direct SVG URL (returns image/svg+xml):\n${queryUrl}\n\n# Markdown direct link:\n![FLIP Banner](${queryUrl})`;
        }

        const origin = typeof window !== "undefined" ? window.location.origin : "";
        return `<!-- FLIP Brand Assets -->\n\n<!-- 1. Minimal Three-dot Emblem -->\n![FLIP Logo](./logo.svg)\n<!-- Hosted URL: ${origin}/logo.svg -->\n\n<!-- 2. Three-dot Emblem (alias) -->\n![FLIP Headlight](./headlight.svg)\n<!-- Hosted URL: ${origin}/headlight.svg -->\n\n<!-- 3. Solenoid Disc Favicon -->\n![FLIP Favicon](./favicon.svg)\n<!-- Hosted URL: ${origin}/favicon.svg -->`;
    }, [activeTab, label, queryUrl]);

    const handleCopy = useCallback(async (text: string, msg: string) => {
        await navigator.clipboard.writeText(text);
        showToast(msg);
    }, [showToast]);

    const handleDownloadAllZip = useCallback(async () => {
        if (isZipping || stillFrames.length === 0) return;

        try {
            setIsZipping(true);
            await downloadFrames(stillFrames);
            showToast(`Downloaded all ${stillFrames.length} frames as ZIP!`);
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
        setItalic(true);
        setTheme("amber");
        setDurationPerText(3.8);
        setCellPitch(14);
        showToast("Reset to default rotation");
    }, [showToast]);

    return (
        <div className="flex min-h-screen flex-col bg-[#080a0f] text-[#f1f5f9]">
            {/* Header */}
            <header className="sticky top-0 z-40 flex items-center justify-between border-b border-[#202736] bg-[#0f131a] px-6 py-4 sm:px-8">
                <a href="/" className="flex items-center gap-3.5 no-underline" aria-label="FLIP home">
                    <img src="/logo.svg" alt="" width={68} height={32} className="block shrink-0" />
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-[#f1f5f9]">FLIP</h1>
                        <p className="text-xs text-[#94a3b8]">Flip-dot Letter &amp; Image Playground</p>
                    </div>
                </a>

                <div className="flex items-center gap-3">
                    <a href="#quick-start" className="text-xs font-semibold text-[#94a3b8] transition hover:text-[#f59e0b]">
                        Guide
                    </a>
                    <button
                        type="button"
                        onClick={() => setBgTheme(b => b === "dark" ? "light" : "dark")}
                        className="flex items-center gap-1.5 rounded-md border border-[#202736] bg-[#161c26] px-3 py-1.5 text-xs font-medium text-[#94a3b8] transition hover:border-[#f59e0b] hover:text-[#f1f5f9]"
                    >
                        <span>🌓</span>
                        {" "}
                        Stage Theme
                    </button>
                </div>
            </header>

            {/* Main Grid */}
            <main className="grid flex-1 grid-cols-1 gap-6 p-4 sm:p-8 lg:grid-cols-[420px_1fr]">
                {/* Controls Panel */}
                <section className="flex flex-col gap-5 rounded-xl border border-[#202736] bg-[#0f131a] p-6 shadow-xl">
                    <div className="border-b border-[#202736] pb-3">
                        <h2 className="text-base font-semibold tracking-wide text-[#f1f5f9]">Display Configuration</h2>
                    </div>

                    <form onSubmit={e => e.preventDefault()} className="flex flex-col gap-5">
                        {/* Messages Input */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <label htmlFor="textInput" className="text-xs font-medium text-[#94a3b8]">
                                    Display Messages
                                </label>
                                <span className="text-[11px] text-[#64748b]">1 line per frame to rotate</span>
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
                                <span className="text-[11px] font-medium text-[#64748b]">Presets:</span>
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

                        {/* Dot Shape & Typography Controls */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <span className="text-xs font-medium text-[#94a3b8]">Dot Shape</span>
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
                                <span className="text-xs font-medium text-[#94a3b8]">Typography</span>
                                <div className="grid grid-cols-2 rounded-lg border border-[#202736] bg-[#080a0f] p-1 gap-1">
                                    <button
                                        type="button"
                                        onClick={() => setItalic(true)}
                                        className={`rounded py-1.5 text-xs font-semibold transition ${italic ? "bg-[#f59e0b] text-[#080a0f]" : "text-[#94a3b8] hover:text-[#f1f5f9]"}`}
                                    >
                                        <em>Italic (24°)</em>
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

                        {/* Palette Swatches */}
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-[#94a3b8]">Color Theme</span>
                                <span className="text-xs font-medium text-[#f59e0b]">{PALETTES[theme].name}</span>
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
                                            className={`flex flex-col items-center gap-1.5 rounded-lg border p-2 transition ${isActive ? "border-[#f59e0b] bg-[#161c26]" : "border-[#202736] bg-[#080a0f] hover:border-[#64748b]"}`}
                                            title={pal.name}
                                        >
                                            <span
                                                className="h-4 w-4 rounded-full shadow-inner"
                                                style={{ backgroundColor: pal.activeDot }}
                                            />
                                            <span className="text-[10px] font-semibold text-[#94a3b8] capitalize">{pKey}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Timing Sliders */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="durationInput" className="text-xs font-medium text-[#94a3b8]">Hold / Frame</label>
                                    <span className="font-mono text-xs text-[#f59e0b]">
                                        {durationPerText.toFixed(1)}
                                        s
                                    </span>
                                </div>
                                <input
                                    id="durationInput"
                                    type="range"
                                    min="1.5"
                                    max="7.0"
                                    step="0.1"
                                    value={durationPerText}
                                    onChange={e => setDurationPerText(Number.parseFloat(e.target.value))}
                                    className="accent-[#f59e0b]"
                                />
                            </div>

                            <div className="flex flex-col gap-1.5">
                                <div className="flex items-center justify-between">
                                    <label htmlFor="pitchInput" className="text-xs font-medium text-[#94a3b8]">Dot Pitch</label>
                                    <span className="font-mono text-xs text-[#f59e0b]">
                                        {cellPitch}
                                        px
                                    </span>
                                </div>
                                <input
                                    id="pitchInput"
                                    type="range"
                                    min="10"
                                    max="18"
                                    step="1"
                                    value={cellPitch}
                                    onChange={e => setCellPitch(Number.parseInt(e.target.value, 10))}
                                    className="accent-[#f59e0b]"
                                />
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex items-center gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => showToast("Display refreshed")}
                                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#f59e0b] py-2.5 text-xs font-bold text-[#080a0f] shadow-lg shadow-[#f59e0b]/20 transition hover:bg-[#fbbf24]"
                            >
                                <span>⚡</span>
                                {" "}
                                Update Display
                            </button>
                            <button
                                type="button"
                                onClick={handleReset}
                                className="rounded-lg border border-[#202736] bg-[#161c26] px-4 py-2.5 text-xs font-semibold text-[#94a3b8] transition hover:border-[#64748b] hover:text-[#f1f5f9]"
                            >
                                Reset
                            </button>
                        </div>
                    </form>
                </section>

                {/* Right Stage & Export Section */}
                <section className="flex flex-col gap-6">
                    <div className="flex flex-col overflow-hidden rounded-xl border border-[#202736] bg-[#0f131a] shadow-xl">
                        {/* Stage Header / Telemetry */}
                        <div className="flex flex-wrap items-center justify-between border-b border-[#202736] px-5 py-3 gap-3">
                            <div className="flex items-center gap-2 font-mono text-xs text-[#94a3b8]">
                                <span className="h-2 w-2 rounded-full bg-[#10b981] shadow-[0_0_8px_rgba(16,185,129,0.7)] animate-pulse" />
                                <span>
                                    {generated.cols}
                                    {" "}
                                    ×
                                    {" "}
                                    {generated.rows}
                                    {" "}
                                    dots
                                </span>
                                <span className="text-[#64748b]">•</span>
                                <span>
                                    {generated.width}
                                    {" "}
                                    ×
                                    {" "}
                                    {generated.height}
                                    {" "}
                                    px
                                </span>
                                <span className="text-[#64748b]">•</span>
                                <span>
                                    {texts.length}
                                    {" "}
                                    {texts.length === 1 ? "frame" : "frames"}
                                </span>
                                <span className="text-[#64748b]">•</span>
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
                            className={`flex min-h-[300px] items-center justify-center p-8 transition-colors ${
                                bgTheme === "dark"
                                    ? "bg-[#0b0d13]"
                                    : bgTheme === "light"
                                        ? "bg-[#f8fafc]"
                                        : "bg-[#0d1117] bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:28px_28px]"
                            }`}
                        >
                            <img
                                src={generatedDataUri}
                                alt={label}
                                className="w-full max-w-5xl rounded-lg shadow-2xl block"
                            />
                        </div>

                        {/* Export Bar */}
                        <div className="flex flex-wrap items-center justify-between border-t border-[#202736] bg-[#0f131a] px-5 py-3 gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => handleCopy(`![${label}](./flip.svg)`, "Markdown snippet copied!")}
                                    className="flex items-center gap-1.5 rounded border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-3 py-1.5 text-xs font-semibold text-[#f59e0b] transition hover:bg-[#f59e0b]/20"
                                >
                                    <span>📋</span>
                                    {" "}
                                    Copy Markdown
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleCopy(generated.svg, "Raw SVG markup copied!")}
                                    className="flex items-center gap-1.5 rounded border border-[#202736] bg-[#161c26] px-3 py-1.5 text-xs font-medium text-[#94a3b8] transition hover:border-[#64748b] hover:text-[#f1f5f9]"
                                >
                                    <span>📄</span>
                                    {" "}
                                    Copy Raw SVG
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        download(generated.svg, "flip.svg", "image/svg+xml");
                                        showToast("Downloaded flip.svg!");
                                    }}
                                    className="flex items-center gap-1.5 rounded border border-[#202736] bg-[#161c26] px-3 py-1.5 text-xs font-medium text-[#94a3b8] transition hover:border-[#64748b] hover:text-[#f1f5f9]"
                                >
                                    <span>💾</span>
                                    {" "}
                                    Download Animated SVG
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleCopy(queryUrl, "Direct API URL copied!")}
                                    className="flex items-center gap-1.5 rounded border border-[#202736] bg-[#161c26] px-3 py-1.5 text-xs font-medium text-[#94a3b8] transition hover:border-[#64748b] hover:text-[#f1f5f9]"
                                >
                                    <span>🔗</span>
                                    {" "}
                                    Copy Direct URL
                                </button>
                            </div>
                        </div>

                        {/* Still Frames Section */}
                        <div className="flex flex-col gap-4 border-t border-[#202736] bg-[#0c1017] p-6">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h3 className="text-sm font-semibold tracking-wide text-[#f1f5f9]">Still Frames (Static Images)</h3>
                                    <p className="text-xs text-[#64748b]">Settled state per phrase — clean standalone vector &amp; PNG downloads without animation</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleDownloadAllZip}
                                    disabled={isZipping}
                                    className="flex items-center gap-1.5 rounded border border-[#f59e0b] bg-[#f59e0b]/10 px-3 py-1.5 text-xs font-semibold text-[#f59e0b] transition hover:bg-[#f59e0b]/20"
                                >
                                    <span>📦</span>
                                    {" "}
                                    {isZipping ? "Zipping..." : "Download All (.ZIP)"}
                                </button>
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
                                                {/* Omits duplicative width x height; shows unique metric */}
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

                        {/* Integration Snippets Tabs */}
                        <div id="quick-start" className="flex flex-col gap-3 border-t border-[#202736] bg-[#080a0f] p-5">
                            <div className="flex items-center gap-2 border-b border-[#202736] pb-2">
                                {(["markdown", "html", "api", "brand"] as const).map(tab => (
                                    <button
                                        key={tab}
                                        type="button"
                                        onClick={() => setActiveTab(tab)}
                                        className={`px-2.5 py-1 text-xs font-semibold capitalize transition border-b-2 -mb-[9px] ${activeTab === tab ? "border-[#f59e0b] text-[#f59e0b]" : "border-transparent text-[#64748b] hover:text-[#94a3b8]"}`}
                                    >
                                        {tab === "api" ? "Live API" : tab === "brand" ? "Brand Assets" : tab}
                                    </button>
                                ))}
                            </div>

                            <pre className="overflow-x-auto rounded-lg border border-[#202736] bg-[#0f131a] p-3 font-mono text-xs text-[#cbd5e1] whitespace-pre-wrap break-all">
                                <code>{snippetText}</code>
                            </pre>
                        </div>
                    </div>
                </section>
            </main>

            {/* Footer */}
            <footer className="border-t border-[#202736] bg-[#080a0f] px-8 py-5 text-center text-xs text-[#64748b]">
                <strong className="text-[#94a3b8]">FLIP</strong>
                {" "}
                &mdash; Flip-dot Letter &amp; Image Playground.
            </footer>

            {/* Toast Notification */}
            {toast && (
                <div className="fixed bottom-6 right-6 z-50 rounded-lg border border-[#f59e0b] bg-[#161c26] px-4 py-2.5 font-mono text-xs font-semibold text-[#f59e0b] shadow-2xl transition">
                    {toast}
                </div>
            )}
        </div>
    );
}
