/** Local server: the API plus Vite (dev) or the built app (--prod). Vercel uses server/vercel.ts instead. */
import "dotenv/config";
import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { SECURITY_HEADERS } from "./headers.ts";

const prod = process.argv.includes("--prod");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 5199);

const app = createApp();
const server = http.createServer(app);

if (prod) {
  const dist = path.join(root, "dist");
  // Same headers Vercel sends, so CSP problems show up locally too.
  app.use((_req, res, next) => {
    res.set(SECURITY_HEADERS);
    next();
  });
  app.use(express.static(dist, { index: false }));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(dist, "index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    root,
    server: { middlewareMode: true, hmr: { server } },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

server.listen(PORT, HOST, () => {
  console.log(`\n  taste  →  http://${HOST}:${PORT}${prod ? "  (production build)" : ""}\n`);
});
