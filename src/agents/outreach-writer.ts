import { callLLMForJSON } from "@/services/llm";
import {
  BusinessProfile,
  ContactCard,
  OutreachMessage,
  OutreachMessageSchema,
  AgentResult,
} from "./types";

const SYSTEM_PROMPT = `You are writing a WhatsApp message on behalf of Brokai Labs to a specific solar business in Rajasthan.

Brokai Labs builds:
- AI Voice Receptionists (auto-answer customer calls 24/7)
- Field operations SaaS (manage installation teams, scheduling, dispatching)
- Communication automation (WhatsApp/SMS follow-ups with leads)
- CRM and booking systems for SMBs

Return ONLY valid JSON:
{
  "whatsappMessage": "string (the WhatsApp message)",
  "personalizationPoints": ["what you personalized"],
  "callToAction": "string (the ask)"
}

RULES FOR THE MESSAGE:
1. MUST mention the company by name (e.g., "Hi Siddharth, saw that URJASVINI specializes in on-grid solar systems...")
2. MUST reference ONE specific detail from their profile (their products, employee count, years in business, website, or a specific service they offer)
3. Lead with an OUTCOME relevant to THEIR situation, not Brokai's features
4. Keep it 3-4 short sentences MAX — this is WhatsApp, not email
5. End with a casual question (not "Would you be open to..." — too salesy)
6. Sound like a real person texting, not a marketing template

GOOD EXAMPLE:
"Hi Ravi, saw that Penta Solarex handles both residential and commercial installations across Rajasthan. With that volume, how are you currently managing incoming customer inquiries? We built an AI receptionist at Brokai that handles calls 24/7 — could be useful during peak season. Worth a quick look?"

BAD EXAMPLE (too generic, don't do this):
"Hi, we help solar companies automate customer communication. Would you be open to a 5-minute chat?"

ADAPT the pitch based on the company:
- No CRM detected → pitch booking/CRM system
- Small team → pitch AI receptionist to handle overflow calls
- Multiple locations → pitch field operations SaaS
- No website → pitch digital presence + communication tools
- Large company → pitch enterprise automation`;

interface OutreachInput {
  profile: BusinessProfile;
  contacts: ContactCard;
}

export async function runOutreachWriter(
  input: OutreachInput
): Promise<AgentResult<OutreachMessage>> {
  const start = Date.now();

  try {
    const contactName = input.contacts.contacts.find((c) => c.name)?.name;
    const contactRole = input.contacts.contacts.find((c) => c.role)?.role;

    // Build personalization hints for the LLM
    const hints = buildPersonalizationHints(input.profile);

    const userPrompt = `Write a WhatsApp outreach message for this company.

=== COMPANY ===
Name: ${input.profile.companyName}
${contactName ? `Contact person: ${contactName}${contactRole ? ` (${contactRole})` : ""}` : "No contact name — start with company name instead"}
Summary: ${input.profile.summary}
Industry: ${input.profile.industry}
Size: ${input.profile.sizeSignals.join(", ") || "Unknown"}
Website: ${input.profile.digitalPresence.website || "No website found"}
Systems: ${input.profile.systemsUsed.join(", ") || "Unknown"}

=== PERSONALIZATION HINTS (use at least ONE) ===
${hints.join("\n")}

=== WHAT TO PITCH ===
${getPitchDirection(input.profile)}`;

    const message = await callLLMForJSON<OutreachMessage>(
      SYSTEM_PROMPT,
      userPrompt
    );

    if (message) {
      const parsed = OutreachMessageSchema.safeParse(message);
      if (parsed.success) {
        return {
          success: true,
          data: parsed.data,
          durationMs: Date.now() - start,
        };
      }
    }

    return {
      success: false,
      data: createFallbackMessage(input, contactName),
      error: "LLM failed to generate outreach message",
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      data: createFallbackMessage(input, input.contacts.contacts.find((c) => c.name)?.name),
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - start,
    };
  }
}

/**
 * Extract specific, personalizable facts from the business profile.
 */
function buildPersonalizationHints(profile: BusinessProfile): string[] {
  const hints: string[] = [];

  if (profile.summary && profile.summary !== "Limited web presence found.") {
    // Extract specific services/products mentioned
    const keywords = ["rooftop", "ground mount", "on-grid", "off-grid", "hybrid", "EPC", "residential", "commercial", "industrial", "installer", "dealer", "manufacturer"];
    for (const kw of keywords) {
      if (profile.summary.toLowerCase().includes(kw)) {
        hints.push(`They do ${kw} solar work — reference this`);
      }
    }
  }

  for (const signal of profile.sizeSignals) {
    if (signal !== "Unknown") {
      hints.push(`Size detail: "${signal}" — mention this to show you researched them`);
    }
  }

  if (profile.digitalPresence.website) {
    hints.push(`They have a website (${profile.digitalPresence.website}) — shows digital awareness`);
  } else {
    hints.push(`No website found — they may need help with digital presence`);
  }

  if (profile.systemsUsed.some((s) => s.toLowerCase().includes("no crm"))) {
    hints.push(`No CRM detected — pitch Brokai's CRM/booking system`);
  }

  if (profile.digitalPresence.directories.length > 0) {
    hints.push(`Listed on ${profile.digitalPresence.directories.length} directories — they're actively seeking business`);
  }

  if (hints.length === 0) {
    hints.push(`They are a ${profile.industry} company in Rajasthan`);
  }

  return hints;
}

/**
 * Determine the best Brokai product to pitch based on the company profile.
 */
function getPitchDirection(profile: BusinessProfile): string {
  const systems = profile.systemsUsed.join(" ").toLowerCase();
  const summary = profile.summary.toLowerCase();
  const size = profile.sizeSignals.join(" ").toLowerCase();

  if (systems.includes("no crm")) {
    return "Pitch: Brokai's CRM and booking system — they have no CRM, so managing customer inquiries and installation schedules is likely manual and chaotic.";
  }
  if (size.includes("50") || size.includes("100") || size.includes("large")) {
    return "Pitch: Brokai's field operations SaaS — with a larger team, managing technicians, schedules, and dispatching is a pain point.";
  }
  if (!profile.digitalPresence.website) {
    return "Pitch: Brokai's communication automation — without a website, they rely on phone/WhatsApp for leads, so an AI receptionist that never misses a call is valuable.";
  }
  if (summary.includes("residential") || summary.includes("rooftop")) {
    return "Pitch: Brokai's AI voice receptionist — residential solar companies get high call volume from homeowners wanting quotes. An AI that handles initial inquiries saves time.";
  }
  return "Pitch: Brokai's AI voice receptionist — solar companies miss customer calls during installations. An always-available AI that handles inquiries and books appointments increases conversions.";
}

function createFallbackMessage(
  input: OutreachInput,
  contactName?: string
): OutreachMessage {
  const greeting = contactName ? `Hi ${contactName}` : `Hi`;
  const specific = input.profile.sizeSignals.find((s) => s !== "Unknown") || input.profile.industry;

  return {
    whatsappMessage: `${greeting}, noticed ${input.profile.companyName} is doing great work in ${input.profile.industry}${specific !== input.profile.industry ? ` (${specific})` : ""} in Rajasthan. Quick question — how are you currently handling incoming customer inquiries when your team is out on installations? We built something at Brokai Labs that might help. Happy to share a quick demo if you're curious.`,
    personalizationPoints: [
      `Company name: ${input.profile.companyName}`,
      `Industry: ${input.profile.industry}`,
      `Detail: ${specific}`,
    ],
    callToAction: "Quick demo if curious",
  };
}
