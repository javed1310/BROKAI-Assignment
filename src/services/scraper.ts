import * as cheerio from "cheerio";

export interface ScrapedContent {
  text: string;
  phones: string[];
  emails: string[];
  title: string;
}

const PHONE_REGEX = /(?:\+91[\s-]?)?[6-9]\d{9}/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/**
 * Two-tier scraping: Cheerio first (fast), Playwright fallback (JS-rendered).
 */
export async function scrapeUrl(url: string): Promise<ScrapedContent> {
  // Try Cheerio first (static HTML)
  const cheerioResult = await scrapeWithCheerio(url);
  if (cheerioResult.text.length > 100) {
    return cheerioResult;
  }

  // Fallback to Playwright for JS-rendered pages
  const playwrightResult = await scrapeWithPlaywright(url);
  return playwrightResult.text.length > cheerioResult.text.length
    ? playwrightResult
    : cheerioResult;
}

/**
 * Fast static HTML scraping with Cheerio
 */
async function scrapeWithCheerio(url: string): Promise<ScrapedContent> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return emptyContent();

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove script, style, nav, footer tags
    $("script, style, nav, footer, header, noscript, iframe").remove();

    const title = $("title").text().trim();
    const text = $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000); // Limit to 5000 chars

    const phones = extractPhones(text);
    const emails = extractEmails(text);

    return { text, phones, emails, title };
  } catch {
    return emptyContent();
  }
}

/**
 * Playwright fallback for JS-rendered pages.
 * Uses a singleton browser instance.
 */
let browserInstance: import("playwright").Browser | null = null;

async function getBrowser() {
  if (!browserInstance) {
    const { chromium } = await import("playwright");
    browserInstance = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserInstance;
}

async function scrapeWithPlaywright(url: string): Promise<ScrapedContent> {
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9",
    });

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    // Wait a bit for JS to render
    await page.waitForTimeout(2000);

    const title = await page.title();
    const text = await page.evaluate(() => {
      const el = document.body;
      if (!el) return "";
      // Remove script/style elements
      el.querySelectorAll("script, style, nav, footer, header").forEach(
        (e) => e.remove()
      );
      return (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 5000);
    });

    await page.close();

    const phones = extractPhones(text);
    const emails = extractEmails(text);

    return { text, phones, emails, title };
  } catch {
    return emptyContent();
  }
}

function extractPhones(text: string): string[] {
  const matches = text.match(PHONE_REGEX) || [];
  return [...new Set(matches)];
}

function extractEmails(text: string): string[] {
  const matches = text.match(EMAIL_REGEX) || [];
  return [...new Set(matches)].filter(
    (e) => !e.endsWith(".png") && !e.endsWith(".jpg") && !e.endsWith(".svg")
  );
}

function emptyContent(): ScrapedContent {
  return { text: "", phones: [], emails: [], title: "" };
}
