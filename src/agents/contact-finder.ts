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

const PHONE_REGEX = /(?:\+91[\s-]?)?[6-9]\d{9}/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

const SYSTEM_PROMPT = `You are a contact information specialist for Indian businesses. Your PRIMARY job is to find PHONE NUMBERS, EMAIL ADDRESSES, and WHATSAPP NUMBERS.

Return ONLY valid JSON matching this schema:
{
  "companyName": "string",
  "contacts": [
    {
      "name": "string (optional - contact person name)",
      "role": "string (optional - their role/title)",
      "phone": "string (PRIORITY - phone number in Indian format)",
      "email": "string (email address)",
      "whatsapp": "string (WhatsApp number - for Indian businesses, this is usually the same as the phone number)",
      "source": "string (URL where this contact was found)"
    }
  ],
  "addresses": ["string array of physical addresses found"],
  "confidence": "high | medium | low"
}

CRITICAL RULES:
- PHONE NUMBERS are the #1 priority. Extract every phone number you find.
- Indian phone numbers are 10 digits starting with 6-9, often prefixed with +91 or 91.
- Look for patterns like: 098877 55000, +91 98877 55000, 9887755000, 91-98877-55000
- ONLY set whatsapp if there is EXPLICIT evidence: a wa.me link, "WhatsApp" text near the number, or a "Chat on WhatsApp" button. Do NOT assume every phone is WhatsApp.
- Extract phone numbers from search snippets — they often appear in the text.
- Include the source URL for EVERY contact entry.
- Set confidence: "high" if from company website, "medium" if from directories, "low" if only from dataset.
- Do NOT make up information.`;

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
    const allPhones: string[] = [];
    const allEmails: string[] = [];

    // Step 1: Collect Excel data (no WhatsApp assumption — only set if verified)
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

    const verifiedWhatsAppNumbers: string[] = [];

    // Step 2: Scrape company website
    if (input.profile.digitalPresence.website) {
      const baseUrl = input.profile.digitalPresence.website;
      try {
        const scraped = await scrapeUrl(baseUrl);
        if (scraped.text) {
          allScrapedText.push(`=== ${baseUrl} ===\n${scraped.text.slice(0, 2000)}`);
          allPhones.push(...scraped.phones);
          allEmails.push(...scraped.emails);
          verifiedWhatsAppNumbers.push(...scraped.whatsappNumbers);
        }
      } catch {
        // Continue
      }
    }

    // Step 3: Multiple targeted searches for phone/contact info
    const searchQueries = [
      `"${input.profile.companyName}" phone contact Rajasthan`,
      `"${input.profile.companyName}" site:indiamart.com OR site:justdial.com`,
    ];

    const allSearchResults = [];
    for (const query of searchQueries) {
      const results = await webSearch(query, 5);
      allSearchResults.push(...results);
    }

    // Step 4: Extract phones and emails from search snippets
    // NOTE: WhatsApp detection is handled ONLY by the scraper (wa.me links,
    // api.whatsapp.com links, explicit "WhatsApp: <number>" text patterns).
    // We do NOT mark numbers as WhatsApp just because the word appears in a snippet.
    for (const result of allSearchResults) {
      const snippetPhones = result.snippet.match(PHONE_REGEX) || [];
      const snippetEmails = result.snippet.match(EMAIL_REGEX) || [];
      allPhones.push(...snippetPhones);
      allEmails.push(...snippetEmails);
    }

    const searchSnippets = allSearchResults
      .map((r) => `[${r.title}] (${r.url})\n${r.snippet}`)
      .join("\n\n");

    // Deduplicate
    const uniquePhones = [...new Set(allPhones)];
    const uniqueEmails = [...new Set(allEmails.filter(
      (e) => !e.endsWith(".png") && !e.endsWith(".jpg")
    ))];

    // Step 5: Call LLM with all collected data
    const userPrompt = `Find ALL contact information for: ${input.profile.companyName}

=== EXISTING DATA (from provided dataset) ===
Email: ${input.excelEmail || "Not available"}
Phone: ${input.excelPhone || "Not available"}
${input.excelAlternateNumber ? `Alternate phone: ${input.excelAlternateNumber}` : ""}

=== PHONE NUMBERS FOUND BY SCRAPER (extract these!) ===
${uniquePhones.length > 0 ? uniquePhones.join(", ") : "None found"}

=== EMAIL ADDRESSES FOUND BY SCRAPER ===
${uniqueEmails.length > 0 ? uniqueEmails.join(", ") : "None found"}

=== VERIFIED WHATSAPP NUMBERS (from wa.me links or explicit "WhatsApp" mentions) ===
${[...new Set(verifiedWhatsAppNumbers)].length > 0 ? [...new Set(verifiedWhatsAppNumbers)].join(", ") : "None verified"}

=== SCRAPED WEBSITE CONTENT ===
${allScrapedText.join("\n\n") || "No website content available."}

=== SEARCH RESULTS (look for phone numbers in these snippets!) ===
${searchSnippets || "No search results found."}

IMPORTANT: Extract every phone number and email. Only set whatsapp if there is explicit evidence (verified numbers above, wa.me links, or "WhatsApp" text).`;

    const contactCard = await callLLMForJSON<ContactCard>(
      SYSTEM_PROMPT,
      userPrompt
    );

    if (contactCard) {
      const parsed = ContactCardSchema.safeParse(contactCard);
      if (parsed.success) {
        const mergedContacts = mergeContacts(parsed.data.contacts, excelContacts);
        return {
          success: true,
          data: { ...parsed.data, contacts: mergedContacts },
          durationMs: Date.now() - start,
        };
      }
    }

    // Fallback: build contact card from regex-extracted data + Excel
    const verifiedWASet = new Set(verifiedWhatsAppNumbers);
    const scrapedContacts: ContactEntry[] = [];
    for (const phone of uniquePhones) {
      if (!excelContacts.some((c) => c.phone === phone)) {
        scrapedContacts.push({
          phone,
          whatsapp: verifiedWASet.has(phone) ? phone : undefined,
          source: "Extracted from web search results",
        });
      }
    }
    for (const email of uniqueEmails) {
      if (!excelContacts.some((c) => c.email === email)) {
        scrapedContacts.push({ email, source: "Extracted from web search results" });
      }
    }
    const allContacts = [...excelContacts, ...scrapedContacts];

    return {
      success: allContacts.length > 0,
      data: {
        companyName: input.profile.companyName,
        contacts: allContacts.length > 0 ? allContacts : [{ source: "No contacts found" }],
        addresses: [],
        confidence: scrapedContacts.length > 0 ? "medium" : excelContacts.length > 0 ? "low" : "low",
      },
      error: scrapedContacts.length > 0 ? undefined : "Limited contact info found",
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
      data: {
        companyName: input.profile.companyName,
        contacts: excelContacts.length > 0 ? excelContacts : [{ source: "No contacts found" }],
        addresses: [],
        confidence: "low",
      },
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
