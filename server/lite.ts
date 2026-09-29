/**
 * "Lite" curation: no API key needed. Builds the pool from Deezer's artist
 * radios (which already cluster by sound), ranks songs that several seeds agree
 * on, and derives rough features from Deezer's measured tempo and loudness.
 */
import { clamp } from "../shared/harmony.ts";
import { bestMatch, songKey } from "../shared/match.ts";
import type { GenerateRequest, Palette, PlaylistTrack, Track } from "../shared/types.ts";
import {
  deezerArtistRadio,
  deezerDetails,
  deezerRelatedArtists,
  deezerTrackArtistId,
  mapLimit,
  searchDeezer,
} from "./catalog.ts";

async function deezerIdFor(seed: Track): Promise<string | null> {
  if (seed.source === "deezer") return seed.sourceId;
  const hit = bestMatch(seed, await searchDeezer(`${seed.artist} ${seed.title}`, 5));
  return hit?.sourceId ?? null;
}

export async function withDeezerFeatures<T extends Track>(t: T): Promise<T & { bpm?: number; energy?: number; isrc?: string }> {
  if (t.source !== "deezer") return t;
  try {
    const d = await deezerDetails(t.sourceId);
    // Deezer's gain is replay-gain loudness (≈ -16 quiet … -5 loud): a rough stand-in for energy.
    const energy = d.gain != null ? Math.round(clamp((d.gain + 16) * 7.5, 8, 92)) : undefined;
    return { ...t, bpm: d.bpm && d.bpm > 40 ? Math.round(d.bpm) : undefined, energy, isrc: d.isrc ?? t.isrc };
  } catch {
    return t;
  }
}

/** Deezer's measured tempo is sometimes double or half time; bring everything into the pool's octave. */
function foldTempos<T extends { bpm?: number }>(tracks: T[]): T[] {
  const known = tracks.map((t) => t.bpm).filter((b): b is number => !!b).sort((a, b) => a - b);
  if (known.length < 3) return tracks;
  const median = known[Math.floor(known.length / 2)];
  return tracks.map((t) => {
    if (!t.bpm) return t;
    let b = t.bpm;
    while (b > median * Math.SQRT2) b /= 2;
    while (b < median / Math.SQRT2) b *= 2;
    return { ...t, bpm: Math.round(b) };
  });
}

export async function curateLite(req: GenerateRequest, onFound: (t: PlaylistTrack) => void) {
  const artistIds = (
    await mapLimit(req.seeds, 3, async (s) => {
      try {
        const id = await deezerIdFor(s);
        return id ? await deezerTrackArtistId(id) : null;
      } catch {
        return null;
      }
    })
  ).filter((x): x is string => !!x);

  if (!artistIds.length) throw new Error("Couldn't find the seed artists on Deezer.");

  const radioArtists = new Set(artistIds);
  if (req.wander >= 0.34) {
    const perSeed = req.wander >= 0.67 ? 3 : 1;
    for (const id of artistIds) {
      try {
        (await deezerRelatedArtists(id, perSeed)).forEach((a) => radioArtists.add(a.id));
      } catch {
        /* related artists are a bonus */
      }
    }
  }

  const votes = new Map<string, { track: Track; score: number }>();
  const seedKeys = new Set(req.seeds.map(songKey));
  const radios = await mapLimit([...radioArtists], 3, (id) => deezerArtistRadio(id, 30).catch(() => [] as Track[]));
  radios.forEach((radio, ri) => {
    const fromSeed = ri < artistIds.length ? 1 : 0.6;
    radio.forEach((t, pos) => {
      const key = songKey(t);
      if (seedKeys.has(key)) return;
      const entry = votes.get(key) ?? { track: t, score: 0 };
      entry.score += fromSeed * (1 - pos / 60);
      votes.set(key, entry);
    });
  });

  const newSongs = Math.max(1, req.length - (req.includeSeeds ? req.seeds.length : 0));
  const perArtist = new Map<string, number>();
  req.seeds.forEach((s) => perArtist.set(s.artist.toLowerCase(), (perArtist.get(s.artist.toLowerCase()) ?? 0) + 1));

  const ranked = [...votes.values()].sort((a, b) => b.score - a.score);
  const chosen: Track[] = [];
  for (const { track } of ranked) {
    const a = track.artist.toLowerCase();
    if ((perArtist.get(a) ?? 0) >= 2) continue;
    perArtist.set(a, (perArtist.get(a) ?? 0) + 1);
    chosen.push(track);
    if (chosen.length >= newSongs + 8) break;
  }

  const enriched = await mapLimit(chosen, 4, async (t, i) => {
    const f = await withDeezerFeatures(t);
    if (i < newSongs) onFound(f);
    return f as PlaylistTrack;
  });

  const seedsRaw = await mapLimit(req.seeds, 3, (s) => withDeezerFeatures(s) as Promise<PlaylistTrack>);
  const folded = foldTempos([...seedsRaw, ...enriched]);
  const seeds = folded.slice(0, seedsRaw.length);
  const pool = folded.slice(seedsRaw.length);
  const avgEnergy = folded.reduce((s, t) => s + (t.energy ?? 50), 0) / Math.max(1, folded.length);
  const palette: Palette = avgEnergy > 66 ? "summer" : avgEnergy > 50 ? "meadow" : avgEnergy > 36 ? "sunset" : "rain";

  const lead = req.seeds[0];
  return {
    picks: pool.slice(0, newSongs),
    bench: pool.slice(newSongs),
    seeds,
    vibe: {
      name: `around ${lead.title.toLowerCase().replace(/\s*[([].*$/, "")}`,
      description: `Grown from the radio around ${[...new Set(req.seeds.map((s) => s.artist))].join(", ")}. Lite mode — connect an AI under AI integrations for vibe-aware picks and key-matched transitions.`,
      moods: [],
      palette,
    },
  };
}
