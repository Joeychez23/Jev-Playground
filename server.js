// Jev Playground server: serves the static UI and proxies requests to the
// TypeSafe API so the API key never reaches the browser.
const http = require("http");
const fs = require("fs");
const path = require("path");

loadDotEnv(path.join(__dirname, ".env"));

const PORT = Number(process.env.PORT) || 8080;
const API_KEY = process.env.TYPESAFE_API_KEY;
const API_URL = "https://api.typesafe.ai/v1/systemone";
const PUBLIC_DIR = path.join(__dirname, "public");
const MAX_BODY_BYTES = 512 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

if (!API_KEY) {
  console.error("Missing TYPESAFE_API_KEY. Put it in .env or export it.");
  process.exit(1);
}

http
  .createServer(async (req, res) => {
    try {
      if (req.method === "POST" && req.url === "/api/ask") return await handleAsk(req, res);
      if (req.method === "GET") return serveStatic(req, res);
      sendJson(res, 405, { error: "Method not allowed" });
    } catch (err) {
      console.error(err);
      sendJson(res, 500, { error: "Internal server error" });
    }
  })
  .listen(PORT, () => console.log(`Jev Playground running at http://localhost:${PORT}`));

async function handleAsk(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJson(res, 400, { error: err.message === "too_large" ? "Request too large" : "Invalid JSON" });
  }

  const { state, questions } = body || {};
  if (state === undefined || state === "" || !questions || typeof questions !== "object" || !Object.keys(questions).length) {
    return sendJson(res, 400, { error: "Provide a state and at least one question." });
  }

  const started = Date.now();
  const upstream = await fetch(API_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "jev-latest", state, questions }),
  });
  const text = await upstream.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { error: text.slice(0, 500) };
  }
  data.latency_ms = Date.now() - started;
  sendJson(res, upstream.status, data);
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: "Forbidden" });
  fs.readFile(filePath, (err, data) => {
    if (err) return sendJson(res, 404, { error: "Not found" });
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream" });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("too_large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(obj));
}

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
