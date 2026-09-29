import { useEffect, useRef, useState } from "react";
import { ARC_LABEL, flowSummary, sequence } from "../../shared/harmony.ts";
import type { AppConfig, Playlist, PlaylistTrack } from "../../shared/types.ts";
import { svgToJpegBase64 } from "../lib/cover.ts";
import { plural, totalDuration } from "../lib/format.ts";
import { ExportPanel } from "./ExportPanel.tsx";
import { FlowChart } from "./FlowChart.tsx";
import { PauseIcon, PlayIcon, ShuffleIcon, SproutIcon } from "./Icons.tsx";
import { usePlayer } from "./Player.tsx";
import type { SetupTopic } from "./SetupSheet.tsx";
import { TrackList } from "./TrackList.tsx";
import { Vinyl } from "./Vinyl.tsx";

interface Props {
  playlist: Playlist;
  config: AppConfig | null;
  onChange: (p: Playlist) => void;
  onRegrow: () => void;
  onSetup: (t: SetupTopic) => void;
}

export function PlaylistView({ playlist, config, onChange, onRegrow, onSetup }: Props) {
  const player = usePlayer();
  const [hovered, setHovered] = useState<number | null>(null);
  const [name, setName] = useState(playlist.name);
  const coverRef = useRef<SVGSVGElement>(null);

  useEffect(() => setName(playlist.name), [playlist.id, playlist.name]);

  const { tracks } = playlist;
  const summary = flowSummary(tracks);
  const totalMs = tracks.reduce((s, t) => s + (t.durationMs ?? 0), 0);
  const playingIndex = player.current ? tracks.findIndex((t) => t.id === player.current!.id) : -1;
  const isOurs = playingIndex >= 0;

  const update = (tracksNext: PlaylistTrack[], bench: PlaylistTrack[]) => onChange({ ...playlist, tracks: tracksNext, bench });

  const playAll = () => {
    if (isOurs) player.toggle();
    else player.playQueue(tracks, 0);
  };

  const commitName = () => {
    const clean = name.trim().slice(0, 80);
    if (clean && clean !== playlist.name) onChange({ ...playlist, name: clean });
    else setName(playlist.name);
  };

  return (
    <div className="playlist">
      <section className="hero">
        <div className="hero-art">
          <Vinyl playlist={playlist} spinning={isOurs && player.playing} svgRef={coverRef} />
        </div>
        <div className="hero-info">
          <p className="eyebrow">
            {playlist.mode === "lite" ? "Lite mode" : `Curated by ${playlist.curator?.name ?? "Claude"}`} · {ARC_LABEL[playlist.arc].name.toLowerCase()} shape
          </p>
          <input
            className="title-input"
            value={name}
            aria-label="Playlist name"
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            spellCheck={false}
          />
          {playlist.description && <p className="desc">{playlist.description}</p>}
          {playlist.moods.length > 0 && (
            <ul className="moods">
              {playlist.moods.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
          <dl className="stats">
            <div>
              <dt>Songs</dt>
              <dd>{tracks.length}</dd>
            </div>
            <div>
              <dt>Length</dt>
              <dd>{totalDuration(totalMs)}</dd>
            </div>
            {summary.bpmRange && (
              <div>
                <dt>Tempo</dt>
                <dd>
                  {summary.bpmRange[0] === summary.bpmRange[1] ? summary.bpmRange[0] : `${summary.bpmRange[0]}–${summary.bpmRange[1]}`}
                  <small> bpm</small>
                </dd>
              </div>
            )}
            <div>
              <dt>Smooth hand-offs</dt>
              <dd>
                {summary.rated ? summary.seamless : "—"}
                {summary.rated > 0 && <small>/{summary.rated}</small>}
              </dd>
            </div>
          </dl>
          <div className="hero-actions">
            <button className="btn dark lg" onClick={playAll} disabled={!tracks.length}>
              {isOurs && player.playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
              {isOurs && player.playing ? "Pause" : isOurs ? "Resume" : "Preview the flow"}
            </button>
            <button className="btn ghost" onClick={() => onChange({ ...playlist, tracks: sequence(tracks, playlist.arc) })} title="Re-run the sequencer on the current songs">
              <ShuffleIcon size={16} /> Re-sequence
            </button>
            <button className="btn ghost" onClick={onRegrow} title="Back to the seeds, same settings">
              <SproutIcon size={16} /> Regrow
            </button>
          </div>
          <p className="small muted preview-note">Previews are 30-second clips that crossfade into each other.</p>
        </div>
      </section>

      <section className="tile flow">
        <div className="section-head">
          <h2>The flow</h2>
          <p className="muted">
            {summary.rated
              ? `${summary.seamless} of ${plural(summary.rated, "rated hand-off")} ${summary.rated === 1 ? "is" : "are"} seamless or smooth, judged by key (Camelot wheel), tempo and energy.`
              : "There isn't enough key or tempo data to rate these transitions."}
            {summary.rated > 0 && summary.rated < summary.transitions.length && ` ${summary.transitions.length - summary.rated} unrated for lack of key and tempo data.`}
          </p>
        </div>
        <FlowChart tracks={tracks} arc={playlist.arc} hovered={hovered} onHover={setHovered} playingIndex={isOurs ? playingIndex : null} />
      </section>

      <section className="tracks">
        <div className="section-head">
          <h2>Running order</h2>
          <p className="muted">Drag to reorder. Swap brings in the alternative that fits best between its neighbours.</p>
        </div>
        <TrackList tracks={tracks} bench={playlist.bench} onChange={update} hovered={hovered} onHover={setHovered} />
      </section>

      <ExportPanel playlist={playlist} config={config} cover={() => (coverRef.current ? svgToJpegBase64(coverRef.current) : Promise.resolve(null))} onSetup={onSetup} />
    </div>
  );
}
