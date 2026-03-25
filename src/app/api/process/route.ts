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

    if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) {
      return NextResponse.json(
        { error: "No LLM API key configured. Set GEMINI_API_KEY or GROQ_API_KEY in .env.local" },
        { status: 500 }
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
