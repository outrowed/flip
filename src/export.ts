import JSZip from "jszip";
import type { generateStillFlipDotFrames } from "../core/svg.js";

type Frame = ReturnType<typeof generateStillFlipDotFrames>[number];

export function download(content: BlobPart, filename: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function frameName(frame: Frame) {
    const label = frame.text.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "frame";
    return `frame-${String(frame.frameIndex + 1).padStart(2, "0")}-${label}`;
}

export async function png(frame: Frame): Promise<Blob> {
    const svg = frame.svg.replace("width=\"100%\"", `width="${frame.width}" height="${frame.height}"`);
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));

    try {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = frame.width * 2;
        canvas.height = frame.height * 2;
        const context = canvas.getContext("2d");

        if (!context) throw new Error("Canvas is unavailable");

        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return await new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG export failed")), "image/png"));
    }
    finally {
        URL.revokeObjectURL(url);
    }
}

export async function downloadFrames(frames: Frame[]) {
    const zip = new JSZip();

    for (const frame of frames) {
        const name = frameName(frame);
        zip.file(`svg/${name}.svg`, frame.svg);
        zip.file(`png/${name}.png`, await (await png(frame)).arrayBuffer());
    }

    download(await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
    }), "flip-frames.zip", "application/zip");
}
