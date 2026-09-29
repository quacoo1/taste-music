import { z } from "zod";
import { PALETTES } from "../../shared/types.ts";

/* ------------------------------------------------------------------ */
/* Strict schema — for providers with guaranteed structured output     */
/* ------------------------------------------------------------------ */

const StrictPick = z.object({
  title: z.string(),
  artist: z.string(),
  bpm: z.number(),
  camelot: z.string().describe("Camelot key, one of 1A–12A (minor) or 1B–12B (major)"),
  energy: z.number(),
  valence: z.number(),
  why: z.string(),
});

export const StrictCuration = z.object({
  seeds: z.array(StrictPick.omit({ why: true })),
  vibe: z.object({
    name: z.string(),
    description: z.string(),
    moods: z.array(z.string()),
    palette: z.string().describe(`One of: ${PALETTES.join(", ")}`),
  }),
  tracks: z.array(StrictPick),
});

/** The same shape as plain JSON Schema, strict-mode ready (every field required, no extras). */
const pickProps = {
  title: { type: "string" },
  artist: { type: "string", description: "Primary artist only" },
  bpm: { type: "number", description: "Tempo a DJ would beat-match" },
  camelot: { type: "string", description: "Camelot key, 1A–12A (minor) or 1B–12B (major)" },
  energy: { type: "number", description: "0–100" },
  valence: { type: "number", description: "Musical positivity, 0–100" },
};

export const CURATION_JSON_SCHEMA = {
  type: "object",
  properties: {
    seeds: {
      type: "array",
      items: { type: "object", properties: pickProps, required: Object.keys(pickProps), additionalProperties: false },
    },
    vibe: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        moods: { type: "array", items: { type: "string" } },
        palette: { type: "string", enum: [...PALETTES] },
      },
      required: ["name", "description", "moods", "palette"],
      additionalProperties: false,
    },
    tracks: {
      type: "array",
      items: {
        type: "object",
        properties: { ...pickProps, why: { type: "string", description: "Under 12 words" } },
        required: [...Object.keys(pickProps), "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["seeds", "vibe", "tracks"],
  additionalProperties: false,
} as const;

/** Spelled out in the prompt for providers that only offer JSON mode (or nothing). */
export const JSON_SHAPE_INSTRUCTIONS = `Respond with a single JSON object and nothing else — no prose, no code fences — in exactly this shape:
{"seeds":[{"title":"…","artist":"…","bpm":98,"camelot":"8A","energy":55,"valence":40}],
 "vibe":{"name":"…","description":"…","moods":["…"],"palette":"meadow"},
 "tracks":[{"title":"…","artist":"…","bpm":100,"camelot":"9A","energy":60,"valence":45,"why":"…"}]}`;

/* ------------------------------------------------------------------ */
/* Forgiving parse — what the pipeline actually consumes               */
/* ------------------------------------------------------------------ */

const num = z.coerce.number().finite().optional().catch(undefined);
const str = z.string().optional().catch(undefined);

const LoosePick = z.object({
  title: z.coerce.string().min(1),
  artist: z.coerce.string().min(1),
  bpm: num,
  camelot: str,
  energy: num,
  valence: num,
  why: str,
});
export type Pick = z.infer<typeof LoosePick>;
export type Estimates = Omit<Pick, "title" | "artist" | "why">;

export interface Curation {
  seeds: Pick[];
  vibe: { name?: string; description?: string; moods: string[]; palette?: string };
  tracks: Pick[];
}

export function parsePick(raw: unknown): Pick | null {
  const r = LoosePick.safeParse(raw);
  return r.success ? r.data : null;
}

export function parseCuration(raw: unknown): Curation | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v.map(parsePick).filter((p): p is Pick => !!p) : []);
  const vibe = (o.vibe && typeof o.vibe === "object" ? o.vibe : {}) as Record<string, unknown>;
  const tracks = list(o.tracks);
  if (!tracks.length) return null;
  return {
    seeds: Array.isArray(o.seeds) ? o.seeds.map((s) => parsePick(s) ?? ({} as Pick)) : [],
    vibe: {
      name: typeof vibe.name === "string" ? vibe.name : undefined,
      description: typeof vibe.description === "string" ? vibe.description : undefined,
      moods: Array.isArray(vibe.moods) ? vibe.moods.filter((m): m is string => typeof m === "string") : [],
      palette: typeof vibe.palette === "string" ? vibe.palette : undefined,
    },
    tracks,
  };
}

/** Pull the JSON object out of a model's text (reasoning tags, code fences, stray prose). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}
