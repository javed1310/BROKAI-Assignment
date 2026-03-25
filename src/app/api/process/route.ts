import { NextRequest, NextResponse } from "next/server";
import { runPipeline } from "@/agents/orchestrator";
import { LeadRecord } from "@/services/excel-parser";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const lead = body.lead as LeadRecord;

    if (!lead || !lead.companyName) {
      return NextResponse.json(
        { error: "Invalid lead data. companyName is required." },
        { status: 400 }
      );
    }

    const result = await runPipeline(lead);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("Process error:", error);
    return NextResponse.json(
      {
        error: "Failed to process lead",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
