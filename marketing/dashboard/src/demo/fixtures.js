// Demo fixtures. Only bundled when __DEMO__ is true (vite dev, or VITE_DEMO=1); never in production builds.
// Media paths starting with "demo/" resolve to /demo-media/<file> (not committed: copy sample stock there locally).
import { addDays, weekStartIST } from "../lib/format.js";

const at = (ymd, hhmm = "10:00") => new Date(`${ymd}T${hhmm}:00+05:30`).toISOString();
const ago = (mins) => new Date(Date.now() - mins * 60000).toISOString();
let n = 0;
const id = (p) => `${p}-${String(++n).padStart(4, "0")}-demo-${Math.random().toString(16).slice(2, 10)}`;

/* ---------- typographic slide/graphic renders (SVG data URIs) ---------- */
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function wrap(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max) { lines.push(line.trim()); line = w; } else line += " " + w;
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}
const FONT = "-apple-system, BlinkMacSystemFont, 'Inter', 'Helvetica Neue', Arial, sans-serif";
function svgUri(svg) { return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; }

function slideSvg({ w = 1080, h = 1350, kind, eyebrow, headline, body, stat, index, total, dark }) {
  const bg = dark
    ? `<defs><radialGradient id="g" cx="100%" cy="0%" r="90%"><stop offset="0" stop-color="#EE0800" stop-opacity=".75"/><stop offset=".6" stop-color="#EE0800" stop-opacity="0"/></radialGradient></defs><rect width="${w}" height="${h}" fill="#15161A"/><rect width="${w}" height="${h}" fill="url(#g)"/>`
    : `<rect width="${w}" height="${h}" fill="#FAF7F2"/><rect x="0" y="0" width="${w}" height="14" fill="#EE0800"/>`;
  const ink = dark ? "#FFFFFF" : "#15161A";
  const soft = dark ? "rgba(255,255,255,.7)" : "#3a3d45";
  const pad = 96;
  let y = kind === "cover" ? h * 0.42 : 300;
  const parts = [];
  parts.push(`<text x="${pad}" y="${pad + 40}" font-family="${FONT}" font-size="30" font-weight="700" letter-spacing="3" fill="${dark ? "#FF7A66" : "#EE0800"}">${esc((eyebrow || "").toUpperCase())}</text>`);
  if (stat) {
    parts.push(`<text x="${pad}" y="${y + 120}" font-family="${FONT}" font-size="200" font-weight="800" letter-spacing="-8" fill="${dark ? "#FF3322" : "#EE0800"}">${esc(stat)}</text>`);
    y += 230;
  }
  const hl = wrap(headline, kind === "cover" ? 16 : 20);
  const size = kind === "cover" ? 96 : 72;
  hl.forEach((l, i) => parts.push(`<text x="${pad}" y="${y + i * size * 1.08}" font-family="${FONT}" font-size="${size}" font-weight="800" letter-spacing="-2.5" fill="${ink}">${esc(l)}</text>`));
  y += hl.length * size * 1.08 + 40;
  if (body) wrap(body, 40).forEach((l, i) => parts.push(`<text x="${pad}" y="${y + i * 52}" font-family="${FONT}" font-size="36" font-weight="500" fill="${soft}">${esc(l)}</text>`));
  parts.push(`<text x="${pad}" y="${h - pad + 10}" font-family="${FONT}" font-size="34" font-weight="800" letter-spacing="-1" fill="${ink}">dhiti</text>`);
  if (total) parts.push(`<text x="${w - pad}" y="${h - pad + 10}" text-anchor="end" font-family="${FONT}" font-size="28" font-weight="600" fill="${soft}">${index}/${total}</text>`);
  return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg}${parts.join("")}</svg>`);
}

/* ---------- content ---------- */
const ADM_MD = `It is 6:40 pm on a Friday. An airline debit memo for ₹38,400 lands in the inbox of a mid-sized agency in Pune. The fare was right when it was ticketed. The fare basis was not. Nobody notices until the settlement report closes.

**Most ADMs are not caused by bad agents. They are caused by a missing second look.**

## Why ADMs keep coming back

IATA's own [BSP data](https://www.iata.org/en/services/finance/bsp/) shows that agencies lose a measurable share of margin to debit memos every year, and the reasons repeat: wrong fare basis, missing endorsements, reissues without the right penalty, and duplicate bookings left open.

## What a second-check desk actually does

A second-check desk is a small team that reviews every ticket within a fixed window after issue. The checks are boring on purpose:

- Fare basis and booking class match the filed fare
- Reissue penalties and residual values are applied correctly
- Duplicate and churned segments are cancelled before ticketing deadlines
- Tour codes and endorsements match the deal

## The numbers that matter

Illustrative example: an agency issuing 1,800 tickets a month with a 0.6% ADM rate and an average memo of ₹9,500 loses about ₹1.03 lakh a month. Cutting the rate in half pays for a two-person desk several times over.

## How to start in two weeks

1. Pull the last six months of ADMs and tag each by cause.
2. Write a checklist for the top five causes only.
3. Review every ticket issued after 4 pm first, because that is when most errors happen.
4. Share a weekly one-page report with the ticketing team.

## What to measure

Track ADM count, ADM value, and time from issue to check. Anything checked within four hours can usually still be voided.

## The short version

A second-check desk is cheap, calm work. Done every day, it turns ADMs from a monthly surprise into a rare exception.`;

const ROOMING_MD = `The group lands in Jaipur at 11 am. The hotel has 22 rooms blocked. The rooming list says 24. Somebody is going to spend the afternoon on the phone.

**A rooming list is only as good as the last time someone checked it against the hotel.**

## The 48-hour window

Most hotel group desks want final names 48 to 72 hours out. That is also when late changes pile up.

## The checklist

- Names exactly as on ID
- Room type and bedding per pair
- Arrival and departure per guest, not per group
- Special requests copied into the hotel's own format

## Who owns it

One named coordinator per group, with a back-up.

## The short version

Check twice, send once, and confirm in writing.`;

const SUPPORT_MD = `A customer writes in at 9 pm asking why their refund has not arrived. The answer is in three systems. The agent who knows all three has gone home.

**Support quality is a process problem long before it is a people problem.**

## Where the cost hides

Repeat contacts, escalations and refunds issued to stop complaints.

## What a rural team changes

Stable teams, lower attrition and time to build real product knowledge.

## The short version

Good support is designed, not hired.`;

export function buildFixtures() {
  n = 0;
  const thisMon = weekStartIST();
  const nextMon = addDays(thisMon, 7);
  const lastMon = addDays(thisMon, -7);
  const runW = { id: id("run"), kind: "weekly", status: "succeeded", started_at: ago(60 * 26), finished_at: ago(60 * 26 - 47), usage: { blogs: 3, carousels: 3, graphics: 6, videos: 3 }, error: null };
  const runs = [
    { id: id("run"), kind: "publish", status: "succeeded", started_at: ago(22), finished_at: ago(21), usage: {}, error: null },
    { id: id("run"), kind: "jobs", status: "succeeded", started_at: ago(60 * 5), finished_at: ago(60 * 5 - 9), usage: { revisions: 2 }, error: null },
    { id: id("run"), kind: "publish", status: "failed", started_at: ago(60 * 9), finished_at: ago(60 * 9 - 1), usage: {}, error: "git push rejected: remote has new commits (retried on next run)" },
    runW,
    { id: id("run"), kind: "weekly", status: "succeeded", started_at: ago(60 * 24 * 8), finished_at: ago(60 * 24 * 8 - 52), usage: {}, error: null },
  ];
  const logs = {
    [runW.id]: [
      "08:00:02 run start kind=weekly",
      "08:00:05 context: 14 existing posts, next order 15, 3 revisions pending",
      "08:03:41 research: 23 sources read, 6 trends, 5 pain points",
      "08:05:12 topics: 3 planned (Mon, Wed, Fri)",
      "08:19:30 blog 1 saved (1,412 words, checks passed)",
      "08:22:04 cover: magnific stock #2148 'travel agency office' 6000x4000",
      "08:31:10 carousel 1 rendered (7 slides + PDF)",
      "08:44:58 reel 1 rendered silent preview, awaiting voiceover",
      "08:47:03 run finish status=succeeded",
    ].join("\n"),
  };

  const brief = {
    id: id("brief"), run_id: runW.id, week_start: nextMon, created_at: ago(60 * 25),
    summary:
      "Airline debit memos are back in the news as carriers tighten fare audits after the festive peak. Group travel for weddings and MICE is up sharply for December to February, and hotels are pushing earlier rooming-list cut-offs. Agencies are openly discussing support costs as margins compress.",
    trends: [
      { title: "Carriers tighten post-ticketing fare audits", detail: "Several carriers announced stricter ADM policies for reissues and fare basis mismatches from January.", source_urls: ["https://www.iata.org/en/services/finance/bsp/"] },
      { title: "Wedding and MICE groups drive winter demand", detail: "Group bookings for Rajasthan and Goa are pacing well ahead of last year.", source_urls: ["https://www.tourism.gov.in/"] },
      { title: "Hotels move rooming-list cut-offs earlier", detail: "Large properties now ask for final names 72 hours out instead of 48.", source_urls: [] },
    ],
    pain_points: [
      { audience: "Agency owners", pain: "ADMs eat margin and arrive weeks after the mistake", evidence: "Owners in travel-trade forums report 0.5-1% of ticket value lost to ADMs.", source_urls: ["https://www.iata.org/"] },
      { audience: "Group desks", pain: "Last-minute rooming list changes and mismatches at check-in", evidence: "Recurring complaints in hotel group-sales communities.", source_urls: [] },
      { audience: "Support heads", pain: "Repeat contacts on refunds", evidence: "Refund status is the top contact reason across OTAs.", source_urls: [] },
    ],
    competitor_notes: [
      { competitor: "Large BPO A", url: "https://example.com", observation: "Generic 'travel BPO' messaging, no specifics on ADM prevention." },
      { competitor: "Mid-tier back office B", url: "https://example.com", observation: "Publishes weekly but thin content, under 600 words, no sources." },
    ],
    opportunities: [
      { idea: "Own the 'second-check desk' idea for ADM prevention", why_now: "Carrier audits are tightening in January.", source_urls: ["https://www.iata.org/en/services/finance/bsp/"] },
      { idea: "A practical rooming-list checklist for winter groups", why_now: "Peak group season starts in two weeks.", source_urls: [] },
      { idea: "Support quality without cost blow-outs", why_now: "Margins are compressing after the festive peak.", source_urls: [] },
    ],
    sources: [
      { title: "IATA Billing and Settlement Plan", url: "https://www.iata.org/en/services/finance/bsp/" },
      { title: "Ministry of Tourism statistics", url: "https://www.tourism.gov.in/" },
      { title: "Travel trade forum thread on ADMs", url: "https://example.com/forum/adm" },
    ],
  };
  const oldBrief = { ...brief, id: id("brief"), week_start: thisMon, created_at: ago(60 * 24 * 8), summary: "Shoulder-season planning, corporate travel policy refreshes and hotel rate loading dominated the week.", trends: brief.trends.slice(0, 2), opportunities: brief.opportunities.slice(0, 2) };

  const T = (o) => ({ id: id("topic"), brief_id: brief.id, week_start: nextMon, angle: "", secondary_keywords: [], audience: "Travel agency owners", rationale: "", priority: 1, status: "ready", error: null, created_at: ago(60 * 25), ...o });
  const tA = T({ title: "How a second-check desk cuts airline ADMs in half", primary_keyword: "airline ADM prevention", category: "Travel operations", planned_publish_date: nextMon, priority: 1, rationale: "Carrier audits tighten in January; owners are actively searching for ADM fixes.", angle: "Calm daily process beats heroic month-end clean-ups." });
  const tB = T({ title: "Group rooming lists: the 48-hour checklist", primary_keyword: "group rooming list checklist", category: "Hotel operations", planned_publish_date: addDays(nextMon, 2), priority: 2, status: "producing" });
  const tC = T({ title: "Support quality without the cost blow-out", primary_keyword: "travel customer support outsourcing", category: "Customer support", planned_publish_date: addDays(nextMon, 4), priority: 3, status: "planned" });
  const L = (o) => T({ brief_id: oldBrief.id, week_start: thisMon, status: "ready", ...o });
  const tL1 = L({ title: "Corporate hotel rate loading without the errors", primary_keyword: "corporate hotel rate loading", category: "Hotel operations", planned_publish_date: thisMon });
  const tL2 = L({ title: "What a good travel reporting pack looks like", primary_keyword: "corporate travel reporting", category: "Travel operations", planned_publish_date: addDays(thisMon, 2) });
  const tL3 = L({ title: "Training a first-time operations hire in 30 days", primary_keyword: "operations training", category: "People & careers", planned_publish_date: addDays(thisMon, 4) });
  const topics = [tA, tB, tC, tL1, tL2, tL3];

  const items = [];
  const assets = [];
  const asset = (item, kind, storage_path, extra = {}) => assets.push({ id: id("asset"), content_item_id: item.id, kind, storage_path, mime: extra.mime || "image/png", width: extra.width ?? null, height: extra.height ?? null, position: extra.position ?? 0, meta: extra.meta || { stock: [{ provider: "magnific", id: "2148", title: "Agency office" }] }, created_at: item.created_at });

  const blog = (topic, o) => {
    const it = {
      id: id("item"), topic_id: topic.id, parent_id: null, type: "blog", version: 1, feedback: null, approved_at: null, approved_by: null,
      published_at: null, published_url: null, error: null, created_at: ago(60 * 24), updated_at: ago(60 * 2), scheduled_for: at(topic.planned_publish_date), ...o,
    };
    it.title = it.body.frontmatter.title;
    items.push(it);
    asset(it, "blog_cover", `demo/${o.cover}`, { mime: "image/webp", width: 1600, height: 900, meta: { stock: [{ provider: "magnific", id: "71829", title: o.cover.replace(".jpg", "") + " stock photo" }] } });
    return it;
  };
  const blogBody = (topic, { slug, description, md, image }) => ({
    slug,
    frontmatter: { title: topic.title, description, category: topic.category, image: `${slug}.webp`, imageAlt: "Operations team at work", order: 15, date: topic.planned_publish_date },
    markdown: md,
    word_count: md.split(/\s+/).length * 3,
    meta: { primary_keyword: topic.primary_keyword, secondary_keywords: ["debit memo", "BSP", "ticketing audit"], faq: [{ q: "What is an ADM?", a: "An Agency Debit Memo is a charge an airline raises against an agency for a ticketing error." }] },
    sources: [{ title: "IATA Billing and Settlement Plan", url: "https://www.iata.org/en/services/finance/bsp/" }, { title: "Ministry of Tourism statistics", url: "https://www.tourism.gov.in/" }],
    checks: { passed: true, messages: [] },
    cover_stock: { id: "71829", title: image },
  });

  const bA = blog(tA, { status: "pending_review", cover: "office.jpg", body: blogBody(tA, { slug: "second-check-desk-airline-adm", description: "A two-person second-check desk reviews every ticket within hours and can halve airline debit memos. Here is how to set one up in two weeks.", md: ADM_MD, image: "office" }) });
  const bB = blog(tB, { status: "approved", approved_at: ago(180), approved_by: "demo-owner@example.com", cover: "manager.jpg", body: blogBody(tB, { slug: "group-rooming-list-checklist", description: "The 48-hour rooming list checklist our group desk uses to stop check-in surprises for wedding and MICE groups.", md: ROOMING_MD, image: "manager" }) });
  const bC = blog(tC, { status: "changes_requested", feedback: "Open with a real scenario from an OTA, and cite one external source on repeat contacts.", cover: "phone.jpg", body: blogBody(tC, { slug: "support-quality-without-cost", description: "Support quality is a process problem before it is a people problem. How rural teams keep quality high and costs steady.", md: SUPPORT_MD, image: "phone" }) });
  const pub = (topic, slug, cover, daysAgo) => {
    const it = blog(topic, { status: "published", cover, approved_at: ago(60 * 24 * (daysAgo + 1)), approved_by: "demo-owner@example.com", published_at: ago(60 * 24 * daysAgo), published_url: `https://www.dhitiservices.com/blog/${slug}/`, scheduled_for: ago(60 * 24 * daysAgo), body: blogBody(topic, { slug, description: "Published last week.", md: ROOMING_MD, image: cover }) });
    return it;
  };
  const pL1 = pub(tL1, "corporate-hotel-rate-loading", "manager.jpg", 5);
  pub(tL2, "corporate-travel-reporting", "office.jpg", 3);
  pub(tL3, "first-operations-job-training", "phone.jpg", 1);

  const derived = (parent, type, o) => {
    const it = { id: id("item"), topic_id: parent.topic_id, parent_id: parent.id, type, version: 1, feedback: null, approved_at: null, approved_by: null, published_at: null, published_url: null, error: null, scheduled_for: null, created_at: ago(60 * 23), updated_at: ago(60 * 2), ...o };
    items.push(it);
    return it;
  };

  const carouselFor = (parent, topic, status, extra = {}) => {
    const slides = [
      { kind: "cover", eyebrow: topic.category, headline: topic.title, body: "" },
      { kind: "stat", eyebrow: "The cost", headline: "of ticket value lost to ADMs at a typical agency", stat: "0.6%", body: "" },
      { kind: "point", eyebrow: "Step 1", headline: "Check every ticket within four hours", body: "Most errors can still be voided the same day." },
      { kind: "point", eyebrow: "Step 2", headline: "Write a checklist for the top five causes", body: "Fare basis, reissues, duplicates, tour codes, endorsements." },
      { kind: "quote", eyebrow: "The rule", headline: "Most ADMs are caused by a missing second look.", body: "" },
      { kind: "cta", eyebrow: "Dhiti Services", headline: "Read the full guide on our blog", body: "dhitiservices.com/blog" },
    ];
    const it = derived(parent, "carousel", {
      status, title: `${topic.title} · carousel`, ...extra,
      body: { caption_linkedin: `${topic.title}.\n\nMost ADMs are not caused by bad agents. They are caused by a missing second look. Here is the six-step desk we run for agencies.`, caption_instagram: `${topic.title} ✈️ Save this for your ticketing team.`, hashtags: ["TravelAgency", "AirlineOps", "BackOffice", "Dhiti"], slides },
    });
    slides.forEach((s, i) => asset(it, "carousel_slide", slideSvg({ ...s, index: i + 1, total: slides.length, dark: i === 0 || s.kind === "quote" || s.kind === "cta" }), { position: i, width: 1080, height: 1350, meta: { stock: [] } }));
    asset(it, "carousel_pdf", "demo/carousel.pdf", { mime: "application/pdf", position: 99, meta: {} });
    return it;
  };
  const graphicFor = (parent, topic, status, g, extra = {}) => {
    const it = derived(parent, "graphic", { status, title: `${topic.title} · ${g.kind}`, ...extra, body: { ...g, caption: `${g.headline} ${g.body || ""}`.trim(), hashtags: ["TravelOps", "Dhiti"] } });
    asset(it, "graphic", slideSvg({ w: 1080, h: 1080, kind: "point", eyebrow: g.kind === "stat" ? "By the numbers" : g.kind === "quote" ? "Field note" : "Ops tip", headline: g.headline, body: g.body, stat: g.stat, dark: g.kind !== "tip" }), { position: 0, width: 1080, height: 1080, meta: { variant: "square", stock: [] } });
    asset(it, "graphic", slideSvg({ w: 1200, h: 627, kind: "point", eyebrow: g.kind === "stat" ? "By the numbers" : "Ops tip", headline: g.headline, body: "", stat: "", dark: g.kind !== "tip" }), { position: 1, width: 1200, height: 627, meta: { variant: "landscape", stock: [] } });
    return it;
  };
  const videoFor = (parent, topic, status, extra = {}) => {
    const scenes = [
      { duration: 4.5, on_screen_text: "6:40 pm. An ADM lands.", vo_line: "It's six forty on a Friday, and an airline debit memo just landed." },
      { duration: 6, on_screen_text: "₹38,400 for one fare basis slip", vo_line: "Thirty eight thousand rupees, for one fare basis that nobody checked." },
      { duration: 7, on_screen_text: "Fix: a second-check desk", vo_line: "The fix is boring on purpose. A small desk checks every ticket within four hours." },
      { duration: 6.5, on_screen_text: "Half the ADMs. Every month.", vo_line: "Agencies that do this cut their debit memos roughly in half." },
      { duration: 4, on_screen_text: "dhitiservices.com", vo_line: "Dhiti Services. Calm back-office work, done daily." },
    ];
    const it = derived(parent, "video", {
      status, title: `${topic.title} · reel`, ...extra,
      body: {
        caption: `${topic.title}. A two-person desk, four-hour checks, half the ADMs.`, hashtags: ["TravelAgency", "Reels", "Dhiti"], scenes,
        voiceover_script: scenes.map((s) => s.vo_line).join(" "), voiceover: status === "awaiting_voiceover" ? null : { library_asset_id: "lib-demo", duration: 27.4 },
      },
    });
    asset(it, "video", "demo/departures.mp4", { mime: "video/mp4", width: 1080, height: 1920, meta: { stock: [{ provider: "magnific", id: "553201", title: "Airport departures board" }] } });
    asset(it, "video_poster", "demo/departures.jpg", { mime: "image/jpeg", width: 1080, height: 1920, position: 1 });
    return it;
  };

  carouselFor(bA, tA, "pending_review");
  graphicFor(bA, tA, "pending_review", { kind: "stat", stat: "₹1L", headline: "lost every month to avoidable ADMs", body: "at an agency issuing 1,800 tickets" });
  graphicFor(bA, tA, "pending_review", { kind: "tip", headline: "Check tickets issued after 4 pm first", body: "That is when most fare errors happen." });
  videoFor(bA, tA, "awaiting_voiceover");

  carouselFor(bB, tB, "approved", { approved_at: ago(170), approved_by: "demo-owner@example.com" });
  graphicFor(bB, tB, "approved", { kind: "quote", headline: "Check twice, send once, confirm in writing.", body: "", attribution: "Dhiti group desk" }, { approved_at: ago(160) });
  graphicFor(bB, tB, "changes_requested", { kind: "stat", stat: "72h", headline: "is the new rooming list cut-off", body: "at large Rajasthan properties" }, { feedback: "Use 48h to match the blog." });
  videoFor(bB, tB, "pending_review");

  derived(bC, "carousel", { status: "generating", title: `${tC.title} · carousel`, body: {} });
  carouselFor(pL1, tL1, "published", { published_at: ago(60 * 24 * 4), published_url: "https://www.linkedin.com/feed/" });
  graphicFor(pL1, tL1, "approved", { kind: "tip", headline: "Load corporate rates the day the contract lands", body: "Not the day before the first booking." }, { approved_at: ago(60 * 30) });

  const jobs = [
    { id: id("job"), kind: "regenerate", payload: { content_item_id: bC.id, feedback: bC.feedback }, status: "queued", requested_by: "demo-owner@example.com", error: null, created_at: ago(40), started_at: null, finished_at: null },
    { id: id("job"), kind: "publish_now", payload: {}, status: "done", requested_by: "demo-owner@example.com", error: null, created_at: ago(60 * 30), started_at: ago(60 * 29), finished_at: ago(60 * 29) },
    { id: id("job"), kind: "run_weekly", payload: {}, status: "done", requested_by: "schedule", error: null, created_at: ago(60 * 26), started_at: ago(60 * 26), finished_at: ago(60 * 25) },
  ];

  const library = [
    { id: id("lib"), kind: "photo", storage_path: "demo/office.jpg", mime: "image/jpeg", title: "Team at the Saswad office", notes: "Shot in October. OK for covers.", tags: ["team", "office"], content_item_id: null, used_count: 3, uploaded_by: "demo-owner@example.com", created_at: ago(60 * 24 * 12) },
    { id: id("lib"), kind: "photo", storage_path: "demo/manager.jpg", mime: "image/jpeg", title: "Operations lead on a call", notes: "", tags: ["people"], content_item_id: null, used_count: 1, uploaded_by: "demo-owner@example.com", created_at: ago(60 * 24 * 9) },
    { id: id("lib"), kind: "photo", storage_path: "demo/phone.jpg", mime: "image/jpeg", title: "Support desk close-up", notes: "", tags: ["support"], content_item_id: null, used_count: 0, uploaded_by: "demo-owner@example.com", created_at: ago(60 * 24 * 6) },
    { id: id("lib"), kind: "video", storage_path: "demo/departures.mp4", mime: "video/mp4", title: "Departures board b-roll", notes: "", tags: ["airport"], content_item_id: null, used_count: 2, uploaded_by: "demo-owner@example.com", created_at: ago(60 * 24 * 5) },
    { id: id("lib"), kind: "voiceover", storage_path: "demo/voiceover.mp3", mime: "audio/mpeg", title: "Anika · rooming list reel", notes: "Duration 27.4 s", tags: ["voiceover"], content_item_id: null, used_count: 1, uploaded_by: "demo-owner@example.com", created_at: ago(60 * 20) },
  ];

  const settings = {
    blogs_per_week: 3, carousels_per_blog: 1, graphics_per_blog: 2, videos_per_blog: 1,
    publish_days: ["Monday", "Wednesday", "Friday"],
    audience: "Founders and operations heads at travel agencies, tour operators, TMCs, OTAs, travel-tech companies and hotels in India and abroad.",
    avoid_topics: ["Visa advice", "Pricing comparisons with named competitors"],
    extra_guidance: "Keep examples Indian and specific. Prefer owner photos from the library for people shots.",
    stock_only: true, no_ai_generation: true,
  };

  return { settings, runs, logs, briefs: [brief, oldBrief], topics, items, assets, jobs, library };
}
