/**
 * YouTube Music has no public search API, so we use the same unauthenticated
 * endpoint the music.youtube.com web client uses, restricted to "Songs".
 * Matching happens here so the (quota-limited) YouTube Data API is only used
 * for writing the playlist — never for searching.
 */
import { bestMatch, type Matchable } from "../shared/match.ts";
import { mapLimit } from "./catalog.ts";

const SONGS_FILTER = "EgWKAQIIAWoKEAoQAxAEEAkQBQ%3D%3D";
const CLIENT = { clientName: "WEB_REMIX", clientVersion: "1.20250101.01.00", hl: "en", gl: "US" };

interface YtSong extends Matchable {
  videoId: string;
}

function collect(o: any, out: any[]) {
  if (!o || typeof o !== "object") return;
  if (Array.isArray(o)) return o.forEach((v) => collect(v, out));
  if (o.musicResponsiveListItemRenderer) return void out.push(o.musicResponsiveListItemRenderer);
  for (const v of Object.values(o)) collect(v, out);
}

function runsText(col: any): string {
  return (col?.musicResponsiveListItemFlexColumnRenderer?.text?.runs ?? []).map((r: any) => r.text).join("");
}

function parseDuration(s: string | undefined) {
  const m = s?.match(/^(?:(\d+):)?(\d+):(\d\d)$/);
  if (!m) return undefined;
  return ((Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000;
}

async function searchSongs(query: string): Promise<YtSong[]> {
  const res = await fetch(`https://music.youtube.com/youtubei/v1/search?prettyPrint=false`, {
    method: "POST",
    signal: AbortSignal.timeout(12_000),
    headers: {
      "Content-Type": "application/json",
      Origin: "https://music.youtube.com",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36",
    },
    body: JSON.stringify({ context: { client: CLIENT }, query, params: decodeURIComponent(SONGS_FILTER) }),
  });
  if (!res.ok) throw new Error(`YouTube Music search responded ${res.status}`);
  const items: any[] = [];
  collect(await res.json(), items);
  return items.flatMap((r) => {
    const videoId = r.playlistItemData?.videoId;
    if (!videoId) return [];
    const parts = runsText(r.flexColumns?.[1]).split(" • ");
    return [{ videoId, title: runsText(r.flexColumns?.[0]), artist: parts[0] ?? "", durationMs: parseDuration(parts.at(-1)) }];
  });
}

export async function resolveVideoIds(tracks: Matchable[]): Promise<(string | null)[]> {
  return mapLimit(tracks, 4, async (t) => {
    try {
      const results = await searchSongs(`${t.artist} ${t.title}`);
      return bestMatch(t, results, 0.62)?.videoId ?? null;
    } catch (err) {
      console.warn("[youtube] search failed:", (err as Error).message);
      return null;
    }
  });
}

/**
 * youtube.com/watch_videos turns up to 50 video ids into an anonymous playlist
 * the listener can play and save — no sign-in or API key needed.
 */
export async function anonymousPlaylist(videoIds: string[]) {
  const ids = videoIds.slice(0, 50);
  const res = await fetch(`https://www.youtube.com/watch_videos?video_ids=${ids.join(",")}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const location = res.headers.get("location");
  const list = location ? new URL(location, "https://www.youtube.com").searchParams.get("list") : null;
  if (!list) throw new Error("YouTube didn't return a playlist");
  return {
    list,
    youtubeUrl: `https://www.youtube.com/watch?v=${ids[0]}&list=${list}`,
    musicUrl: `https://music.youtube.com/watch?v=${ids[0]}&list=${list}`,
  };
}
