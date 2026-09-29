export type Source = "deezer" | "itunes";

/** A real, playable recording resolved against a public catalog. */
export interface Track {
  /** `${source}:${sourceId}` */
  id: string;
  source: Source;
  sourceId: string;
  title: string;
  artist: string;
  album?: string;
  /** ~500px square */
  artwork?: string;
  /** ~120px square */
  artworkSmall?: string;
  /** Direct preview URL (iTunes). Deezer previews go through /api/preview so the signed URL never goes stale. */
  previewUrl?: string;
  durationMs?: number;
  explicit?: boolean;
  isrc?: string;
}

/** What the sequencer needs to know about a song. Any field can be unknown. */
export interface Features {
  bpm?: number;
  /** Camelot notation, "1A"–"12B" */
  camelot?: string;
  /** 0–100 */
  energy?: number;
  /** 0–100, musical positivity */
  valence?: number;
}

export interface PlaylistTrack extends Track, Features {
  seed?: boolean;
  /** The curator's one-line reason for the pick. */
  why?: string;
}

export const ARCS = ["steady", "build", "journey", "unwind"] as const;
export type Arc = (typeof ARCS)[number];

export const PALETTES = ["meadow", "sunset", "dusk", "dawn", "rain", "summer", "night"] as const;
export type Palette = (typeof PALETTES)[number];

export interface Playlist {
  id: string;
  name: string;
  description: string;
  moods: string[];
  palette: Palette;
  arc: Arc;
  tracks: PlaylistTrack[];
  /** Verified picks that didn't make the cut — used for swaps. */
  bench: PlaylistTrack[];
  mode: "ai" | "lite";
  /** Which AI curated it (absent in lite mode). */
  curator?: { provider: string; name: string; model: string };
  createdAt: number;
}

export interface GenerateRequest {
  seeds: Track[];
  length: number;
  arc: Arc;
  /** 0 = stay close to the seeds, 1 = wander into neighbouring sounds */
  wander: number;
  note?: string;
  includeSeeds: boolean;
}

export type GenerateStage = "listening" | "curating" | "verifying" | "sequencing";

export type GenerateEvent =
  | { type: "status"; stage: GenerateStage; message: string }
  | { type: "found"; track: PlaylistTrack; count: number; target: number }
  | { type: "notice"; message: string }
  /** The AI attempt was abandoned; songs found so far no longer count. */
  | { type: "restart" }
  | { type: "done"; playlist: Playlist }
  | { type: "error"; message: string };

/** Server-provided defaults. Users can override the client IDs in their own browser. */
export interface AppConfig {
  spotifyClientId: string | null;
  googleClientId: string | null;
}
