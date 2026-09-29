/**
 * Fuzzy matching between "what the curator said" and "what a catalog returned".
 * Used by the server (Deezer / iTunes / YouTube Music) and the browser (Spotify).
 */

const NOISE = /\b(\d{4}\s)?remaster(ed)?(\s\d{4})?\b/g;

export function normalizeTitle(s: string): string {
  return fold(s)
    .replace(/\s[-–—]\s.*$/, " ") // " - Remastered 2011"
    .replace(/[([{].*?[)\]}]/g, " ") // (feat. X), [Live]
    .replace(/\b(feat|ft|featuring)\.?\s.*$/, " ")
    .replace(NOISE, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeArtist(s: string): string {
  return fold(s)
    .replace(/^the\s+/, "")
    .replace(/[^a-z0-9 ,&]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fold(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " & ")
    .replace(/[’']/g, "");
}

function bigrams(s: string) {
  const out = new Map<string, number>();
  const t = s.replace(/\s+/g, " ");
  for (let i = 0; i < t.length - 1; i++) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

/** Sørensen–Dice on character bigrams, 0..1 */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const A = bigrams(a);
  const B = bigrams(b);
  let overlap = 0;
  for (const [g, c] of A) overlap += Math.min(c, B.get(g) ?? 0);
  const total = [...A.values()].reduce((s, c) => s + c, 0) + [...B.values()].reduce((s, c) => s + c, 0);
  return (2 * overlap) / total;
}

export function titleSimilarity(a: string, b: string) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return similarity(fold(a), fold(b));
  if (na === nb) return 1;
  // One title containing the other whole ("Nights" vs "Nights (Frank Ocean)") is a near match
  const within = (x: string, y: string) => x.length > 3 && ` ${y} `.includes(` ${x} `);
  const contains = within(na, nb) || within(nb, na);
  return Math.max(similarity(na, nb), contains ? 0.86 : 0);
}

function splitArtists(s: string) {
  return normalizeArtist(s)
    .split(/\s*(?:,|&|\bfeat\b|\bft\b|\bfeaturing\b|\band\b|\bx\b|\bwith\b)\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function artistSimilarity(a: string, b: string) {
  const whole = similarity(normalizeArtist(a), normalizeArtist(b));
  const pa = splitArtists(a);
  const pb = splitArtists(b);
  let best = whole;
  for (const x of pa) for (const y of pb) best = Math.max(best, similarity(x, y));
  return best;
}

export interface Matchable {
  title: string;
  artist: string;
  durationMs?: number;
}

/** 0..1 confidence that `candidate` is the recording described by `wanted`; 0 if clearly not. */
export function matchScore(wanted: Matchable, candidate: Matchable): number {
  const t = titleSimilarity(wanted.title, candidate.title);
  const a = artistSimilarity(wanted.artist, candidate.artist);
  if (t < 0.72 || a < 0.62) return 0;
  let d = 0.5;
  if (wanted.durationMs && candidate.durationMs) {
    const gap = Math.abs(wanted.durationMs - candidate.durationMs) / 1000;
    d = gap <= 4 ? 1 : gap >= 40 ? 0 : 1 - (gap - 4) / 36;
  }
  // Live / remix / karaoke / cover versions are rarely what anyone meant
  const unwanted = /\b(live|karaoke|instrumental|acoustic|remix|cover|tribute|sped up|slowed|8d|nightcore)\b/;
  const penalty = unwanted.test(fold(candidate.title)) && !unwanted.test(fold(wanted.title)) ? 0.25 : 0;
  return 0.55 * t + 0.35 * a + 0.1 * d - penalty;
}

export function bestMatch<T extends Matchable>(wanted: Matchable, candidates: T[], threshold = 0.7): T | null {
  let best: T | null = null;
  let bestScore = threshold;
  for (const c of candidates) {
    const s = matchScore(wanted, c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return best;
}

/** Same song, regardless of catalog id — used for de-duplication. */
export function songKey(t: Matchable) {
  return `${normalizeTitle(t.title)}::${splitArtists(t.artist)[0] ?? normalizeArtist(t.artist)}`;
}
