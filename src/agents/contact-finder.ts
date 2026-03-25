import { webSearch } from "@/services/search";
import { scrapeUrl } from "@/services/scraper";
import { callLLMForJSON } from "@/services/llm";
import {
  BusinessProfile,
  ContactCard,
  ContactCardSchema,
  ContactEntry,
  AgentResult,
} from "./types";

const SYSTEM_PROMPT = `You are a contact information specialist. Given scraped content from websites, search results, and existing data, extract all contact details for the company.

Return ONLY valid JSON matching this exact schema:
{
  "companyName": "string",
  "contacts": [
    {
      "name": "string (optional - contact person name if found)",
      "role": "string (optional - their role/title)",
      "phone": "string (optional - phone number)",
      "email": "string (optional - email address)",
      "whatsapp": "string (optional - WhatsApp number if different from phone)",
      "source": "string (URL or description of where this was found)"
    }
  ],
  "addresses": ["string array of physical addresses found"],
  "confidence": "high | medium | low"
}

Rules:
- Include ALL contact entries found from different sources.
- Always include the source URL for each contact.
- Set confidence to "high" if you found contacts from the company website, "medium" if from directories, "low" if only from the provided dataset.
- Do NOT make up contact information. Only extract what is actually present in the data.
- Phone numbers should be in Indian format where applicable.`;

interface ContactFinderInput {
  profile: BusinessProfile;
  excelEmail?: string;
  excelPhone?: string;
  excelAlternateNumber?: string;
}

export async function runContactFinder(
  input: ContactFinderInput
): Promise<AgentResult<ContactCard>> {
  const start = Date.now();

  try {
    const allScrapedText: string[] = [];
    const scrapedPhones: string[] = [];
    const scrapedEmails: string[] = [];

    // Step 1: Start with Excel data
    const excelContacts: ContactEntry[] = [];
    if (input.excelEmail || input.excelPhone) {
      excelContacts.push({
        email: input.excelEmail || undefined,
        phone: input.excelPhone || undefined,
        source: "Provided dataset (Excel)",
      });
    }
    if (input.excelAlternateNumber) {
      excelContacts.push({
        phone: input.excelAlternateNumber,
        source: "Provided dataset (Excel) - alternate number",
      });
    }

    // Step 2: Scrape company website contact page
    if (input.profile.digitalPresence.website) {
      const baseUrl = input.profile.digitalPresence.website;
      const contactUrls = [
        baseUrl,
        `${baseUrl}/contact`,
        `${baseUrl}/contact-us`,
        `${baseUrl}/about`,
      ];

      for (const url of contactUrls) {
        try {
          const scraped = await scrapeUrl(url);
          if (scraped.text) {
            allScrapedText.push(`=== ${url} ===\n${scraped.text.slice(0, 2000)}`);
            scrapedPhones.push(...scraped.phones);
            scrapedEmails.push(...scraped.emails);
          }
        } catch {
          // Continue if one page fails
        }
      }
    }

    // Step 3: Search for contact info
    const contactQuery = `"${input.profile.companyName}" contact number ${input.profile.digitalPresence.website ? "" : "Rajasthan"}`;
    const searchResults = await webSearch(contactQuery, 5);

    const searchSnippets = searchResults
      .map((r) => `[${r.title}] (${r.url})\n${r.snippet}`)
      .join("\n\n");

    // Step 4: Build prompt and call LLM
    const userPrompt = `Find contact information for: ${input.profile.companyName}

=== EXISTING DATA (from provided dataset) ===
${input.excelEmail ? `Email: ${input.excelEmail}` : "No email in dataset"}
${input.excelPhone ? `Phone: ${input.excelPhone}` : "No phone in dataset"}
${input.excelAlternateNumber ? `Alternate: ${input.excelAlternateNumber}` : ""}

=== SCRAPED WEBSITE CONTENT ===
${allScrapedText.join("\n\n") || "No website content available."}

=== ADDITIONAL PHONES FOUND BY SCRAPER ===
${scrapedPhones.length > 0 ? scrapedPhones.join(", ") : "None"}

=== ADDITIONAL EMAILS FOUND BY SCRAPER ===
${scrapedEmails.length > 0 ? scrapedEmails.join(", ") : "None"}

=== SEARCH RESULTS ===
${searchSnippets || "No search results found."}`;

    const contactCard = await callLLMForJSON<ContactCard>(
      SYSTEM_PROMPT,
      userPrompt
    );

    if (contactCard) {
      const parsed = ContactCardSchema.safeParse(contactCard);
      if (parsed.success) {
        // Merge Excel contacts if not already included
        const mergedContacts = mergeContacts(parsed.data.contacts, excelContacts);
        return {
          success: true,
          data: { ...parsed.data, contacts: mergedContacts },
          durationMs: Date.now() - start,
        };
      }
    }

    // Fallback: return Excel data
    return {
      success: false,
      data: createFallbackCard(input, excelContacts),
      error: "LLM failed to extract contacts",
      durationMs: Date.now() - start,
    };
  } catch (error) {
    const excelContacts: ContactEntry[] = [];
    if (input.excelEmail || input.excelPhone) {
      excelContacts.push({
        email: input.excelEmail || undefined,
        phone: input.excelPhone || undefined,
        source: "Provided dataset (Excel)",
      });
    }

    return {
      success: false,
      data: createFallbackCard(input, excelContacts),
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - start,
    };
  }
}

function mergeContacts(
  llmContacts: ContactEntry[],
  excelContacts: ContactEntry[]
): ContactEntry[] {
  const merged = [...llmContacts];
  for (const ec of excelContacts) {
    const alreadyExists = merged.some(
      (c) =>
        (c.email && c.email === ec.email) ||
        (c.phone && c.phone === ec.phone)
    );
    if (!alreadyExists) {
      merged.push(ec);
    }
  }
  return merged;
}

function createFallbackCard(
  input: ContactFinderInput,
  excelContacts: ContactEntry[]
): ContactCard {
  return {
    companyName: input.profile.companyName,
    contacts:
      excelContacts.length > 0
        ? excelContacts
        : [{ source: "No contacts found" }],
    addresses: [],
    confidence: excelContacts.length > 0 ? "low" : "low",
  };
}
