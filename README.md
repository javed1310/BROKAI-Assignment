# Brokai Lead Intelligence

A multi-agent lead intelligence system that takes a list of companies, autonomously researches each one, finds contact information, and generates personalized cold outreach messages.

Built for the [Brokai Labs](https://brokailabs.com) AI Engineer Intern assessment.

## Live Demo

**Deployed URL**: _(will be added after Railway deployment)_

## Architecture

The system uses **3 specialized AI agents** working in sequence:

```
Excel Upload → Agent 01: Researcher → Agent 02: Contact Finder → Agent 03: Outreach Writer → Dashboard
```

### Agent Pipeline

| Agent | Input | Task | Output |
|-------|-------|------|--------|
| **Researcher** | Company name + state | Searches web (Serper.dev), scrapes company websites and directories (IndiaMART, Justdial) | Structured business profile |
| **Contact Finder** | Business profile + Excel data | Scrapes contact pages, searches for phone/email, merges with dataset | Contact card with source URLs |
| **Outreach Writer** | Profile + contacts | Generates personalized WhatsApp-style cold message from Brokai Labs | Ready-to-send message |

### Key Design Decisions

- **Custom orchestration** over LangChain/CrewAI — simpler, more debuggable, no unnecessary abstraction
- **Cheerio + Playwright** two-tier scraping — fast static HTML parsing first, headless browser fallback for JS-rendered pages
- **Per-agent fallbacks** — if any agent fails, the pipeline continues with graceful degradation rather than crashing
- **Frontend-stored state** — no server-side database needed; Excel is parsed on upload, results stored in React state

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, TypeScript) |
| Styling | Tailwind CSS |
| LLM | Google Gemini 1.5 Flash (free tier) |
| Web Search | Serper.dev (2,500 free searches) |
| Scraping | Cheerio (static) + Playwright (JS-rendered) |
| Validation | Zod (typed agent contracts) |
| Deployment | Railway (free tier) |

## Project Structure

```
src/
├── agents/
│   ├── types.ts            # Zod schemas, shared interfaces
│   ├── researcher.ts       # Agent 1: web search + scrape + LLM structuring
│   ├── contact-finder.ts   # Agent 2: scrape contacts + LLM extraction
│   ├── outreach-writer.ts  # Agent 3: personalized message generation
│   └── orchestrator.ts     # Pipeline runner chaining all 3 agents
├── services/
│   ├── llm.ts              # Gemini wrapper with retry + rate limiting
│   ├── search.ts           # Serper.dev + Google scraper fallback
│   ├── scraper.ts          # Cheerio + Playwright two-tier scraper
│   └── excel-parser.ts     # Excel parsing + email de-obfuscation
├── lib/
│   ├── rate-limiter.ts     # Token bucket rate limiter
│   └── utils.ts            # Email/phone normalization helpers
├── components/
│   ├── UploadForm.tsx       # Drag-and-drop Excel upload
│   ├── LeadTable.tsx        # Paginated, searchable lead table
│   ├── LeadDetail.tsx       # Expandable agent output display
│   └── StatusBadge.tsx      # Status indicator component
└── app/
    ├── page.tsx             # Main dashboard (upload → table → results)
    └── api/
        ├── upload/route.ts  # Excel file upload + parsing
        └── process/route.ts # Run agent pipeline on one lead
```

## Running Locally

### Prerequisites

- Node.js 18+
- npm

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Javed-Coherent/Nutri_updates.git
   cd Nutri_updates
   ```

2. Install dependencies:
   ```bash
   npm install
   npx playwright install chromium
   ```

3. Create `.env.local` from the example:
   ```bash
   cp .env.example .env.local
   ```

4. Add your API keys to `.env.local`:
   ```
   GEMINI_API_KEY=your_gemini_api_key_here
   SERPER_API_KEY=your_serper_api_key_here
   ```

   - **Gemini API Key**: Get free at [Google AI Studio](https://aistudio.google.com/app/apikey)
   - **Serper API Key**: Get 2,500 free searches at [serper.dev](https://serper.dev)

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) and upload your Excel file.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key (free tier: 15 RPM, 1500 req/day) |
| `SERPER_API_KEY` | Yes | Serper.dev API key (2,500 free searches on signup) |

## Failure Handling

The system is designed to **never crash or skip a row**:

- **Search fails** → falls back to Google scraper → falls back to minimal profile
- **Scraping fails** → uses search snippets instead of full page content
- **LLM fails** → 3 retries with exponential backoff → template-based fallback
- **Agent fails** → orchestrator catches error, continues with fallback data
- **Missing contacts** → shows Excel data with "low confidence" label

Every company row always appears in the output with a clear status: `completed`, `partial`, or `failed`.

## Design Tradeoffs

1. **Serper.dev over custom Google scraping** — Google blocks automated requests from server IPs after ~20-50 queries. Serper.dev provides reliable Google results via API with 2,500 free searches, which covers all 784 companies.

2. **Railway over Vercel** — Playwright (headless browser for JS-rendered pages) requires ~200MB of browser binaries that don't fit in Vercel's 50MB serverless function limit. Railway has no size limits and no request timeout, enabling better scraping and simpler batch processing.

3. **Client-side state over database** — For this assessment scope, storing leads and results in React state (with no server-side persistence) keeps the architecture simple and avoids database setup. The tradeoff is that results are lost on page refresh.
