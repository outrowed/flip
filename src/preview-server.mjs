import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const svgPath = resolve(process.cwd(), "dist/flip-dots-hello-world.svg");

const server = createServer((req, res) => {
  const svg = readFileSync(svgPath, "utf8");
  if (req.url === "/flip-dots-hello-world.svg") {
    res.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8" });
    res.end(svg);
    return;
  }

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>GitHub README Flip-Dots Preview</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px;
      background: #0d1117;
      color: #e6edf3;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    }
    .container {
      max-width: 1012px;
      margin: 0 auto;
    }
    .readme-box {
      border: 1px solid #30363d;
      border-radius: 6px;
      background: #0d1117;
      padding: 24px;
      margin-bottom: 24px;
    }
    .readme-light {
      border: 1px solid #d0d7de;
      border-radius: 6px;
      background: #ffffff;
      color: #1f2328;
      padding: 24px;
    }
    .label {
      font-size: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      margin-bottom: 12px;
      opacity: 0.7;
    }
    img {
      display: block;
      width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="readme-box">
      <div class="label">GitHub Dark Mode README (&lt;img src="flip-dots-hello-world.svg"&gt;)</div>
      <img src="/flip-dots-hello-world.svg" alt="Flip-Dot Display: hello world"/>
    </div>
    <div class="readme-light">
      <div class="label">GitHub Light Mode README (&lt;img src="flip-dots-hello-world.svg"&gt;)</div>
      <img src="/flip-dots-hello-world.svg" alt="Flip-Dot Display: hello world"/>
    </div>
  </div>
</body>
</html>`;

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 4329);
server.listen(port, host, () => {
  console.log(`Preview server listening on http://${host}:${port}`);
});
