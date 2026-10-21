import { useState } from "react";
import { Link } from "react-router-dom";

export function PlaceholderPreviewPage() {
    const [width, setWidth] = useState(1260);
    const [height, setHeight] = useState(234);
    const [theme, setTheme] = useState("amber");
    const [format, setFormat] = useState("webp");
    const params = new URLSearchParams({
        width: String(width),
        height: String(height),
        theme,
        format,
    });
    const url = `/api/placeholder?${params}`;
    const fieldClass = "rounded border border-[#202736] bg-[#080a0f] p-2 text-[#f1f5f9]";

    return (
        <section className="flex flex-col gap-6 p-8 text-[#f1f5f9]">
            <Link to="/" className="text-sm text-[#fbbf24]">Back to FLIP</Link>
            <h2 className="text-xl font-bold">Placeholder preview</h2>
            <p className="text-sm text-[#94a3b8]">Inspect the actual API placeholder without starting an animation render. This image stays a placeholder on every reload.</p>
            <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-2 text-sm">
                    Width
                    <input className={fieldClass} type="number" min="100" max="3000" value={width} onChange={event => setWidth(Number(event.target.value))} />
                </label>
                <label className="flex flex-col gap-2 text-sm">
                    Height
                    <input className={fieldClass} type="number" min="60" max="1000" value={height} onChange={event => setHeight(Number(event.target.value))} />
                </label>
                <label className="flex flex-col gap-2 text-sm">
                    Theme
                    <select className={fieldClass} value={theme} onChange={event => setTheme(event.target.value)}>
                        {["amber", "emerald", "white", "cyan", "crimson"].map(value => <option key={value}>{value}</option>)}
                    </select>
                </label>
                <label className="flex flex-col gap-2 text-sm">
                    Format
                    <select className={fieldClass} value={format} onChange={event => setFormat(event.target.value)}>
                        {["webp", "png", "svg"].map(value => <option key={value}>{value}</option>)}
                    </select>
                </label>
            </div>
            <div className="overflow-auto rounded-xl border border-[#202736] bg-[#0b0d13] p-6">
                <img src={url} alt="Generating flip-dot animation placeholder" className="block h-auto max-w-full" />
            </div>
            <a href={url} className="break-all font-mono text-xs text-[#94a3b8]">{url}</a>
        </section>
    );
}
