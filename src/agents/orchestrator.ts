import { runResearcher } from "./researcher";
import { runContactFinder } from "./contact-finder";
import { runOutreachWriter } from "./outreach-writer";
import { PipelineResult } from "./types";
import { LeadRecord } from "@/services/excel-parser";

/**
 * Run the full 3-agent pipeline for a single lead.
 * Each agent's output feeds into the next.
 * Failures are caught per-agent — the pipeline continues with fallbacks.
 */
export async function runPipeline(lead: LeadRecord): Promise<PipelineResult> {
  const pipelineStart = Date.now();

  // Agent 1: Researcher
  const profileResult = await runResearcher({
    companyName: lead.companyName,
    state: lead.state,
    existingEmail: lead.email || lead.cleanEmail,
  });

  // Agent 2: Contact Finder (uses Agent 1's output)
  const contactResult = await runContactFinder({
    profile: profileResult.data!,
    excelEmail: lead.email || lead.cleanEmail,
    excelPhone: lead.phone,
    excelAlternateNumber: lead.alternateNumber,
  });

  // Agent 3: Outreach Writer (uses Agent 1 + Agent 2's output)
  const outreachResult = await runOutreachWriter({
    profile: profileResult.data!,
    contacts: contactResult.data!,
  });

  // Determine overall status
  const allSucceeded =
    profileResult.success && contactResult.success && outreachResult.success;
  const allFailed =
    !profileResult.success && !contactResult.success && !outreachResult.success;

  return {
    leadId: lead.id,
    status: allSucceeded ? "completed" : allFailed ? "failed" : "partial",
    profile: profileResult,
    contacts: contactResult,
    outreach: outreachResult,
    totalDurationMs: Date.now() - pipelineStart,
  };
}
