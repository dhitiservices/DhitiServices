# Research: the weekly brief

Goal: a short, fully sourced brief that tells the planner what is happening **now** in the travel industry, what
is hurting Dhiti's buyers in their back office, what competitors publish (and miss), and which practical guides
Dhiti could write this week. Output: `$WORK/brief.json`, saved with `node src/cli.js save-brief`.

Budget: 12 to 25 WebSearch calls, plus WebFetch on every page you will cite. Use `mode: "standard"` for most
searches; use `mode: "extended"` for at most 3 searches where freshness matters most (regulation, a major report).

## 1. Before searching

- Read `ctx.json`: existing blog posts (titles and slugs), `recent_topics` (last 8 weeks), `settings.avoid_topics`,
  `settings.audience`, `settings.extra_guidance`. Write down the clusters already covered so you look for new
  angles, not repeats.
- Note today's date (IST) and the target publish week. Put the month and year into time-sensitive queries
  (for example "December 2026").

## 2. Search plan (cover all five areas)

Plan your queries before you start; adapt as you learn. Example queries are starting points, not a script.

**A. Travel industry news and trends, India first (4 to 7 searches)**
- "travel agents India news <month year>", "TAAI OR TAFI OR IATO statement <month year>"
- "corporate travel India <year> survey", "GBTA business travel outlook <year>"
- "OTA India results quarter <year>", "hotel occupancy India <month year> HVS OR JLL OR STR"
- "tour operators India season <upcoming season> demand", "outbound travel India <year> report"
- Global: "Skift travel operations <month year>", "PhocusWire agencies <month year>", "hotel distribution costs <year> report"

**B. Regulation, settlement and distribution (3 to 5 searches)**
- GST and TCS on travel: "TCS overseas tour package <year> rules", "GST travel agents notification <year>",
  "GSTR-2B ITC mismatch travel"
- Airline distribution: "IATA BSP India <year>", "NDC adoption travel agencies <year>", "airline ADM policy <year>",
  "IATA NewGen ISS"
- DGCA and consumer rules: "DGCA refund rules <year>", "passenger charter refund timeline India"
- Data protection: "DPDP rules travel companies <year>"
- Payments and collections: "B2B payment delays India <year> survey", "virtual cards travel payments <year>"

**C. Operational pain and seasonality (3 to 5 searches)**
- Hiring and staffing: "travel agency staff shortage <year>", "hotel back office hiring India <year>"
- Peak periods coming in the next 4 to 8 weeks (wedding season, year-end holidays, summer outbound, Hajj/Umrah,
  long weekends, financial year-end in March): "<season> travel demand India <year>"
- Operational failure stories reported by trade press: refunds stuck, rate loading errors, group booking
  attrition, unpaid commissions, reconciliation backlogs, review response, chargebacks.

**D. Competitors (2 to 4 searches)**
- Discover names by search, do not assume: "travel back office outsourcing", "travel BPO services India",
  "mid office outsourcing travel agency", "hotel back office outsourcing India", "travel accounting outsourcing".
- Open 3 to 5 competitor blogs or service pages (WebFetch). Note what they publish, how deep it goes, and what
  they do **not** cover well (usually: specific routines, real documents, honest trade-offs, India context).

**E. Search demand signals (1 to 3 searches)**
- For promising angles, search the phrase a buyer would type and look at what ranks. If the top results are thin
  vendor pages or old listicles, that is an opportunity. If they are government or airline pages the reader needs
  instead of us, skip it.

## 3. Source rules

- **Freshness:** nothing older than about 6 months unless it is evergreen reference material (an IATA programme
  page, a regulation's text, a standard definition). The last 2 to 4 weeks matter most.
- **Credibility, in this order:** primary sources (IATA, GBTA, UN Tourism, Ministry of Tourism, CBIC/GST Council,
  DGCA, RBI, Income Tax Department), research firms and associations (HVS, JLL, STR, Phocuswright, Atradius,
  HOTREC, TAAI, TAFI, IATO, FHRAI), serious trade press (Skift, PhocusWire, Travel Weekly, TTG, Travolution,
  TravTalk India, Express TravelWorld, ETTravelWorld, Hospitality Net, Hotelier India, BW Hotelier), business press
  (Economic Times, Business Standard, Mint, Reuters). Avoid content farms, AI-written listicles, press releases
  with no data, and anything behind a hard paywall you cannot read.
- **Verify with WebFetch** every page whose claim you will put in the brief. Confirm the number, the date and the
  context. If the page does not say it, drop the claim.
- **Copy URLs exactly** as fetched (after redirects). Never construct, shorten or guess a URL. https only.

## 4. brief.json shape (exactly)

```json
{
  "run_id": "<run id from run start>",
  "week_start": "YYYY-MM-DD (Monday of the target publish week)",
  "summary": "4 to 6 plain sentences for a busy editor: what matters this week and why.",
  "trends": [{ "title": "", "detail": "1 to 3 sentences with the specific fact, date and who said it", "source_urls": ["https://..."] }],
  "pain_points": [{ "audience": "specific buyer, e.g. 'TMC finance teams' or 'independent hotels, 20 to 100 rooms'",
                    "pain": "what is breaking or costing money", "evidence": "1 to 2 sentences on what the source shows",
                    "source_urls": ["https://..."] }],
  "competitor_notes": [{ "competitor": "name as found", "url": "https://...", "observation": "what they publish and what they miss" }],
  "opportunities": [{ "idea": "a working blog title Dhiti could publish", "why_now": "the timely reason",
                      "source_urls": ["https://..."] }],
  "sources": [{ "title": "short human-readable title, publisher and month", "url": "https://..." }]
}
```

Targets: 5 to 8 trends, 5 to 8 pain points, 3 to 5 competitor notes, 4 to 6 opportunities. Quality beats
quantity: drop anything you cannot source. Every URL in any `source_urls` must also appear in `sources`.

**Weak versus strong entries** (format examples only; the facts below are placeholders, never reuse them)
- Weak trend: "ADM volumes are rising." Strong: "Indian agencies report airlines raising ADMs months after
  ticketing for fare-rule breaches; TAAI raised it with carriers in November 2026 (TravTalk, 12 Nov 2026)."
- Weak opportunity: "Write about refunds." Strong: "Refund timelines after flight cancellations: a tracking routine
  for agencies; why now: DGCA's revised passenger charter took effect this month and complaints are being reported."

## 5. Save

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && jq empty "$WORK/brief.json" && node src/cli.js save-brief "$WORK/brief.json" | tee "$WORK/brief.saved.json"
```

Keep the returned `id` as `BRIEF_ID` (write it to `$WORK/state.json`). If saving fails because of a field
problem, fix the JSON and retry once; if it still fails, continue planning from the local file and record the
error in the run log.
