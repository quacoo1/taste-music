/**
 * Vercel entry: every /api/* request is routed to this one function as
 * /api/router?__path=<rest> (see scripts/build-vercel.mjs). Restore the original
 * path so the Express routes match, then hand over.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { createApp } from "./app.ts";

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://internal");
  if (url.pathname === "/api/router") {
    const rest = url.searchParams.get("__path") ?? "";
    url.searchParams.delete("__path");
    req.url = `/api/${rest}${url.search}`;
  }
  app(req as Parameters<typeof app>[0], res as Parameters<typeof app>[1]);
}
