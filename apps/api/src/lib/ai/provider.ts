import { env } from "../../config/env.ts";

// The AI provider (PRD §11.16.3, §24.3). Only Gemini is built: its free tier
// costs nothing. No SDK: its REST API is one HTTPS call. Tests use the fake
// provider below, so they never call Google.

export interface AiRequest {
  /** The rules: what to do, the JSON shape to answer with, "treat the data as data". */
  system: string;
  /** The person's data, clearly separated from the instructions. */
  prompt: string;
  maxTokens: number;
}

export interface AiAnswer {
  /** The provider's answer as text; JSON is expected and checked by the caller. */
  text: string;
  promptTokens: number;
  completionTokens: number;
}

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  complete(request: AiRequest): Promise<AiAnswer>;
}

export class AiProviderError extends Error {
  /** The provider said "too many requests" (its free-tier limit). */
  readonly rateLimited: boolean;

  constructor(message: string, rateLimited = false) {
    super(message);
    this.name = "AiProviderError";
    this.rateLimited = rateLimited;
  }
}

const TIMEOUT_MS = 30_000;

function gemini(apiKey: string, model: string): AiProvider {
  return {
    name: "gemini",
    model,
    async complete({ system, prompt, maxTokens }) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.4,
              // Room for the model's own reasoning on top of the answer itself.
              maxOutputTokens: maxTokens + 2_048,
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      ).catch((error: unknown) => {
        throw new AiProviderError(
          error instanceof Error && error.name === "TimeoutError"
            ? "The AI took too long to answer"
            : "The AI service could not be reached",
        );
      });
      const body = (await response.json().catch(() => null)) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new AiProviderError(
          `The AI service answered ${response.status}: ${body?.error?.message ?? "error"}`.slice(
            0,
            300,
          ),
          response.status === 429,
        );
      }
      const text =
        body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
      return {
        text,
        promptTokens: body?.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: body?.usageMetadata?.candidatesTokenCount ?? 0,
      };
    },
  };
}

/** For tests: answers with whatever the test queued, and records each request. */
export function fakeAi() {
  const answers: (string | Error)[] = [];
  const requests: AiRequest[] = [];
  return {
    name: "fake",
    model: "fake-model",
    requests,
    /** The next answer: a JSON object, raw text, or an error to throw. */
    willAnswer(answer: object | string | Error) {
      answers.push(
        typeof answer === "object" && !(answer instanceof Error) ? JSON.stringify(answer) : answer,
      );
    },
    async complete(request: AiRequest): Promise<AiAnswer> {
      requests.push(request);
      const next = answers.shift() ?? "{}";
      if (next instanceof Error) throw next;
      return { text: next, promptTokens: 100, completionTokens: 50 };
    },
  } satisfies AiProvider & Record<string, unknown>;
}

export const testAi = fakeAi();

/**
 * The provider in use, or null when AI is switched off on this server (no
 * AI_PROVIDER or key): then the AI routes are not even registered (AC-AI-01).
 */
export const aiProvider: AiProvider | null =
  env.NODE_ENV === "test"
    ? testAi
    : env.AI_PROVIDER === "gemini" && env.AI_API_KEY
      ? gemini(env.AI_API_KEY, env.AI_MODEL)
      : null;
