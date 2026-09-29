import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AppConfig, Playlist, PlaylistTrack } from "../../shared/types.ts";
import { clock } from "../lib/format.ts";
import { OAUTH_RESUME_KEY } from "../lib/oauth.ts";
import { completeSpotifyAuth, exportToSpotify, type ExportProgress } from "../lib/spotify.ts";
import { load, remove } from "../lib/storage.ts";
import { loadGoogleIdentity, quickLink, requestGoogleToken, saveToYoutubeLibrary } from "../lib/youtube.ts";
import { CheckIcon, CopyIcon, DownloadIcon, ExternalIcon, SpotifyMark, YouTubeMusicMark } from "./Icons.tsx";
import type { SetupTopic } from "./SetupSheet.tsx";

type Job =
  | { status: "idle" }
  | { status: "busy"; label: string; pct?: number }
  | { status: "done"; url: string; label: string; added: number; missing: PlaylistTrack[]; alt?: { url: string; label: string } }
  | { status: "error"; message: string };

const idle: Job = { status: "idle" };

interface Props {
  playlist: Playlist;
  config: AppConfig | null;
  cover: () => Promise<string | null>;
  onSetup: (t: SetupTopic) => void;
}

export function ExportPanel({ playlist, config, cover, onSetup }: Props) {
  const [spotify, setSpotify] = useState<Job>(idle);
  const [ytQuick, setYtQuick] = useState<Job>(idle);
  const [ytSave, setYtSave] = useState<Job>(idle);
  const [copied, setCopied] = useState(false);
  const signature = `${playlist.id}:${playlist.tracks.map((t) => t.id).join(",")}`;
  const resumed = useRef(false);

  // Edits to the playlist invalidate earlier exports.
  useEffect(() => {
    setSpotify(idle);
    setYtQuick(idle);
    setYtSave(idle);
  }, [signature]);

  useEffect(() => {
    if (config?.googleClientId) loadGoogleIdentity().catch(() => {});
  }, [config?.googleClientId]);

  const runSpotify = async () => {
    if (!config?.spotifyClientId) return onSetup("spotify");
    const labels: Record<ExportProgress["phase"], string> = {
      auth: "Connecting to Spotify…",
      match: "Finding songs",
      create: "Creating playlist…",
      add: "Adding songs",
      cover: "Painting the cover…",
    };
    try {
      const result = await exportToSpotify(playlist, config.spotifyClientId, cover, (p) =>
        setSpotify({
          status: "busy",
          label: p.total ? `${labels[p.phase]} ${p.done}/${p.total}` : labels[p.phase],
          pct: p.total ? ((p.done ?? 0) / p.total) * 100 : undefined,
        }),
      );
      setSpotify({ status: "done", url: result.url, label: "Open in Spotify", added: result.added, missing: result.missing });
    } catch (err) {
      setSpotify({ status: "error", message: (err as Error).message });
    }
  };

  // Came back from a full-page Spotify redirect (popup was blocked)
  useEffect(() => {
    if (resumed.current || !config?.spotifyClientId) return;
    const pending = load<{ provider: string; playlistId: string } | null>(OAUTH_RESUME_KEY, null);
    let search: string | null = null;
    try {
      search = sessionStorage.getItem("taste:oauth-params");
    } catch {
      /* ignore */
    }
    if (!pending || !search || pending.playlistId !== playlist.id) return;
    resumed.current = true;
    remove(OAUTH_RESUME_KEY);
    try {
      sessionStorage.removeItem("taste:oauth-params");
    } catch {
      /* ignore */
    }
    setSpotify({ status: "busy", label: "Connecting to Spotify…" });
    completeSpotifyAuth(config.spotifyClientId, new URLSearchParams(search))
      .then(() => runSpotify())
      .catch((err) => setSpotify({ status: "error", message: (err as Error).message }));
  }, [config?.spotifyClientId, playlist.id]);

  const runQuick = async () => {
    setYtQuick({ status: "busy", label: "Finding songs on YouTube Music…" });
    try {
      const r = await quickLink(playlist);
      setYtQuick({ status: "done", url: r.musicUrl, label: "Open in YouTube Music", added: r.found, missing: r.missing, alt: { url: r.youtubeUrl, label: "YouTube" } });
    } catch (err) {
      setYtQuick({ status: "error", message: (err as Error).message });
    }
  };

  const runSave = () => {
    if (!config?.googleClientId) return onSetup("google");
    // Request the token synchronously inside the click so the popup isn't blocked.
    requestGoogleToken(config.googleClientId)
      .then(async (token) => {
        const r = await saveToYoutubeLibrary(playlist, token, (p) =>
          setYtSave({
            status: "busy",
            label: p.phase === "match" ? "Finding songs…" : p.phase === "create" ? "Creating playlist…" : `Adding songs ${p.done}/${p.total}`,
            pct: p.total ? ((p.done ?? 0) / p.total) * 100 : undefined,
          }),
        );
        setYtSave({ status: "done", url: r.url, label: "Open in your library", added: r.added, missing: r.missing });
      })
      .catch((err) => setYtSave({ status: "error", message: (err as Error).message }));
    setYtSave({ status: "busy", label: "Waiting for Google sign-in…" });
  };

  const copyList = () => {
    const text = playlist.tracks.map((t, i) => `${i + 1}. ${t.artist} — ${t.title}`).join("\n");
    navigator.clipboard?.writeText(`${playlist.name}\n\n${text}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  const downloadCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["#", "Title", "Artist", "Album", "BPM", "Key", "Energy", "Duration", "ISRC"],
      ...playlist.tracks.map((t, i) => [i + 1, t.title, t.artist, t.album, t.bpm ? Math.round(t.bpm) : "", t.camelot, t.energy, t.durationMs ? clock(t.durationMs / 1000) : "", t.isrc]),
    ];
    const blob = new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${playlist.name.replace(/[^\w\- ]+/g, "").trim() || "playlist"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <section className="export" aria-labelledby="export-title">
      <div className="section-head">
        <h2 id="export-title">Take it with you</h2>
        <p className="muted">Songs are matched on each service by title, artist and length, in this exact order. For the smoothest hand-offs, switch on Crossfade in your player's playback settings.</p>
      </div>
      <div className="export-grid">
        <div className="export-card">
          <div className="export-brand">
            <SpotifyMark />
            <div>
              <h3>Spotify</h3>
              <p className="muted small">A private playlist in your library, with this cover.</p>
            </div>
          </div>
          <JobView
            job={spotify}
            action={
              <button className="btn dark" onClick={runSpotify}>
                {config?.spotifyClientId ? "Save to Spotify" : "Set up Spotify"}
              </button>
            }
            onRetry={runSpotify}
          />
        </div>

        <div className="export-card">
          <div className="export-brand">
            <YouTubeMusicMark />
            <div>
              <h3>YouTube Music</h3>
              <p className="muted small">Opens as a queue in this order — tap Save there to keep it.</p>
            </div>
          </div>
          <JobView
            job={ytQuick}
            action={
              <button className="btn dark" onClick={runQuick}>
                Open in YouTube Music
              </button>
            }
            onRetry={runQuick}
          />
          <div className="export-secondary">
            <JobView
              job={ytSave}
              compact
              action={
                <button className="btn ghost" onClick={runSave}>
                  {config?.googleClientId ? "Save to my library" : "Save to my library (setup)"}
                </button>
              }
              onRetry={runSave}
            />
          </div>
        </div>
      </div>
      <div className="export-more">
        <button className="chip-btn" onClick={copyList}>
          {copied ? <CheckIcon size={15} /> : <CopyIcon size={15} />} {copied ? "Copied" : "Copy track list"}
        </button>
        <button className="chip-btn" onClick={downloadCsv}>
          <DownloadIcon size={15} /> Download CSV
        </button>
      </div>
    </section>
  );
}

function JobView({ job, action, onRetry, compact }: { job: Job; action: ReactNode; onRetry: () => void; compact?: boolean }) {
  if (job.status === "idle") return <div className="job">{action}</div>;
  if (job.status === "busy")
    return (
      <div className={`job busy${compact ? " compact" : ""}`} aria-live="polite">
        <div className="job-label">
          <span className="spinner" aria-hidden />
          {job.label}
        </div>
        {job.pct != null && (
          <div className="job-bar">
            <div style={{ width: `${job.pct}%` }} />
          </div>
        )}
      </div>
    );
  if (job.status === "error")
    return (
      <div className="job error" role="alert">
        <p>{job.message}</p>
        <button className="btn ghost" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  return (
    <div className="job done">
      <div className="job-actions">
        <a className="btn dark" href={job.url} target="_blank" rel="noreferrer">
          {job.label} <ExternalIcon size={15} />
        </a>
        {job.alt && (
          <a className="btn ghost" href={job.alt.url} target="_blank" rel="noreferrer">
            {job.alt.label} <ExternalIcon size={15} />
          </a>
        )}
      </div>
      <p className="small muted">
        <CheckIcon size={14} /> {job.added} songs{job.missing.length ? ` · ${job.missing.length} not found` : ""}
      </p>
      {job.missing.length > 0 && (
        <details className="missing">
          <summary>Not found</summary>
          <ul>
            {job.missing.map((t) => (
              <li key={t.id}>
                {t.artist} — {t.title}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
