/**
 * Builds Vercel's Build Output API layout (https://vercel.com/docs/build-output-api):
 *
 *   .vercel/output/static/                 the Vite build
 *   .vercel/output/functions/api/router.func/  the stateless API, bundled into one file
 *   .vercel/output/config.json             routing + security headers
 *
 * Run after `vite build`. Vercel picks up .vercel/output automatically.
 */
import { build } from "esbuild";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const out = path.join(root, ".vercel", "output");
const fn = path.join(out, "functions", "api", "router.func");

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(fn, { recursive: true });
await fs.cp(path.join(root, "dist"), path.join(out, "static"), { recursive: true });

await build({
  entryPoints: [path.join(root, "server", "vercel.ts")],
  outfile: path.join(fn, "index.cjs"),
  bundle: true,
  platform: "node",
  target: "node24",
  format: "cjs",
  legalComments: "none",
  logLevel: "warning",
  // Export the handler both as module.exports and .default, whichever the launcher looks for.
  footer: { js: "const __h = module.exports.default; module.exports = __h; module.exports.default = __h;" },
});

await fs.writeFile(
  path.join(fn, ".vc-config.json"),
  JSON.stringify(
    {
      runtime: "nodejs24.x",
      handler: "index.cjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
      maxDuration: 60,
    },
    null,
    2,
  ),
);

// Compile the shared header list so the deployed site matches the local production server.
const headersModule = path.join(out, "headers.tmp.mjs");
await build({ entryPoints: [path.join(root, "server", "headers.ts")], outfile: headersModule, bundle: true, format: "esm", platform: "node", logLevel: "warning" });
const { SECURITY_HEADERS } = await import(pathToFileURL(headersModule).href);
await fs.rm(headersModule);

await fs.writeFile(
  path.join(out, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "^/assets/(.*)$", headers: { "Cache-Control": "public, max-age=31536000, immutable" }, continue: true },
        { src: "^/(.*)$", headers: SECURITY_HEADERS, continue: true },
        { handle: "filesystem" },
        { src: "^/api/(.*)$", dest: "/api/router?__path=$1" },
        { src: "^/(.*)$", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);

const size = (await fs.stat(path.join(fn, "index.cjs"))).size;
console.log(`✓ .vercel/output ready (API bundle ${(size / 1024).toFixed(0)} kB)`);
