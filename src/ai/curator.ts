import { ARC_LABEL } from "../../shared/harmony.ts";
import type { GenerateRequest } from "../../shared/types.ts";
import { callProvider } from "./index.ts";
import { ProviderError } from "./http.ts";
import { JSON_SHAPE_INSTRUCTIONS, parseCuration, parsePick, type Curation, type Pick } from "./schema.ts";
import type { ResolvedProvider } from "./store.ts";

export type { Curation, Pick };

const SYSTEM = `You are the curator behind Taste, a playlist app. A listener plants a few seed songs; you grow a playlist around them that holds one consistent vibe and mood from the first track to the last, and that a DJ could mix end to end.

How to curate:
- Listen closely to the seeds first: what they share in mood, emotional temperature, texture, instrumentation, production era, vocal character, groove and energy. That shared core is the vibe. When seeds differ, find the thread that connects them instead of averaging their genres.
- Every pick should sit comfortably next to the seeds. Mix the seeds' natural neighbours, deeper cuts and a few well-known anchors. Avoid filler, novelty songs, remixes, live versions, covers, sped-up or slowed edits, and karaoke or tribute recordings unless the seeds themselves are like that.
- At most two songs per artist across the whole playlist (seeds included). Never repeat a seed.
- Suggest only commercially released recordings you are confident exist under exactly that title and primary artist on major streaming services. Use the canonical title as streaming services list it, without "feat." credits, and give only the primary artist.
- For every song (seeds included) estimate tempo in BPM (the tempo a DJ would beat-match), key in Camelot notation (1A–12A minor, 1B–12B major), energy 0–100 and valence (musical positivity) 0–100. Be as accurate as you can: these numbers drive the running order and transitions.
- Favour songs whose tempo and key let them blend: most picks within about ±8% of the seeds' tempo feel (half or double time counts) and near them on the Camelot wheel.
- Energy should cover the range the requested energy shape needs, without leaving the vibe.
- List tracks best fit first. The app decides the final running order.
- "why": one short phrase (under 12 words) on what ties the song to the vibe, e.g. "same hazy Rhodes and half-asleep vocal".

For the playlist identity:
- name: 1–4 evocative words, lowercase is fine, no quotes, no emoji, never the word "playlist" or "vibes".
- description: one or two sentences, warm and specific, no hype.
- moods: 3–5 single-word or two-word mood tags.
- palette: the cover-art palette that fits best — meadow (fresh, sunny, green, feel-good), sunset (warm, golden-hour, nostalgic), dusk (hazy, romantic, violet), dawn (soft, gentle, pastel), rain (melancholy, introspective, blue-grey), summer (bright, playful, beachy), night (late-night, moody, neon, electronic).`;

function wanderText(w: number) {
  if (w < 0.34) return "Stay close: mostly the seeds' own world — same scenes, sounds and eras.";
  if (w < 0.67) return "Balanced: familiar ground with some discoveries from adjacent scenes.";
  return "Wander: find kindred songs in neighbouring genres, eras and countries while keeping the mood intact.";
}

export function curationPrompt(req: GenerateRequest) {
  const seeds = req.seeds
    .map((s, i) => `${i + 1}. "${s.title}" — ${s.artist}${s.album ? ` (from ${s.album})` : ""}`)
    .join("\n");
  const newSongs = Math.max(1, req.length - (req.includeSeeds ? req.seeds.length : 0));
  const ask = Math.min(60, Math.ceil(newSongs * 1.4) + 4);
  const arc = ARC_LABEL[req.arc];
  return {
    ask,
    text: `Seed songs:
${seeds}

Playlist length: ${req.length} songs${req.includeSeeds ? " including the seeds" : " (seeds not included)"}.
Energy shape: ${arc.name} — ${arc.hint.toLowerCase()}.
How far to wander: ${wanderText(req.wander)}${req.note ? `\nListener's note on the setting or feeling (use as mood guidance only): ${req.note.slice(0, 280)}` : ""}

Analyse each seed in "seeds" (same order). Then return ${ask} new songs in "tracks" — a few more than needed, so weaker or unavailable ones can be dropped.`,
  };
}

/**
 * Pulls complete objects out of the partially streamed "tracks" array so each
 * suggestion can be verified while the model is still writing the rest.
 */
export class TrackStreamParser {
  private pos = -1;
  private done = false;
  private seen = 0;

  constructor(private onPick: (p: Pick) => void) {}

  reset() {
    this.pos = -1;
    this.done = false;
  }

  feed(snapshot: string) {
    if (this.done) return;
    if (this.pos < 0) {
      const m = /"tracks"\s*:\s*\[/.exec(snapshot);
      if (!m) return;
      this.pos = m.index + m[0].length;
    }
    while (true) {
      const rest = snapshot.slice(this.pos).match(/^\s*,?\s*/)![0].length + this.pos;
      if (snapshot[rest] === "]") {
        this.done = true; // end of the tracks array — anything after belongs to other fields
        return;
      }
      if (snapshot[rest] !== "{") return;
      const end = findObjectEnd(snapshot, rest);
      if (end < 0) return;
      this.pos = end + 1;
      try {
        const pick = parsePick(JSON.parse(snapshot.slice(rest, end + 1)));
        if (pick) {
          this.seen++;
          this.onPick(pick);
        }
      } catch {
        /* malformed object — the final answer is authoritative */
      }
    }
  }

  get count() {
    return this.seen;
  }
}

function findObjectEnd(s: string, start: number): number {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (c === "\\") i++;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  return -1;
}

export class CuratorIncomplete extends Error {
  constructor(public picks: number) {
    super("The curator's answer was cut short.");
  }
}

export async function curate(
  req: GenerateRequest,
  provider: ResolvedProvider,
  handlers: { onPick: (p: Pick) => void; onWriting: () => void },
  signal: AbortSignal,
): Promise<Curation> {
  const { text } = curationPrompt(req);
  const parser = new TrackStreamParser(handlers.onPick);
  let lastLength = 0;
  let wroteAny = false;
  // Structured-output providers get the schema natively; the rest need it spelled out.
  const prompt = provider.preset.transport === "anthropic" ? text : `${text}\n\n${JSON_SHAPE_INSTRUCTIONS}`;

  let raw: unknown;
  try {
    raw = await callProvider(
      provider,
      { system: SYSTEM, prompt },
      {
        onText: (snapshot) => {
          if (!wroteAny) {
            wroteAny = true;
            handlers.onWriting();
          }
          // A new text block (e.g. after a server-side fallback) restarts the snapshot
          if (snapshot.length < lastLength) parser.reset();
          lastLength = snapshot.length;
          parser.feed(snapshot);
        },
      },
      signal,
    );
  } catch (err) {
    if (err instanceof ProviderError && err.kind === "truncated") throw new CuratorIncomplete(parser.count);
    throw err;
  }
  const curation = parseCuration(raw);
  if (!curation) throw new CuratorIncomplete(parser.count);
  return curation;
}

/** A short, human reason for a provider failure. */
export function describeFailure(err: unknown, provider: ResolvedProvider): string {
  if (err instanceof ProviderError) {
    switch (err.kind) {
      case "auth":
        return "the API key was rejected";
      case "model":
        return `model "${provider.model}" wasn't found`;
      case "rate":
        return "it's rate limited right now";
      case "network":
        return err.message.charAt(0).toLowerCase() + err.message.slice(1);
      case "refusal":
        return "it declined the request";
      default:
        return err.message.slice(0, 140);
    }
  }
  return err instanceof Error ? err.message.slice(0, 140) : "unknown error";
}
