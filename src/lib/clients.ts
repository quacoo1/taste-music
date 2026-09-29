/**
 * OAuth client IDs for the export integrations. There are no accounts, so each
 * person can use their own Spotify / Google app; the ID is saved in this browser
 * only and overrides the site's default (if the deployment set one).
 */
import type { AppConfig } from "../../shared/types.ts";
import { load, save } from "./storage.ts";

const KEY = "taste:clients";

export interface ClientIds {
  spotify?: string;
  google?: string;
}

export const loadClientIds = () => load<ClientIds>(KEY, {});

export function saveClientId(which: keyof ClientIds, value: string) {
  const ids = loadClientIds();
  const v = value.trim();
  if (v) ids[which] = v;
  else delete ids[which];
  save(KEY, ids);
  return ids;
}

export function effectiveConfig(config: AppConfig | null, ids: ClientIds): AppConfig {
  return {
    spotifyClientId: ids.spotify || config?.spotifyClientId || null,
    googleClientId: ids.google || config?.googleClientId || null,
  };
}
