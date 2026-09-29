import { Fragment, useState } from "react";
import { bestReplacement, keyName, RELATION_LABEL, transition, type Transition } from "../../shared/harmony.ts";
import type { PlaylistTrack } from "../../shared/types.ts";
import { clock } from "../lib/format.ts";
import { CloseIcon, GripIcon, PauseIcon, PlayIcon, SwapIcon } from "./Icons.tsx";
import { Bars, usePlayer } from "./Player.tsx";

interface Props {
  tracks: PlaylistTrack[];
  bench: PlaylistTrack[];
  onChange: (tracks: PlaylistTrack[], bench: PlaylistTrack[]) => void;
  hovered: number | null;
  onHover: (i: number | null) => void;
}

export function TrackList({ tracks, bench, onChange, hovered, onHover }: Props) {
  const player = usePlayer();
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const playingId = player.current?.id;

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...tracks];
    const [t] = next.splice(from, 1);
    next.splice(to > from ? to - 1 : to, 0, t);
    onChange(next, bench);
  };

  const swap = (i: number) => {
    const pick = bestReplacement(tracks, i, bench);
    if (pick < 0) return;
    const next = [...tracks];
    next[i] = bench[pick];
    onChange(next, bench.filter((_, b) => b !== pick));
  };

  const remove = (i: number) => onChange(tracks.filter((_, k) => k !== i), bench);

  const play = (i: number) => {
    if (tracks[i].id === playingId) player.toggle();
    else player.playQueue(tracks, i);
  };

  return (
    <ol className="tracklist" onPointerLeave={() => onHover(null)}>
      {tracks.map((t, i) => {
        const isCurrent = t.id === playingId;
        return (
          <Fragment key={t.id}>
            {i > 0 && <TransitionRow t={transition(tracks[i - 1], t)} from={tracks[i - 1]} to={t} />}
            <li
              className={[
                "track",
                isCurrent && "current",
                hovered === i && "hover",
                drag === i && "dragging",
                over === i && drag !== null && drag !== i && "drop-before",
              ]
                .filter(Boolean)
                .join(" ")}
              onPointerEnter={() => onHover(i)}
              draggable
              onDragStart={(e) => {
                setDrag(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (drag !== null) move(drag, i);
                setDrag(null);
                setOver(null);
              }}
              onDragEnd={() => {
                setDrag(null);
                setOver(null);
              }}
            >
              <span className="grip" aria-hidden>
                <GripIcon size={16} />
              </span>
              <button className="track-num" onClick={() => play(i)} aria-label={isCurrent && player.playing ? `Pause ${t.title}` : `Play preview of ${t.title}`}>
                <span className="num-label">
                  {isCurrent && player.playing ? <Bars on /> : String(i + 1).padStart(2, "0")}
                </span>
                <span className="num-play">{isCurrent && player.playing ? <PauseIcon size={15} /> : <PlayIcon size={15} />}</span>
              </button>
              <img className="track-art" src={t.artworkSmall ?? t.artwork} alt="" loading="lazy" />
              <div className="track-main">
                <div className="track-title">
                  <span className="truncate">{t.title}</span>
                  {t.explicit && <span className="explicit dark">E</span>}
                  {t.seed && <span className="seed-tag">seed</span>}
                </div>
                <div className="track-artist truncate">{t.artist}</div>
                {t.why && <div className="track-why">{t.why}</div>}
              </div>
              <div className="track-stats">
                <span className={`key-chip${t.camelot ? "" : " unknown"}`} title={keyName(t.camelot) ? `Key: ${keyName(t.camelot)}` : "Key unknown"}>
                  {t.camelot ?? "–"}
                </span>
                <span className={`bpm${t.bpm ? "" : " unknown"}`} title={t.bpm ? "Tempo" : "Tempo unknown"}>
                  {t.bpm ? (
                    <>
                      {Math.round(t.bpm)}
                      <small>bpm</small>
                    </>
                  ) : (
                    "–"
                  )}
                </span>
                <Meter value={t.energy} />
                <span className="dur">{t.durationMs ? clock(t.durationMs / 1000) : ""}</span>
              </div>
              <div className="track-actions">
                <button className="icon-btn ghost" onClick={() => swap(i)} disabled={!bench.length} title={bench.length ? "Swap for the best-fitting alternative" : "No alternatives left"} aria-label={`Swap ${t.title}`}>
                  <SwapIcon size={17} />
                </button>
                <button className="icon-btn ghost" onClick={() => remove(i)} title="Remove" aria-label={`Remove ${t.title}`}>
                  <CloseIcon size={16} />
                </button>
              </div>
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function Meter({ value }: { value?: number }) {
  const level = value == null ? 0 : Math.max(1, Math.round(value / 20));
  return (
    <span className="meter" title={value == null ? "Energy unknown" : `Energy ${value}/100`} aria-label={value == null ? "Energy unknown" : `Energy ${value} of 100`}>
      {[1, 2, 3, 4, 5].map((k) => (
        <i key={k} className={k <= level ? "on" : ""} style={{ height: 4 + k * 2.4 }} />
      ))}
    </span>
  );
}

const GRADE_LABEL = { seamless: "Seamless", smooth: "Smooth", shift: "Shift", unrated: "Unrated" } as const;

function TransitionRow({ t, from, to }: { t: Transition; from: PlaylistTrack; to: PlaylistTrack }) {
  const parts: string[] = [];
  if (from.camelot && to.camelot) parts.push(`${from.camelot} → ${to.camelot} ${RELATION_LABEL[t.relation].toLowerCase()}`);
  if (t.bpmDelta != null) parts.push(t.bpmDelta === 0 ? "same tempo" : `${t.bpmDelta > 0 ? "+" : ""}${t.bpmDelta} BPM`);
  if (t.energyDelta != null && Math.abs(t.energyDelta) >= 4) parts.push(`energy ${t.energyDelta > 0 ? "+" : ""}${t.energyDelta}`);
  return (
    <li className={`transition ${t.grade}`} aria-label={`Transition: ${GRADE_LABEL[t.grade]}. ${parts.join(", ")}`}>
      <span className="tx-line" aria-hidden />
      <span className="tx-grade">
        <i aria-hidden />
        {GRADE_LABEL[t.grade]}
      </span>
      <span className="tx-detail">{parts.join(" · ")}</span>
    </li>
  );
}
