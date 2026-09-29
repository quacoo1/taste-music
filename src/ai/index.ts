import type { TestResult, Transport } from "../../shared/ai.ts";
import { callChat, testChat } from "./chat.ts";
import { callOpenAI, testOpenAI } from "./openai.ts";
import type { ResolvedProvider } from "./store.ts";
import type { CallHandlers, CallInput } from "./types.ts";

// The Anthropic SDK only loads when Claude is actually used.
const CALL: Record<Transport, (p: ResolvedProvider, i: CallInput, h: CallHandlers, s: AbortSignal) => Promise<unknown>> = {
  anthropic: async (p, i, h, s) => (await import("./anthropic.ts")).callAnthropic(p, i, h, s),
  "openai-responses": callOpenAI,
  chat: callChat,
};

const TEST: Record<Transport, (p: ResolvedProvider) => Promise<TestResult>> = {
  anthropic: async (p) => (await import("./anthropic.ts")).testAnthropic(p),
  "openai-responses": testOpenAI,
  chat: testChat,
};

export const callProvider = (p: ResolvedProvider, input: CallInput, h: CallHandlers, signal: AbortSignal) =>
  CALL[p.preset.transport](p, input, h, signal);

export async function testProvider(p: ResolvedProvider): Promise<TestResult> {
  if (p.preset.keyRequired && !p.apiKey) return { ok: false, message: "Add an API key first" };
  if (!p.model) return { ok: false, message: "Add a model name first" };
  return TEST[p.preset.transport](p);
}
