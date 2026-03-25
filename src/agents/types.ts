import { z } from "zod";

// ============================================================
// Agent Interface
// ============================================================

export interface AgentResult<T> {
  success: boolean;
  data: T | null;
  error?: string;
  durationMs: number;
}

// ============================================================
// Agent 1: Researcher — Output Schema
// ============================================================

export const BusinessProfileSchema = z.object({
  companyName: z.string(),
  summary: z.string(),
  industry: z.string(),
  sizeSignals: z.array(z.string()),
  digitalPresence: z.object({
    website: z.string().nullable(),
    socialMedia: z.array(z.string()),
    directories: z.array(z.string()),
  }),
  systemsUsed: z.array(z.string()),
  searchSources: z.array(z.string()),
});

export type BusinessProfile = z.infer<typeof BusinessProfileSchema>;

// ============================================================
// Agent 2: Contact Finder — Output Schema
// ============================================================

export const ContactEntrySchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  whatsapp: z.string().optional(),
  source: z.string(),
});

export const ContactCardSchema = z.object({
  companyName: z.string(),
  contacts: z.array(ContactEntrySchema),
  addresses: z.array(z.string()),
  confidence: z.enum(["high", "medium", "low"]),
});

export type ContactEntry = z.infer<typeof ContactEntrySchema>;
export type ContactCard = z.infer<typeof ContactCardSchema>;

// ============================================================
// Agent 3: Outreach Writer — Output Schema
// ============================================================

export const OutreachMessageSchema = z.object({
  whatsappMessage: z.string(),
  personalizationPoints: z.array(z.string()),
  callToAction: z.string(),
});

export type OutreachMessage = z.infer<typeof OutreachMessageSchema>;

// ============================================================
// Pipeline Result — Full output for one lead
// ============================================================

export interface PipelineResult {
  leadId: string;
  status: "completed" | "partial" | "failed";
  profile: AgentResult<BusinessProfile>;
  contacts: AgentResult<ContactCard>;
  outreach: AgentResult<OutreachMessage>;
  totalDurationMs: number;
}
