/**
 * OpenAI-compatible Chat Completions: Gemini, OpenRouter, Groq, Mistral,
 * DeepSeek, xAI, Ollama and any custom endpoint. Output format support varies,
 * so we ask for strict JSON schema first, then JSON mode, then plain text
 * (the prompt spells out the shape either way).
 */
import type { TestResult } from "../../shared/ai.ts";
import { httpError, ProviderError, readSSE, send } from "./http.ts";
import { CURATION_JSON_SCHEMA, extractJson } from "./schema.ts";
import type { ResolvedProvider } from "./store.ts";
import type { CallHandlers, CallInput } from "./types.ts";

const FORMATS = [
  { type: "json_schema", json_schema: { name: "curation", strict: true, schema: CURATION_JSON_SCHEMA } },
  { type: "json_object" },
  undefined,
] as const;

// Only standard headers: extra ones fail the providers' CORS preflight in the browser.
function headers(p: ResolvedProvider): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (p.apiKey) h.Authorization = `Bearer ${p.apiKey}`;
  return h;
}

const where = (p: ResolvedProvider) =>
  p.preset.id === "ollama"
    ? `Ollama at ${p.baseUrl}. Is it running, and started with OLLAMA_ORIGINS=${window.location.origin}?`
    : `${p.baseUrl} (check the URL, and that the server allows requests from ${window.location.origin})`;

export async function callChat(p: ResolvedProvider, input: CallInput, h: CallHandlers, signal: AbortSignal): Promise<unknown> {
  if (!p.baseUrl) throw new ProviderError("request", "No base URL is set for this provider");
  let res: Response | null = null;
  for (const format of FORMATS) {
    res = await send(
      `${p.baseUrl}/chat/completions`,
      {
        method: "POST",
        signal,
        headers: headers(p),
        body: JSON.stringify({
          model: p.model,
          messages: [
            { role: "system", content: input.system },
            { role: "user", content: input.prompt },
          ],
          stream: true,
          ...(format ? { response_format: format } : {}),
        }),
      },
      where(p),
    );
    if (res.ok) break;
    const err = await httpError(res);
    // Unsupported response_format usually comes back as a 400/422 — try a simpler one.
    if (format && (err.status === 400 || err.status === 422)) continue;
    throw err;
  }
  if (!res?.ok) throw new ProviderError("request", "The provider rejected every output format");

  let text = "";
  let truncated = false;
  for await (const { data } of readSSE(res)) {
    if (data.trim() === "[DONE]") break;
    let chunk: any;
    try {
      chunk = JSON.parse(data);
    } catch {
      continue;
    }
    if (chunk.error) throw new ProviderError("server", chunk.error.message ?? String(chunk.error));
    const choice = chunk.choices?.[0];
    const piece = choice?.delta?.content;
    if (typeof piece === "string" && piece) {
      text += piece;
      h.onText(text);
    }
    if (choice?.finish_reason === "length") truncated = true;
    if (choice?.finish_reason === "content_filter") throw new ProviderError("refusal", "The model declined this request");
  }
  const json = extractJson(text);
  if (!json) throw new ProviderError("truncated", truncated ? "The answer was cut short" : "The model didn't return JSON");
  return json;
}

export async function testChat(p: ResolvedProvider): Promise<TestResult> {
  if (!p.baseUrl) return { ok: false, message: "Add a base URL first" };
  if (!p.model) return { ok: false, message: "Add a model name first" };
  try {
    const res = await send(`${p.baseUrl}/models`, { headers: headers(p), signal: AbortSignal.timeout(10_000) }, where(p));
    if (res.ok) {
      const ids: string[] = ((await res.json().catch(() => null))?.data ?? []).map((m: any) => String(m.id ?? m.name ?? ""));
      const listed = ids.some((id) => id === p.model || id.endsWith(`/${p.model}`));
      return listed || !ids.length
        ? { ok: true, message: `Connected · ${p.model}` }
        : { ok: true, message: `Connected — "${p.model}" isn't in the provider's model list, check the name if curation fails` };
    }
    const err = await httpError(res);
    if (err.kind === "auth") return { ok: false, message: `${p.preset.name} rejected the API key` };
    // Some compatible servers don't implement /models; reaching them is enough.
    if (err.status === 404 || err.status === 405) return { ok: true, message: `Reached ${p.baseUrl}` };
    return { ok: false, message: err.message };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
