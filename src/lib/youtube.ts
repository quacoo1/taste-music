import type { Playlist, PlaylistTrack } from "../../shared/types.ts";
import { resolveYoutube, youtubeLink } from "./api.ts";

/* ------------------------------------------------------------------ */
/* Matching (server-side search, cached per playlist)                  */
/* ------------------------------------------------------------------ */

const resolved = new Map<string, Promise<(string | null)[]>>();

export function videoIdsFor(playlist: Playlist): Promise<(string | null)[]> {
  const key = `${playlist.id}:${playlist.tracks.map((t) => t.id).join(",")}`;
  if (!resolved.has(key)) {
    const p = resolveYoutube(playlist.tracks);
    p.catch(() => resolved.delete(key));
    resolved.set(key, p);
  }
  return resolved.get(key)!;
}

export interface QuickLink {
  musicUrl: string;
  youtubeUrl: string;
  found: number;
  missing: PlaylistTrack[];
}

/** No sign-in: an anonymous YouTube playlist built from the matched videos. */
export async function quickLink(playlist: Playlist): Promise<QuickLink> {
  const ids = await videoIdsFor(playlist);
  const found = ids.filter((x): x is string => !!x);
  if (!found.length) throw new Error("Couldn't find these songs on YouTube Music.");
  const link = await youtubeLink(found);
  return { ...link, found: found.length, missing: playlist.tracks.filter((_, i) => !ids[i]) };
}

/* ------------------------------------------------------------------ */
/* Save to library (Google Identity Services + YouTube Data API)       */
/* ------------------------------------------------------------------ */

declare global {
  interface Window {
    google?: any;
  }
}

let gisLoading: Promise<void> | null = null;

export function loadGoogleIdentity(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gisLoading = null;
      reject(new Error("Couldn't load Google sign-in."));
    };
    document.head.appendChild(s);
  });
  return gisLoading;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Must be called from a click handler (after loadGoogleIdentity resolved) so the popup isn't blocked. */
export function requestGoogleToken(clientId: string): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return Promise.resolve(cachedToken.value);
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) return reject(new Error("Google sign-in isn't ready yet — try again."));
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/youtube",
      callback: (res: any) => {
        if (res.error) return reject(new Error(res.error === "access_denied" ? "Google access was declined." : res.error_description ?? res.error));
        cachedToken = { value: res.access_token, expiresAt: Date.now() + (Number(res.expires_in) - 60) * 1000 };
        resolve(res.access_token);
      },
      error_callback: (err: any) =>
        reject(new Error(err?.type === "popup_closed" ? "The sign-in window was closed." : "Google sign-in failed.")),
    });
    client.requestAccessToken();
  });
}

async function yt(token: string, path: string, body: unknown) {
  const res = await fetch(`https://www.googleapis.com/youtube/v3${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const reason = data?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded") throw new Error("YouTube's daily API quota for this app is used up. Try again tomorrow, or use the no-sign-in link.");
    if (reason === "youtubeSignupRequired") throw new Error("This Google account doesn't have a YouTube channel yet.");
    throw new Error(data?.error?.message ?? `YouTube error ${res.status}`);
  }
  return data;
}

export async function saveToYoutubeLibrary(
  playlist: Playlist,
  token: string,
  onProgress: (p: { phase: "match" | "create" | "add"; done?: number; total?: number }) => void,
) {
  onProgress({ phase: "match" });
  const ids = await videoIdsFor(playlist);
  const found = ids.filter((x): x is string => !!x);
  if (!found.length) throw new Error("Couldn't find these songs on YouTube Music.");

  onProgress({ phase: "create" });
  const created = await yt(token, "/playlists?part=snippet,status", {
    snippet: { title: playlist.name, description: [playlist.description, "Grown with taste."].filter(Boolean).join(" ").slice(0, 4900) },
    status: { privacyStatus: "private" },
  });

  // Sequential inserts keep the running order intact.
  for (let i = 0; i < found.length; i++) {
    onProgress({ phase: "add", done: i, total: found.length });
    await yt(token, "/playlistItems?part=snippet", {
      snippet: { playlistId: created.id, resourceId: { kind: "youtube#video", videoId: found[i] } },
    });
  }
  onProgress({ phase: "add", done: found.length, total: found.length });

  return {
    url: `https://music.youtube.com/playlist?list=${created.id}`,
    added: found.length,
    missing: playlist.tracks.filter((_, i) => !ids[i]),
  };
}
