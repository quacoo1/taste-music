import { bestMatch } from "../../shared/match.ts";
import type { Playlist, PlaylistTrack } from "../../shared/types.ts";
import { OAUTH_RESUME_KEY, openAuthPopup, pkceChallenge, randomString } from "./oauth.ts";
import { load, remove, save } from "./storage.ts";

const SCOPES = "playlist-modify-private playlist-modify-public ugc-image-upload";
const TOKEN_KEY = "taste:spotify-token";
const PKCE_KEY = "taste:spotify-pkce";

interface Token {
  access_token: string;
  refresh_token?: string;
  expires_at: number;
}

export const spotifyRedirectUri = () => `${window.location.origin}/callback`;

async function tokenRequest(clientId: string, body: Record<string, string>): Promise<Token> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, ...body }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description ?? "Spotify sign-in failed.");
  const token: Token = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? body.refresh_token,
    expires_at: Date.now() + (data.expires_in - 60) * 1000,
  };
  save(TOKEN_KEY, token);
  return token;
}

/** Exchanges the code from /callback. Exported for the full-page-redirect fallback. */
export async function completeSpotifyAuth(clientId: string, params: URLSearchParams): Promise<Token> {
  const pkce = load<{ verifier: string; state: string } | null>(PKCE_KEY, null);
  remove(PKCE_KEY);
  if (params.get("error")) throw new Error(params.get("error") === "access_denied" ? "Spotify access was declined." : `Spotify: ${params.get("error")}`);
  if (!pkce || params.get("state") !== pkce.state) throw new Error("Spotify sign-in expired — please try again.");
  return tokenRequest(clientId, {
    grant_type: "authorization_code",
    code: params.get("code") ?? "",
    redirect_uri: spotifyRedirectUri(),
    code_verifier: pkce.verifier,
  });
}

async function getToken(clientId: string, resumePlaylistId: string): Promise<Token> {
  const saved = load<Token | null>(TOKEN_KEY, null);
  if (saved && saved.expires_at > Date.now()) return saved;
  if (saved?.refresh_token) {
    try {
      return await tokenRequest(clientId, { grant_type: "refresh_token", refresh_token: saved.refresh_token });
    } catch {
      remove(TOKEN_KEY);
    }
  }
  const verifier = randomString(48);
  const state = randomString(12);
  save(PKCE_KEY, { verifier, state });
  save(OAUTH_RESUME_KEY, { provider: "spotify", playlistId: resumePlaylistId });
  const url =
    "https://accounts.spotify.com/authorize?" +
    new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      scope: SCOPES,
      redirect_uri: spotifyRedirectUri(),
      code_challenge_method: "S256",
      code_challenge: await pkceChallenge(verifier),
      state,
    });
  try {
    return await completeSpotifyAuth(clientId, await openAuthPopup(url));
  } finally {
    remove(OAUTH_RESUME_KEY);
  }
}

async function api(token: Token, path: string, init: RequestInit = {}, attempt = 0): Promise<any> {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token.access_token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (res.status === 429 && attempt < 4) {
    const wait = Number(res.headers.get("Retry-After") ?? 1);
    await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000));
    return api(token, path, init, attempt + 1);
  }
  if (res.status === 401) {
    remove(TOKEN_KEY);
    throw new Error("Spotify session expired — try again to reconnect.");
  }
  if (res.status === 403) {
    throw new Error(
      "Spotify refused the request. Apps in Development Mode only work for accounts added under User Management in the Spotify dashboard.",
    );
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error?.message ?? `Spotify error ${res.status}`);
  }
  return res.status === 204 || res.headers.get("content-length") === "0" ? null : res.json().catch(() => null);
}

const clean = (s: string) => s.replace(/"/g, "").replace(/\s*[([].*?[)\]]/g, "").trim();

async function findUri(token: Token, t: PlaylistTrack): Promise<string | null> {
  const toMatchable = (r: any) => ({
    uri: r.uri as string,
    title: r.name as string,
    artist: (r.artists ?? []).map((a: any) => a.name).join(", "),
    durationMs: r.duration_ms as number,
  });
  if (t.isrc) {
    const res = await api(token, `/search?type=track&limit=5&q=${encodeURIComponent(`isrc:${t.isrc}`)}`);
    const hit = bestMatch(t, ((res?.tracks?.items ?? []) as any[]).map(toMatchable), 0.6);
    if (hit) return hit.uri;
  }
  const q = `track:"${clean(t.title)}" artist:"${clean(t.artist)}"`;
  let items: any[] = (await api(token, `/search?type=track&limit=10&q=${encodeURIComponent(q)}`))?.tracks?.items ?? [];
  if (!items.length) {
    items = (await api(token, `/search?type=track&limit=10&q=${encodeURIComponent(`${clean(t.artist)} ${clean(t.title)}`)}`))?.tracks?.items ?? [];
  }
  return bestMatch(t, items.map(toMatchable))?.uri ?? null;
}

export interface ExportProgress {
  phase: "auth" | "match" | "create" | "add" | "cover";
  done?: number;
  total?: number;
}

export interface ExportResult {
  url: string;
  added: number;
  missing: PlaylistTrack[];
}

export async function exportToSpotify(
  playlist: Playlist,
  clientId: string,
  coverJpeg: (() => Promise<string | null>) | null,
  onProgress: (p: ExportProgress) => void,
): Promise<ExportResult> {
  onProgress({ phase: "auth" });
  const token = await getToken(clientId, playlist.id);

  const total = playlist.tracks.length;
  const uris: (string | null)[] = new Array(total).fill(null);
  let done = 0;
  onProgress({ phase: "match", done, total });
  let cursor = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (cursor < total) {
        const i = cursor++;
        uris[i] = await findUri(token, playlist.tracks[i]).catch(() => null);
        onProgress({ phase: "match", done: ++done, total });
      }
    }),
  );
  const found = uris.filter((u): u is string => !!u);
  if (!found.length) throw new Error("None of the songs could be found on Spotify.");

  onProgress({ phase: "create" });
  const description = [playlist.description, "Grown with taste."].filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 290);
  const created = await api(token, "/me/playlists", {
    method: "POST",
    body: JSON.stringify({ name: playlist.name, description, public: false }),
  });

  onProgress({ phase: "add", done: 0, total: found.length });
  for (let i = 0; i < found.length; i += 100) {
    await api(token, `/playlists/${created.id}/items`, { method: "POST", body: JSON.stringify({ uris: found.slice(i, i + 100) }) });
    onProgress({ phase: "add", done: Math.min(found.length, i + 100), total: found.length });
  }

  if (coverJpeg) {
    onProgress({ phase: "cover" });
    try {
      const b64 = await coverJpeg();
      if (b64) await api(token, `/playlists/${created.id}/images`, { method: "PUT", body: b64, headers: { "Content-Type": "image/jpeg" } });
    } catch (err) {
      console.warn("Cover upload skipped:", err);
    }
  }

  return {
    url: created.external_urls?.spotify ?? `https://open.spotify.com/playlist/${created.id}`,
    added: found.length,
    missing: playlist.tracks.filter((_, i) => !uris[i]),
  };
}
