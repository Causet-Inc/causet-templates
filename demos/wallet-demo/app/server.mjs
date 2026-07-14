/**
 * Tiny static server for the wallets demo (ES modules need http://, not file://).
 *
 * Serves app/public and exposes /config.json from the project .env (if present).
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const projectRoot = path.join(__dirname, "..");
const PORT = Number(process.env.PORT || 3850);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function loadEnvFile() {
  const envPath = path.join(projectRoot, ".env");
  const out = {};
  if (!fs.existsSync(envPath)) return out;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

function configJson() {
  const env = loadEnvFile();
  return {
    apiUrl: env.CAUSET_API_URL || process.env.CAUSET_API_URL || "http://localhost:8085",
    realtimeUrl: env.CAUSET_REALTIME_URL || process.env.CAUSET_REALTIME_URL || "http://localhost:8081",
    platform: env.CAUSET_PLATFORM || process.env.CAUSET_PLATFORM || "local-platform",
    application: env.CAUSET_APPLICATION || process.env.CAUSET_APPLICATION || "my-wallets",
    fork: env.CAUSET_FORK || process.env.CAUSET_FORK || "sandbox",
    apiKey: env.CAUSET_API_KEY || process.env.CAUSET_API_KEY || "",
  };
}

function send(res, status, body, type) {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (url.pathname === "/config.json") {
    return send(res, 200, JSON.stringify(configJson(), null, 2), MIME[".json"]);
  }

  let rel = url.pathname === "/" ? "/index.html" : url.pathname;
  rel = path.normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, rel);

  if (!filePath.startsWith(publicDir)) {
    return send(res, 403, "Forbidden", "text/plain");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    const ext = path.extname(filePath);
    send(res, 200, data, MIME[ext] || "application/octet-stream");
  });
});

server.listen(PORT, () => {
  console.log(`Wallets demo → http://localhost:${PORT}`);
  console.log('Layers: ui/ → domain/ → @causet/sdk → Causet runtime');
});
