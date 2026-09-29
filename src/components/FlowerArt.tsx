import { memo, useId, useMemo, type ReactElement, type Ref } from "react";
import type { Palette } from "../../shared/types.ts";
import { rng } from "../lib/prng.ts";

/* ------------------------------------------------------------------ */
/* Palettes — one painted world per mood                               */
/* ------------------------------------------------------------------ */

interface Paint {
  sky: [string, string];
  cloud: string;
  cloudShade: string;
  sun?: { color: string; glow: string; moon?: boolean };
  stars?: boolean;
  rain?: boolean;
  hills: [string, string, string];
  bush: string;
  grass: string;
  stem: string;
  leaf: string;
  petals: string[];
  centers: string[];
  ink: string;
  cheek: string;
  tiny: string[];
  butterflies: string[];
}

export const PAINTS: Record<Palette, Paint> = {
  meadow: {
    sky: ["#F6EDD3", "#E6EEC6"],
    cloud: "#FBF5E4",
    cloudShade: "#E9E3C8",
    hills: ["#BCD79C", "#8DC266", "#63A845"],
    bush: "#4E963D",
    grass: "#3F8433",
    stem: "#3C8A3A",
    leaf: "#4FA046",
    petals: ["#F48FB1", "#B690EE", "#FFCF4A", "#FF8A5B", "#FFFFFF", "#F46FA0"],
    centers: ["#FFD54F", "#FFB74D", "#FFE082"],
    ink: "#2A2622",
    cheek: "#F0628F",
    tiny: ["#FFFFFF", "#FFE066", "#F7A1C4", "#C3A6F2"],
    butterflies: ["#FF9F43", "#B690EE", "#F48FB1"],
  },
  sunset: {
    sky: ["#E9674F", "#F7B26A"],
    cloud: "#C9577A",
    cloudShade: "#A94472",
    sun: { color: "#FFE08A", glow: "#FFD27A" },
    hills: ["#D9774F", "#9E5070", "#5A6B3A"],
    bush: "#43582F",
    grass: "#344A26",
    stem: "#3F6B35",
    leaf: "#56823F",
    petals: ["#F7A6C4", "#FFC94A", "#FF7A59", "#B28DFF", "#FFF4E8", "#F2789F"],
    centers: ["#FFD166", "#FFB347"],
    ink: "#2A1F1F",
    cheek: "#E4577E",
    tiny: ["#FFE7C2", "#FFB3C7", "#FFD166"],
    butterflies: [],
  },
  dusk: {
    sky: ["#54478C", "#DB9DB2"],
    cloud: "#F0C3D2",
    cloudShade: "#C996B4",
    sun: { color: "#FFE8BD", glow: "#FFD6C9", moon: true },
    stars: true,
    hills: ["#8A6BB0", "#5A4A8A", "#35584A"],
    bush: "#2E4B3F",
    grass: "#243D33",
    stem: "#3A6A52",
    leaf: "#4C8466",
    petals: ["#FFB3D1", "#C9A7FF", "#FFE08A", "#FF9E80", "#FFFFFF", "#9FD4FF"],
    centers: ["#FFD98A", "#FFC1A1"],
    ink: "#221B2E",
    cheek: "#F07BA6",
    tiny: ["#FFFFFF", "#FFD1E3", "#D7C4FF"],
    butterflies: ["#FFD1E3"],
  },
  dawn: {
    sky: ["#F7D8C6", "#DCE4F3"],
    cloud: "#FFFFFF",
    cloudShade: "#EADFE6",
    sun: { color: "#FFD3A1", glow: "#FFE6CC" },
    hills: ["#CFDDB6", "#A9C79A", "#86B679"],
    bush: "#6FA566",
    grass: "#5C9456",
    stem: "#5E9A55",
    leaf: "#74B067",
    petals: ["#F9B4C8", "#CDB4F6", "#FFE3A3", "#FFC3A0", "#FFFFFF", "#A9D8F5"],
    centers: ["#FFE08A", "#FFCB8E"],
    ink: "#34302C",
    cheek: "#F4899F",
    tiny: ["#FFFFFF", "#FBD3E0", "#E4D7FA"],
    butterflies: ["#CDB4F6", "#F9B4C8"],
  },
  rain: {
    sky: ["#9FAEBB", "#D6DCDF"],
    cloud: "#8593A2",
    cloudShade: "#6F7D8D",
    rain: true,
    hills: ["#9CB3A6", "#728F82", "#557466"],
    bush: "#46645A",
    grass: "#3A564D",
    stem: "#45705F",
    leaf: "#5A8A76",
    petals: ["#9EC5E8", "#B7A6D9", "#EDE6C9", "#F2B5C4", "#FFFFFF", "#8FB9C9"],
    centers: ["#F3DE8A", "#E8D6A8"],
    ink: "#26292C",
    cheek: "#E596AB",
    tiny: ["#FFFFFF", "#CFE3F3", "#E6DDF5"],
    butterflies: [],
  },
  summer: {
    sky: ["#8ED2F2", "#EAF7FB"],
    cloud: "#FFFFFF",
    cloudShade: "#DDEFF6",
    sun: { color: "#FFD23F", glow: "#FFE98A" },
    hills: ["#A5D86F", "#67BC4B", "#43A34A"],
    bush: "#2F8A3E",
    grass: "#277834",
    stem: "#2F8A3E",
    leaf: "#44A64B",
    petals: ["#FF6B9E", "#FFB020", "#FF5A3C", "#7C5CFF", "#FFFFFF", "#FF8FC7"],
    centers: ["#FFD23F", "#FFA62B"],
    ink: "#1F1B16",
    cheek: "#FF5C8A",
    tiny: ["#FFFFFF", "#FFE066", "#FF9BC2"],
    butterflies: ["#FF9F43", "#7C5CFF", "#FF6B9E"],
  },
  night: {
    sky: ["#11163A", "#3A2F66"],
    cloud: "#343A6B",
    cloudShade: "#272C57",
    sun: { color: "#F6E7B0", glow: "#9C8FE0", moon: true },
    stars: true,
    hills: ["#2B3468", "#1E2752", "#173434"],
    bush: "#122A2C",
    grass: "#0E2224",
    stem: "#2C6157",
    leaf: "#3A7A6B",
    petals: ["#FF7EB6", "#9D8CFF", "#FFD166", "#5EE6D0", "#F4F1FF", "#FF9E7A"],
    centers: ["#FFE39A", "#FFC1E0"],
    ink: "#161225",
    cheek: "#FF7EB6",
    tiny: ["#F4F1FF", "#5EE6D0", "#FF9ECF"],
    butterflies: ["#5EE6D0"],
  },
};

/* ------------------------------------------------------------------ */
/* Geometry                                                            */
/* ------------------------------------------------------------------ */

const W = 300;

type HeadKind = "puff" | "daisy" | "aster" | "bloom";
type Eyes = "dot" | "happy" | "sleepy";

interface FlowerSpec {
  x: number;
  y: number;
  r: number;
  kind: HeadKind;
  petal: string;
  petal2: string;
  center: string;
  petals: number;
  tilt: number;
  eyes: Eyes;
  open: boolean;
  stemBend: number;
  leaves: { t: number; side: 1 | -1; size: number }[];
}

const SLOTS = [
  { x: 0.5, y: 0.6, s: 1 },
  { x: 0.2, y: 0.67, s: 0.78 },
  { x: 0.8, y: 0.655, s: 0.8 },
  { x: 0.35, y: 0.5, s: 0.6 },
  { x: 0.665, y: 0.495, s: 0.6 },
  { x: 0.085, y: 0.53, s: 0.52 },
  { x: 0.92, y: 0.515, s: 0.52 },
];

function flowerSpec(key: string, slot: (typeof SLOTS)[number], H: number, paint: Paint, index: number): FlowerSpec {
  const r = rng(key);
  const kinds: HeadKind[] = ["puff", "daisy", "aster", "bloom"];
  const kind = index === 0 ? r.pick<HeadKind>(["puff", "puff", "bloom"]) : r.pick(kinds);
  const petal = kind === "daisy" ? r.pick(["#FFFFFF", "#FFF7EC", paint.petals[4]]) : r.pick(paint.petals.filter((c) => c !== "#FFFFFF"));
  return {
    x: slot.x * W + r.range(-8, 8),
    y: slot.y * H + r.range(-6, 6) * (H / 400),
    r: 46 * slot.s * (H < 350 ? 0.9 : 1),
    kind,
    petal,
    petal2: r.pick(paint.petals),
    center: kind === "puff" ? petal : r.pick(paint.centers),
    petals: kind === "puff" ? r.int(5, 6) : kind === "daisy" ? r.int(12, 15) : kind === "aster" ? r.int(16, 20) : 8,
    tilt: r.range(-14, 14),
    eyes: r.pick<Eyes>(["dot", "happy", "sleepy", "dot"]),
    open: r.next() > 0.6,
    stemBend: r.range(-22, 22),
    leaves: Array.from({ length: r.int(1, 2) }, (_, i) => ({ t: 0.35 + i * 0.28 + r.range(-0.05, 0.05), side: (i % 2 ? 1 : -1) as 1 | -1, size: r.range(0.8, 1.15) })),
  };
}

function Face({ cr, eyes, open, ink, cheek, uid }: { cr: number; eyes: Eyes; open: boolean; ink: string; cheek: string; uid: string }) {
  const ex = cr * 0.36;
  const ey = -cr * 0.08;
  const e = cr * 0.16;
  const sw = Math.max(1.4, cr * 0.085);
  return (
    <g>
      <ellipse cx={-cr * 0.58} cy={cr * 0.22} rx={cr * 0.17} ry={cr * 0.11} fill={cheek} opacity={0.55} />
      <ellipse cx={cr * 0.58} cy={cr * 0.22} rx={cr * 0.17} ry={cr * 0.11} fill={cheek} opacity={0.55} />
      {[-1, 1].map((side) =>
        eyes === "dot" ? (
          <g key={side}>
            <ellipse cx={side * ex} cy={ey} rx={cr * 0.1} ry={cr * 0.14} fill={ink} />
            <circle cx={side * ex + cr * 0.03} cy={ey - cr * 0.05} r={cr * 0.035} fill="#fff" />
          </g>
        ) : (
          <path
            key={side}
            d={
              eyes === "happy"
                ? `M${side * ex - e} ${ey + e * 0.35} Q${side * ex} ${ey - e * 0.9} ${side * ex + e} ${ey + e * 0.35}`
                : `M${side * ex - e} ${ey - e * 0.2} Q${side * ex} ${ey + e * 0.9} ${side * ex + e} ${ey - e * 0.2}`
            }
            stroke={ink}
            strokeWidth={sw}
            strokeLinecap="round"
            fill="none"
          />
        ),
      )}
      {open ? (
        <g>
          <path d={`M${-cr * 0.2} ${cr * 0.22} Q0 ${cr * 0.62} ${cr * 0.2} ${cr * 0.22} Z`} fill={ink} />
          <clipPath id={`${uid}-m`}>
            <path d={`M${-cr * 0.2} ${cr * 0.22} Q0 ${cr * 0.62} ${cr * 0.2} ${cr * 0.22} Z`} />
          </clipPath>
          <ellipse cx={0} cy={cr * 0.46} rx={cr * 0.13} ry={cr * 0.08} fill={cheek} clipPath={`url(#${uid}-m)`} />
        </g>
      ) : (
        <path
          d={`M${-cr * 0.2} ${cr * 0.24} Q0 ${cr * 0.46} ${cr * 0.2} ${cr * 0.24}`}
          stroke={ink}
          strokeWidth={sw}
          strokeLinecap="round"
          fill="none"
        />
      )}
    </g>
  );
}

function Head({ f, paint, uid }: { f: FlowerSpec; paint: Paint; uid: string }) {
  const { r } = f;
  const petals: ReactElement[] = [];
  let cr = r * 0.42;
  const step = 360 / f.petals;
  if (f.kind === "puff") {
    cr = r * 0.52;
    for (let i = 0; i < f.petals; i++) {
      const a = ((i * step - 90) * Math.PI) / 180;
      petals.push(<circle key={i} cx={Math.cos(a) * r * 0.5} cy={Math.sin(a) * r * 0.5} r={r * 0.5} fill={f.petal} />);
      petals.push(
        <circle key={`h${i}`} cx={Math.cos(a) * r * 0.62} cy={Math.sin(a) * r * 0.62 - r * 0.06} r={r * 0.2} fill="#fff" opacity={0.22} />,
      );
    }
  } else if (f.kind === "daisy") {
    cr = r * 0.36;
    for (let i = 0; i < f.petals; i++) {
      petals.push(
        <ellipse key={i} cx={0} cy={-r * 0.58} rx={r * 0.17} ry={r * 0.46} fill={f.petal} stroke={paint.cloudShade} strokeWidth={0.6} transform={`rotate(${i * step})`} />,
      );
    }
  } else if (f.kind === "aster") {
    cr = r * 0.33;
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < f.petals; i++) {
        const len = r * (layer ? 0.78 : 1);
        const wd = r * 0.13;
        petals.push(
          <path
            key={`${layer}-${i}`}
            d={`M0 0 Q${wd} ${-len * 0.5} 0 ${-len} Q${-wd} ${-len * 0.5} 0 0Z`}
            fill={layer ? f.petal2 : f.petal}
            opacity={layer ? 0.85 : 1}
            transform={`rotate(${i * step + layer * step * 0.5})`}
          />,
        );
      }
    }
  } else {
    cr = r * 0.4;
    for (let layer = 0; layer < 2; layer++) {
      for (let i = 0; i < f.petals; i++) {
        petals.push(
          <ellipse
            key={`${layer}-${i}`}
            cx={0}
            cy={-r * (layer ? 0.42 : 0.58)}
            rx={r * (layer ? 0.26 : 0.32)}
            ry={r * (layer ? 0.36 : 0.44)}
            fill={layer ? f.petal2 : f.petal}
            transform={`rotate(${i * step + layer * step * 0.5})`}
          />,
        );
      }
    }
  }
  return (
    <g transform={`translate(${f.x} ${f.y}) rotate(${f.tilt})`}>
      {petals}
      <circle r={cr} fill={f.center} />
      {f.kind !== "puff" && <circle r={cr} fill="none" stroke={paint.ink} strokeOpacity={0.08} strokeWidth={2} />}
      <Face cr={cr} eyes={f.eyes} open={f.open} ink={paint.ink} cheek={paint.cheek} uid={uid} />
    </g>
  );
}

function Flower({ f, H, paint, uid }: { f: FlowerSpec; H: number; paint: Paint; uid: string }) {
  const baseX = f.x - f.stemBend * 0.4;
  const baseY = H + 12;
  const cx = f.x + f.stemBend;
  const cy = (f.y + baseY) / 2;
  const stemW = Math.max(3, f.r * 0.13);
  const point = (t: number) => ({
    x: (1 - t) * (1 - t) * baseX + 2 * (1 - t) * t * cx + t * t * f.x,
    y: (1 - t) * (1 - t) * baseY + 2 * (1 - t) * t * cy + t * t * f.y,
  });
  return (
    <g className="flower">
      <path d={`M${baseX} ${baseY} Q${cx} ${cy} ${f.x} ${f.y}`} stroke={paint.stem} strokeWidth={stemW} strokeLinecap="round" fill="none" />
      {f.leaves.map((l, i) => {
        const p = point(1 - l.t);
        const s = (f.r / 46) * l.size;
        return (
          <path
            key={i}
            d="M0 0 Q14 -13 32 -4 Q16 8 0 0Z"
            fill={paint.leaf}
            transform={`translate(${p.x} ${p.y}) scale(${l.side * s} ${s}) rotate(${-18})`}
          />
        );
      })}
      <Head f={f} paint={paint} uid={`${uid}-${Math.round(f.x)}`} />
    </g>
  );
}

function hillPath(r: ReturnType<typeof rng>, y: number, amp: number, H: number, bumps: number) {
  const seg = (W + 80) / bumps;
  let d = `M-40 ${H + 20} L-40 ${y}`;
  for (let i = 0; i < bumps; i++) {
    const x0 = -40 + i * seg;
    d += ` Q${x0 + seg / 2} ${y - amp * r.range(0.4, 1.1)} ${x0 + seg} ${y + r.range(-amp * 0.3, amp * 0.3)}`;
  }
  return `${d} L${W + 40} ${H + 20} Z`;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export interface FlowerArtProps {
  seed: string;
  palette: Palette;
  /** Big flowers with faces (0–7). */
  flowers: number;
  /** Per-flower keys, so each seed song keeps its own flower. */
  flowerKeys?: string[];
  /** Small meadow flowers that pop up (e.g. while songs are being found). */
  sprouts?: number;
  square?: boolean;
  /** Skip the painterly filters (cheaper for thumbnails). */
  plain?: boolean;
  className?: string;
  svgRef?: Ref<SVGSVGElement>;
  label?: string;
}

function FlowerArtImpl({ seed, palette, flowers, flowerKeys, sprouts = 0, square, plain, className, svgRef, label }: FlowerArtProps) {
  const uid = useId().replace(/:/g, "");
  const H = square ? 300 : 400;
  const paint = PAINTS[palette] ?? PAINTS.meadow;

  const keysKey = flowerKeys?.join("|") ?? "";
  const scene = useMemo(() => {
    const keys = keysKey ? keysKey.split("|") : [];
    const r = rng(`${seed}:${palette}:${H}`);
    const ground = H * (square ? 0.5 : 0.47);
    const clouds = Array.from({ length: r.int(2, 4) }, (_, i) => {
      const cx = r.range(20, W - 20);
      const cy = r.range(H * 0.07, H * (square ? 0.26 : 0.24)) + i * 4;
      const puffs = Array.from({ length: r.int(4, 6) }, (_, k) => ({ dx: (k - 2.5) * r.range(12, 17), dy: -r.range(0, 16), r: r.range(12, 22) }));
      return { cx, cy, puffs };
    });
    const stars = paint.stars ? Array.from({ length: 34 }, () => ({ x: r.range(0, W), y: r.range(0, ground - 20), r: r.range(0.5, 1.6), o: r.range(0.4, 1) })) : [];
    const rain = paint.rain ? Array.from({ length: 46 }, () => ({ x: r.range(-20, W), y: r.range(H * 0.12, ground + 30), l: r.range(8, 16) })) : [];
    const hills = [
      hillPath(r, ground, 26, H, 3),
      hillPath(r, ground + H * 0.07, 22, H, 4),
      hillPath(r, ground + H * 0.16, 16, H, 3),
    ];
    const bushes = Array.from({ length: r.int(5, 8) }, () => ({ x: r.range(-10, W + 10), y: ground + H * 0.05 + r.range(-6, 6), r: r.range(10, 20), n: r.int(3, 4) }));
    const tiny = Array.from({ length: 70 }, () => ({
      x: r.range(4, W - 4),
      y: r.range(ground + H * 0.1, H - 6),
      r: r.range(2.2, 4.4),
      c: r.pick(paint.tiny),
    }));
    const tufts = Array.from({ length: 14 }, () => ({ x: r.range(0, W), y: H - r.range(0, 18), h: r.range(10, 22), lean: r.range(-6, 6) }));
    const butterflies = paint.butterflies.length
      ? Array.from({ length: r.int(1, 3) }, () => ({ x: r.range(30, W - 30), y: r.range(H * 0.14, ground - 10), c: r.pick(paint.butterflies), a: r.range(-25, 25), s: r.range(0.8, 1.2) }))
      : [];
    const sun = paint.sun ? { x: r.range(W * 0.62, W * 0.84), y: r.range(H * 0.13, H * 0.22), r: square ? 24 : 28 } : null;
    const specs = SLOTS.map((slot, i) => flowerSpec(keys[i] ?? `${seed}:${i}`, slot, H, paint, i));
    return { ground, clouds, stars, rain, hills, bushes, tiny, tufts, butterflies, sun, specs };
  }, [seed, palette, H, square, paint, keysKey]);

  const shown = Math.max(0, Math.min(7, flowers));
  // Draw back-to-front (higher heads are further away). The order is fixed per
  // scene so adding a flower never moves — and re-animates — the others.
  const order = scene.specs.map((f, i) => ({ f, i })).sort((a, b) => a.f.y - b.f.y);
  const staticTiny = scene.tiny.slice(0, 26);
  const sproutTiny = scene.tiny.slice(26, 26 + Math.min(44, sprouts));

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={label ?? "Painted flower garden"}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={paint.sky[0]} />
          <stop offset="1" stopColor={paint.sky[1]} />
        </linearGradient>
        <radialGradient id={`${uid}-glow`}>
          <stop offset="0" stopColor={paint.sun?.glow ?? "#fff"} stopOpacity="0.9" />
          <stop offset="1" stopColor={paint.sun?.glow ?? "#fff"} stopOpacity="0" />
        </radialGradient>
        {!plain && (
          <>
            <filter id={`${uid}-paint`} x="-5%" y="-5%" width="110%" height="110%">
              <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed={(seed.length * 7) % 97} result="n" />
              <feDisplacementMap in="SourceGraphic" in2="n" scale="3.2" xChannelSelector="R" yChannelSelector="G" />
            </filter>
            <filter id={`${uid}-grain`} x="0" y="0" width="100%" height="100%">
              <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
              <feColorMatrix type="matrix" values="0 0 0 0 0.2  0 0 0 0 0.16  0 0 0 0 0.12  0 0 0 0.55 0" />
            </filter>
          </>
        )}
      </defs>

      <rect x={-20} y={-20} width={W + 40} height={H + 40} fill={`url(#${uid}-sky)`} />

      <g filter={plain ? undefined : `url(#${uid}-paint)`}>
        {scene.stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
        ))}
        {scene.sun && (
          <g>
            <circle cx={scene.sun.x} cy={scene.sun.y} r={scene.sun.r * 2.2} fill={`url(#${uid}-glow)`} />
            <circle cx={scene.sun.x} cy={scene.sun.y} r={scene.sun.r} fill={paint.sun!.color} />
            {paint.sun!.moon && <circle cx={scene.sun.x + scene.sun.r * 0.45} cy={scene.sun.y - scene.sun.r * 0.25} r={scene.sun.r * 0.85} fill={paint.sky[0]} opacity={0.92} />}
          </g>
        )}
        {scene.clouds.map((c, i) => (
          <g key={i}>
            {c.puffs.map((p, k) => (
              <circle key={`s${k}`} cx={c.cx + p.dx} cy={c.cy + p.dy + 5} r={p.r} fill={paint.cloudShade} />
            ))}
            {c.puffs.map((p, k) => (
              <circle key={k} cx={c.cx + p.dx} cy={c.cy + p.dy} r={p.r} fill={paint.cloud} />
            ))}
          </g>
        ))}
        {scene.rain.map((d, i) => (
          <line key={i} x1={d.x} y1={d.y} x2={d.x - d.l * 0.35} y2={d.y + d.l} stroke="#E8EEF2" strokeOpacity={0.55} strokeWidth={1.2} strokeLinecap="round" />
        ))}

        <path d={scene.hills[0]} fill={paint.hills[0]} />
        {scene.bushes.map((b, i) => (
          <g key={i} fill={paint.bush}>
            {Array.from({ length: b.n }, (_, k) => (
              <circle key={k} cx={b.x + (k - b.n / 2) * b.r * 0.8} cy={b.y - Math.sin((k / (b.n - 1 || 1)) * Math.PI) * b.r * 0.5} r={b.r * 0.72} />
            ))}
          </g>
        ))}
        <path d={scene.hills[1]} fill={paint.hills[1]} />
        <path d={scene.hills[2]} fill={paint.hills[2]} />

        {staticTiny.map((t, i) => (
          <TinyFlower key={i} {...t} center={paint.centers[0]} />
        ))}
        {sproutTiny.map((t, i) => (
          <g key={`sp${i}`} className="sprout">
            <TinyFlower {...t} r={t.r * 1.35} center={paint.centers[0]} />
          </g>
        ))}

        {order.map(({ f, i }) => (i < shown ? <Flower key={i} f={f} H={H} paint={paint} uid={uid} /> : null))}

        {scene.tufts.map((t, i) => (
          <path key={i} d={`M${t.x - 5} ${H + 4} Q${t.x + t.lean} ${t.y - t.h} ${t.x + 5} ${H + 4}Z`} fill={paint.grass} opacity={0.85} />
        ))}

      </g>

      {scene.butterflies.map((b, i) => (
          <g key={i} transform={`translate(${b.x} ${b.y}) rotate(${b.a}) scale(${b.s})`}>
            <g className="butterfly" style={{ animationDelay: `${i * -1.3}s` }}>
              <ellipse cx={-7} cy={-4} rx={7} ry={9} fill={b.c} transform="rotate(-25)" />
              <ellipse cx={7} cy={-4} rx={7} ry={9} fill={b.c} transform="rotate(25)" />
              <ellipse cx={-5} cy={6} rx={4.5} ry={5.5} fill={b.c} opacity={0.85} />
              <ellipse cx={5} cy={6} rx={4.5} ry={5.5} fill={b.c} opacity={0.85} />
              <rect x={-1.2} y={-8} width={2.4} height={17} rx={1.2} fill={paint.ink} />
            </g>
          </g>
        ))}

      {!plain && <rect x={0} y={0} width={W} height={H} filter={`url(#${uid}-grain)`} opacity={0.35} style={{ mixBlendMode: "multiply" }} />}
    </svg>
  );
}

function TinyFlower({ x, y, r, c, center }: { x: number; y: number; r: number; c: string; center: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <circle key={a} cx={Math.cos((a * Math.PI) / 180) * r * 0.62} cy={Math.sin((a * Math.PI) / 180) * r * 0.62} r={r * 0.52} fill={c} />
      ))}
      <circle r={r * 0.36} fill={center} />
    </g>
  );
}

export const FlowerArt = memo(FlowerArtImpl);
