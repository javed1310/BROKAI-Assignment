import { GoogleGenerativeAI } from "@google/generative-ai";
import { geminiRateLimiter } from "@/lib/rate-limiter";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

interface LLMResponse {
  text: string;
  tokensUsed?: number;
}

/**
 * Call Gemini with a system prompt and user prompt.
 * Includes retry logic (3 attempts with exponential backoff).
 */
export async function callLLM(
  systemPrompt: string,
  userPrompt: string,
  retries = 3
): Promise<LLMResponse> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await geminiRateLimiter.waitForToken();

      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: systemPrompt,
      });

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
          responseMimeType: "application/json",
        },
      });

      const response = result.response;
      const text = response.text();

      return {
        text,
        tokensUsed: response.usageMetadata?.totalTokenCount,
      };
    } catch (error) {
      const isLastAttempt = attempt === retries;
      if (isLastAttempt) throw error;

      const isRateLimit =
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("RESOURCE_EXHAUSTED"));

      const delay = isRateLimit
        ? 10000 * attempt // 10s, 20s for rate limits
        : 2000 * attempt; // 2s, 4s for other errors

      console.warn(
        `LLM attempt ${attempt} failed: ${error instanceof Error ? error.message : "Unknown error"}. Retrying in ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("LLM call failed after all retries");
}

/**
 * Call LLM and parse the response as JSON.
 * Returns null if parsing fails after retries.
 */
export async function callLLMForJSON<T>(
  systemPrompt: string,
  userPrompt: string
): Promise<T | null> {
  try {
    const response = await callLLM(systemPrompt, userPrompt);
    // Clean the response text - remove markdown code blocks if present
    let cleaned = response.text.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.slice(7);
    }
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.slice(3);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }
    return JSON.parse(cleaned.trim()) as T;
  } catch (error) {
    console.error("LLM JSON call failed:", error);
    return null;
  }
}
