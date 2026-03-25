import { GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { geminiRateLimiter } from "@/lib/rate-limiter";

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY })
  : null;

interface LLMResponse {
  text: string;
  provider: "gemini" | "groq";
}

/**
 * Check if an error is non-retryable (don't waste quota retrying).
 */
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
 * Call Groq LLM (fallback).
 */
async function callGroq(
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  if (!groq) throw new Error("GROQ_API_KEY not configured");

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: systemPrompt + "\n\nReturn ONLY valid JSON. No markdown, no code blocks." },
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
 * Smart retries: skip retries on non-retryable errors (404, auth).
 */
export async function callLLM(
  systemPrompt: string,
  userPrompt: string
): Promise<LLMResponse> {
  // Try Gemini first
  if (genAI) {
    try {
      return await callGemini(systemPrompt, userPrompt);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.warn(`Gemini failed: ${err.message.slice(0, 150)}`);

      // If non-retryable, go straight to Groq
      if (!isNonRetryable(err)) {
        // One retry for Gemini on transient errors
        try {
          await new Promise((r) => setTimeout(r, 2000));
          return await callGemini(systemPrompt, userPrompt);
        } catch (retryError) {
          console.warn(`Gemini retry failed: ${retryError instanceof Error ? retryError.message.slice(0, 150) : "Unknown"}`);
        }
      }
    }
  }

  // Fallback to Groq
  if (groq) {
    try {
      console.log("Falling back to Groq...");
      return await callGroq(systemPrompt, userPrompt);
    } catch (error) {
      console.warn(`Groq failed: ${error instanceof Error ? error.message.slice(0, 150) : "Unknown"}`);
      // One retry for Groq
      try {
        await new Promise((r) => setTimeout(r, 1000));
        return await callGroq(systemPrompt, userPrompt);
      } catch (retryError) {
        throw new Error(
          `All LLM providers failed. Gemini: ${genAI ? "quota/error" : "not configured"}. Groq: ${retryError instanceof Error ? retryError.message.slice(0, 100) : "error"}`
        );
      }
    }
  }

  throw new Error(
    "No LLM provider configured. Set GEMINI_API_KEY or GROQ_API_KEY in .env.local"
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
    // Remove markdown code blocks if present
    if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
    if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
    if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
    return JSON.parse(cleaned.trim()) as T;
  } catch (error) {
    console.error("LLM JSON call failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
