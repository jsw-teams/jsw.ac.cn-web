import http from "node:http";
import fs from "node:fs/promises";
import fss from "node:fs";
import path from "node:path";

const root = path.join(process.cwd(), "public");
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml"
};

http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
  if (!fss.existsSync(file)) file = path.join(root, "404.html");
  try {
    const body = await fs.readFile(file);
    res.writeHead(file.endsWith("404.html") ? 404 : 200, {
      "content-type": types[path.extname(file)] || "application/octet-stream"
    });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving public at http://127.0.0.1:${port}/`);
});
