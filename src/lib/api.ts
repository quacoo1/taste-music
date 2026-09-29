import type { AppConfig, GenerateEvent, GenerateRequest, Playlist, Track } from "../../shared/types.ts";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export const getConfig = () => fetch("/api/config").then((r) => json<AppConfig>(r));

export async function searchTracks(q: string, signal?: AbortSignal) {
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal });
  return (await json<{ tracks: Track[] }>(res)).tracks;
}

export function previewSrc(t: Track) {
  if (t.source === "deezer") return `/api/preview/deezer/${t.sourceId}`;
  return t.previewUrl ?? null;
}

/** Lite mode runs on the server (it needs Deezer's radio endpoints). Streams events, resolves with the playlist. */
export async function streamLite(req: GenerateRequest, onEvent: (e: GenerateEvent) => void, signal: AbortSignal): Promise<Playlist> {
  const res = await fetch("/api/lite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok || !res.body) await json(res);

  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let result: Playlist | null = null;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let split: number;
    while ((split = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      const data = chunk
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trimStart())
        .join("\n");
      if (!data) continue;
      const event = JSON.parse(data) as GenerateEvent;
      if (event.type === "error") throw new Error(event.message);
      if (event.type === "done") result = event.playlist;
      onEvent(event);
    }
  }
  if (!result) throw new Error("The connection closed before the playlist was ready.");
  return result;
}

export async function resolveYoutube(tracks: { title: string; artist: string; durationMs?: number }[]) {
  const res = await fetch("/api/youtube/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tracks: tracks.map(({ title, artist, durationMs }) => ({ title, artist, durationMs })) }),
  });
  return (await json<{ videoIds: (string | null)[] }>(res)).videoIds;
}

export async function youtubeLink(videoIds: string[]) {
  const res = await fetch("/api/youtube/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoIds }),
  });
  return json<{ youtubeUrl: string; musicUrl: string; list: string }>(res);
}

export interface MatchedTrack extends Track {
  /** Deezer's measured tempo, when it has one. */
  measuredBpm?: number;
}

/** Resolve AI suggestions to real recordings (null = not found). */
export async function matchPicks(picks: { title: string; artist: string }[], signal?: AbortSignal) {
  const res = await fetch("/api/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ picks: picks.map(({ title, artist }) => ({ title, artist })) }),
    signal,
  });
  return (await json<{ results: (MatchedTrack | null)[] }>(res)).results;
}

/** Measured tempo, loudness and ISRC for known tracks (seeds). */
export async function trackDetails(tracks: Track[], signal?: AbortSignal) {
  const res = await fetch("/api/details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tracks }),
    signal,
  });
  return (await json<{ results: { bpm?: number; gain?: number; isrc?: string }[] }>(res)).results;
}
