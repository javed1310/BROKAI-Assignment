import * as XLSX from "xlsx";
import { deobfuscateEmail, normalizePhone, generateLeadId } from "@/lib/utils";

export interface LeadRecord {
  id: string;
  index: number;
  state: string;
  companyName: string;
  email: string;
  phone: string;
  alternateNumber: string;
  cleanEmail: string;
  notes: string;
  reachoutStatus: string;
  followUpDone: string;
}

/**
 * Parse an Excel buffer into structured lead records.
 * Handles the specific format of the Brokai lead list:
 * Columns: index, state, company name, email (obfuscated), phone, reachout sent, note, alternate number, email, follow up done
 */
export function parseExcelBuffer(buffer: ArrayBuffer): LeadRecord[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });

  const leads: LeadRecord[] = [];

  // Skip header row (row 0)
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;

    const companyName = String(row[2] || "").trim();
    if (!companyName) continue;

    const rawEmail = String(row[3] || "");
    const phone = String(row[4] || "");
    const alternateNumber = String(row[7] || "");
    const cleanEmailCol = String(row[8] || "");

    leads.push({
      id: generateLeadId(i, companyName),
      index: i,
      state: String(row[1] || "").trim(),
      companyName,
      email: deobfuscateEmail(rawEmail),
      phone: normalizePhone(phone),
      alternateNumber: normalizePhone(alternateNumber),
      cleanEmail: cleanEmailCol.trim(),
      notes: String(row[6] || "").trim(),
      reachoutStatus: String(row[5] || "").trim(),
      followUpDone: String(row[9] || "").trim(),
    });
  }

  return leads;
}
