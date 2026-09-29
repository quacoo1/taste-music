/**
 * Lite mode: no AI involved, so it runs here on the server (it needs Deezer's
 * radio endpoints, which browsers can't call directly). AI curation runs in
 * the browser — see src/ai/grow.ts.
 */
import { randomUUID } from "node:crypto";
import { sequence } from "../shared/harmony.ts";
import type { GenerateEvent, GenerateRequest, Palette, Playlist } from "../shared/types.ts";
import { curateLite } from "./lite.ts";

type Emit = (e: GenerateEvent) => void;

export async function generateLite(req: GenerateRequest, emit: Emit) {
  const newSongs = Math.max(1, req.length - (req.includeSeeds ? req.seeds.length : 0));
  emit({ type: "status", stage: "listening", message: "Listening to your seeds" });
  emit({ type: "status", stage: "curating", message: "Following the seeds' radio" });
  let count = 0;
  const lite = await curateLite(req, (track) => emit({ type: "found", track, count: ++count, target: newSongs }));
  emit({ type: "status", stage: "sequencing", message: "Ordering for smooth transitions" });
  const seeds = lite.seeds.map((s) => ({ ...s, seed: true }));
  const pool = req.includeSeeds ? [...seeds, ...lite.picks] : lite.picks;
  const playlist: Playlist = {
    id: randomUUID(),
    name: lite.vibe.name,
    description: lite.vibe.description,
    moods: lite.vibe.moods,
    palette: lite.vibe.palette as Palette,
    arc: req.arc,
    tracks: sequence(pool, req.arc),
    bench: lite.bench,
    mode: "lite",
    createdAt: Date.now(),
  };
  emit({ type: "done", playlist });
}
