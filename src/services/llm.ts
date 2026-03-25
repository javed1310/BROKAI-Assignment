import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { RateLimiter } from "@/lib/rate-limiter";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

// Rate limiters
const geminiRateLimiter = new RateLimiter(12); // 12 RPM (under Gemini's 15 RPM)
const groqRateLimiter = new RateLimiter(20); // 20 RPM (under Groq's 30 RPM)

// Circuit breaker: skip a provider for 60s after 429
let geminiDownUntil = 0;
let groqDownUntil = 0;

interface LLMResponse {
  text: string;
  provider: "gemini" | "groq";
}

function isRateLimited(error: Error): boolean {
  return error.message.includes("429") || error.message.includes("RESOURCE_EXHAUSTED") || error.message.includes("Rate limit");
}

function isNonRetryable(error: Error): boolean {
  const msg = error.message;
  return (
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("API_KEY") ||
    msg.includes("PERMISSION_DENIED") ||
    msg.includes("INVALID_ARGUMENT")
  );
}

/**
 * Call Gemini LLM.
 */
async function callGemini(
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  if (!genAI) throw new Error("GEMINI_API_KEY not configured");

  await geminiRateLimiter.waitForToken();

  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
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

  return {
    text: result.response.text(),
    provider: "gemini",
  };
}

/**
 * Call Groq LLM.
 */
async function callGroq(
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  if (!groq) throw new Error("GROQ_API_KEY not configured");

  await groqRateLimiter.waitForToken();

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: systemPrompt + "\n\nReturn ONLY valid JSON. No markdown, no code blocks.",
      },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 2048,
    response_format: { type: "json_object" },
  });

  const text = completion.choices[0]?.message?.content || "";
  return { text, provider: "groq" };
}

/**
 * Call LLM with fallback chain: Gemini → Groq.
 * Features: rate limiting, circuit breaker, 429 wait-and-retry.
 */
export async function callLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  const now = Date.now();

  // Try Gemini first (if not circuit-broken)
  if (genAI && now > geminiDownUntil) {
    try {
      return await callGemini(systemPrompt, userPrompt);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (isRateLimited(err)) {
        // Circuit break: skip Gemini for 60s
        geminiDownUntil = Date.now() + 60000;
        console.warn("Gemini rate limited — circuit breaker ON for 60s");
      } else if (!isNonRetryable(err)) {
        // One retry for transient errors
        try {
          await new Promise((r) => setTimeout(r, 2000));
          return await callGemini(systemPrompt, userPrompt);
        } catch (retryErr) {
          const re = retryErr instanceof Error ? retryErr : new Error(String(retryErr));
          if (isRateLimited(re)) {
            geminiDownUntil = Date.now() + 60000;
            console.warn("Gemini rate limited on retry — circuit breaker ON for 60s");
          }
        }
      } else {
        console.warn(`Gemini non-retryable error: ${err.message.slice(0, 100)}`);
      }
    }
  } else if (genAI && now <= geminiDownUntil) {
    console.log("Gemini circuit-broken, skipping...");
  }

  // Fallback to Groq (if not circuit-broken)
  if (groq && now > groqDownUntil) {
    try {
      return await callGroq(systemPrompt, userPrompt);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (isRateLimited(err)) {
        // Wait 15s and retry once (rate limits are per-minute)
        console.warn("Groq rate limited — waiting 15s before retry...");
        await new Promise((r) => setTimeout(r, 15000));
        try {
          return await callGroq(systemPrompt, userPrompt);
        } catch (retryErr) {
          // If still failing, circuit break for 30s
          groqDownUntil = Date.now() + 30000;
          console.warn("Groq still rate limited — circuit breaker ON for 30s");
        }
      } else {
        // One retry for non-rate-limit errors
        try {
          await new Promise((r) => setTimeout(r, 1000));
          return await callGroq(systemPrompt, userPrompt);
        } catch {
          // Fall through
        }
      }
    }
  } else if (groq && now <= groqDownUntil) {
    console.log("Groq circuit-broken, skipping...");
  }

  // Both providers down — wait for circuit breaker to expire
  const nextAvailable = Math.min(
    genAI ? geminiDownUntil : Infinity,
    groq ? groqDownUntil : Infinity
  );
  const waitTime = nextAvailable - Date.now();

  if (waitTime > 0 && waitTime < 60000) {
    console.log(`Both providers down — waiting ${Math.ceil(waitTime / 1000)}s...`);
    await new Promise((r) => setTimeout(r, waitTime + 1000));
    // Retry once after waiting
    return callLLM(systemPrompt, userPrompt);
  }

  throw new Error(
    "All LLM providers failed. Check your API keys and rate limits."
  );
}

/**
 * Call LLM and parse the response as JSON.
 */
export async function callLLMForJSON<T>(
  systemPrompt: string,
  userPrompt: string
): Promise<T | null> {
  try {
    const response = await callLLM(systemPrompt, userPrompt);
    let cleaned = response.text.trim();
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
    return JSON.parse(cleaned.trim()) as T;
  } catch (error) {
    console.error(
      "LLM JSON call failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
