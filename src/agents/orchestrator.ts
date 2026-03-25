import { runResearcher } from "./researcher";
import { runContactFinder } from "./contact-finder";
import { runOutreachWriter } from "./outreach-writer";
import { PipelineResult } from "./types";
import { LeadRecord } from "@/services/excel-parser";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run the full 3-agent pipeline for a single lead.
 * Each agent's output feeds into the next.
 * Delays between agents to respect LLM rate limits.
 */
export async function runPipeline(lead: LeadRecord): Promise<PipelineResult> {
  const pipelineStart = Date.now();

  // Agent 1: Researcher
  const profileResult = await runResearcher({
    companyName: lead.companyName,
    state: lead.state,
    existingEmail: lead.email || lead.cleanEmail,
  });

  // Wait 3s between agents to let rate limits recover
  await sleep(3000);

  // Agent 2: Contact Finder (uses Agent 1's output)
  const contactResult = await runContactFinder({
    profile: profileResult.data!,
    excelEmail: lead.email || lead.cleanEmail,
    excelPhone: lead.phone,
    excelAlternateNumber: lead.alternateNumber,
  });

  // Wait 3s between agents
  await sleep(3000);

  // Agent 3: Outreach Writer (uses Agent 1 + Agent 2's output)
  const outreachResult = await runOutreachWriter({
    profile: profileResult.data!,
    contacts: contactResult.data!,
  });

  // Determine overall status
  const allSucceeded =
    profileResult.success && contactResult.success && outreachResult.success;
  const hasAnyData =
    profileResult.data || contactResult.data || outreachResult.data;

  return {
    leadId: lead.id,
    status: allSucceeded ? "completed" : hasAnyData ? "partial" : "failed",
    profile: profileResult,
    contacts: contactResult,
    outreach: outreachResult,
    totalDurationMs: Date.now() - pipelineStart,
  };
}
