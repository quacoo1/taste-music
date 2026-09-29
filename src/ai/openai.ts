/** OpenAI via the Responses API, with strict JSON-schema output. */
import type { TestResult } from "../../shared/ai.ts";
import { httpError, ProviderError, readSSE, send } from "./http.ts";
import { CURATION_JSON_SCHEMA, extractJson } from "./schema.ts";
import type { ResolvedProvider } from "./store.ts";
import type { CallHandlers, CallInput } from "./types.ts";

const base = (p: ResolvedProvider) => p.baseUrl || "https://api.openai.com/v1";
const headers = (p: ResolvedProvider) => ({ Authorization: `Bearer ${p.apiKey}`, "Content-Type": "application/json" });

export async function callOpenAI(p: ResolvedProvider, input: CallInput, h: CallHandlers, signal: AbortSignal): Promise<unknown> {
  const res = await send(
    `${base(p)}/responses`,
    {
      method: "POST",
      signal,
      headers: headers(p),
      body: JSON.stringify({
        model: p.model,
        input: [
          { role: "system", content: input.system },
          { role: "user", content: input.prompt },
        ],
        text: { format: { type: "json_schema", name: "curation", schema: CURATION_JSON_SCHEMA, strict: true } },
        stream: true,
      }),
    },
    "the OpenAI API",
  );
  if (!res.ok) throw await httpError(res);

  let text = "";
  let refused = false;
  let incomplete = false;
  for await (const { data } of readSSE(res)) {
    if (data === "[DONE]") break;
    let ev: any;
    try {
      ev = JSON.parse(data);
    } catch {
      continue;
    }
    switch (ev.type) {
      case "response.output_text.delta":
        text += ev.delta ?? "";
        h.onText(text);
        break;
      case "response.refusal.delta":
        refused = true;
        break;
      case "response.incomplete":
        incomplete = true;
        break;
      case "response.failed":
        throw new ProviderError("server", ev.response?.error?.message ?? "OpenAI couldn't complete the request");
      case "error":
        throw new ProviderError("request", ev.message ?? ev.error?.message ?? "OpenAI returned an error");
    }
  }
  if (refused) throw new ProviderError("refusal", "OpenAI declined this request");
  const json = extractJson(text);
  if (!json || incomplete) throw new ProviderError("truncated", "OpenAI's answer was cut short");
  return json;
}

export async function testOpenAI(p: ResolvedProvider): Promise<TestResult> {
  try {
    const res = await send(`${base(p)}/models/${encodeURIComponent(p.model)}`, { headers: headers(p), signal: AbortSignal.timeout(10_000) }, "the OpenAI API");
    if (res.ok) return { ok: true, message: `Connected · ${p.model}` };
    const err = await httpError(res);
    if (err.kind === "model") return { ok: false, message: `The key works, but model "${p.model}" wasn't found` };
    return { ok: false, message: err.kind === "auth" ? "OpenAI rejected the API key" : err.message };
  } catch (err) {
    return { ok: false, message: (err as Error).message };
  }
}
