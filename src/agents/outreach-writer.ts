import { callLLMForJSON } from "@/services/llm";
import {
  BusinessProfile,
  ContactCard,
  OutreachMessage,
  OutreachMessageSchema,
  AgentResult,
} from "./types";

const SYSTEM_PROMPT = `You are a sales copywriter for Brokai Labs — an AI systems company that builds voice receptionists, SaaS platforms, and automation tools for small and medium businesses.

Your task: Write a personalized WhatsApp-style cold outreach message for the given company.

Return ONLY valid JSON matching this exact schema:
{
  "whatsappMessage": "string (the actual WhatsApp message text, 3-5 sentences max)",
  "personalizationPoints": ["string array of what you personalized based on their profile"],
  "callToAction": "string (the specific ask in the message)"
}

Message guidelines:
- WhatsApp-style: short, conversational, no formal salutation
- Lead with OUTCOME, not features (e.g. "never miss a customer call" not "we have AI voice tech")
- Reference something specific about their business (industry, size, digital presence)
- Position Brokai as solving a pain point relevant to their business
- End with a soft call-to-action (question, not a demand)
- Keep it under 500 characters total
- Do NOT use emojis excessively (1-2 max)
- Sound human, not like a template`;

interface OutreachInput {
  profile: BusinessProfile;
  contacts: ContactCard;
}

export async function runOutreachWriter(
  input: OutreachInput
): Promise<AgentResult<OutreachMessage>> {
  const start = Date.now();

  try {
    // Pick the best contact name if available
    const contactName = input.contacts.contacts.find((c) => c.name)?.name;

    const userPrompt = `Write a personalized WhatsApp outreach message for this company.

=== COMPANY PROFILE ===
Company: ${input.profile.companyName}
Summary: ${input.profile.summary}
Industry: ${input.profile.industry}
Size signals: ${input.profile.sizeSignals.join(", ") || "Unknown"}
Website: ${input.profile.digitalPresence.website || "None found"}
Current systems: ${input.profile.systemsUsed.join(", ") || "Unknown"}

=== CONTACT INFO ===
${contactName ? `Contact person: ${contactName}` : "No contact name available"}
${input.contacts.contacts.map((c) => `${c.role ? c.role + ": " : ""}${c.phone || ""} ${c.email || ""}`).join("\n")}

=== BROKAI LABS CONTEXT ===
Brokai Labs builds AI-powered systems for SMBs:
- AI Voice Receptionists (never miss a customer call)
- Field operations SaaS (manage technicians, schedules, dispatching)
- Communication automation (WhatsApp, SMS, email follow-ups)
- CRM and booking systems

For a solar company, Brokai can help with:
- Automatically answering customer inquiries about solar installations
- Managing installation team schedules and dispatching
- Following up with leads who requested quotes
- Sending automated updates to customers about installation progress`;

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

    // Fallback: template message
    return {
      success: false,
      data: createFallbackMessage(input),
      error: "LLM failed to generate outreach message",
      durationMs: Date.now() - start,
    };
  } catch (error) {
    return {
      success: false,
      data: createFallbackMessage(input),
      error: error instanceof Error ? error.message : "Unknown error",
      durationMs: Date.now() - start,
    };
  }
}

function createFallbackMessage(input: OutreachInput): OutreachMessage {
  const name = input.contacts.contacts.find((c) => c.name)?.name;
  const greeting = name ? `Hi ${name}` : "Hi";

  return {
    whatsappMessage: `${greeting}, I'm reaching out from Brokai Labs. We help solar businesses like ${input.profile.companyName} automate customer communication with AI-powered voice receptionists and follow-up systems. Would you be open to a quick 5-minute chat about how we could help you handle more customer inquiries without missing any?`,
    personalizationPoints: [
      `Company name: ${input.profile.companyName}`,
      `Industry: ${input.profile.industry}`,
    ],
    callToAction: "Quick 5-minute chat",
  };
}
