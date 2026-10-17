#!/usr/bin/env node

/**
 * CLI entrypoint for generating the animated wide square flip-dot SVG banner
 * and optionally previewing the italicized matrix in the terminal.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { renderMatrixAscii } from "./matrix.mjs";
import { generateFlipDotSvg } from "./svg.mjs";

export function runCli(argv = process.argv.slice(2)) {
  const { values } = parseArgs({
    args: argv,
    options: {
      text: { type: "string", short: "t", default: "" },
      texts: { type: "string", default: "" },
      out: {
        type: "string",
        short: "o",
        default: "dist/flip-dots-hello-world.svg"
      },
      cols: { type: "string", default: "86" },
      rows: { type: "string", default: "13" },
      "dot-size": { type: "string", default: "12" },
      pitch: { type: "string", default: "14" },
      cycle: { type: "string", default: "" },
      "duration-per-text": { type: "string", default: "3.8" },
      upright: { type: "boolean", default: false },
      ascii: { type: "boolean", short: "a", default: false }
    },
    strict: false
  });

  const minCols = Number.parseInt(values.cols, 10) || 86;
  const rows = Number.parseInt(values.rows, 10) || 13;
  const dotSize = Number.parseFloat(values["dot-size"]) || 12;
  const cellPitch = Number.parseFloat(values.pitch) || 14;
  const durationPerText = Number.parseFloat(values["duration-per-text"]) || 3.8;
  const cycleSeconds = values.cycle ? Number.parseFloat(values.cycle) : undefined;
  const italic = !values.upright;

  let texts;
  if (values.texts) {
    texts = values.texts.split(",").map((s) => s.trim());
  } else if (values.text) {
    texts = [values.text];
  }

  const result = generateFlipDotSvg({
    texts,
    italic,
    minCols,
    rows,
    dotSize,
    cellPitch,
    durationPerText,
    cycleSeconds
  });

  const outPath = resolve(process.cwd(), values.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, result.svg, "utf8");

  if (values.ascii) {
    process.stdout.write(`${renderMatrixAscii(result.matrix.grid)}\n\n`);
  }

  process.stdout.write(
    `Generated ${outPath} (${result.width}x${result.height}px, ${result.cols}x${result.rows} circular flip-dots, ${result.layouts.length} rotating texts)\n`
  );

  return { outPath, ...result };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
