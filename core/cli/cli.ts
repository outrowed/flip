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
import { loadResourcesSync } from "../resources-node.ts";
import { generateFlipDotSvg, parseDisplayParams, splitFrameTexts } from "../svg.ts";

export function runCli(argv = process.argv.slice(2)) {
    loadResourcesSync();

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
            "color": {
                type: "string",
                default: "",
            },
            "background": {
                type: "string",
                default: "",
            },
            "align": {
                type: "string",
                default: "center",
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
        texts = splitFrameTexts(values.texts);
    }
    else if (values.text) {
        texts = values.text.includes("\n") ? splitFrameTexts(values.text) : [values.text];
    }

    const displayParams = parseDisplayParams({
        shape: values.shape,
        theme: values.theme,
        color: values.color || undefined,
        background: values.background || undefined,
        align: values.align,
        italic: !values["no-italic"],
        duration: values.duration,
        pitch: values.pitch,
        dotSize: values["dot-size"],
        minCols: values["min-cols"],
        rows: values.rows,
    });

    const options = {
        ...displayParams,
        texts,
    };

    const result = generateFlipDotSvg(options);

    if (values["preview-ascii"]) {
        result.layouts.forEach((layout, idx) => {
            const label = result.frames?.[idx]?.text || `Frame ${idx + 1}`;
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
