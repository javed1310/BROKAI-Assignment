import { NextRequest, NextResponse } from "next/server";
import { parseExcelBuffer } from "@/services/excel-parser";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const validTypes = [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ];
    if (!validTypes.includes(file.type) && !file.name.match(/\.xlsx?$/i)) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload an Excel file (.xlsx or .xls)" },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const leads = parseExcelBuffer(buffer);

    if (leads.length === 0) {
      return NextResponse.json(
        { error: "No valid company records found in the file" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      count: leads.length,
      leads,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Failed to parse Excel file" },
      { status: 500 }
    );
  }
}
