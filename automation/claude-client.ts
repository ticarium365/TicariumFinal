import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

/**
 * Ticarium365 — Claude API Client
 * Tüm otomasyon modülleri bu client'ı kullanır.
 */

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 4096;

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ClaudeOptions {
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

export async function askClaude(
  prompt: string,
  options: ClaudeOptions = {}
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY bulunamadı. .env dosyasını kontrol edin.");
  }

  const body: any = {
    model: MODEL,
    max_tokens: options.maxTokens ?? MAX_TOKENS,
    messages: [{ role: "user", content: prompt }],
  };

  if (options.systemPrompt) {
    body.system = options.systemPrompt;
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API hatası (${response.status}): ${err}`);
  }

  const data = await response.json() as any;
  return data.content?.[0]?.text ?? "";
}

export async function askClaudeWithHistory(
  messages: Message[],
  options: ClaudeOptions = {}
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY bulunamadı.");
  }

  const body: any = {
    model: MODEL,
    max_tokens: options.maxTokens ?? MAX_TOKENS,
    messages,
  };

  if (options.systemPrompt) {
    body.system = options.systemPrompt;
  }

  const response = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API hatası (${response.status}): ${err}`);
  }

  const data = await response.json() as any;
  return data.content?.[0]?.text ?? "";
}
