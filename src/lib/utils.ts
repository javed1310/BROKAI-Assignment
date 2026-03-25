/**
 * De-obfuscate emails from formats like: name[at]domain[dot]com
 */
export function deobfuscateEmail(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/\s*\[at\]\s*/gi, "@")
    .replace(/\s*\[dot\]\s*/gi, ".")
    .replace(/^Email\s*:\s*/i, "")
    .trim();
}

/**
 * Clean and normalize phone numbers
 * Handles formats like: 91 98449 33433, 088246 50462, +91-98287-14888
 */
export function normalizePhone(raw: string): string {
  if (!raw || raw.toLowerCase() === "no contact") return "";
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return "";
  // If starts with 91 and has 12 digits, format as +91 XXXXX XXXXX
  if (digits.startsWith("91") && digits.length === 12) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  // If 10 digits, assume Indian number
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return raw.trim();
}

/**
 * Generate a unique ID for a lead
 */
export function generateLeadId(index: number, companyName: string): string {
  const slug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 30);
  return `${index}-${slug}`;
}
