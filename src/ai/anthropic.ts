import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { TestResult } from "../../shared/ai.ts";
import { ProviderError } from "./http.ts";
import { StrictCuration } from "./schema.ts";
import type { ResolvedProvider } from "./store.ts";
import type { CallHandlers, CallInput } from "./types.ts";

const clients = new Map<string, Anthropic>();
function client(apiKey?: string) {
  const key = apiKey ?? "";
  // The key belongs to the person using this browser and goes straight to Anthropic.
  if (!clients.has(key)) clients.set(key, new Anthropic({ apiKey, dangerouslyAllowBrowser: true }));
  return clients.get(key)!;
}

/** Models that accept server-side refusal fallbacks and the effort control. */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"]);
const supportsEffort = (model: string) => /^claude-(opus|sonnet|fable|mythos)-(5|4-[678])/.test(model);

function mapError(err: unknown): unknown {
  if (err instanceof Anthropic.APIUserAbortError) return err;
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError("auth", "Claude rejected the API key", err.status);
  }
  if (err instanceof Anthropic.NotFoundError) return new ProviderError("model", err.message, 404);
  if (err instanceof Anthropic.RateLimitError) return new ProviderError("rate", err.message, 429);
  if (err instanceof Anthropic.APIConnectionError) {
    return new ProviderError("network", "Couldn't reach the Claude API");
  }
  if (err instanceof Anthropic.APIError) return new ProviderError(err.status && err.status >= 500 ? "server" : "request", err.message, err.status);
  return err;
}

export async function callAnthropic(p: ResolvedProvider, input: CallInput, h: CallHandlers, signal: AbortSignal): Promise<unknown> {
  const stream = client(p.apiKey).beta.messages.stream(
    {
      model: p.model,
      max_tokens: 64000,
      system: input.system,
      messages: [{ role: "user", content: input.prompt }],
      output_config: {
        ...(supportsEffort(p.model) ? { effort: "medium" as const } : {}),
        format: betaZodOutputFormat(StrictCuration),
      },
      ...(FALLBACK_MODELS.has(p.model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    },
    { signal },
  );
  stream.on("text", (_delta, snapshot) => h.onText(snapshot));

  let message;
  try {
    message = await stream.finalMessage();
  } catch (err) {
    throw mapError(err);
  }
  if (message.stop_reason === "refusal") throw new ProviderError("refusal", "Claude declined this request");
  if (message.parsed_output) return message.parsed_output;
  throw new ProviderError("truncated", "Claude's answer was cut short");
}

export async function testAnthropic(p: ResolvedProvider): Promise<TestResult> {
  try {
    const model = await client(p.apiKey).models.retrieve(p.model);
    return { ok: true, message: `Connected · ${model.display_name}` };
  } catch (err) {
    const e = mapError(err);
    if (e instanceof ProviderError && e.kind === "model") return { ok: false, message: `The key works, but model "${p.model}" wasn't found` };
    return { ok: false, message: e instanceof Error ? e.message : "Couldn't connect" };
  }
}
