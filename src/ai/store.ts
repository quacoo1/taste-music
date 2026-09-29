/**
 * AI credentials live only in this browser (localStorage). They are sent
 * straight to the provider's API when curating — never to Taste's server.
 */
import { PROVIDER_IDS, PROVIDERS, presetFor, type AiStatus, type AiSummary, type ProviderId, type ProviderPreset } from "../../shared/ai.ts";
import { load, save } from "../lib/storage.ts";

const KEY = "taste:ai";

interface SavedProvider {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  /** Keyless providers (Ollama, custom) count as connected once saved. */
  enabled?: boolean;
  /** Result of the last connection test; failing providers aren't picked automatically. */
  lastTestOk?: boolean;
}

interface Saved {
  choice?: ProviderId | "lite";
  providers: Partial<Record<ProviderId, SavedProvider>>;
}

const read = (): Saved => {
  const data = load<Partial<Saved>>(KEY, {});
  return { choice: data.choice, providers: data.providers ?? {} };
};

const write = (s: Saved) => save(KEY, s);

export interface ResolvedProvider {
  preset: ProviderPreset;
  apiKey?: string;
  model: string;
  baseUrl: string;
  configured: boolean;
}

export function resolve(id: ProviderId, saved = read()): ResolvedProvider {
  const preset = presetFor(id);
  const s = saved.providers[id] ?? {};
  const model = s.model || preset.defaultModel;
  const baseUrl = (s.baseUrl || preset.baseUrl || "").replace(/\/+$/, "");
  return {
    preset,
    apiKey: s.apiKey,
    model,
    baseUrl,
    configured: preset.keyRequired ? Boolean(s.apiKey && model) : Boolean(s.enabled && model && baseUrl),
  };
}

/** The provider that will curate, or null for lite mode. */
export function activeProvider(): ResolvedProvider | null {
  const saved = read();
  if (saved.choice === "lite") return null;
  if (saved.choice) {
    const chosen = resolve(saved.choice, saved);
    if (chosen.configured) return chosen;
  }
  for (const id of PROVIDER_IDS) {
    const p = resolve(id, saved);
    if (p.configured && saved.providers[id]?.lastTestOk !== false) return p;
  }
  return null;
}

export function aiSummary(): AiSummary {
  const p = activeProvider();
  return p ? { provider: p.preset.id, name: p.preset.name, model: p.model } : null;
}

export function status(): AiStatus {
  const saved = read();
  return {
    active: activeProvider()?.preset.id ?? null,
    choice: saved.choice ?? "auto",
    providers: PROVIDERS.map((p) => {
      const r = resolve(p.id, saved);
      return {
        id: p.id,
        configured: r.configured,
        keySource: r.apiKey ? "saved" : null,
        keyPreview: r.apiKey ? `…${r.apiKey.slice(-4)}` : null,
        model: r.model,
        baseUrl: p.transport === "chat" ? r.baseUrl || null : null,
        lastTestOk: saved.providers[p.id]?.lastTestOk ?? null,
      };
    }),
  };
}

export interface ProviderPatch {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export function updateProvider(id: ProviderId, patch: ProviderPatch) {
  const preset = presetFor(id);
  const saved = read();
  const current = { ...(saved.providers[id] ?? {}) };
  if (patch.apiKey !== undefined && patch.apiKey.trim()) current.apiKey = patch.apiKey.trim();
  if (patch.model !== undefined) {
    const model = patch.model.trim();
    if (model && model !== preset.defaultModel) current.model = model;
    else delete current.model;
  }
  if (patch.baseUrl !== undefined && preset.editableBaseUrl) {
    const url = patch.baseUrl.trim().replace(/\/+$/, "");
    if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw new Error("The base URL must start with http:// or https://");
    if (url && url !== preset.baseUrl) current.baseUrl = url;
    else delete current.baseUrl;
  }
  if (!preset.keyRequired) current.enabled = true;
  delete current.lastTestOk;
  saved.providers[id] = current;
  write(saved);
}

export function recordTest(id: ProviderId, ok: boolean) {
  const saved = read();
  const entry = saved.providers[id];
  if (!entry) return;
  entry.lastTestOk = ok;
  write(saved);
}

export function removeProvider(id: ProviderId) {
  const saved = read();
  delete saved.providers[id];
  if (saved.choice === id) delete saved.choice;
  write(saved);
}

export function choose(choice: ProviderId | "lite" | "auto") {
  const saved = read();
  if (choice === "auto") delete saved.choice;
  else saved.choice = choice;
  write(saved);
}
