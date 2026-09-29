import { bestMatch, type Matchable } from "../shared/match.ts";
import type { Track } from "../shared/types.ts";

/* ------------------------------------------------------------------ */
/* Small utilities                                                     */
/* ------------------------------------------------------------------ */

class TtlCache<V> {
  private map = new Map<string, { v: V; at: number }>();
  constructor(private ttlMs: number, private max = 2000) {}
  get(k: string) {
    const hit = this.map.get(k);
    if (!hit) return undefined;
    if (Date.now() - hit.at > this.ttlMs) {
      this.map.delete(k);
      return undefined;
    }
    return hit.v;
  }
  set(k: string, v: V) {
    if (this.map.size >= this.max) this.map.delete(this.map.keys().next().value!);
    this.map.set(k, { v, at: Date.now() });
  }
}

/** Spaces request starts at least `gapMs` apart (Deezer allows ~50 requests / 5s). */
function throttle(gapMs: number) {
  let next = 0;
  return async () => {
    const now = Date.now();
    const at = Math.max(now, next);
    next = at + gapMs;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
  };
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

async function getJson(url: string, timeoutMs = 10_000): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs), headers: { "User-Agent": "taste-music/0.1" } });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/* Deezer                                                              */
/* ------------------------------------------------------------------ */

const deezerGate = throttle(115);
const cache = new TtlCache<any>(10 * 60_000);

async function deezer(path: string): Promise<any> {
  const url = `https://api.deezer.com${path}`;
  const hit = cache.get(url);
  if (hit) return hit;
  for (let attempt = 0; attempt < 3; attempt++) {
    await deezerGate();
    const data = await getJson(url);
    // Deezer reports quota errors in a 200 body
    if (data?.error) {
      if (data.error.code === 4 && attempt < 2) {
        await new Promise((r) => setTimeout(r, 1200));
        continue;
      }
      throw new Error(`Deezer: ${data.error.message ?? "error"}`);
    }
    cache.set(url, data);
    return data;
  }
}

function fromDeezer(d: any): Track {
  return {
    id: `deezer:${d.id}`,
    source: "deezer",
    sourceId: String(d.id),
    title: d.title,
    artist: d.artist?.name ?? "",
    album: d.album?.title,
    artwork: d.album?.cover_big ?? d.album?.cover_medium,
    artworkSmall: d.album?.cover_medium ?? d.album?.cover_small,
    durationMs: d.duration ? d.duration * 1000 : undefined,
    explicit: Boolean(d.explicit_lyrics),
    isrc: d.isrc,
  };
}

export async function searchDeezer(q: string, limit = 10): Promise<Track[]> {
  const data = await deezer(`/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  return (data?.data ?? []).filter((d: any) => d.readable !== false).map(fromDeezer);
}

export async function deezerDetails(id: string): Promise<{ bpm?: number; gain?: number; isrc?: string; preview?: string }> {
  const d = await deezer(`/track/${id}`);
  return { bpm: d.bpm || undefined, gain: d.gain, isrc: d.isrc, preview: d.preview };
}

/** Fresh signed preview URL — Deezer preview links expire after a few minutes. */
export async function deezerPreview(id: string): Promise<string | null> {
  await deezerGate();
  const d = await getJson(`https://api.deezer.com/track/${encodeURIComponent(id)}`);
  return d?.preview || null;
}

export async function deezerArtistRadio(artistId: string, limit = 25): Promise<Track[]> {
  const data = await deezer(`/artist/${artistId}/radio?limit=${limit}`);
  return (data?.data ?? []).map(fromDeezer);
}

export async function deezerRelatedArtists(artistId: string, limit = 8): Promise<{ id: string; name: string }[]> {
  const data = await deezer(`/artist/${artistId}/related?limit=${limit}`);
  return (data?.data ?? []).map((a: any) => ({ id: String(a.id), name: a.name }));
}

export async function deezerTrackArtistId(trackId: string): Promise<string | null> {
  const d = await deezer(`/track/${trackId}`);
  return d?.artist?.id ? String(d.artist.id) : null;
}

/* ------------------------------------------------------------------ */
/* iTunes (fallback catalog)                                           */
/* ------------------------------------------------------------------ */

function fromItunes(d: any): Track {
  const art = (d.artworkUrl100 as string | undefined)?.replace("100x100bb", "600x600bb");
  return {
    id: `itunes:${d.trackId}`,
    source: "itunes",
    sourceId: String(d.trackId),
    title: d.trackName,
    artist: d.artistName,
    album: d.collectionName,
    artwork: art,
    artworkSmall: (d.artworkUrl100 as string | undefined)?.replace("100x100bb", "200x200bb"),
    previewUrl: d.previewUrl,
    durationMs: d.trackTimeMillis,
    explicit: d.trackExplicitness === "explicit",
  };
}

export async function searchItunes(q: string, limit = 10): Promise<Track[]> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=${limit}`;
  const hit = cache.get(url);
  if (hit) return hit;
  const data = await getJson(url);
  const tracks = (data?.results ?? []).filter((d: any) => d.kind === "song").map(fromItunes);
  cache.set(url, tracks);
  return tracks;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export async function searchTracks(q: string, limit = 10): Promise<Track[]> {
  try {
    const res = await searchDeezer(q, limit);
    if (res.length) return res;
  } catch (err) {
    console.warn("[catalog] deezer search failed, trying iTunes:", (err as Error).message);
  }
  return searchItunes(q, limit);
}

const stripFeat = (s: string) => s.replace(/\s*[([]?\b(feat|ft|featuring)\.?\s[^)\]]*[)\]]?/gi, "").trim();

/** Resolve a curator's suggestion to a real recording, or null if it can't be found. */
export async function findTrack(wanted: Matchable): Promise<Track | null> {
  const q = `${stripFeat(wanted.artist)} ${stripFeat(wanted.title)}`;
  try {
    const hit = bestMatch(wanted, await searchDeezer(q, 8));
    if (hit) return hit;
  } catch (err) {
    console.warn("[catalog] deezer lookup failed:", (err as Error).message);
  }
  try {
    return bestMatch(wanted, await searchItunes(q, 8));
  } catch {
    return null;
  }
}
