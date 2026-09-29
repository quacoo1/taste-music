/**
 * Grows a playlist in the browser: the AI is called directly with the key
 * stored here, picks are checked against the catalog via Taste's stateless
 * /api/match, and sequencing runs locally. Without an AI (or if it fails),
 * the server's lite mode takes over.
 */
import { clamp, normalizeCamelot, reconcileBpm, sequence } from "../../shared/harmony.ts";
import { normalizeArtist, songKey } from "../../shared/match.ts";
import { PALETTES, type GenerateEvent, type GenerateRequest, type Palette, type Playlist, type PlaylistTrack, type Track } from "../../shared/types.ts";
import { matchPicks, streamLite, trackDetails, type MatchedTrack } from "../lib/api.ts";
import { curate, CuratorIncomplete, describeFailure, type Curation, type Pick } from "./curator.ts";
import type { Estimates } from "./schema.ts";
import { activeProvider, type ResolvedProvider } from "./store.ts";

type Emit = (e: GenerateEvent) => void;

/** 0–100, accepting models that answer on a 0–1 scale. */
const pct = (v?: number) => (v == null || !Number.isFinite(v) ? undefined : Math.round(clamp(v > 0 && v <= 1 ? v * 100 : v, 0, 100)));

function withFeatures<T extends Track>(track: T, est: Estimates, measured?: number): PlaylistTrack {
  return {
    ...track,
    bpm: reconcileBpm(measured, est.bpm),
    camelot: normalizeCamelot(est.camelot),
    energy: pct(est.energy),
    valence: pct(est.valence),
  };
}

/** Queues picks and resolves them in small batches, a couple of requests at a time. */
function createMatcher(signal: AbortSignal) {
  type Job = { pick: Pick; resolve: (t: MatchedTrack | null) => void };
  const queue: Job[] = [];
  let inFlight = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    while (queue.length && inFlight < 2) {
      const batch = queue.splice(0, 6);
      inFlight++;
      matchPicks(
        batch.map((j) => j.pick),
        signal,
      )
        .then(
          (results) => batch.forEach((j, i) => j.resolve(results[i] ?? null)),
          () => batch.forEach((j) => j.resolve(null)),
        )
        .finally(() => {
          inFlight--;
          if (queue.length) schedule(0);
        });
    }
  };
  const schedule = (ms: number) => {
    if (!timer) timer = setTimeout(flush, ms);
  };

  return (pick: Pick) =>
    new Promise<MatchedTrack | null>((resolve) => {
      queue.push({ pick, resolve });
      schedule(queue.length >= 6 ? 0 : 250);
    });
}

export async function grow(req: GenerateRequest, emit: Emit, signal: AbortSignal): Promise<Playlist> {
  const provider = activeProvider();
  if (!provider) return streamLite(req, emit, signal);
  return growWithAi(req, provider, emit, signal);
}

async function growWithAi(req: GenerateRequest, provider: ResolvedProvider, emit: Emit, signal: AbortSignal): Promise<Playlist> {
  const newSongs = Math.max(1, req.length - (req.includeSeeds ? req.seeds.length : 0));
  emit({ type: "status", stage: "listening", message: "Listening to your seeds" });

  const match = createMatcher(signal);
  // Seed details don't depend on the AI, so fetch them while it thinks.
  const seedDetails = trackDetails(req.seeds, signal).catch(() => req.seeds.map(() => ({}) as { bpm?: number; gain?: number; isrc?: string }));
  const seenKeys = new Set(req.seeds.map(songKey));
  const resolvedKeys = new Set(req.seeds.map(songKey));
  const seenIds = new Set(req.seeds.map((s) => s.id));
  const verified: { rank: number; track: PlaylistTrack }[] = [];
  const pending: Promise<void>[] = [];
  let rank = 0;
  let abandoned = false;

  const onPick = (p: Pick) => {
    const key = songKey(p);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    const myRank = rank++;
    pending.push(
      match(p).then((found) => {
        if (!found || abandoned || signal.aborted) return;
        if (seenIds.has(found.id) || resolvedKeys.has(songKey(found))) return;
        seenIds.add(found.id);
        resolvedKeys.add(songKey(found));
        const { measuredBpm, ...track } = found;
        const full: PlaylistTrack = { ...withFeatures(track, p, measuredBpm), why: p.why };
        verified.push({ rank: myRank, track: full });
        emit({ type: "found", track: full, count: verified.length, target: newSongs });
      }),
    );
  };

  let curation: Curation | null = null;
  try {
    curation = await curate(req, provider, { onPick, onWriting: () => emit({ type: "status", stage: "curating", message: "Picking kindred songs" }) }, signal);
    curation.tracks.forEach(onPick); // anything the stream parser missed
  } catch (err) {
    if (signal.aborted) throw err;
    if (err instanceof CuratorIncomplete && err.picks >= Math.min(8, newSongs)) {
      emit({ type: "notice", message: "The curator's answer was cut short, so this playlist uses the songs it had picked so far." });
    } else {
      abandoned = true;
      const reason = err instanceof CuratorIncomplete ? "its answer couldn't be read" : describeFailure(err, provider);
      console.warn(`[grow] ${provider.preset.name} (${provider.model}) failed:`, err);
      emit({ type: "notice", message: `${provider.preset.name} couldn't curate this one (${reason}), so it grew in lite mode.` });
      emit({ type: "restart" });
      return streamLite(req, emit, signal);
    }
  }

  emit({ type: "status", stage: "verifying", message: "Checking every song exists" });
  await Promise.all(pending);
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");

  // Best fit first, at most two songs per artist (seeds included); extras go to the bench.
  const perArtist = new Map<string, number>();
  const artistKey = (t: Track) => normalizeArtist(t.artist).split(/\s*[,&]\s*/)[0];
  if (req.includeSeeds) req.seeds.forEach((s) => perArtist.set(artistKey(s), (perArtist.get(artistKey(s)) ?? 0) + 1));
  const within: PlaylistTrack[] = [];
  const overflow: PlaylistTrack[] = [];
  for (const t of verified.sort((a, b) => a.rank - b.rank).map((v) => v.track)) {
    const n = perArtist.get(artistKey(t)) ?? 0;
    if (n >= 2) overflow.push(t);
    else {
      perArtist.set(artistKey(t), n + 1);
      within.push(t);
    }
  }
  const ordered = [...within, ...overflow];
  if (ordered.length < Math.min(5, newSongs)) {
    throw new Error("Couldn't find enough of the curator's picks in the catalog. Try again or change the seeds.");
  }
  if (ordered.length < newSongs) {
    emit({ type: "notice", message: `Found ${ordered.length} of ${newSongs} songs — a few picks weren't in the catalog.` });
  }

  const details = await seedDetails;
  const seeds: PlaylistTrack[] = req.seeds.map((s, i) => {
    const est = curation?.seeds[i];
    const d = details[i] ?? {};
    const base =
      est && (est.bpm != null || est.camelot || est.energy != null)
        ? withFeatures(s, est, d.bpm)
        : { ...s, bpm: d.bpm, energy: d.gain != null ? Math.round(clamp((d.gain + 16) * 7.5, 8, 92)) : undefined };
    return { ...base, isrc: d.isrc ?? s.isrc, seed: true };
  });

  emit({ type: "status", stage: "sequencing", message: "Ordering for smooth transitions" });
  const picks = ordered.slice(0, newSongs);
  const pool = req.includeSeeds ? [...seeds, ...picks] : picks;
  const palette = curation?.vibe.palette ?? "";

  const playlist: Playlist = {
    id: crypto.randomUUID(),
    name: curation?.vibe.name?.trim().slice(0, 60) || `after ${req.seeds[0].title.toLowerCase()}`,
    description: curation?.vibe.description ?? "",
    moods: curation?.vibe.moods.slice(0, 5) ?? [],
    palette: (PALETTES as readonly string[]).includes(palette) ? (palette as Palette) : "meadow",
    arc: req.arc,
    tracks: sequence(pool, req.arc),
    bench: ordered.slice(newSongs),
    mode: "ai",
    curator: { provider: provider.preset.id, name: provider.preset.name, model: provider.model },
    createdAt: Date.now(),
  };
  emit({ type: "done", playlist });
  return playlist;
}
