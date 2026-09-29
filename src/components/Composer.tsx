import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ARC_LABEL } from "../../shared/harmony.ts";
import type { AiSummary } from "../../shared/ai.ts";
import { ARCS, type Arc, type Playlist, type Track } from "../../shared/types.ts";
import { searchTracks } from "../lib/api.ts";
import { plural } from "../lib/format.ts";
import { FlowerArt } from "./FlowerArt.tsx";
import { ArcGlyph, CloseIcon, PauseIcon, PlayIcon, SearchIcon } from "./Icons.tsx";
import { usePlayer } from "./Player.tsx";
import { coverFlowers } from "./Vinyl.tsx";

export interface GrowOptions {
  length: number;
  arc: Arc;
  wander: number;
  note: string;
  includeSeeds: boolean;
}

export const MAX_SEEDS = 5;

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

function SeedSearch({ onAdd, disabled, taken }: { onAdd: (t: Track) => void; disabled: boolean; taken: Set<string> }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      searchTracks(term, ctrl.signal)
        .then((r) => {
          setResults(r);
          setActive(0);
          setError(null);
          setOpen(true);
        })
        .catch((err) => {
          if (!ctrl.signal.aborted) setError((err as Error).message);
        })
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 220);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const choose = (t: Track) => {
    onAdd(t);
    setQ("");
    setResults([]);
    setOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="search">
      <label className="search-field">
        <SearchIcon size={18} />
        <input
          ref={inputRef}
          value={q}
          disabled={disabled}
          placeholder={disabled ? `That's ${MAX_SEEDS} seeds — plenty` : "Plant a song — search title or artist"}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === "Escape") setOpen(false);
          }}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search for a seed song"
        />
        {loading && <span className="spinner" aria-hidden />}
      </label>
      {error && <p className="field-error">{error}</p>}
      {open && results.length > 0 && (
        <ul className="results" id={listId} role="listbox">
          {results.map((t, i) => (
            <li
              key={t.id}
              role="option"
              aria-selected={i === active}
              aria-disabled={taken.has(t.id)}
              className={`${i === active ? "active" : ""}${taken.has(t.id) ? " taken" : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                if (!taken.has(t.id)) choose(t);
              }}
            >
              <img src={t.artworkSmall ?? t.artwork} alt="" />
              <div className="truncate">
                <b className="truncate">{t.title}</b>
                <span className="truncate">
                  {t.artist}
                  {t.album ? ` · ${t.album}` : ""}
                </span>
              </div>
              {taken.has(t.id) && <span className="small muted">planted</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Seed card — the little white player                                 */
/* ------------------------------------------------------------------ */

function SeedCard({ track, onRemove }: { track: Track; onRemove: () => void }) {
  const player = usePlayer();
  const isCurrent = player.current?.id === track.id;
  const playing = isCurrent && player.playing;
  return (
    <li className="seed-card">
      <img src={track.artworkSmall ?? track.artwork} alt="" />
      <div className="seed-meta">
        <b className="truncate">{track.title}</b>
        <span className="truncate">{track.artist}</span>
        <div className="seed-progress">
          <div style={{ width: isCurrent ? `${Math.min(100, (player.time / (player.duration || 30)) * 100)}%` : "0%" }} />
        </div>
      </div>
      <button
        className="icon-btn ghost"
        onClick={() => (isCurrent ? player.toggle() : player.playQueue([track], 0))}
        aria-label={playing ? `Pause ${track.title}` : `Preview ${track.title}`}
      >
        {playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
      </button>
      <button className="icon-btn ghost" onClick={onRemove} aria-label={`Remove ${track.title}`}>
        <CloseIcon size={16} />
      </button>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Composer                                                            */
/* ------------------------------------------------------------------ */

interface Props {
  seeds: Track[];
  setSeeds: (s: Track[]) => void;
  options: GrowOptions;
  setOptions: (o: GrowOptions) => void;
  onGrow: () => void;
  recent: Playlist[];
  onOpenRecent: (p: Playlist) => void;
  /** null means lite mode. */
  ai: AiSummary;
  onOpenAi: () => void;
  error: string | null;
}

const LENGTHS = [12, 20, 30];
const WANDER = [
  { v: 0.15, label: "Close" },
  { v: 0.5, label: "Balanced" },
  { v: 0.85, label: "Far" },
];

export function Composer({ seeds, setSeeds, options, setOptions, onGrow, recent, onOpenRecent, ai, onOpenAi, error }: Props) {
  const taken = new Set(seeds.map((s) => s.id));
  const set = <K extends keyof GrowOptions>(k: K, v: GrowOptions[K]) => setOptions({ ...options, [k]: v });

  return (
    <div className="compose">
      <section className="stage" aria-label="Your garden">
        <div className="stage-copy">
          Taste is a tiny playlist gardener. Plant a few songs you love and it grows a playlist that keeps one mood from the first note to the last, ordered by key, tempo and energy so every song hands off to the next.
        </div>
        <TiltCard>
          <FlowerArt seed="taste-garden" palette="meadow" flowers={seeds.length} flowerKeys={seeds.map((s) => s.id)} label="Your garden: one flower per seed song" />
          {seeds.length === 0 && <span className="stage-empty">plant a song</span>}
        </TiltCard>
        <button className="flower-btn" onClick={onGrow} disabled={!seeds.length}>
          grow a playlist
        </button>
        <p className="stage-hint">{seeds.length ? `${plural(seeds.length, "seed")} planted` : "two or three seeds work best"}</p>
      </section>

      <section className="composer" aria-label="Plant songs">
        <h1>
          Plant a few songs. <em>Grow</em> a playlist.
        </h1>
        <p className="lede">One mood, start to finish — with transitions a DJ would sign off on.</p>

        <SeedSearch onAdd={(t) => setSeeds([...seeds, t].slice(0, MAX_SEEDS))} disabled={seeds.length >= MAX_SEEDS} taken={taken} />

        {seeds.length > 0 && (
          <ul className="seeds">
            {seeds.map((s) => (
              <SeedCard key={s.id} track={s} onRemove={() => setSeeds(seeds.filter((x) => x.id !== s.id))} />
            ))}
          </ul>
        )}

        <div className="options">
          <fieldset className="opt">
            <legend>Length</legend>
            <div className="segmented">
              {LENGTHS.map((n) => (
                <button key={n} className={options.length === n ? "on" : ""} onClick={() => set("length", n)} aria-pressed={options.length === n}>
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="opt">
            <legend>Wander</legend>
            <div className="segmented">
              {WANDER.map((w) => (
                <button key={w.label} className={Math.abs(options.wander - w.v) < 0.2 ? "on" : ""} onClick={() => set("wander", w.v)} aria-pressed={Math.abs(options.wander - w.v) < 0.2}>
                  {w.label}
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="opt wide">
            <legend>Energy shape</legend>
            <div className="segmented arcs">
              {ARCS.map((a) => (
                <button key={a} className={options.arc === a ? "on" : ""} onClick={() => set("arc", a)} aria-pressed={options.arc === a} title={ARC_LABEL[a].hint}>
                  <ArcGlyph arc={a} size={26} />
                  <span>{ARC_LABEL[a].name}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <label className="opt wide note">
            <span className="legend">Setting (optional)</span>
            <input value={options.note} maxLength={200} placeholder="sunday morning, windows open" onChange={(e) => set("note", e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={options.includeSeeds} onChange={(e) => set("includeSeeds", e.target.checked)} />
            <span>Include my seed songs in the playlist</span>
          </label>
        </div>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="composer-foot">
          <button className="btn dark lg" onClick={onGrow} disabled={!seeds.length}>
            Grow {options.length} songs
          </button>
          {ai === null && (
            <button className="curator-note" onClick={onOpenAi}>
              Lite mode · set up AI integrations for vibe-aware picks
            </button>
          )}
          {ai && (
            <button className="curator-note" onClick={onOpenAi} title="Change in AI integrations">
              Curated by {ai.name} · {ai.model}
            </button>
          )}
        </div>

        {recent.length > 0 && (
          <div className="recent">
            <h2>Recently grown</h2>
            <ul>
              {recent.map((p) => (
                <li key={p.id}>
                  <button onClick={() => onOpenRecent(p)}>
                    <FlowerArt seed={p.id} palette={p.palette} flowers={coverFlowers(p)} flowerKeys={p.tracks.filter((t) => t.seed).map((t) => t.id)} square plain />
                    <b className="truncate">{p.name}</b>
                    <span>{plural(p.tracks.length, "song")}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

/** A card that leans toward the pointer. */
export function TiltCard({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      className="tilt"
      onPointerMove={(e) => {
        const el = ref.current;
        if (!el || e.pointerType !== "mouse") return;
        const b = el.getBoundingClientRect();
        const px = (e.clientX - b.left) / b.width - 0.5;
        const py = (e.clientY - b.top) / b.height - 0.5;
        el.style.setProperty("--rx", `${(-py * 10).toFixed(2)}deg`);
        el.style.setProperty("--ry", `${(px * 12).toFixed(2)}deg`);
        el.style.setProperty("--gx", `${((px + 0.5) * 100).toFixed(1)}%`);
        el.style.setProperty("--gy", `${((py + 0.5) * 100).toFixed(1)}%`);
      }}
      onPointerLeave={() => {
        const el = ref.current;
        if (!el) return;
        el.style.removeProperty("--rx");
        el.style.removeProperty("--ry");
      }}
    >
      <div className="tilt-card" ref={ref}>
        {children}
        <span className="tilt-shine" aria-hidden />
      </div>
    </div>
  );
}
