import type { Arc, Features } from "./types.ts";

/* ------------------------------------------------------------------ */
/* Camelot wheel                                                       */
/* ------------------------------------------------------------------ */

export const CAMELOT_KEYS = Array.from({ length: 12 }, (_, i) => [`${i + 1}A`, `${i + 1}B`]).flat();

interface Camelot {
  n: number; // 1–12
  l: "A" | "B"; // A = minor, B = major
}

export function parseCamelot(key?: string): Camelot | null {
  if (!key) return null;
  const m = /^\s*(1[0-2]|[1-9])\s*([AaBb])\s*$/.exec(key);
  if (!m) return null;
  return { n: Number(m[1]), l: m[2].toUpperCase() as "A" | "B" };
}

export function normalizeCamelot(key?: string): string | undefined {
  const c = parseCamelot(key);
  return c ? `${c.n}${c.l}` : undefined;
}

const NOTE_NAMES: Record<string, string> = {
  "1A": "A♭m", "2A": "E♭m", "3A": "B♭m", "4A": "Fm", "5A": "Cm", "6A": "Gm",
  "7A": "Dm", "8A": "Am", "9A": "Em", "10A": "Bm", "11A": "F♯m", "12A": "D♭m",
  "1B": "B", "2B": "F♯", "3B": "D♭", "4B": "A♭", "5B": "E♭", "6B": "B♭",
  "7B": "F", "8B": "C", "9B": "G", "10B": "D", "11B": "A", "12B": "E",
};

export function keyName(key?: string): string | undefined {
  const c = parseCamelot(key);
  return c ? NOTE_NAMES[`${c.n}${c.l}`] : undefined;
}

/** Steps clockwise from a to b on the 12-position wheel, in -5..6 */
function wheelStep(a: number, b: number): number {
  const d = (((b - a) % 12) + 12) % 12;
  return d > 6 ? d - 12 : d;
}

export type KeyRelation =
  | "same"
  | "adjacent"
  | "relative"
  | "diagonal"
  | "boost"
  | "lift"
  | "clash"
  | "unknown";

const KEY_SCORES: Record<KeyRelation, number> = {
  same: 1,
  adjacent: 0.92,
  relative: 0.88,
  diagonal: 0.72,
  boost: 0.62,
  lift: 0.55,
  clash: 0.2,
  unknown: 0.6,
};

export function keyRelation(a?: string, b?: string): KeyRelation {
  const ka = parseCamelot(a);
  const kb = parseCamelot(b);
  if (!ka || !kb) return "unknown";
  const step = wheelStep(ka.n, kb.n);
  if (ka.l === kb.l) {
    if (step === 0) return "same";
    if (Math.abs(step) === 1) return "adjacent";
    if (step === 2) return "boost"; // +2: "energy boost" mix
    if (step === -5) return "lift"; // +7 clockwise = one semitone up
    return "clash";
  }
  if (step === 0) return "relative";
  if (Math.abs(step) === 1) return "diagonal";
  return "clash";
}

export const keyScore = (a?: string, b?: string) => KEY_SCORES[keyRelation(a, b)];

/* ------------------------------------------------------------------ */
/* Tempo & energy                                                      */
/* ------------------------------------------------------------------ */

/** Relative tempo gap, treating half/double time as equivalent. */
export function tempoGap(a?: number, b?: number): number | null {
  if (!a || !b) return null;
  return Math.min(...[b, b * 2, b / 2].map((x) => Math.abs(a - x) / a));
}

export function tempoScore(a?: number, b?: number): number {
  const gap = tempoGap(a, b);
  if (gap === null) return 0.6;
  return clamp(1 - (gap - 0.02) / 0.13, 0, 1);
}

export function energyScore(a?: number, b?: number): number {
  if (a == null || b == null) return 0.6;
  return clamp(1 - (Math.abs(a - b) - 6) / 34, 0, 1);
}

/** Bring a measured BPM (which may be double/half time) in line with an estimate. */
export function reconcileBpm(measured: number | undefined, estimate: number | undefined): number | undefined {
  if (!measured || measured < 40) return estimate;
  if (!estimate) return measured;
  const options = [measured, measured / 2, measured * 2];
  const best = options.reduce((p, c) => (Math.abs(c - estimate) < Math.abs(p - estimate) ? c : p));
  // Only trust the measurement when it agrees with the estimate's ballpark.
  return Math.abs(best - estimate) / estimate <= 0.08 ? Math.round(best * 10) / 10 : estimate;
}

/* ------------------------------------------------------------------ */
/* Transitions                                                         */
/* ------------------------------------------------------------------ */

export type TransitionGrade = "seamless" | "smooth" | "shift" | "unrated";

export interface Transition {
  /** For sequencing: unknown components count as neutral. */
  score: number;
  /** Judged on known key/tempo only; "unrated" when neither is known. */
  grade: TransitionGrade;
  relation: KeyRelation;
  bpmDelta: number | null;
  energyDelta: number | null;
}

const W_KEY = 0.4;
const W_TEMPO = 0.35;
const W_ENERGY = 0.25;

export function transition(a: Features, b: Features): Transition {
  const relation = keyRelation(a.camelot, b.camelot);
  const k = KEY_SCORES[relation];
  const t = tempoScore(a.bpm, b.bpm);
  const e = energyScore(a.energy, b.energy);
  const score = W_KEY * k + W_TEMPO * t + W_ENERGY * e;

  const known: [number, number][] = [];
  if (relation !== "unknown") known.push([W_KEY, k]);
  const tempoKnown = tempoGap(a.bpm, b.bpm) !== null;
  if (tempoKnown) known.push([W_TEMPO, t]);
  if (a.energy != null && b.energy != null) known.push([W_ENERGY, e]);
  const rated = relation !== "unknown" || tempoKnown;
  const judged = known.reduce((s, [w, v]) => s + w * v, 0) / Math.max(1e-9, known.reduce((s, [w]) => s + w, 0));

  let bpmDelta: number | null = null;
  if (a.bpm && b.bpm) {
    const target = [b.bpm, b.bpm * 2, b.bpm / 2].reduce((p, c) => (Math.abs(c - a.bpm!) < Math.abs(p - a.bpm!) ? c : p));
    bpmDelta = Math.round(target - a.bpm);
  }
  return {
    score,
    grade: !rated ? "unrated" : judged >= 0.8 ? "seamless" : judged >= 0.62 ? "smooth" : "shift",
    relation,
    bpmDelta,
    energyDelta: a.energy != null && b.energy != null ? Math.round(b.energy - a.energy) : null,
  };
}

export const RELATION_LABEL: Record<KeyRelation, string> = {
  same: "Same key",
  adjacent: "Harmonic neighbour",
  relative: "Relative major/minor",
  diagonal: "Diagonal mix",
  boost: "Energy-boost mix",
  lift: "Semitone lift",
  clash: "Key change",
  unknown: "Key unknown",
};

/* ------------------------------------------------------------------ */
/* Energy arcs                                                         */
/* ------------------------------------------------------------------ */

export const ARC_LABEL: Record<Arc, { name: string; hint: string }> = {
  steady: { name: "Steady", hint: "One level, start to finish" },
  build: { name: "Build", hint: "Start soft, end lifted" },
  journey: { name: "Journey", hint: "Ease in, peak, settle" },
  unwind: { name: "Unwind", hint: "Start bright, drift down" },
};

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Target energy (0–100) at position i of n, scaled to the pool's own range. */
export function arcTarget(arc: Arc, i: number, n: number, lo: number, hi: number): number {
  const t = n <= 1 ? 0 : i / (n - 1);
  const span = hi - lo;
  switch (arc) {
    case "steady":
      return lo + span * 0.5;
    case "build":
      return lo + span * smooth(t);
    case "unwind":
      return hi - span * smooth(t);
    case "journey": {
      const peak = 0.66;
      if (t <= peak) return lo + span * (0.2 + 0.8 * smooth(t / peak));
      return lo + span * (1 - 0.6 * smooth((t - peak) / (1 - peak)));
    }
  }
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 50;
  const idx = clamp(Math.round(p * (sorted.length - 1)), 0, sorted.length - 1);
  return sorted[idx];
}

/* ------------------------------------------------------------------ */
/* Sequencing                                                          */
/* ------------------------------------------------------------------ */

/**
 * Orders tracks for the smoothest run of transitions while following the
 * requested energy arc. Greedy construction from every possible opener,
 * then local search (relocate / swap / segment reversal) until stable.
 */
export function sequence<T extends Features>(tracks: T[], arc: Arc): T[] {
  const n = tracks.length;
  if (n <= 2) return [...tracks];

  const energies = tracks.map((t) => t.energy).filter((e): e is number => e != null).sort((a, b) => a - b);
  const lo = percentile(energies, 0.1);
  const hi = Math.max(percentile(energies, 0.9), lo + 12);
  const arcWeight = arc === "steady" ? 1.2 : 4;

  const trans: number[][] = tracks.map((a) => tracks.map((b) => 1 - transition(a, b).score));
  const place: number[][] = tracks.map((t) =>
    Array.from({ length: n }, (_, pos) => {
      if (t.energy == null) return 0;
      const d = (t.energy - arcTarget(arc, pos, n, lo, hi)) / 100;
      return arcWeight * d * d;
    }),
  );

  const cost = (order: number[]) => {
    let c = place[order[0]][0];
    for (let i = 1; i < n; i++) c += trans[order[i - 1]][order[i]] + place[order[i]][i];
    return c;
  };

  let best: number[] = [];
  let bestCost = Infinity;
  for (let start = 0; start < n; start++) {
    const used = new Set([start]);
    const order = [start];
    for (let pos = 1; pos < n; pos++) {
      let pick = -1;
      let pickCost = Infinity;
      for (let j = 0; j < n; j++) {
        if (used.has(j)) continue;
        const c = trans[order[pos - 1]][j] + place[j][pos];
        if (c < pickCost) {
          pickCost = c;
          pick = j;
        }
      }
      used.add(pick);
      order.push(pick);
    }
    const c = cost(order);
    if (c < bestCost) {
      bestCost = c;
      best = order;
    }
  }

  // Local search
  for (let sweep = 0; sweep < 60; sweep++) {
    let improved = false;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        // relocate i → j
        const moved = [...best];
        const [x] = moved.splice(i, 1);
        moved.splice(j, 0, x);
        const cm = cost(moved);
        if (cm < bestCost - 1e-9) {
          best = moved;
          bestCost = cm;
          improved = true;
          continue;
        }
        if (j > i) {
          // swap
          const swapped = [...best];
          [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
          const cs = cost(swapped);
          if (cs < bestCost - 1e-9) {
            best = swapped;
            bestCost = cs;
            improved = true;
            continue;
          }
          // reverse segment i..j
          const reversed = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
          const cr = cost(reversed);
          if (cr < bestCost - 1e-9) {
            best = reversed;
            bestCost = cr;
            improved = true;
          }
        }
      }
    }
    if (!improved) break;
  }

  return best.map((i) => tracks[i]);
}

/** Pick the bench track that slots in best between position i's neighbours. */
export function bestReplacement<T extends Features>(list: T[], i: number, bench: T[]): number {
  let pick = -1;
  let pickScore = -Infinity;
  bench.forEach((b, bi) => {
    const prev = list[i - 1];
    const next = list[i + 1];
    let s = 0;
    if (prev) s += transition(prev, b).score;
    if (next) s += transition(b, next).score;
    // a small preference for the curator's ranking (bench is ordered best-first)
    s -= bi * 0.005;
    if (s > pickScore) {
      pickScore = s;
      pick = bi;
    }
  });
  return pick;
}

export function flowSummary(tracks: Features[]) {
  const transitions = tracks.slice(1).map((t, i) => transition(tracks[i], t));
  const bpms = tracks.map((t) => t.bpm).filter((b): b is number => !!b);
  return {
    transitions,
    rated: transitions.filter((t) => t.grade !== "unrated").length,
    seamless: transitions.filter((t) => t.grade === "seamless" || t.grade === "smooth").length,
    average: transitions.length ? transitions.reduce((s, t) => s + t.score, 0) / transitions.length : 1,
    bpmRange: bpms.length ? ([Math.round(Math.min(...bpms)), Math.round(Math.max(...bpms))] as const) : null,
  };
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
