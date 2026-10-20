import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SvgOptions } from "../../core/svg.ts";
import { variants as buildVariants, type Variant } from "../lab/variants.ts";

const DEFAULT_TEXTS = ["hello world", "its me", "taruna", "outrowed", "peace out~"];
const DEFAULT_TIME_SECONDS = 2.5;
const THEMES = ["amber", "emerald", "white", "cyan", "crimson"] as const;

function svgAt(svg: string, time: number | null, reduced: boolean) {
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");

    if (document.querySelector("parsererror")) throw new Error("Invalid SVG markup");

    if (time !== null) {
        for (const element of document.querySelectorAll<SVGElement>("*")) {
            const delay = Number.parseFloat(element.style?.animationDelay || "0") || 0;
            element.style.animationDelay = `${delay - time}s`;
            element.style.animationPlayState = "paused";
        }
    }

    if (reduced) {
        const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
        style.textContent = [...svg.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n {4}\}/g)].map(match => match[1]).join("\n");
        document.documentElement.append(style);
    }

    return new XMLSerializer().serializeToString(document);
}

function svgUrl(svg: string) {
    return URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
}

function svgStats(svg: string) {
    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    return `${(new Blob([svg]).size / 1024).toFixed(1)} KiB · ${document.querySelectorAll("*").length} XML elements\n${(svg.match(/@keyframes/g) || []).length} keyframe definitions · ${(svg.match(/<use\b/g) || []).length} <use> instances`;
}

async function loadSvg(image: HTMLImageElement, svg: string, objectUrls: string[]) {
    const url = svgUrl(svg);
    objectUrls.push(url);
    image.src = url;
    await image.decode();
}

function canvasFor(image: HTMLImageElement, width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");

    if (!context) throw new Error("Canvas 2D context unavailable");

    context.drawImage(image, 0, 0, width, height);

    return canvas;
}

function Field({ label, htmlFor, children }: {
    label: string;
    htmlFor?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-[#94a3b8]">
            <label htmlFor={htmlFor}>{label}</label>
            {children}
        </div>
    );
}

const inputClass = "rounded-lg border border-[#202736] bg-[#080a0f] px-3 py-2 text-xs text-[#f1f5f9] focus:border-[#f59e0b] focus:outline-none";
const buttonClass = "rounded-lg border border-[#202736] bg-[#161c26] px-3 py-2 text-xs font-semibold text-[#94a3b8] transition hover:border-[#f59e0b] hover:text-[#f1f5f9]";

export function LabPage() {
    const [rawText, setRawText] = useState(DEFAULT_TEXTS.join("\n"));
    const [shape, setShape] = useState<"circle" | "square">("circle");
    const [theme, setTheme] = useState<(typeof THEMES)[number]>("amber");
    const [pitch, setPitch] = useState(14);
    const [italic, setItalic] = useState(true);
    const [candidateId, setCandidateId] = useState("path");
    const [time, setTime] = useState(DEFAULT_TIME_SECONDS);
    const [reduced, setReduced] = useState(false);
    const [blend, setBlend] = useState(0.5);
    const [displayWidth, setDisplayWidth] = useState("100%");
    const [live, setLive] = useState(false);
    const [status, setStatus] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [variants, setVariants] = useState<Variant[]>([]);
    const [referenceStats, setReferenceStats] = useState("");
    const [candidateStats, setCandidateStats] = useState("");
    const [candidateTitle, setCandidateTitle] = useState("Candidate");
    const [differenceSrc, setDifferenceSrc] = useState("");
    const [overlaySrc, setOverlaySrc] = useState("");
    const objectUrls = useRef<string[]>([]);
    const animationFrame = useRef<number | null>(null);
    const referenceImage = useRef<HTMLImageElement>(null);
    const candidateImage = useRef<HTMLImageElement>(null);

    const texts = useMemo(() => rawText.split("\n").map(text => text.trim()).filter(Boolean).slice(0, 8), [rawText]);
    const options: SvgOptions = useMemo(() => ({
        texts: texts.length > 0 ? texts : ["hello world"],
        dotShape: shape,
        theme,
        cellPitch: pitch,
        dotSize: pitch - 2,
        italic,
    }), [texts, shape, theme, pitch, italic]);

    const render = useCallback(async (items: Variant[], selectedId: string, atTime: number | null, forceReduced: boolean) => {
        const reference = referenceImage.current;
        const candidate = candidateImage.current;

        if (!reference || !candidate || items.length === 0) return;

        objectUrls.current.forEach(URL.revokeObjectURL);
        objectUrls.current = [];
        const selected = items.find(item => item.id === selectedId) ?? items[2] ?? items[0];

        if (!selected) return;

        setCandidateTitle(selected.title);
        setReferenceStats(svgStats(items[0]?.svg ?? ""));
        setCandidateStats(svgStats(selected.svg));

        try {
            await Promise.all([
                loadSvg(reference, svgAt(items[0]?.svg ?? "", atTime, forceReduced), objectUrls.current),
                loadSvg(candidate, svgAt(selected.svg, atTime, forceReduced), objectUrls.current),
            ]);

            if (atTime === null) {
                setStatus("Live pair running. Freeze to compare both at the same timeline position.");
                return;
            }

            const view = new DOMParser().parseFromString(selected.svg, "image/svg+xml").documentElement.getAttribute("viewBox")?.split(" ").map(Number);

            if (!view || view.length < 4) throw new Error("Missing SVG viewBox");

            const referenceCanvas = canvasFor(reference, view[2] ?? 1, view[3] ?? 1);
            const candidateCanvas = canvasFor(candidate, view[2] ?? 1, view[3] ?? 1);
            const referenceContext = referenceCanvas.getContext("2d");
            const candidateContext = candidateCanvas.getContext("2d");

            if (!referenceContext || !candidateContext) throw new Error("Canvas 2D context unavailable");

            const referencePixels = referenceContext.getImageData(0, 0, referenceCanvas.width, referenceCanvas.height);
            const candidatePixels = candidateContext.getImageData(0, 0, candidateCanvas.width, candidateCanvas.height);
            const difference = document.createElement("canvas");
            difference.width = referenceCanvas.width;
            difference.height = referenceCanvas.height;
            const differenceContext = difference.getContext("2d");

            if (!differenceContext) throw new Error("Canvas 2D context unavailable");

            const imageData = differenceContext.createImageData(difference.width, difference.height);
            let changed = 0;
            let maximum = 0;
            let total = 0;

            for (let index = 0; index < referencePixels.data.length; index += 4) {
                let pixelMaximum = 0;

                for (let channel = 0; channel < 3; channel += 1) {
                    const delta = Math.abs((referencePixels.data[index + channel] ?? 0) - (candidatePixels.data[index + channel] ?? 0));
                    imageData.data[index + channel] = Math.min(255, delta * 8);
                    maximum = Math.max(maximum, delta);
                    total += delta;
                    pixelMaximum = Math.max(pixelMaximum, delta);
                }

                if (pixelMaximum > 0) changed += 1;

                imageData.data[index + 3] = 255;
            }

            differenceContext.putImageData(imageData, 0, 0);
            const overlay = document.createElement("canvas");
            overlay.width = referenceCanvas.width;
            overlay.height = referenceCanvas.height;
            const overlayContext = overlay.getContext("2d");

            if (!overlayContext) throw new Error("Canvas 2D context unavailable");

            overlayContext.drawImage(referenceCanvas, 0, 0);
            overlayContext.globalAlpha = blend;
            overlayContext.drawImage(candidateCanvas, 0, 0);
            setDifferenceSrc(difference.toDataURL());
            setOverlaySrc(overlay.toDataURL());
            const pixelCount = referenceCanvas.width * referenceCanvas.height;
            setStatus(`Frozen at ${atTime.toFixed(3)}s · changed pixels ${changed.toLocaleString()} / ${pixelCount.toLocaleString()} (${(100 * changed / pixelCount).toFixed(3)}%) · max channel difference ${maximum}/255 · mean ${(total / (pixelCount * 3)).toFixed(4)}. ${forceReduced ? "Reduced motion forced." : ""}`);
            setError(null);
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
    }, [blend]);

    useEffect(() => {
        const items = buildVariants(options);
        setVariants(items);
        setCandidateId(current => items.some(item => item.id === current) ? current : "path");
        return () => objectUrls.current.forEach(URL.revokeObjectURL);
    }, [options]);

    useEffect(() => {
        if (variants.length === 0) return;

        void render(variants, candidateId, live ? null : time, reduced);
    }, [variants, candidateId, time, reduced, live, render]);

    useEffect(() => {
        if (!live) {
            if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);

            return;
        }

        const started = performance.now() - time * 1000;
        const cycle = 24;

        const tick = (now: number) => {
            const next = ((now - started) / 1000) % cycle;
            setTime(next);
            animationFrame.current = requestAnimationFrame(tick);
        };

        animationFrame.current = requestAnimationFrame(tick);

        return () => {
            if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current);
        };
    }, [live, time]);

    const download = (variant: Variant) => {
        const url = svgUrl(variant.svg);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `flip-${variant.id}.svg`;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    };

    const activeVariant = variants.find(variant => variant.id === candidateId) ?? variants[2];

    const setTimeAndFreeze = (next: number) => {
        setTime(Math.max(0, Math.min(23.999, next)));
        setLive(false);
    };

    return (
        <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-6 p-4 sm:p-8">
            <section className="rounded-xl border border-[#202736] bg-[#0f131a] p-6 shadow-xl">
                <div className="border-b border-[#202736] pb-4">
                    <h2 className="text-2xl font-bold tracking-tight">SVG rendering lab</h2>
                    <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#94a3b8]">Same board, text, timing, glow, and sweep. Compare the original against representation experiments. Previews are standalone SVG images; frozen comparisons are pixel-synchronized.</p>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                    <Field label="Messages (one per frame)" htmlFor="lab-messages"><textarea id="lab-messages" value={rawText} rows={4} onChange={event => setRawText(event.target.value)} className={`${inputClass} min-h-24 resize-y font-mono`} /></Field>
                    <Field label="Dot shape" htmlFor="lab-shape">
                        <select id="lab-shape" value={shape} onChange={event => setShape(event.target.value as "circle" | "square")} className={inputClass}>
                            <option value="circle">Round</option>
                            <option value="square">Square</option>
                        </select>
                    </Field>
                    <Field label="Palette" htmlFor="lab-theme"><select id="lab-theme" value={theme} onChange={event => setTheme(event.target.value as (typeof THEMES)[number])} className={inputClass}>{THEMES.map(item => <option key={item}>{item}</option>)}</select></Field>
                    <Field label={`Dot pitch · ${pitch}px`} htmlFor="lab-pitch"><input id="lab-pitch" type="range" min="10" max="22" value={pitch} onChange={event => setPitch(Number(event.target.value))} className="accent-[#f59e0b]" /></Field>
                    <label className="flex items-center gap-2 self-end pb-2 text-xs text-[#94a3b8]">
                        <input type="checkbox" checked={italic} onChange={event => setItalic(event.target.checked)} className="accent-[#f59e0b]" />
                        Italic
                    </label>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={() => {
                            const next = buildVariants(options); setVariants(next); setError(null);
                        }}
                        className="rounded-lg bg-[#f59e0b] px-4 py-2 text-xs font-bold text-[#080a0f] transition hover:bg-[#fbbf24]"
                    >
                        Generate variants
                    </button>
                    {activeVariant && <button type="button" onClick={() => download(activeVariant)} className={buttonClass}>Download candidate SVG</button>}
                    <button type="button" onClick={() => variants.length > 0 && download(variants[0] as Variant)} className={buttonClass}>Download original SVG</button>
                </div>
            </section>

            <section className="flex flex-col gap-5 rounded-xl border border-[#202736] bg-[#0f131a] p-5 shadow-xl">
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <Field label="Candidate">
                        <select
                            value={candidateId}
                            onChange={(event) => {
                                setCandidateId(event.target.value); setLive(false);
                            }}
                            className={inputClass}
                        >
                            {variants.slice(1).map(variant => <option key={variant.id} value={variant.id}>{variant.title}</option>)}
                        </select>
                    </Field>
                    <Field label="Display width" htmlFor="lab-display-width">
                        <select id="lab-display-width" value={displayWidth} onChange={event => setDisplayWidth(event.target.value)} className={inputClass}>
                            <option value="100%">Responsive</option>
                            <option value="390px">390 px phone</option>
                            <option value="768px">768 px</option>
                            <option value="1260px">Native width</option>
                        </select>
                    </Field>
                    <div className="flex flex-wrap items-end gap-2">
                        <button type="button" onClick={() => setLive(true)} className={buttonClass}>Live animation</button>
                        <button type="button" onClick={() => setLive(false)} className={buttonClass}>Freeze / compare</button>
                    </div>
                    <label className="flex items-center gap-2 self-end pb-2 text-xs text-[#94a3b8]">
                        <input type="checkbox" checked={reduced} onChange={event => setReduced(event.target.checked)} className="accent-[#f59e0b]" />
                        Reduced-motion output
                    </label>
                </div>
                <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#202736] bg-[#080a0f] p-3">
                    <label htmlFor="lab-time" className="text-xs font-medium text-[#94a3b8]">Timeline</label>
                    <input id="lab-time" type="range" min="0" max="23.999" step="0.001" value={time} onChange={event => setTimeAndFreeze(Number(event.target.value))} className="min-w-40 flex-1 accent-[#f59e0b]" />
                    <input aria-label="Timeline seconds" type="number" min="0" max="23.999" step="0.01" value={time.toFixed(3)} onChange={event => setTimeAndFreeze(Number(event.target.value))} className={`${inputClass} w-24 font-mono`} />
                    {[[0, "Zero state"], [1.3, "Flip"], [2.5, "Hold"], [4.9, "Next flip"]].map(([second, label]) => <button key={label as string} type="button" onClick={() => setTimeAndFreeze(Number(second))} className={buttonClass}>{label}</button>)}
                </div>
                <p className="font-mono text-xs text-[#f59e0b]" role="status">{error ? `Error: ${error}` : status}</p>
                <div className="grid gap-4 xl:grid-cols-2">
                    {[{
                        title: "Original / reference",
                        image: referenceImage,
                        stats: referenceStats,
                        alt: "Original reference SVG",
                    }, {
                        title: candidateTitle,
                        image: candidateImage,
                        stats: candidateStats,
                        alt: "Experimental candidate SVG",
                    }].map(item => (
                        <article key={item.alt} className="overflow-hidden rounded-xl border border-[#202736] bg-[#080a0f]">
                            <h3 className="border-b border-[#202736] px-4 py-3 text-sm font-semibold">{item.title}</h3>
                            <div className="overflow-x-auto bg-[#0b0d13] p-3">
                                <div
                                    className="mx-auto"
                                    style={{
                                        width: displayWidth,
                                        maxWidth: "100%",
                                    }}
                                >
                                    <img ref={item.image} alt={item.alt} className="block h-auto w-full" />
                                </div>
                            </div>
                            <pre className="overflow-x-auto border-t border-[#202736] px-4 py-3 font-mono text-[11px] leading-relaxed text-[#9dbad9]">{item.stats}</pre>
                        </article>
                    ))}
                </div>
                <details open className="rounded-xl border border-[#202736] bg-[#080a0f] p-4">
                    <summary className="cursor-pointer text-sm font-semibold">Pixel difference at selected instant</summary>
                    <p className="my-3 text-xs leading-relaxed text-[#94a3b8]">Black means identical. Colored pixels show amplified RGB differences; antialiasing differences count too. This checks fidelity, not FPS.</p>
                    <div className="grid gap-4 xl:grid-cols-2">
                        <img src={differenceSrc} alt="Amplified pixel difference" className="w-full image-render-pixelated" />
                        <img src={overlaySrc} alt="Half-opacity overlay of original and candidate" className="w-full" />
                    </div>
                    <Field label={`Overlay blend · ${Math.round(blend * 100)}%`} htmlFor="lab-blend"><input id="lab-blend" type="range" min="0" max="1" step="0.05" value={blend} onChange={event => setBlend(Number(event.target.value))} className="accent-[#f59e0b]" /></Field>
                </details>
            </section>

            <section className="rounded-xl border border-[#202736] bg-[#0f131a] p-5">
                <h3 className="text-sm font-semibold">Performance review protocol</h3>
                <p className="mt-2 text-xs leading-relaxed text-[#94a3b8]">Compare one isolated sample at a time on your target phone. Lower bytes or fewer XML nodes alone do not prove higher FPS. Filter/motion separation and settled-layer swapping may alter pixels or browser behavior; they remain experimental.</p>
            </section>
            <section className="rounded-xl border border-[#202736] bg-[#0f131a] p-5">
                <h3 className="text-sm font-semibold">Variant catalog</h3>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {variants.map(variant => (
                        <article key={variant.id} className="flex flex-col gap-3 rounded-lg border border-[#202736] bg-[#080a0f] p-4">
                            <div>
                                <h4 className="text-sm font-semibold">{variant.title}</h4>
                                <p className="mt-1 text-xs leading-relaxed text-[#94a3b8]">{variant.note}</p>
                            </div>
                            <pre className="whitespace-pre-wrap font-mono text-[11px] text-[#9dbad9]">{svgStats(variant.svg)}</pre>
                            <button
                                type="button"
                                onClick={() => {
                                    setCandidateId(variant.id === "original" ? "path" : variant.id); setLive(false); window.scrollTo({
                                        top: 0,
                                        behavior: "smooth",
                                    });
                                }}
                                className={`${buttonClass} mt-auto self-start`}
                            >
                                Compare
                            </button>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}
