/**
 * Taste's API. Stateless on purpose: no accounts, no database, no API keys.
 * It only proxies public music catalogs that browsers can't reach directly
 * (Deezer and YouTube Music don't allow cross-origin requests). Everything
 * personal — AI keys, playlists, OAuth tokens — stays in the user's browser.
 */
import express from "express";
import { z } from "zod";
import { ARCS, type AppConfig, type GenerateEvent } from "../shared/types.ts";
import { deezerDetails, deezerPreview, findTrack, mapLimit, searchTracks } from "./catalog.ts";
import { generateLite } from "./generate.ts";
import { anonymousPlaylist, resolveVideoIds } from "./youtube.ts";

const TrackSchema = z.object({
  id: z.string().max(100),
  source: z.enum(["deezer", "itunes"]),
  sourceId: z.string().max(40),
  title: z.string().min(1).max(300),
  artist: z.string().min(1).max(300),
  album: z.string().max(300).optional(),
  artwork: z.string().max(1000).optional(),
  artworkSmall: z.string().max(1000).optional(),
  previewUrl: z.string().max(1000).optional(),
  durationMs: z.number().optional(),
  explicit: z.boolean().optional(),
  isrc: z.string().max(20).optional(),
});

const GenerateSchema = z.object({
  seeds: z.array(TrackSchema).min(1).max(5),
  length: z.number().int().min(6).max(40),
  arc: z.enum(ARCS),
  wander: z.number().min(0).max(1),
  note: z.string().max(280).optional(),
  includeSeeds: z.boolean(),
});

const Wanted = z.object({ title: z.string().min(1).max(300), artist: z.string().min(1).max(300), durationMs: z.number().optional() });

/** A small per-instance limiter so the catalog proxies can't be hammered. */
function rateLimit(perMinute: number): express.RequestHandler {
  const hits = new Map<string, { count: number; reset: number }>();
  return (req, res, next) => {
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "local").split(",")[0].trim();
    const now = Date.now();
    const entry = hits.get(ip);
    if (!entry || entry.reset < now) {
      if (hits.size > 5000) hits.clear();
      hits.set(ip, { count: 1, reset: now + 60_000 });
      return next();
    }
    if (++entry.count > perMinute) {
      res.set("Retry-After", String(Math.ceil((entry.reset - now) / 1000)));
      return void res.status(429).json({ error: "Too many requests — try again in a minute." });
    }
    next();
  };
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use("/api", express.json({ limit: "256kb" }), rateLimit(240));

  app.get("/api/config", (_req, res) => {
    // Optional defaults for the export integrations; users can bring their own client IDs.
    const config: AppConfig = {
      spotifyClientId: process.env.SPOTIFY_CLIENT_ID?.trim() || null,
      googleClientId: process.env.GOOGLE_CLIENT_ID?.trim() || null,
    };
    res.set("Cache-Control", "no-store").json(config);
  });

  app.get("/api/search", async (req, res) => {
    const q = String(req.query.q ?? "").trim().slice(0, 200);
    if (q.length < 2) return void res.json({ tracks: [] });
    try {
      res.json({ tracks: await searchTracks(q, 8) });
    } catch (err) {
      console.error("[search]", err);
      res.status(502).json({ error: "Search is unavailable right now." });
    }
  });

  app.get("/api/preview/deezer/:id", async (req, res) => {
    if (!/^\d{1,20}$/.test(req.params.id)) return void res.status(400).end();
    try {
      const url = await deezerPreview(req.params.id);
      if (!url) return void res.status(404).end();
      res.set("Cache-Control", "no-store").redirect(302, url);
    } catch {
      res.status(502).end();
    }
  });

  /** Resolve AI suggestions (from the browser) to real recordings. */
  app.post("/api/match", async (req, res) => {
    const parsed = z.object({ picks: z.array(Wanted).min(1).max(10) }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid request" });
    const results = await mapLimit(parsed.data.picks, 4, async (pick) => {
      const found = await findTrack(pick).catch(() => null);
      if (!found || found.source !== "deezer") return found;
      try {
        const d = await deezerDetails(found.sourceId);
        return { ...found, measuredBpm: d.bpm, isrc: d.isrc ?? found.isrc };
      } catch {
        return found;
      }
    });
    res.json({ results });
  });

  /** Measured tempo, loudness and ISRC for known tracks (the seeds). */
  app.post("/api/details", async (req, res) => {
    const parsed = z.object({ tracks: z.array(TrackSchema).min(1).max(5) }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid request" });
    const results = await mapLimit(parsed.data.tracks, 3, async (t) => {
      if (t.source !== "deezer") return {};
      return deezerDetails(t.sourceId).then(
        ({ bpm, gain, isrc }) => ({ bpm, gain, isrc }),
        () => ({}),
      );
    });
    res.json({ results });
  });

  /** Lite mode (no AI), streamed as server-sent events. */
  app.post("/api/lite", async (req, res) => {
    const parsed = GenerateSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid request" });

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    const emit = (e: GenerateEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    const heartbeat = setInterval(() => !res.writableEnded && res.write(": keep-alive\n\n"), 15_000);
    try {
      await generateLite(parsed.data, emit);
    } catch (err) {
      console.error("[lite]", err);
      emit({ type: "error", message: err instanceof Error ? err.message : "Something went wrong." });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  });

  app.post("/api/youtube/resolve", async (req, res) => {
    const parsed = z.object({ tracks: z.array(Wanted).min(1).max(60) }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid request" });
    res.json({ videoIds: await resolveVideoIds(parsed.data.tracks) });
  });

  app.post("/api/youtube/link", async (req, res) => {
    const parsed = z.object({ videoIds: z.array(z.string().regex(/^[\w-]{11}$/)).min(1).max(50) }).safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid request" });
    try {
      res.json(await anonymousPlaylist(parsed.data.videoIds));
    } catch (err) {
      console.error("[youtube link]", err);
      res.status(502).json({ error: "YouTube didn't create the playlist link." });
    }
  });

  app.use("/api", (_req, res) => void res.status(404).json({ error: "Not found" }));
  return app;
}
