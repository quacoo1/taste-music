import { useCallback, useEffect, useRef, useState } from "react";
import type { AppConfig, GenerateStage, Playlist, PlaylistTrack, Track } from "../shared/types.ts";
import { Composer, type GrowOptions } from "./components/Composer.tsx";
import { Growing } from "./components/Growing.tsx";
import { ArrowLeftIcon } from "./components/Icons.tsx";
import { Island } from "./components/Player.tsx";
import { PlaylistView } from "./components/PlaylistView.tsx";
import { aiSummary } from "./ai/store.ts";
import { AiSheet } from "./components/AiSheet.tsx";
import { SetupSheet, type SetupTopic } from "./components/SetupSheet.tsx";
import { getConfig } from "./lib/api.ts";
import { effectiveConfig, loadClientIds } from "./lib/clients.ts";
import { load, save } from "./lib/storage.ts";

type View = "compose" | "growing" | "playlist";

const DEFAULT_OPTIONS: GrowOptions = { length: 20, arc: "journey", wander: 0.5, note: "", includeSeeds: true };

interface GrowState {
  stage: GenerateStage;
  found: PlaylistTrack[];
  notices: string[];
  target: number;
}

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [seeds, setSeeds] = useState<Track[]>(() => load("taste:seeds", []));
  const [options, setOptions] = useState<GrowOptions>(() => ({ ...DEFAULT_OPTIONS, ...load("taste:options", {}) }));
  const [playlist, setPlaylist] = useState<Playlist | null>(() => load("taste:current", null));
  const [recent, setRecent] = useState<Playlist[]>(() => load("taste:recent", []));
  const [view, setViewState] = useState<View>(() => (window.location.hash === "#playlist" && load("taste:current", null) ? "playlist" : "compose"));
  const [grow, setGrow] = useState<GrowState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [setup, setSetup] = useState<SetupTopic | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [ai, setAi] = useState(aiSummary);
  const [clientIds, setClientIds] = useState(loadClientIds);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    getConfig().then(setConfig, () => setConfig(null));
  }, []);

  useEffect(() => save("taste:seeds", seeds), [seeds]);
  useEffect(() => save("taste:options", options), [options]);
  useEffect(() => {
    if (playlist) save("taste:current", playlist);
  }, [playlist]);
  useEffect(() => save("taste:recent", recent), [recent]);

  const setView = useCallback((v: View) => {
    setViewState(v);
    // The playlist gets its own history entry, so Back returns to the seeds.
    if (v === "playlist" && window.location.hash !== "#playlist") history.pushState(null, "", "#playlist");
    if (v !== "playlist" && window.location.hash) history.replaceState(null, "", window.location.pathname);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  useEffect(() => {
    const sync = () => {
      const wantsPlaylist = window.location.hash === "#playlist";
      setViewState((v) => (v === "growing" ? v : wantsPlaylist && load("taste:current", null) ? "playlist" : "compose"));
    };
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  const clearData = () => {
    if (!window.confirm("Remove everything Taste saved in this browser: playlists, seeds, AI keys, client IDs and sign-ins?")) return;
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("taste:"))
        .forEach((k) => localStorage.removeItem(k));
      Object.keys(sessionStorage)
        .filter((k) => k.startsWith("taste:"))
        .forEach((k) => sessionStorage.removeItem(k));
    } catch {
      /* storage unavailable */
    }
    window.location.replace("/");
  };

  const remember = (p: Playlist) => setRecent((r) => [p, ...r.filter((x) => x.id !== p.id)].slice(0, 6));

  const startGrow = async () => {
    if (!seeds.length) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setError(null);
    const target = Math.max(1, options.length - (options.includeSeeds ? seeds.length : 0));
    setGrow({ stage: "listening", found: [], notices: [], target });
    setView("growing");
    try {
      // The growing pipeline (and any AI SDK) loads only when it's needed.
      const { grow: growPlaylist } = await import("./ai/grow.ts");
      const result = await growPlaylist(
        {
          seeds,
          length: options.length,
          arc: options.arc,
          wander: options.wander,
          note: options.note.trim() || undefined,
          includeSeeds: options.includeSeeds,
        },
        (e) => {
          if (e.type === "status") setGrow((g) => g && { ...g, stage: e.stage });
          else if (e.type === "found") setGrow((g) => g && { ...g, found: [...g.found, e.track] });
          else if (e.type === "notice") setGrow((g) => g && { ...g, notices: [...g.notices, e.message] });
          else if (e.type === "restart") setGrow((g) => g && { ...g, found: [] });
        },
        ctrl.signal,
      );
      setPlaylist(result);
      remember(result);
      setView("playlist");
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError((err as Error).message || "Something went wrong while growing.");
      setView("compose");
    } finally {
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  };

  const cancelGrow = () => {
    abortRef.current?.abort();
    setView("compose");
  };

  const updatePlaylist = (p: Playlist) => {
    setPlaylist(p);
    setRecent((r) => r.map((x) => (x.id === p.id ? p : x)));
  };

  const regrow = () => {
    if (playlist) {
      const seedTracks = playlist.tracks.filter((t) => t.seed);
      if (seedTracks.length) {
        setSeeds(
          seedTracks.map(({ id, source, sourceId, title, artist, album, artwork, artworkSmall, previewUrl, durationMs, explicit, isrc }) => ({
            id, source, sourceId, title, artist, album, artwork, artworkSmall, previewUrl, durationMs, explicit, isrc,
          })),
        );
      }
    }
    setView("compose");
  };

  return (
    <>
      <header className="topbar">
        <button className="brand" onClick={() => view !== "growing" && setView("compose")} aria-label="taste — home">
          <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
            <g transform="translate(32 32)">
              <g fill="#F48FB1">
                {[0, 72, 144, 216, 288].map((a) => (
                  <circle key={a} cx={Math.cos(((a - 90) * Math.PI) / 180) * 15} cy={Math.sin(((a - 90) * Math.PI) / 180) * 15} r="12" />
                ))}
              </g>
              <circle r="11" fill="#FFD54F" />
              <circle cx="-4" cy="-2" r="1.8" fill="#2B2B2B" />
              <circle cx="4" cy="-2" r="1.8" fill="#2B2B2B" />
              <path d="M-4 3 Q0 7 4 3" stroke="#2B2B2B" strokeWidth="1.8" fill="none" strokeLinecap="round" />
            </g>
          </svg>
          <span>taste</span>
        </button>
        <nav>
          {view === "playlist" && (
            <button className="btn ghost sm" onClick={() => setView("compose")}>
              <ArrowLeftIcon size={15} /> Seeds
            </button>
          )}
          {view === "compose" && playlist && (
            <button className="btn ghost sm" onClick={() => setView("playlist")}>
              Last playlist
            </button>
          )}
          <button
            className={`status-pill${ai ? "" : " lite"}`}
            onClick={() => setAiOpen(true)}
            title={ai ? `${ai.name} (${ai.model}) is curating — AI integrations` : "Lite mode — set up AI integrations"}
          >
            <i aria-hidden />
            {ai ? ai.name : "Lite"}
          </button>
        </nav>
      </header>

      <main>
        {view === "compose" && (
          <Composer
            seeds={seeds}
            setSeeds={setSeeds}
            options={options}
            setOptions={setOptions}
            onGrow={startGrow}
            recent={recent}
            onOpenRecent={(p) => {
              setPlaylist(p);
              setView("playlist");
            }}
            ai={ai}
            onOpenAi={() => setAiOpen(true)}
            error={error}
          />
        )}
        {view === "growing" && grow && (
          <Growing seeds={seeds} found={grow.found} target={grow.target} stage={grow.stage} notices={grow.notices} onCancel={cancelGrow} />
        )}
        {view === "playlist" && playlist && (
          <PlaylistView playlist={playlist} config={effectiveConfig(config, clientIds)} onChange={updatePlaylist} onRegrow={regrow} onSetup={setSetup} />
        )}
      </main>

      <footer className="foot">
        <span>taste</span>
        <span className="muted">No accounts. Your playlists and keys stay in this browser. Previews via Deezer &amp; Apple.</span>
        <button className="foot-link" onClick={clearData}>
          Clear my data
        </button>
      </footer>

      <Island />
      {setup && <SetupSheet topic={setup} siteConfig={config} onClose={() => setSetup(null)} onSaved={setClientIds} />}
      {aiOpen && <AiSheet onClose={() => setAiOpen(false)} onChanged={setAi} />}
    </>
  );
}
