# FLIP

![FLIP Banner](https://flip.taruna.me/api/svg?texts=%7Eflip%7E%2Cflip-dot%2Cletter%2Cimage%2Cplayground)

<p align="center" style="font-size: 18px; font-weight: bold;">Flip-dot Letter & Image Playground</p>

An interactive text-to-flipdots animated SVG generator and electromechanical display board for Markdown profiles, websites, and terminal environments.

> Live playground: **https://flip.taruna.me**

## Overview

FLIP simulates modular electromechanical [flip-dot display boards](https://en.wikipedia.org/wiki/Flip-disc_display) mounted inside an anodized aluminum bezel. Letters and punctuation transition through rotating phrases using electromagnetic diagonal sweep waves, highlighting active amber solenoids and resting in a recessed dark zero-state.

SVGs produced by the engine are completely standalone with pure inline CSS keyframe animations. They require no JavaScript, external font files, or remote stylesheets, making them safe for GitHub README profiles, Camo proxies, and static documentation.

## Features

- Converts multi-line custom messages into rotating animated SVG banners with zero client-side dependencies.
- Rasterizes animations server-side into smooth 24 FPS WebP and APNG formats with duplicate frame compression.
- Generates settled still frames for each phrase, allowing direct export of static vector SVGs or high-resolution PNG snapshots.
- Serves exact-dimension responsive placeholders with short cache headers during cold raster generation to prevent GitHub Camo timeouts.
- Bundles complete frame sequences into downloadable ZIP archives directly within the browser using JSZip.
- Includes five color presets: Amber Solenoid, Emerald Transit, Monochrome White, Cyber Cyan, and Crimson Hazard.
- Supports both forward 24-degree italic shear and upright typography with round or square dot geometries.
- Features real-time stage telemetry, configurable dot pitch, duration controls, and multiple stage backdrop themes (Dark, Light, Grid).
- Provides a standalone CLI utility for headless SVG generation and ASCII terminal matrix rendering.
- Exposes a Fastify HTTP service for dynamic on-demand SVG, WebP, and APNG generation via query parameters.

## Usage

### Markdown Embeds

You can reference the live API endpoint directly in any Markdown document or GitHub profile:

```markdown
![FLIP Banner](https://flip.taruna.me/api/svg?texts=hello+world,its+me,taruna,peace+out~)
```

Which results in:

> ![FLIP Banner](https://flip.taruna.me/api/svg?texts=hello+world,its+me,taruna,peace+out~)

To render static non-animated frames, use the `/api/frame` endpoint:

```markdown
![Still Frame](https://flip.taruna.me/api/frame?texts=hello+world&frame=0)
```

Which results in:

> ![Still Frame](https://flip.taruna.me/api/frame?texts=hello+world&frame=0)

### Animated Raster Formats (WebP & APNG)

When embedding in environments that do not support animated vector SVGs, you can request 24 FPS animated WebP or APNG outputs by setting `format=webp` or `format=apng`:

```markdown
<!-- 24 FPS animated WebP -->
![FLIP WebP](https://flip.taruna.me/api/svg?texts=system+online,all+green&format=webp)

<!-- Animated PNG -->
![FLIP APNG](https://flip.taruna.me/api/svg?texts=system+online,all+green&format=apng)
```

#### GitHub Camo & Non-Blocking Placeholders

Generating a multi-phrase 24 FPS animation takes several seconds of deterministic frame sampling. GitHub routes external media through its Camo proxy (`camo.githubusercontent.com`), which terminates origin requests taking longer than 10 seconds.

To ensure links never time out on GitHub:

1. **First load (cache miss)**: The server immediately returns an exact-dimension placeholder image (`GENERATING FLIP-DOT ANIMATION... Please wait for a moment - Reload from time to time to view`) with `Cache-Control: public, max-age=4, s-maxage=4, must-revalidate`. Because the placeholder matches the exact board dimensions, Cumulative Layout Shift is zero (`CLS = 0`).
2. **Background rendering**: The server compiles and caches the 24 FPS raster output in the background.
3. **Subsequent reloads (cache hit)**: Once rendering finishes, Camo revalidates with the origin and caches the complete animation with a standard duration (`max-age=60, s-maxage=300`).

To inspect the placeholder styling and dimensions during development without triggering an actual background render, open the dedicated developer preview page at `/preview-placeholder` or request:

```
GET /api/placeholder?width=1260&height=234&theme=amber&format=webp
```

### Developer API Reference

The Fastify HTTP service exposes `/api/svg` and `/api/frame` with these query parameters:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `texts` | `string` | *(preset)* | Comma-separated list of phrases to cycle through. |
| `text` | `string` | | Single text phrase (alternative to `texts`). |
| `format` | `string` | `svg` | Target output format: `svg`, `webp`, or `apng`. |
| `shape` | `string` | `circle` | Dot geometry: `circle` (round) or `square`. |
| `theme` | `string` | `amber` | Color theme: `amber`, `emerald`, `white`, `cyan`, or `crimson`. |
| `italic` | `boolean` | `true` | Forward slant typography (`true` for 24-degree slant, `false` for upright). |
| `duration` | `number` | `3.8` | Display dwell time per message in seconds. |
| `pitch` | `number` | `14` | Dot center-to-center pitch in pixels. |
| `renderTech` | `string` | `compound-path` | SVG rendering method: `compound-path` (compact) or `original` (individual elements). |
| `sync` | `boolean` | `false` | When `true`, synchronously waits for rasterization to finish instead of returning a placeholder. |
| `frame` | `number` | `0` | Zero-based frame index for static exports via `/api/frame`. |

### Command Line Interface

Generate an animated SVG banner or preview matrix layouts directly in your terminal:

```bash
# Generate a banner from rotating text phrases
pnpm generate -t "hello world" -o assets/banner.svg

# Output ASCII preview of dot matrix layouts in the console
node dist/cli.js --texts="hello,world" --preview-ascii
```

## Deployment

Build the static client SPA, Fastify server bundle, and standalone CLI into `dist/`:

```bash
pnpm build
```

Start the production server:

```bash
pnpm start
```

The server listens on `http://0.0.0.0:4329`, serving the static client application alongside the dynamic `/api` endpoints.

### Docker

Build and run the rootless production container:

```bash
docker build -t local/flip:0.2.0 .
docker run -d --name flip -p 4329:4329 local/flip:0.2.0
```

## Development

The project requires Node.js `>= 22.18` (or Node 24) and `pnpm`.

### Getting Started

Install project dependencies:

```bash
pnpm install
```

Run the development environment:

```bash
# Start Fastify API backend in watch mode (port 3029)
pnpm dev:api

# Start Vite React frontend with HMR (port 4329, proxying /api to 3029)
pnpm dev
```

Open `http://localhost:4329` in your browser to inspect the playground.

### Testing and Code Quality

Run unit tests, type checking, and style linters:

```bash
# Run Vitest unit tests
pnpm test

# Run TypeScript type check
pnpm typecheck

# Run Biome and ESLint checks
pnpm check

# Automatically format code
pnpm format
```

## License

[MIT License](LICENSE). Copyright (c) 2026 Taruna Prasetya.