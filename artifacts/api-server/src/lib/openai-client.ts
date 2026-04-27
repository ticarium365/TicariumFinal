import OpenAI from "openai";

/** Canonical AI responses use AI_INTEGRATIONS_*; OPENAI_API_KEY is accepted as alias for Railway / simplicity */
export function resolveOpenAiApiKey(): string | undefined {
  const k =
    (process.env.AI_INTEGRATIONS_OPENAI_API_KEY || "").trim() ||
    (process.env.OPENAI_API_KEY || "").trim();
  return k || undefined;
}

export function resolveOpenAiBaseUrl(): string | undefined {
  const b = (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || "").trim();
  return b || undefined;
}

let cached: OpenAI | undefined;

/** Lazy singleton; returns null when no API key — never instantiate OpenAI at module load */
export function getOpenAIClient(): OpenAI | null {
  const apiKey = resolveOpenAiApiKey();
  if (!apiKey) return null;
  if (cached !== undefined) return cached;
  cached = new OpenAI({
    apiKey,
    baseURL: resolveOpenAiBaseUrl(),
  });
  return cached;
}

export function aiFeatureDisabledBody(): { error: string } {
  return { error: "AI feature disabled" };
}
