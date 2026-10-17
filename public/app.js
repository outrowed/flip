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

// Snippet tab switching
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    state.activeTab = btn.dataset.tab;
    updateSnippet();
  });
});

// Initialize on load
generateSvg();
