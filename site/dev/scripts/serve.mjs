// Serves dist/ the way Vercel will: the headers and cleanUrls of vercel.json, 404.html with status 404.
//   node scripts/serve.mjs [--port 8125] [--axe]
// --axe serves axe-core at /__axe.js for the accessibility run (a page reads it with a script tag it adds itself, so the
// Content-Security-Policy is left off for that one file).
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1]) || 8125;
const axe = args.includes("--axe");
const dist = path.resolve("dist");
const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const rules = config.headers.map((r) => ({ re: new RegExp("^" + r.source.replace("(.*)", ".*") + "$"), headers: r.headers }));
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml", ".asc": "application/pgp-keys",
};

function resolve(urlPath) {
  const p = path.join(dist, path.normalize(decodeURIComponent(urlPath)).replace(/^(\.\.[/\\])+/, ""));
  for (const c of [p, p + ".html", path.join(p, "index.html")]) {
    if (c.startsWith(dist) && fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

http
  .createServer((req, res) => {
    const urlPath = new URL(req.url, "http://x").pathname;
    if (axe && urlPath === "/__axe.js") {
      res.writeHead(200, { "content-type": "text/javascript" });
      return res.end(fs.readFileSync("../node_modules/axe-core/axe.min.js"));
    }
    let file = resolve(urlPath);
    let status = 200;
    if (!file) {
      file = path.join(dist, "404.html");
      status = 404;
    }
    const headers = { "content-type": types[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" };
    for (const r of rules) {
      if (!r.re.test(urlPath)) continue;
      for (const h of r.headers) {
        if (axe && h.key === "Content-Security-Policy") continue;
        headers[h.key.toLowerCase()] = h.value;
      }
    }
    res.writeHead(status, headers);
    res.end(fs.readFileSync(file));
  })
  .listen(port, "127.0.0.1", () => console.log(`serving ${dist} on http://127.0.0.1:${port}${axe ? " (axe: no CSP)" : ""}`));
