export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

// In-memory cache to avoid duplicate queries
const searchCache = new Map<string, SearchResult[]>();

/**
 * Search using Serper.dev API (primary) with fallback.
 * Returns top search results for a given query.
 */
export async function webSearch(
  query: string,
  maxResults = 5
): Promise<SearchResult[]> {
  const cacheKey = query.toLowerCase().trim();
  if (searchCache.has(cacheKey)) {
    return searchCache.get(cacheKey)!;
  }

  let results: SearchResult[] = [];

  // Try Serper.dev first
  if (process.env.SERPER_API_KEY) {
    results = await searchWithSerper(query, maxResults);
  }

  // Fallback: scrape Google directly
  if (results.length === 0) {
    results = await searchWithGoogleScraper(query, maxResults);
  }

  searchCache.set(cacheKey, results);
  return results;
}

/**
 * Serper.dev API - real Google results as JSON
 */
async function searchWithSerper(
  query: string,
  maxResults: number
): Promise<SearchResult[]> {
  try {
    const res = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "X-API-KEY": process.env.SERPER_API_KEY || "",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        q: query,
        num: maxResults,
        gl: "in",
        hl: "en",
      }),
    });

    if (!res.ok) {
      console.warn(`Serper API error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const organic = data.organic || [];

    return organic.slice(0, maxResults).map(
      (r: { title?: string; link?: string; snippet?: string }) => ({
        title: r.title || "",
        url: r.link || "",
        snippet: r.snippet || "",
      })
    );
  } catch (error) {
    console.warn("Serper search failed:", error);
    return [];
  }
}

/**
 * Fallback: scrape Google search results with cheerio.
 * This may get blocked after many requests.
 */
async function searchWithGoogleScraper(
  query: string,
  maxResults: number
): Promise<SearchResult[]> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&hl=en&num=${maxResults}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return [];

    const html = await res.text();
    const cheerio = await import("cheerio");
    const $ = cheerio.load(html);
    const results: SearchResult[] = [];

    $("div.g").each((_, el) => {
      if (results.length >= maxResults) return;
      const titleEl = $(el).find("h3").first();
      const linkEl = $(el).find("a").first();
      const snippetEl = $(el).find("[data-sncf]").first().length
        ? $(el).find("[data-sncf]").first()
        : $(el).find(".VwiC3b").first();

      const title = titleEl.text().trim();
      const href = linkEl.attr("href") || "";
      const snippet = snippetEl.text().trim();

      if (title && href.startsWith("http")) {
        results.push({ title, url: href, snippet });
      }
    });

    return results;
  } catch (error) {
    console.warn("Google scraper failed:", error);
    return [];
  }
}
