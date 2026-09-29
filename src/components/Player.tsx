import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PlaylistTrack } from "../../shared/types.ts";
import { previewSrc } from "../lib/api.ts";
import { clock } from "../lib/format.ts";
import { CloseIcon, CrossfadeIcon, ForwardIcon, PauseIcon, PlayIcon, RewindIcon } from "./Icons.tsx";

/** Seconds of equal-power crossfade between previews. */
const FADE = 4;

interface PlayerApi {
  queue: PlaylistTrack[];
  index: number;
  playing: boolean;
  time: number;
  duration: number;
  fading: boolean;
  current: PlaylistTrack | null;
  playQueue: (queue: PlaylistTrack[], index: number) => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
}

const Ctx = createContext<PlayerApi | null>(null);

export function usePlayer() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePlayer outside PlayerProvider");
  return ctx;
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audios = useRef<[HTMLAudioElement, HTMLAudioElement] | null>(null);
  const active = useRef(0);
  const queueRef = useRef<PlaylistTrack[]>([]);
  const indexRef = useRef(-1);
  const fadeTimer = useRef(0);
  const fadingRef = useRef(false);

  const [queue, setQueue] = useState<PlaylistTrack[]>([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [fading, setFading] = useState(false);

  const el = () => audios.current![active.current];
  const other = () => audios.current![1 - active.current];

  /** Abandon a fade in progress: the outgoing song keeps the stage. */
  const cancelFade = useCallback(() => {
    window.clearInterval(fadeTimer.current);
    if (fadingRef.current) {
      other().pause();
      other().volume = 1;
      el().volume = 1;
    }
    fadingRef.current = false;
    setFading(false);
  }, []);

  /** Complete a fade: the incoming song becomes the active element. Safe to call twice. */
  const finishFade = useCallback(() => {
    window.clearInterval(fadeTimer.current);
    if (!fadingRef.current) return;
    const from = el();
    from.pause();
    from.volume = 1;
    other().volume = 1;
    active.current = 1 - active.current;
    fadingRef.current = false;
    setFading(false);
  }, []);

  const load = useCallback((i: number, a: HTMLAudioElement) => {
    const t = queueRef.current[i];
    const src = t ? previewSrc(t) : null;
    if (!src) return false;
    a.src = src;
    return true;
  }, []);

  const startAt = useCallback(
    (i: number) => {
      cancelFade();
      const q = queueRef.current;
      if (i < 0 || i >= q.length) {
        el().pause();
        setPlaying(false);
        return;
      }
      indexRef.current = i;
      setIndex(i);
      setTime(0);
      other().pause();
      const a = el();
      if (!load(i, a)) return startAt(i + 1);
      a.volume = 1;
      a.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    },
    [cancelFade, load],
  );

  const beginFade = useCallback(() => {
    const nextIndex = indexRef.current + 1;
    if (fadingRef.current || nextIndex >= queueRef.current.length) return;
    const from = el();
    const to = other();
    if (!load(nextIndex, to)) return;
    fadingRef.current = true;
    setFading(true);
    to.volume = 0;
    to.play().catch(() => {});
    // The incoming song takes the stage as soon as it starts rising.
    indexRef.current = nextIndex;
    setIndex(nextIndex);
    setTime(0);
    // A timer rather than requestAnimationFrame: the fade must finish even
    // when the tab is in the background (the outgoing "ended" is a backstop).
    const started = performance.now();
    fadeTimer.current = window.setInterval(() => {
      const t = Math.min(1, Math.max(0, (performance.now() - started) / (FADE * 1000)));
      from.volume = Math.min(1, Math.max(0, Math.cos((t * Math.PI) / 2)));
      to.volume = Math.min(1, Math.max(0, Math.sin((t * Math.PI) / 2)));
      if (t >= 1) finishFade();
    }, 50);
  }, [load, finishFade]);

  useEffect(() => {
    const pair: [HTMLAudioElement, HTMLAudioElement] = [new Audio(), new Audio()];
    pair.forEach((a, n) => {
      a.preload = "auto";
      a.addEventListener("timeupdate", () => {
        const isActive = n === active.current;
        // During a fade the incoming element drives the clock.
        if (fadingRef.current ? isActive : !isActive) return;
        setTime(a.currentTime);
        if (a.duration) setDuration(a.duration);
        if (!fadingRef.current && a.duration && a.duration - a.currentTime <= FADE && !a.paused) beginFade();
      });
      a.addEventListener("ended", () => {
        if (n !== active.current) return;
        if (fadingRef.current) finishFade();
        else startAt(indexRef.current + 1);
      });
      a.addEventListener("error", () => {
        if (!a.src) return;
        if (fadingRef.current && n !== active.current) {
          // The incoming preview failed mid-fade: skip past it.
          finishFade();
          setTimeout(() => startAt(indexRef.current + 1), 300);
        } else if (!fadingRef.current && n === active.current) {
          setTimeout(() => startAt(indexRef.current + 1), 300);
        }
      });
    });
    audios.current = pair;
    return () => {
      window.clearInterval(fadeTimer.current);
      pair.forEach((a) => (a.pause(), a.removeAttribute("src")));
    };
  }, [beginFade, finishFade, startAt]);

  const api = useMemo<PlayerApi>(
    () => ({
      queue,
      index,
      playing,
      time,
      duration,
      fading,
      current: queue[index] ?? null,
      playQueue: (q, i) => {
        queueRef.current = q;
        setQueue(q);
        startAt(i);
      },
      toggle: () => {
        const a = el();
        if (!a.src) return startAt(Math.max(0, indexRef.current));
        if (a.paused) {
          a.play().then(() => setPlaying(true), () => {});
          if (fadingRef.current) other().play().catch(() => {});
        } else {
          a.pause();
          if (fadingRef.current) other().pause();
          setPlaying(false);
        }
      },
      next: () => startAt(Math.min(queueRef.current.length - 1, indexRef.current + 1)),
      prev: () => startAt(el().currentTime > 3 ? indexRef.current : Math.max(0, indexRef.current - 1)),
      stop: () => {
        cancelFade();
        audios.current?.forEach((a) => a.pause());
        setPlaying(false);
        setQueue([]);
        queueRef.current = [];
        setIndex(-1);
        indexRef.current = -1;
      },
    }),
    [queue, index, playing, time, duration, fading, startAt, cancelFade],
  );

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

/* ------------------------------------------------------------------ */
/* The island                                                          */
/* ------------------------------------------------------------------ */

export function Island() {
  const p = usePlayer();
  const t = p.current;
  if (!t) return null;
  const remaining = Math.max(0, p.duration - p.time);
  const pct = Math.min(100, (p.time / (p.duration || 30)) * 100);
  return (
    <div className="island" role="region" aria-label="Preview player">
      <div className="island-top">
        <img className="island-art" src={t.artworkSmall ?? t.artwork} alt="" />
        <div className="island-meta">
          <div className="island-title">
            <span className="truncate">{t.title}</span>
            {t.explicit && <span className="explicit" aria-label="Explicit">E</span>}
          </div>
          <div className="island-artist truncate">{t.artist}</div>
        </div>
        <Bars on={p.playing} />
      </div>
      <div className="island-progress">
        <span>{clock(p.time)}</span>
        <div className="island-bar">
          <div style={{ width: `${pct}%` }} />
        </div>
        <span>-{clock(remaining)}</span>
      </div>
      <div className="island-controls">
        <span className="island-hint" title="Previews crossfade into each other, like the real transitions">
          <CrossfadeIcon size={18} />
        </span>
        <button className="icon-btn" onClick={p.prev} aria-label="Previous">
          <RewindIcon size={26} />
        </button>
        <button className="icon-btn big" onClick={p.toggle} aria-label={p.playing ? "Pause" : "Play"}>
          {p.playing ? <PauseIcon size={30} /> : <PlayIcon size={30} />}
        </button>
        <button className="icon-btn" onClick={p.next} aria-label="Next">
          <ForwardIcon size={26} />
        </button>
        <button className="icon-btn subtle" onClick={p.stop} aria-label="Close player">
          <CloseIcon size={18} />
        </button>
      </div>
    </div>
  );
}

export function Bars({ on }: { on: boolean }) {
  return (
    <span className={`bars${on ? " on" : ""}`} aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <i key={i} style={{ animationDelay: `${i * -0.22}s` }} />
      ))}
    </span>
  );
}
