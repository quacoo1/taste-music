import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ARC_LABEL, arcTarget, keyName } from "../../shared/harmony.ts";
import type { Arc, PlaylistTrack } from "../../shared/types.ts";

interface Props {
  tracks: PlaylistTrack[];
  arc: Arc;
  hovered: number | null;
  onHover: (i: number | null) => void;
  playingIndex: number | null;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

const PAD = { l: 34, r: 12 };

/**
 * Two small multiples on one shared x-axis (track position): energy with the
 * requested shape as a dashed guide, and tempo. Separate charts rather than one
 * dual-axis chart, since the two measures don't share a scale.
 */
export function FlowChart({ tracks, arc, hovered, onHover, playingIndex }: Props) {
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const n = tracks.length;
  if (n < 2) return null;

  const x = (i: number) => PAD.l + (i / (n - 1)) * (width - PAD.l - PAD.r);
  const energies = tracks.map((t) => t.energy).filter((e): e is number => e != null);
  const hasEnergy = energies.length >= 2;
  const bpms = tracks.map((t) => t.bpm).filter((b): b is number => !!b);
  const hasTempo = bpms.length >= 2;

  const sorted = [...energies].sort((a, b) => a - b);
  const lo = sorted[Math.round(0.1 * (sorted.length - 1))] ?? 30;
  const hi = Math.max(sorted[Math.round(0.9 * (sorted.length - 1))] ?? 70, lo + 12);

  const focus = hovered ?? playingIndex;
  const tip = hovered != null ? tracks[hovered] : null;

  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = (e.clientX - box.left - PAD.l) / (box.width - PAD.l - PAD.r);
    onHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  };

  return (
    <div className="flow-chart" ref={wrapRef}>
      {hasEnergy && (
        <Panel
          title="Energy"
          legend={
            <>
              <span className="lg">
                <i className="lg-line" /> Energy
              </span>
              <span className="lg">
                <i className="lg-dash" /> {ARC_LABEL[arc].name} shape
              </span>
            </>
          }
          height={132}
          width={width}
          domain={[0, 100]}
          ticks={[0, 50, 100]}
          values={tracks.map((t) => t.energy ?? null)}
          guide={tracks.map((_, i) => arcTarget(arc, i, n, lo, hi))}
          seeds={tracks.map((t) => !!t.seed)}
          x={x}
          focus={focus}
          onMove={onMove}
          onLeave={() => onHover(null)}
        />
      )}
      {hasTempo && (
        <Panel
          title="Tempo"
          legend={<span className="lg muted">BPM</span>}
          height={92}
          width={width}
          domain={[Math.floor(Math.min(...bpms) / 5) * 5 - 5, Math.ceil(Math.max(...bpms) / 5) * 5 + 5]}
          ticks={null}
          values={tracks.map((t) => t.bpm ?? null)}
          seeds={tracks.map((t) => !!t.seed)}
          x={x}
          focus={focus}
          onMove={onMove}
          onLeave={() => onHover(null)}
          axis
        />
      )}
      {!hasEnergy && !hasTempo && <p className="muted small">No tempo or energy data for these songs.</p>}
      {tip && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(x(hovered!), 90), width - 90) }}>
          <b>
            {String(hovered! + 1).padStart(2, "0")} · {tip.title}
          </b>
          <span>{tip.artist}</span>
          <span className="tip-stats">
            {tip.camelot && (
              <>
                {tip.camelot}
                {keyName(tip.camelot) ? ` (${keyName(tip.camelot)})` : ""} ·{" "}
              </>
            )}
            {tip.bpm ? `${Math.round(tip.bpm)} BPM` : "tempo ?"}
            {tip.energy != null ? ` · energy ${tip.energy}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

interface PanelProps {
  title: string;
  legend: ReactNode;
  height: number;
  width: number;
  domain: [number, number];
  ticks: number[] | null;
  values: (number | null)[];
  guide?: number[];
  seeds: boolean[];
  x: (i: number) => number;
  focus: number | null;
  onMove: (e: PointerEvent<SVGRectElement>) => void;
  onLeave: () => void;
  axis?: boolean;
}

function Panel({ title, legend, height, width, domain, ticks, values, guide, seeds, x, focus, onMove, onLeave, axis }: PanelProps) {
  const top = 10;
  const bottom = axis ? 22 : 6;
  const plotH = height - top - bottom;
  const y = (v: number) => top + plotH - ((v - domain[0]) / (domain[1] - domain[0])) * plotH;
  const pts = values.map((v, i) => (v == null ? null : ([x(i), y(v)] as const)));
  // Connect runs of known values; songs with unknown values leave a gap.
  const path = pts.reduce((d, p, i) => (p ? `${d}${pts[i - 1] ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}` : d), "");
  const isolated = pts.map((p, i) => !!p && !pts[i - 1] && !pts[i + 1]);
  const complete = pts.every(Boolean);
  const area = complete ? `${path}L${pts.at(-1)![0]} ${top + plotH}L${pts[0]![0]} ${top + plotH}Z` : "";
  const guidePath = guide?.map((g, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(g).toFixed(1)}`).join("");
  const tickVals = ticks ?? [domain[0], Math.round((domain[0] + domain[1]) / 2), domain[1]];
  const n = values.length;
  const fits = Math.max(2, Math.floor((width - 46) / 30));
  const every = [1, 2, 5, 10].find((step) => Math.ceil(n / step) <= fits) ?? 10;
  const showTick = (i: number) => i === n - 1 || (i % every === 0 && n - 1 - i >= Math.max(1, every * 0.6));

  return (
    <div className="chart-panel">
      <div className="chart-head">
        <span className="chart-title">{title}</span>
        <span className="chart-legend">{legend}</span>
      </div>
      <svg width={width} height={height} role="img" aria-label={`${title} across the playlist`}>
        {tickVals.map((t) => (
          <g key={t}>
            <line x1={34} x2={width - 12} y1={y(t)} y2={y(t)} className="grid" />
            <text x={26} y={y(t) + 3.5} className="tick" textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        {focus != null && <line x1={x(focus)} x2={x(focus)} y1={top} y2={top + plotH} className="crosshair" />}
        {guidePath && <path d={guidePath} className="guide" />}
        {area && <path d={area} className="area" />}
        <path d={path} className="line" />
        {pts.map((p, i) => (p && isolated[i] && !seeds[i] ? <circle key={`i${i}`} cx={p[0]} cy={p[1]} r={3.5} className="lone-dot" /> : null))}
        {pts.map((p, i) => (p && seeds[i] ? <circle key={i} cx={p[0]} cy={p[1]} r={4.5} className="seed-dot" /> : null))}
        {focus != null && pts[focus] && <circle cx={pts[focus]![0]} cy={pts[focus]![1]} r={5} className="focus-dot" />}
        {axis &&
          values.map((_, i) =>
            showTick(i) ? (
              <text key={i} x={x(i)} y={height - 6} className="tick" textAnchor="middle">
                {i + 1}
              </text>
            ) : null,
          )}
        <rect x={0} y={0} width={width} height={height} fill="transparent" onPointerMove={onMove} onPointerLeave={onLeave} />
      </svg>
    </div>
  );
}
