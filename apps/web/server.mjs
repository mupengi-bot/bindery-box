import * as http from "node:http";
import * as fs from "node:fs/promises";
import * as path from "node:path";
const port = Number(process.env.BINDERY_WEB_PORT ?? 4310);
const root = path.resolve("apps/web/public");
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const file = path.join(root, rel);
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}).listen(port, () => console.log(`Mission Control listening on http://localhost:${port}`));
