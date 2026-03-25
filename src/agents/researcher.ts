import { webSearch } from "@/services/search";
import { scrapeUrl } from "@/services/scraper";
import { callLLMForJSON } from "@/services/llm";
import { BusinessProfile, BusinessProfileSchema, AgentResult } from "./types";

const SYSTEM_PROMPT = `You are a business research analyst. Given raw search results and website content about a company, extract a structured business profile.

Return ONLY valid JSON matching this exact schema:
{
  "companyName": "string",
  "summary": "string (2-3 sentences about what they do)",
  "industry": "string (e.g. Solar EPC, Solar Panel Dealer, Solar Installer)",
  "sizeSignals": ["string array of size indicators like employee count, years in business, project count, revenue signals"],
  "digitalPresence": {
    "website": "string URL or null",
    "socialMedia": ["string array of social media URLs found"],
    "directories": ["string array of directory listing URLs like IndiaMART, Justdial"]
  },
  "systemsUsed": ["string array of any CRM, booking, communication tools detected - e.g. WordPress, WhatsApp Business, No CRM detected"],
  "searchSources": ["string array of URLs used as research sources"]
}

Rules:
- Be factual. Only include information you can extract from the provided data.
- If information is unavailable, use empty arrays or null.
- Do NOT make up or hallucinate information.
- Keep the summary concise and specific to this company.`;

interface ResearcherInput {
  companyName: string;
  state: string;
  existingEmail?: string;
}

export async function runResearcher(
  input: ResearcherInput
): Promise<AgentResult<BusinessProfile>> {
  const start = Date.now();

  try {
    // Step 1: Run multiple targeted searches
    const queries = [
      `"${input.companyName}" solar ${input.state}`,
      `"${input.companyName}" ${input.state} IndiaMART OR Justdial`,
    ];

    const searchResults = await Promise.all(
      queries.map((q) => webSearch(q, 5))
    );
    const allResults = searchResults.flat();

    // Step 2: Scrape the top result page for richer content (limit to 1 to save time)
    let scrapedContent = "";
    const urlsToScrape = allResults
      .filter((r) => r.url && !r.url.includes("google.com"))
      .slice(0, 1);

    for (const result of urlsToScrape) {
      try {
        const scraped = await scrapeUrl(result.url);
        if (scraped.text) {
          scrapedContent += `\n\n=== Content from ${result.url} ===\n${scraped.text.slice(0, 2000)}`;
        }
      } catch {
        // Continue if scraping fails
      }
    }

    // Step 3: Build the prompt and call LLM
    const searchSnippets = allResults
      .map(
        (r, i) =>
          `${i + 1}. [${r.title}] (${r.url})\n   ${r.snippet}`
      )
      .join("\n");

    const userPrompt = `Research the following company and extract a structured business profile.

Company: ${input.companyName}
State: ${input.state}
${input.existingEmail ? `Known email: ${input.existingEmail}` : ""}

=== SEARCH RESULTS ===
${searchSnippets || "No search results found."}

=== SCRAPED WEBSITE CONTENT ===
${scrapedContent || "No website content available."}`;

    const profile = await callLLMForJSON<BusinessProfile>(
      SYSTEM_PROMPT,
      userPrompt
    );

    if (profile) {
      // Validate with Zod
      const parsed = BusinessProfileSchema.safeParse(profile);
      if (parsed.success) {
        return {
          success: true,
          data: parsed.data,
          durationMs: Date.now() - start,
        };
      }
    }

    // If LLM returned data but validation failed, return what we got
    if (profile) {
      return {
        success: true,
        data: {
          companyName: input.companyName,
          summary: profile.summary || `Solar energy company based in ${input.state}.`,
          industry: profile.industry || "Solar",
          sizeSignals: profile.sizeSignals || [],
          digitalPresence: profile.digitalPresence || { website: null, socialMedia: [], directories: [] },
          systemsUsed: profile.systemsUsed || [],
          searchSources: allResults.map((r) => r.url).filter(Boolean),
        },
        durationMs: Date.now() - start,
      };
    }

    // Fallback: minimal profile
    return {
      success: false,
      data: createFallbackProfile(input, allResults.map((r) => r.url)),
      error: "LLM failed to generate profile",
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      data: createFallbackProfile(input, []),
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - start,
    };
  }
}

function createFallbackProfile(
  input: ResearcherInput,
  sources: string[]
): BusinessProfile {
  return {
    companyName: input.companyName,
    summary: `Solar energy company based in ${input.state}. Limited web presence found.`,
    industry: "Solar",
    sizeSignals: ["Unknown"],
    digitalPresence: { website: null, socialMedia: [], directories: [] },
    systemsUsed: ["Unknown"],
    searchSources: sources.filter(Boolean),
  };
}
