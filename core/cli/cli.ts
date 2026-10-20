#!/usr/bin/env node

/**
 * CLI entrypoint for generating the animated wide square flip-dot SVG banner
 * and optionally previewing the italicized matrix in the terminal.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { renderMatrixAscii } from "../matrix.ts";
import { generateFlipDotSvg } from "../svg.ts";

export function runCli(argv = process.argv.slice(2)) {
    const { values } = parseArgs({
        args: argv,
        options: {
            "text": {
                type: "string",
                short: "t",
                default: "",
            },
            "texts": {
                type: "string",
                default: "",
            },
            "out": {
                type: "string",
                short: "o",
                default: "assets/flip.svg",
            },
            "shape": {
                type: "string",
                default: "circle",
            },
            "theme": {
                type: "string",
                default: "amber",
            },
            "duration": {
                type: "string",
                default: "3.8",
            },
            "pitch": {
                type: "string",
                default: "14",
            },
            "dot-size": {
                type: "string",
                default: "12",
            },
            "min-cols": {
                type: "string",
                default: "86",
            },
            "rows": {
                type: "string",
                default: "13",
            },
            "preview-ascii": {
                type: "boolean",
                default: false,
            },
            "no-italic": {
                type: "boolean",
                default: false,
            },
        },
    });

    let texts: string[] | undefined;

    if (values.texts) {
        texts = values.texts
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);
    }
    else if (values.text) {
        texts = [values.text];
    }

    const options = {
        texts,
        dotShape: (values.shape === "square" ? "square" : "circle") as "square" | "circle",
        theme: values.theme as "amber" | "emerald" | "white" | "cyan" | "crimson",
        italic: !values["no-italic"],
        durationPerText: Number.parseFloat(values.duration || "3.8"),
        cellPitch: Number.parseFloat(values.pitch || "14"),
        dotSize: Number.parseFloat(values["dot-size"] || "12"),
        minCols: Number.parseInt(values["min-cols"] || "86", 10),
        rows: Number.parseInt(values.rows || "13", 10),
    };

    const result = generateFlipDotSvg(options);

    if (values["preview-ascii"]) {
        const textList = options.texts || ["hello world"];
        result.layouts.forEach((layout, idx) => {
            const label = textList[idx] || `Frame ${idx + 1}`;
            console.log(`\n=== ASCII PREVIEW: "${label}" (${layout.cols}x${layout.rows}) ===\n`);
            console.log(renderMatrixAscii(layout.grid));
        });
    }

    const outPath = resolve(process.cwd(), values.out || "assets/flip.svg");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, result.svg, "utf8");

    console.log(
        `Generated ${outPath} (${result.width}x${result.height}px, ${result.cols}x${result.rows} circular flip-dots, ${result.layouts.length} rotating texts)`,
    );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
    runCli();
}
