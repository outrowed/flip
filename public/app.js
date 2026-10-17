/**
 * FLIP — Flip-dot Letter & Image Playground
 * Client-side playground controller
 */

const PRESETS = {
  rotation: [
    "hello world",
    "its me",
    "taruna",
    "outrowed",
    "peace out~"
  ],
  single: [
    "hello world"
  ],
  terminal: [
    "system online",
    "all checks green",
    "ready for input"
  ],
  minimal: [
    "taruna",
    "outrowed"
  ]
};

// State
const state = {
  texts: [...PRESETS.rotation],
  dotShape: "circle",
  italic: true,
  theme: "amber",
  durationPerText: 3.8,
  cellPitch: 14,
  dotSize: 12,
  svgData: null,
  activeTab: "markdown"
};

// DOM Elements
const textInput = document.getElementById("textInput");
const shapeButtons = document.querySelectorAll("#shapeGroup .segment-btn");
const italicButtons = document.querySelectorAll("#italicGroup .segment-btn");
const swatchButtons = document.querySelectorAll("#paletteGrid .palette-swatch");
const themeNameLabel = document.getElementById("themeName");
const durationInput = document.getElementById("durationInput");
const durationVal = document.getElementById("durationVal");
const pitchInput = document.getElementById("pitchInput");
const pitchVal = document.getElementById("pitchVal");
const generateBtn = document.getElementById("generateBtn");
const resetBtn = document.getElementById("resetBtn");
const svgContainer = document.getElementById("svgContainer");
const stageViewport = document.getElementById("stageViewport");
const viewToggles = document.querySelectorAll(".view-toggle");
const themeToggleStage = document.getElementById("themeToggleStage");

// Telemetry
const boardDims = document.getElementById("boardDims");
const pixelDims = document.getElementById("pixelDims");
const frameCount = document.getElementById("frameCount");
const fileSize = document.getElementById("fileSize");

// Export & Snippets
const copyMarkdownBtn = document.getElementById("copyMarkdownBtn");
const copySvgBtn = document.getElementById("copySvgBtn");
const downloadSvgBtn = document.getElementById("downloadSvgBtn");
const copyUrlBtn = document.getElementById("copyUrlBtn");
const downloadAllFramesBtn = document.getElementById("downloadAllFramesBtn");
const framesGrid = document.getElementById("framesGrid");
const toast = document.getElementById("toast");
const snippetCode = document.getElementById("snippetCode");
const tabButtons = document.querySelectorAll(".tab-btn");

let toastTimeout = null;

function showToast(message) {
  if (toastTimeout) clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.classList.remove("hidden");
  toastTimeout = setTimeout(() => {
    toast.classList.add("hidden");
  }, 2200);
}

function parseTextsFromInput() {
  const raw = textInput.value || "";
  const lines = raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  return lines.length > 0 ? lines : ["hello world"];
}

async function generateSvg() {
  state.texts = parseTextsFromInput();
  generateBtn.disabled = true;
  generateBtn.innerHTML = '<span class="icon">⌛</span> Generating...';

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        texts: state.texts,
        dotShape: state.dotShape,
        italic: state.italic,
        theme: state.theme,
        durationPerText: state.durationPerText,
        cellPitch: state.cellPitch,
        dotSize: state.dotSize
      })
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || "Generation failed");

    state.svgData = data;

    // Render into stage
    svgContainer.innerHTML = data.svg;

    // Telemetry
    boardDims.textContent = `${data.cols} × ${data.rows} dots`;
    pixelDims.textContent = `${data.width} × ${data.height} px`;
    frameCount.textContent = `${data.textCount} ${data.textCount === 1 ? "frame" : "frames"}`;
    const kb = (new Blob([data.svg]).size / 1024).toFixed(1);
    fileSize.textContent = `~${kb} KB`;

    renderStillFrames(data.frames || []);
    updateSnippet();
  } catch (err) {
    svgContainer.innerHTML = `<div class="stage-loading" style="color:#ef4444">Error: ${err.message}</div>`;
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = '<span class="icon">⚡</span> Update Display';
  }
}

function getQueryUrl() {
  const origin = window.location.origin;
  const params = new URLSearchParams();
  if (state.texts.length > 1) {
    params.set("texts", state.texts.join(","));
  } else if (state.texts.length === 1) {
    params.set("text", state.texts[0]);
  }
  if (state.dotShape !== "circle") params.set("shape", state.dotShape);
  if (state.theme !== "amber") params.set("theme", state.theme);
  if (!state.italic) params.set("italic", "false");
  if (state.durationPerText !== 3.8) params.set("duration", state.durationPerText);
  if (state.cellPitch !== 14) params.set("pitch", state.cellPitch);
  return `${origin}/api/svg?${params.toString()}`;
}

function updateSnippet() {
  const url = getQueryUrl();
  const label = state.texts.join(" • ") || "FLIP Display";

  if (state.activeTab === "markdown") {
    snippetCode.textContent = `![${label}](./flip.svg)\n\n<!-- Or via live API endpoint: -->\n![${label}](${url})`;
  } else if (state.activeTab === "html") {
    snippetCode.textContent = `<p align="center">\n  <img src="./flip.svg" width="100%" alt="${label}" />\n</p>`;
  } else if (state.activeTab === "api") {
    snippetCode.textContent = `# Direct SVG URL (returns image/svg+xml):\n${url}\n\n# Markdown direct link:\n![FLIP Banner](${url})`;
  } else if (state.activeTab === "brand") {
    const origin = window.location.origin;
    snippetCode.textContent = `<!-- FLIP Brand Assets -->\n\n<!-- 1. Minimal Three-dot Emblem -->\n![FLIP Logo](./logo.svg)\n<!-- Hosted URL: ${origin}/logo.svg -->\n\n<!-- 2. Three-dot Emblem (alias) -->\n![FLIP Headlight](./headlight.svg)\n<!-- Hosted URL: ${origin}/headlight.svg -->\n\n<!-- 3. Solenoid Disc Favicon -->\n![FLIP Favicon](./favicon.svg)\n<!-- Hosted URL: ${origin}/favicon.svg -->`;
  }
}

// Preset Handlers
document.querySelectorAll(".preset-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = btn.dataset.preset;
    if (PRESETS[key]) {
      textInput.value = PRESETS[key].join("\n");
      generateSvg();
    }
  });
});

// Dot Shape toggle
shapeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    shapeButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.dotShape = btn.dataset.shape;
    generateSvg();
  });
});

// Italic toggle
italicButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    italicButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.italic = btn.dataset.italic === "true";
    generateSvg();
  });
});

// Theme Swatches
swatchButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    swatchButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.theme = btn.dataset.theme;
    themeNameLabel.textContent = btn.title || state.theme;
    generateSvg();
  });
});

// Sliders
durationInput.addEventListener("input", (e) => {
  state.durationPerText = Number.parseFloat(e.target.value);
  durationVal.textContent = `${state.durationPerText.toFixed(1)}s`;
});
durationInput.addEventListener("change", generateSvg);

pitchInput.addEventListener("input", (e) => {
  state.cellPitch = Number.parseInt(e.target.value, 10);
  state.dotSize = state.cellPitch - 2;
  pitchVal.textContent = `${state.cellPitch}px`;
});
pitchInput.addEventListener("change", generateSvg);

// Generate & Reset
generateBtn.addEventListener("click", generateSvg);

resetBtn.addEventListener("click", () => {
  textInput.value = PRESETS.rotation.join("\n");
  state.dotShape = "circle";
  state.italic = true;
  state.theme = "amber";
  state.durationPerText = 3.8;
  state.cellPitch = 14;
  state.dotSize = 12;

  shapeButtons.forEach((b) => b.classList.toggle("active", b.dataset.shape === "circle"));
  italicButtons.forEach((b) => b.classList.toggle("active", b.dataset.italic === "true"));
  swatchButtons.forEach((b) => b.classList.toggle("active", b.dataset.theme === "amber"));
  themeNameLabel.textContent = "Amber Solenoid";

  durationInput.value = "3.8";
  durationVal.textContent = "3.8s";
  pitchInput.value = "14";
  pitchVal.textContent = "14px";

  generateSvg();
});

// Stage Viewport Toggles (Dark / Light / Blueprint Grid)
viewToggles.forEach((btn) => {
  btn.addEventListener("click", () => {
    viewToggles.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    const bg = btn.dataset.bg;
    stageViewport.className = `stage-viewport stage-${bg}`;
  });
});

themeToggleStage.addEventListener("click", () => {
  if (stageViewport.classList.contains("stage-dark")) {
    stageViewport.className = "stage-viewport stage-light";
    viewToggles.forEach((b) => b.classList.toggle("active", b.dataset.bg === "light"));
  } else {
    stageViewport.className = "stage-viewport stage-dark";
    viewToggles.forEach((b) => b.classList.toggle("active", b.dataset.bg === "dark"));
  }
});

// Clipboard & Download Handlers
copyMarkdownBtn.addEventListener("click", async () => {
  const label = state.texts.join(" • ") || "FLIP Display";
  const md = `![${label}](./flip.svg)`;
  await navigator.clipboard.writeText(md);
  showToast("Markdown snippet copied!");
});

copySvgBtn.addEventListener("click", async () => {
  if (!state.svgData || !state.svgData.svg) return;
  await navigator.clipboard.writeText(state.svgData.svg);
  showToast("Raw SVG code copied!");
});

downloadSvgBtn.addEventListener("click", () => {
  if (!state.svgData || !state.svgData.svg) return;
  const blob = new Blob([state.svgData.svg], { type: "image/svg+xml;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "flip.svg";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast("Downloaded flip.svg!");
});

copyUrlBtn.addEventListener("click", async () => {
  const url = getQueryUrl();
  await navigator.clipboard.writeText(url);
  showToast("Direct API URL copied!");
});

// Render Still Frame Cards & Downloads
function sanitizeFileName(str) {
  return str.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "frame";
}

function renderStillFrames(frames) {
  if (!framesGrid) return;
  framesGrid.innerHTML = "";

  if (!frames || frames.length === 0) {
    framesGrid.innerHTML = '<div style="color:var(--text-dim);padding:14px;font-size:12px;">No frames available</div>';
    return;
  }

  frames.forEach((frame, idx) => {
    const card = document.createElement("div");
    card.className = "frame-card";

    const preview = document.createElement("div");
    preview.className = "frame-card-preview";
    preview.innerHTML = frame.svg;

    const meta = document.createElement("div");
    meta.className = "frame-card-meta";

    const info = document.createElement("div");
    info.className = "frame-card-info";

    const title = document.createElement("span");
    title.className = "frame-card-title";
    title.textContent = `Frame ${idx + 1}: "${frame.text}"`;

    const details = document.createElement("span");
    details.className = "frame-card-details";
    details.textContent = `${frame.activeCount} dots active`;

    info.appendChild(title);
    info.appendChild(details);

    const actions = document.createElement("div");
    actions.className = "frame-card-actions";

    // Download SVG
    const svgBtn = document.createElement("button");
    svgBtn.type = "button";
    svgBtn.className = "frame-action-btn";
    svgBtn.title = "Download static SVG";
    svgBtn.textContent = ".SVG";
    svgBtn.addEventListener("click", () => {
      downloadFile(frame.svg, `flip-frame-${idx + 1}-${sanitizeFileName(frame.text)}.svg`, "image/svg+xml;charset=utf-8");
      showToast(`Downloaded Frame ${idx + 1} (.SVG)`);
    });

    // Download PNG
    const pngBtn = document.createElement("button");
    pngBtn.type = "button";
    pngBtn.className = "frame-action-btn";
    pngBtn.title = "Rasterize and download PNG";
    pngBtn.textContent = ".PNG";
    pngBtn.addEventListener("click", () => {
      rasterizeSvgToPng(frame.svg, frame.width, frame.height, `flip-frame-${idx + 1}-${sanitizeFileName(frame.text)}.png`);
    });

    actions.appendChild(svgBtn);
    actions.appendChild(pngBtn);

    meta.appendChild(info);
    meta.appendChild(actions);

    card.appendChild(preview);
    card.appendChild(meta);
    framesGrid.appendChild(card);
  });
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function rasterizeSvgToPng(svgStr, width, height, filename) {
  const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const img = new Image();

  img.onload = () => {
    const canvas = document.createElement("canvas");
    // 2x supersampling for high DPI crispness
    const scale = 2;
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);

    canvas.toBlob((pngBlob) => {
      if (pngBlob) {
        const pngUrl = URL.createObjectURL(pngBlob);
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(pngUrl), 2000);
        showToast(`Downloaded ${filename}!`);
      }
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    showToast("PNG export failed");
  };

  img.src = url;
}

if (downloadAllFramesBtn) {
  downloadAllFramesBtn.addEventListener("click", async () => {
    if (!state.svgData || !state.svgData.frames || state.svgData.frames.length === 0) return;
    const frames = state.svgData.frames;

    if (typeof window.JSZip === "undefined") {
      showToast("JSZip library not loaded");
      return;
    }

    try {
      downloadAllFramesBtn.disabled = true;
      downloadAllFramesBtn.innerHTML = '<span class="icon">⌛</span> Zipping...';

      const zip = new window.JSZip();
      const svgFolder = zip.folder("svg");
      const pngFolder = zip.folder("png");

      // Helper to render frame PNG blob
      const getPngBlob = (svgStr, width, height) =>
        new Promise((resolve) => {
          const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            const canvas = document.createElement("canvas");
            const scale = 2; // 2x supersampling
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext("2d");
            ctx.scale(scale, scale);
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((pngBlob) => {
              URL.revokeObjectURL(url);
              resolve(pngBlob);
            }, "image/png");
          };
          img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
          };
          img.src = url;
        });

      for (let i = 0; i < frames.length; i += 1) {
        const frame = frames[i];
        const num = String(i + 1).padStart(2, "0");
        const baseName = `frame-${num}-${sanitizeFileName(frame.text)}`;

        // Add SVG
        svgFolder.file(`${baseName}.svg`, frame.svg);

        // Add PNG
        const pngBlob = await getPngBlob(frame.svg, frame.width, frame.height);
        if (pngBlob) {
          pngFolder.file(`${baseName}.png`, pngBlob);
        }
      }

      const zipContent = await zip.generateAsync({ type: "blob" });
      const zipUrl = URL.createObjectURL(zipContent);
      const a = document.createElement("a");
      a.href = zipUrl;
      a.download = `flip-dots-frames.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(zipUrl), 2000);

      showToast(`Downloaded all ${frames.length} frames as ZIP!`);
    } catch (err) {
      showToast(`ZIP generation failed: ${err.message}`);
    } finally {
      downloadAllFramesBtn.disabled = false;
      downloadAllFramesBtn.innerHTML = '<span class="icon">📦</span> Download All (.ZIP)';
    }
  });
}

// Initial automatic load
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", generateSvg);
} else {
  generateSvg();
}
