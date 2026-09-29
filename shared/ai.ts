/**
 * AI providers that can curate playlists. Three transports cover them all:
 * the Anthropic SDK, OpenAI's Responses API, and the OpenAI-compatible
 * Chat Completions format that most other providers (and local servers) speak.
 */

export const PROVIDER_IDS = ["anthropic", "openai", "gemini", "openrouter", "groq", "mistral", "deepseek", "xai", "ollama", "custom"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type Transport = "anthropic" | "openai-responses" | "chat";

export interface ProviderPreset {
  id: ProviderId;
  name: string;
  maker: string;
  blurb: string;
  transport: Transport;
  defaultModel: string;
  /** Suggestions for the model field; any model ID the provider accepts works. */
  models: string[];
  baseUrl?: string;
  /** Local servers and custom endpoints let you change the base URL. */
  editableBaseUrl?: boolean;
  keyRequired: boolean;
  keyPlaceholder?: string;
  keyUrl?: string;
  monogram: string;
  tint: string;
}

export const PROVIDERS: ProviderPreset[] = [
  {
    id: "anthropic",
    name: "Claude",
    maker: "Anthropic",
    blurb: "Deep music knowledge with structured output",
    transport: "anthropic",
    defaultModel: "claude-opus-5-5",
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-haiku-4-5"],
    keyRequired: true,
    keyPlaceholder: "sk-ant-…",
    keyUrl: "https://console.anthropic.com/settings/keys",
    monogram: "Cl",
    tint: "#F3D9CB",
  },
  {
    id: "openai",
    name: "OpenAI",
    maker: "OpenAI",
    blurb: "GPT models via the Responses API",
    transport: "openai-responses",
    defaultModel: "gpt-6-sol",
    models: ["gpt-6-astra", "gpt-6-sol", "gpt-6-luna"],
    keyRequired: true,
    keyPlaceholder: "sk-…",
    keyUrl: "https://platform.openai.com/api-keys",
    monogram: "Oa",
    tint: "#D8E8E1",
  },
  {
    id: "gemini",
    name: "Gemini",
    maker: "Google",
    blurb: "Gemini models via Google AI Studio",
    transport: "chat",
    defaultModel: "gemini-3.8-flash",
    models: ["gemini-3.8-flash", "gemini-3.5-flash-lite"],
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyRequired: true,
    keyPlaceholder: "AIza…",
    keyUrl: "https://aistudio.google.com/apikey",
    monogram: "Ge",
    tint: "#DCE3F7",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    maker: "OpenRouter",
    blurb: "One key for hundreds of models",
    transport: "chat",
    defaultModel: "anthropic/claude-sonnet-5.5",
    models: ["anthropic/claude-opus-5.5", "anthropic/claude-sonnet-5.5", "openai/gpt-6-sol", "google/gemini-3.8-flash", "x-ai/grok-4.7", "deepseek/deepseek-v4-pro"],
    baseUrl: "https://openrouter.ai/api/v1",
    keyRequired: true,
    keyPlaceholder: "sk-or-…",
    keyUrl: "https://openrouter.ai/settings/keys",
    monogram: "Or",
    tint: "#E4E0F5",
  },
  {
    id: "groq",
    name: "Groq",
    maker: "Groq",
    blurb: "Very fast open models",
    transport: "chat",
    defaultModel: "openai/gpt-oss-120b",
    models: ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"],
    baseUrl: "https://api.groq.com/openai/v1",
    keyRequired: true,
    keyPlaceholder: "gsk_…",
    keyUrl: "https://console.groq.com/keys",
    monogram: "Gq",
    tint: "#F5DDD6",
  },
  {
    id: "mistral",
    name: "Mistral",
    maker: "Mistral AI",
    blurb: "European frontier models",
    transport: "chat",
    defaultModel: "mistral-medium-latest",
    models: ["mistral-medium-latest", "mistral-large-latest", "mistral-small-latest"],
    baseUrl: "https://api.mistral.ai/v1",
    keyRequired: true,
    keyUrl: "https://console.mistral.ai/api-keys",
    monogram: "Mi",
    tint: "#F7E5C8",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    maker: "DeepSeek",
    blurb: "Strong, low-cost reasoning models",
    transport: "chat",
    defaultModel: "deepseek-v4-pro",
    models: ["deepseek-v4-pro", "deepseek-flash"],
    baseUrl: "https://api.deepseek.com",
    keyRequired: true,
    keyPlaceholder: "sk-…",
    keyUrl: "https://platform.deepseek.com/api_keys",
    monogram: "Ds",
    tint: "#D9E4F2",
  },
  {
    id: "xai",
    name: "Grok",
    maker: "xAI",
    blurb: "Grok models from xAI",
    transport: "chat",
    defaultModel: "grok-4.7",
    models: ["grok-4.7", "grok-4.3"],
    baseUrl: "https://api.x.ai/v1",
    keyRequired: true,
    keyPlaceholder: "xai-…",
    keyUrl: "https://console.x.ai",
    monogram: "xA",
    tint: "#E2E2E2",
  },
  {
    id: "ollama",
    name: "Ollama",
    maker: "Local",
    blurb: "Models running on this computer, no key needed",
    transport: "chat",
    defaultModel: "",
    models: [],
    baseUrl: "http://127.0.0.1:11434/v1",
    editableBaseUrl: true,
    keyRequired: false,
    monogram: "Ol",
    tint: "#E8EEDB",
  },
  {
    id: "custom",
    name: "Custom",
    maker: "OpenAI-compatible endpoint",
    blurb: "LM Studio, vLLM, Together, Fireworks… anything that speaks /chat/completions",
    transport: "chat",
    defaultModel: "",
    models: [],
    baseUrl: "",
    editableBaseUrl: true,
    keyRequired: false,
    monogram: "{ }",
    tint: "#ECEAE5",
  },
];

export const presetFor = (id: ProviderId) => PROVIDERS.find((p) => p.id === id)!;

export interface ProviderStatus {
  id: ProviderId;
  configured: boolean;
  keySource: "saved" | "env" | null;
  /** Last characters of the key, never the key itself. */
  keyPreview: string | null;
  model: string;
  baseUrl: string | null;
  /** null when never tested (e.g. a key from .env). */
  lastTestOk: boolean | null;
}

export interface AiStatus {
  /** The provider that will curate, or null for lite mode. */
  active: ProviderId | null;
  /** "lite" when lite mode was chosen explicitly, "auto" when nothing was chosen. */
  choice: ProviderId | "lite" | "auto";
  providers: ProviderStatus[];
}

/** The AI that will curate the next playlist; null means lite mode. */
export type AiSummary = { provider: string; name: string; model: string } | null;

export interface TestResult {
  ok: boolean;
  message: string;
}
