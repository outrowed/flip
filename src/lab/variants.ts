import { generateFlipDotSvg, generateStillFlipDotSvg, type SvgOptions } from "../engine/svg.ts";

export type Variant = {
    id: string;
    title: string;
    note: string;
    svg: string;
};

// Experimental serialization changes only; the production generator is untouched.
export function variants(options: SvgOptions): Variant[] {
    const original = generateFlipDotSvg({
        ...options,
        renderTech: "original",
    });
    const svg = original.svg;
    const zero = /<(circle|rect) class="d z" ([^>]+)\/>/g;
    const inactive = [...svg.matchAll(zero)];

    const number = (attrs: string, name: string) => Number(attrs.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1]);

    const path = inactive.map(([, tag, attrs]) => {
        if (tag === "circle") {
            const x = number(attrs, "cx"); const y = number(attrs, "cy"); const r = number(attrs, "r");
            return `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
        }

        const x = number(attrs, "x"); const y = number(attrs, "y"); const w = number(attrs, "width"); const h = number(attrs, "height"); const r = Math.min(number(attrs, "rx"), w / 2, h / 2);
        return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-w + 2 * r}a${r} ${r} 0 0 1 ${-r} ${-r}v${-h + 2 * r}a${r} ${r} 0 0 1 ${r} ${-r}z`;
    }).join("");
    const packed = svg.replace(zero, "").replace("<g id=\"flip-dot-matrix\">", `<g id="flip-dot-matrix"><path class="d z" d="${path}"/>`);

    // Clip repeating dots to cells that never illuminate, not underneath moving dots.
    const pitch = options.cellPitch ?? 14; const size = options.dotSize ?? 12;
    const ox = options.boardPaddingX ?? 28; const oy = options.boardPaddingY ?? 26;
    const clips = inactive.map(([,tag, attrs]) => {
        const x = tag === "circle" ? number(attrs, "cx") - pitch / 2 : number(attrs, "x") - (pitch - size) / 2;
        const y = tag === "circle" ? number(attrs, "cy") - pitch / 2 : number(attrs, "y") - (pitch - size) / 2;
        return `M${x} ${y}h${pitch}v${pitch}h${-pitch}z`;
    }).join("");
    const tile = options.dotShape === "square"
        ? `<rect class="z" x="${(pitch - size) / 2}" y="${(pitch - size) / 2}" width="${size}" height="${size}" rx="${options.dotRadius ?? 2.2}" stroke-width=".75"/>`
        : `<circle class="z" cx="${pitch / 2}" cy="${pitch / 2}" r="${size / 2}" stroke-width=".75"/>`;
    const patterned = svg.replace(zero, "").replace("</defs>", `<pattern id="lab-bg" patternUnits="userSpaceOnUse" x="${ox}" y="${oy}" width="${pitch}" height="${pitch}">${tile}</pattern><clipPath id="lab-cells"><path d="${clips}"/></clipPath></defs>`)
        .replace("<g id=\"flip-dot-matrix\">", `<g id="flip-dot-matrix"><rect width="${original.width}" height="${original.height}" fill="url(#lab-bg)" clip-path="url(#lab-cells)"/>`);

    // Use geometry at local origin; translate its parent so CSS transforms stay centered.
    function reuse(input: string) {
        let geometry = "";
        const out = input.replace(/<(circle|rect) class="(d z[^"]*)" ([^>]+)\/>/g, (_all, tag, cls, attrs: string) => {
            const x = number(attrs, tag === "circle" ? "cx" : "x");
            const y = number(attrs, tag === "circle" ? "cy" : "y");
            const style = attrs.match(/style="([^"]*)"/)?.[1];

            if (!geometry) geometry = tag === "circle"
                ? `<circle id="lab-dot" cx="0" cy="0" r="${size / 2}"/>`
                : `<rect id="lab-dot" x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" rx="${options.dotRadius ?? 2.2}"/>`;

            return `<g transform="translate(${tag === "circle" ? x : x + size / 2} ${tag === "circle" ? y : y + size / 2})"><use href="#lab-dot" class="${cls}"${style ? ` style="${style}"` : ""}/></g>`;
        });
        return out.replace("</defs>", `${geometry}</defs>`);
    }

    // Technique A: substitute the SVG drop-shadow with a soft radial-gradient halo.
    // It keeps the exact dot flip transform/timing but does not run blur filters.
    function radialHalo(input: string) {
        const cycle = options.cycleSeconds ?? (options.initialHold ?? 0.8) + (options.texts?.length ?? 5) * (options.durationPerText ?? 3.8) + 3.2;
        const flip = options.flipDuration ?? 0.35;
        const palette = options.theme === "emerald" ? "#34d399" : options.theme === "cyan" ? "#22d3ee" : options.theme === "crimson" ? "#fb7185" : options.theme === "white" ? "#fff" : "#fbbf24";
        const unique = new Set([...input.matchAll(/class="d z p-([^"]+)"/g)].map(m => m[1]));
        const rules: string[] = [];

        for (const seq of unique) {
            const state = [0, ...seq.split("").map(Number), 0];
            const steps = ["0%{transform:scaleY(1) scaleX(1);opacity:0}"];
            let at = options.initialHold ?? 0.8;

            for (let i = 0; i < state.length - 1; i++) {
                const from = state[i], to = state[i + 1], p0 = at / cycle * 100;

                if (from === 0 && to === 1) {
                    steps.push(`${p0.toFixed(2)}%{transform:scaleY(1) scaleX(1);opacity:0}`, `${(at + flip * 0.45) / cycle * 100}%{transform:scaleY(.08) scaleX(.92) skewX(-8deg);opacity:0}`, `${(at + flip * 0.75) / cycle * 100}%{transform:scaleY(1.08) scaleX(1.04);opacity:.45}`, `${(at + flip) / cycle * 100}%{transform:scaleY(1) scaleX(1);opacity:.45}`);
                }
                else if (from === 1 && to === 0) {
                    steps.push(`${p0.toFixed(2)}%{transform:scaleY(1) scaleX(1);opacity:.45}`, `${(at + flip * 0.5) / cycle * 100}%{transform:scaleY(.08) scaleX(.92) skewX(8deg);opacity:0}`, `${(at + flip) / cycle * 100}%{transform:scaleY(1) scaleX(1);opacity:0}`);
                }
                else if (from === 1 && to === 1) {
                    steps.push(`${p0.toFixed(2)}%{transform:scaleY(1) scaleX(1);opacity:.45}`, `${(at + flip * 0.5) / cycle * 100}%{transform:scaleY(.72) scaleX(.96);opacity:.45}`, `${(at + flip) / cycle * 100}%{transform:scaleY(1) scaleX(1);opacity:.45}`);
                }

                at += options.durationPerText ?? 3.8;
            }

            steps.push(`100%{transform:scaleY(1) scaleX(1);opacity:0}`);
            rules.push(`.lab-h-${seq}{transform-box:fill-box;transform-origin:center;animation:lab-hm-${seq} ${cycle}s cubic-bezier(.22,1,.36,1) infinite}\n@keyframes lab-hm-${seq}{${steps.join("")}}`);
        }

        const replaced = input
            .replace(/filter: url\(#dot-glow\);?/g, "filter: none;")
            .replace(/<filter id="dot-glow"[\s\S]*?<\/filter>/, "")
            .replace("</defs>", `<radialGradient id="lab-halo-gradient"><stop offset="0%" stop-color="${palette}" stop-opacity=".45"/><stop offset="30%" stop-color="${palette}" stop-opacity=".28"/><stop offset="65%" stop-color="${palette}" stop-opacity=".08"/><stop offset="100%" stop-color="${palette}" stop-opacity="0"/></radialGradient></defs>`)
            .replace("</style>", `${rules.join("\n")} .lab-halo{fill:url(#lab-halo-gradient);pointer-events:none}@media(prefers-reduced-motion:reduce){.lab-halo{animation:none;opacity:0}}</style>`);
        return replaced.replace(/<(circle|rect) class="d z p-([^"]+)" ([^>]+)\/>/g, (_all, tag, seq, attrs: string) => {
            const get = (name: string) => number(attrs, name);

            const delay = attrs.match(/style="([^"]*)"/)?.[1] ?? "";
            const halo = tag === "circle"
                ? `<circle class="lab-halo lab-h-${seq}" cx="${get("cx")}" cy="${get("cy")}" r="${get("r") + 4}"${delay ? ` style="${delay}"` : ""}/>`
                : `<rect class="lab-halo lab-h-${seq}" x="${get("x") - 4}" y="${get("y") - 4}" width="${get("width") + 8}" height="${get("height") + 8}" rx="${get("rx") + 4}"${delay ? ` style="${delay}"` : ""}/>`;
            return `${halo}<${tag} class="d z p-${seq}" ${attrs}/>`;
        });
    }

    const originalHalo = radialHalo(svg);
    const pathHalo = radialHalo(packed);

    // Keep local geometry and filters intact; put the exact transform on a parent.
    // This deliberately tests filter/transform order, which may change glow edges.
    const wrapper = svg.replace(/<(circle|rect) class="d z p-([^"]+)" ([^>]+)\/>/g, (_all, tag, seq, attrs: string) => {
        const delay = attrs.match(/style="([^"]*)"/)?.[1] ?? "";
        attrs = attrs.replace(/style="[^"]*"/, "");
        return `<g class="lab-motion p-${seq}" style="${delay}"><${tag} class="d z p-${seq}" ${attrs} style="${delay};transform:none!important"/></g>`;
    }).replace("</style>", ".lab-motion{transform-box:fill-box;transform-origin:center;fill:none!important;stroke:none!important;filter:none!important}</style>");

    // Swap complete settled layers in only after every delayed flip has finished.
    // Hidden animation suspension is browser-dependent: measure, do not assume.
    const texts = options.texts ?? ["hello world", "its me", "taruna", "outrowed", "peace out~"];
    const cycle = options.cycleSeconds ?? 24;
    const duration = options.durationPerText ?? 3.8;
    const initial = options.initialHold ?? 0.8;
    const settle = (options.sweepMax ?? 0.85) + 0.04 + (options.flipDuration ?? 0.35);
    const intervals = texts.map((_, i) => [initial + i * duration + settle, initial + (i + 1) * duration]).filter(([a, b]) => a < b && b < cycle);
    const points = ["0%{display:inline}"];

    for (const [a, b] of intervals) points.push(`${a / cycle * 100}%{display:none}`, `${b / cycle * 100}%{display:inline}`);

    points.push("100%{display:inline}");
    let overlays = "";
    intervals.forEach((_, i) => {
        const still = generateStillFlipDotSvg({
            ...options,
            texts,
            frameIndex: i,
        }).svg;
        const content = still.match(/<g id="flip-dot-matrix">([\s\S]*?)<\/g>/)?.[1];

        if (!content) return;

        // Still styles remain scoped to this group; definitions shared with original.
        const style = still.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
        overlays += `<g class="lab-settled lab-frame-${i}"><style>${style.replace(/\.d\b/g, `.lab-frame-${i} .d`).replace(/\.z\b/g, `.lab-frame-${i} .z`).replace(/\.a\b/g, `.lab-frame-${i} .a`)}</style>${content}</g>`;
    });
    const holdCss = intervals.map(([a, b], i) => `.lab-frame-${i}{display:none;animation:lab-hold-${i} ${cycle}s steps(1,end) infinite}@keyframes lab-hold-${i}{0%{display:none}${a / cycle * 100}%{display:inline}${b / cycle * 100}%{display:none}100%{display:none}}`).join("");
    const holds = svg.replace("</style>", `.lab-live{animation:lab-live ${cycle}s steps(1,end) infinite}@keyframes lab-live{${points.join("")}}${holdCss}</style>`)
        .replace("<g id=\"flip-dot-matrix\">", "<g id=\"flip-dot-matrix\" class=\"lab-live\">").replace("</svg>", `${overlays}</svg>`);
    return [
        {
            id: "original",
            title: "Original",
            note: "Unmodified production output. Reference for all comparisons.",
            svg,
        },
        {
            id: "original-halo",
            title: "Original + Technique A: radial halo",
            note: "Replaces per-dot drop shadows with animated radial-gradient halos. No blur filters; compare glow fidelity and phone performance.",
            svg: originalHalo,
        },
        {
            id: "path",
            title: "Inactive dots → compound path",
            note: "Same geometry and stroke, one element for all permanently inactive dots.",
            svg: packed,
        },
        {
            id: "path-halo",
            title: "Compound path + Technique A",
            note: "Combines inactive-dot compound path with radial gradient halos on animated dots.",
            svg: pathHalo,
        },
        {
            id: "pattern",
            title: "Inactive dots → clipped pattern",
            note: "Repeating tile clipped only to permanently inactive cells. Check antialiasing and tile seams.",
            svg: patterned,
        },
        {
            id: "use",
            title: "Reusable dot geometry",
            note: "Shared geometry via <use>; same per-instance effects. Browser caching is NOT guaranteed.",
            svg: reuse(svg),
        },
        {
            id: "combined",
            title: "Compound path + reusable geometry",
            note: "Combines the static path and shared animated geometry experiments.",
            svg: reuse(packed),
        },
        {
            id: "wrapper",
            title: "Filter / motion separation",
            note: "Experimental: parent transform, child original filter. Glow can change because operation order changes.",
            svg: wrapper,
        },
        {
            id: "holds",
            title: "Settled layers during holds",
            note: "Experimental display swaps after all flips settle. Hidden animations may still cost CPU; check boundary flashes.",
            svg: holds,
        },
    ];
}
