// Demo fixtures. Only bundled when __DEMO__ is true (vite dev, or VITE_DEMO=1); never in production builds.
// Media paths starting with "demo/" resolve to /demo-media/<file> (not committed: copy sample stock there locally).
import { addDays, weekStartIST, countWords } from "../lib/format.js";

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
const ADM_MD = `Illustrative example: it is 6:40 pm on a Friday, and an airline debit memo lands in the inbox of a mid-sized agency. The fare was right when it was ticketed. The fare basis was not. Nobody noticed in time, and by then the ticket could not be voided.

**Most ADMs are not caused by bad agents. They are caused by a missing second look.**

## Why ADMs keep coming back

IATA describes BSP as a system designed to simplify how accredited agents sell, report and remit ticket money. Airlines may raise an ADM after a sale is reported in BSP, under their own ADM policy. Common reasons include the wrong fare basis and a reissue without the change penalty. Each BSP airline must publish its ADM policy. BSP runs in more than 170 countries and territories, so these rules reach almost every agency that issues tickets.

None of these are hard to catch. They are hard to catch at 6 pm, when the same agent who built the booking is also answering the next call. The person who made the mistake is the person least likely to see it, because they read what they meant to type.

That is why training alone rarely moves the ADM rate. Agents already know the rules. What they lack is a calm, separate moment where someone else checks the work before the void window closes. A void must usually be done on the day the ticket is issued, within the time the airline sets.

## What a second-check desk actually does

A second-check desk is a small team that reviews every ticket within a fixed window after issue. The checks are boring on purpose, and the same every day:

- Fare basis and booking class match the filed fare
- Reissue penalties and residual values are applied correctly
- Duplicate and churned segments are cancelled before ticketing deadlines
- Tour codes and endorsements match the corporate or consolidator deal
- Names match the passport format the airline expects

The desk does not rebook or reprice. When it finds a problem, it flags the ticket to the issuing agent with the fix written out, and the agent corrects it while the ticket can still be voided or reissued for free. The desk owns the check; the agent owns the booking.

## Who should sit on the desk

The best second-check reviewers are not the fastest ticketing agents. They are the most patient ones. Look for people who enjoy reading a fare rule twice, who keep their own notes on airline quirks, and who are comfortable telling a senior colleague that a ticket is wrong.

Start with two people. One reviews the morning batch and one the afternoon batch, and they cover for each other. Rotating a ticketing agent onto the desk for one week a quarter also helps: they come back to the counter with a sharper eye for the errors they used to make.

## The numbers that matter

Illustrative example: an agency issuing 1,800 tickets a month with a 0.6% ADM rate and an average memo of ₹9,500 receives about 11 memos and loses roughly ₹1.03 lakh a month. Halving the rate saves more than ₹6 lakh a year, which pays for a two-person desk several times over, before counting the hours spent disputing memos.

The savings are not only financial. Every ADM dispute takes an agent away from selling, and every memo that reaches a corporate client's invoice costs trust that is slow to rebuild.

There is also a compounding effect. Each memo the desk prevents is one fewer dispute to research, one fewer conversation with the airline's revenue accounting team, and one fewer adjustment to explain at month-end close. An agency can dispute an ADM within the period in the airline's policy, but every dispute takes time that could go to work that grows the business.

## How to start in two weeks

1. Pull the last six months of ADMs and tag each one by cause, then look for the few causes that come up most.
2. Write a one-page checklist for those top five causes only. Resist the urge to cover every rule on day one.
3. Review tickets issued late in the day first, while there is still time to void them.
4. Agree a simple handover: the desk flags, the issuing agent fixes, the desk confirms the fix in the same thread.
5. Share a weekly one-page report with the ticketing team that shows what was caught, not who made the error.

## Common mistakes when setting one up

The most common mistake is making the desk feel like an audit. If agents see flags as blame, they stop asking questions and start hiding small fixes. Keep the weekly report about patterns and keep individual feedback private and specific.

The second mistake is checking too late. A review that happens the next morning finds errors that can no longer be voided. Set a window, four hours from issue is a good start, and measure the desk against it.

The third is letting the checklist grow without limit. Add a new check only when a new cause shows up in the memos twice.

## What to measure

Track three numbers every week: ADM count, ADM value, and the time from issue to check. A ticket checked on the day of issue can usually still be voided, so the share of tickets checked inside that window is the number to watch. Add a fourth, the number of flags per hundred tickets, to see whether training at the counter is working.

Review the numbers with the ticketing team once a month, and close the loop on every pattern: if one airline's reissue rules keep causing flags, write a short guide for that airline and pin it where agents issue tickets.

## The short version

A second-check desk is cheap, calm work. Done every day, inside the void window, with a short checklist and a blame-free report, it catches avoidable memos before they cost money.

Dhiti supports travel agencies with ticketing, finance and reporting, with more than 200 trained specialists. If debit memos are quietly eating your margin, we would be glad to help you set up a second-check desk.`;

const ROOMING_MD = `Illustrative example: the group lands in Jaipur at 11 am. The hotel has 22 rooms blocked. The rooming list says 24. Two couples are standing in the lobby with their luggage, and somebody is going to spend the afternoon on the phone.

**A rooming list is only as good as the last time someone checked it against the hotel.**

## The 48-hour window

Most hotel group desks want final names 48 to 72 hours before arrival. That is also when late changes pile up: a guest drops out, two colleagues decide to share, a family adds a child, a VIP asks for a suite. Every change made after the list is sent creates a gap between what the agency believes and what the hotel has loaded.

The fix is not a better spreadsheet. It is a fixed routine inside that window, run the same way for every group, whether it is a 12-person incentive trip or a 300-guest wedding.

The routine matters more as groups get larger. A 12-person trip can survive one wrong room because the coordinator can fix it in person. A 300-guest wedding spread across two hotels cannot, because every wrong room becomes a queue at the front desk and a call to the family that booked it.

## Why lists drift

Rooming lists drift for three reasons. First, changes arrive through different channels: email, WhatsApp, a call to the sales manager. Second, the hotel's system holds the list in its own format, so every update is retyped by someone at the property. Third, nobody owns the final comparison between the two versions.

Hotel associations such as the [American Hotel and Lodging Association](https://www.ahla.com/) publish group booking guidance that says the same thing in different words: one source of truth, one owner, and written confirmation of every change.

Each of these is small on its own. Together they explain why a list that was perfect on Monday is wrong by Thursday, even when everyone involved is careful.

## The checklist

Run this checklist at 72 hours, again at 48 hours, and once more the evening before arrival:

- Names exactly as on the ID each guest will show at check-in
- Room type and bedding for every pair, not just the room count
- Arrival and departure dates per guest, not per group
- Children, extra beds and accessible rooms flagged clearly
- Special requests copied into the hotel's own format, word for word
- Billing instructions per room: what the group pays and what the guest pays

Each run ends with the same step: ask the hotel to send its version back, and compare it line by line with yours.

## Who owns it

One named coordinator owns each group from contract to checkout, with a named back-up who has read the file. The coordinator is the only person who sends changes to the hotel. Everyone else, including sales, sends changes to the coordinator.

This sounds slow. It is the opposite. When one person holds the list, a change takes one message instead of three, and the hotel learns that a message from that coordinator is always final.

The back-up matters as much as the owner. Groups do not wait for holidays or sick days, and a back-up who has never opened the file is no back-up at all. Ask the back-up to run the 48-hour checklist once for every group, so they know the file before they ever need it.

## Handling late changes

Late changes are normal, so plan for them instead of fighting them. Agree a cut-off with the client, usually 24 hours before arrival, after which changes are handled on site. Keep two or three rooms on a flexible hold where the contract allows it. Log every late change with the time it was sent and the name of the person at the hotel who confirmed it.

Illustrative example: a 40-room wedding group with six late changes and no change log can easily lose an hour at check-in. The same group with a log and a confirmed list from the hotel checks in during the welcome drink.

Share the cut-off with the client in writing when the contract is signed, and repeat it in the reminder you send a week before arrival. Clients rarely object to a clear rule; they object to surprises at the front desk. A short note that explains how on-site changes will be handled, and who to call, turns a late change from a crisis into a routine request.

## What to measure

Measure three things for every group: the number of differences found at each checklist run, the number of guests who had a problem at check-in, and the time from arrival to the last key handed over. The first number should fall from run to run. The second should be zero. The third is the one the client remembers.

Review these numbers after every large group, not only when something goes wrong. Patterns appear quickly: a hotel that always loses bedding requests, a sales channel that sends changes late, a type of group that always adds guests in the last day. Each pattern becomes one more line on the checklist, or one more conversation with the hotel before the next contract is signed.

## Working with the hotel

The hotel's group coordinator is on your side, but they are juggling many groups at once. Make their job easy: send changes in the hotel's format, number every version, and never send a full list when only one line changed. A short call the day before arrival, walking through the final list together, saves more time than any email.

After checkout, send the hotel a short thank-you with two or three notes on what worked and what did not. Coordinators remember the agencies that make their job easier, and that goodwill pays back the next time you need a late room on a sold-out night.

## The short version

Check twice, send once, and confirm in writing. One owner, one list, one comparison against the hotel's own version at 72 hours, 48 hours and the night before. That routine turns check-in from a scramble into a welcome.`;

const SUPPORT_MD = `Illustrative example: a customer writes in at 9 pm asking why their refund has not arrived. The answer is in three systems. The agent who knows all three has gone home, and the agent on shift sends a polite holding reply. The customer writes again the next morning, a little less politely.

**Support quality is a process problem long before it is a people problem.**

## Where the cost hides

Support costs rarely sit where the budget says they do. The visible cost is headcount. The hidden costs are repeat contacts, escalations to senior staff, and refunds or goodwill credits issued simply to stop a complaint. Each repeat contact costs roughly as much as the first one and earns nothing.

Research from groups such as [Gartner's customer service practice](https://www.gartner.com/en/customer-service-support) has shown for years that customers value low effort more than delight. A customer who gets a complete answer the first time is more loyal than one who gets a friendly answer twice.

The costs also show up outside support. Sales teams spend time calming clients who should never have needed calming. Finance teams process refunds and credits that a clear first answer would have avoided. Senior staff spend evenings on escalations instead of on the work they were hired for. When these costs are added up, the true price of a weak support process is often twice the line in the budget.

Start by pricing one repeat contact. Multiply the average handling time by the loaded cost of an agent hour, then add the share of repeats that become escalations. The number is usually large enough to justify fixing the top three causes immediately.

## What repeat contacts tell you

Every repeat contact is a free diagnosis. Tag them for two weeks and the causes appear quickly: a status that is not visible to agents, a policy that agents interpret differently, a handover between teams that drops the context. These are process gaps, and no amount of coaching fixes them.

Illustrative example: a travel support team handling 6,000 contacts a month finds that 1,100 are repeats about refund status. Giving agents read access to the refund tracker removes most of them within a month.

## Why stable teams answer better

Product knowledge in travel and hospitality is deep and specific: fare rules, supplier policies, payment flows, local exceptions. It takes months to build and leaves the moment an experienced agent does. Teams with high attrition are permanently re-learning the same lessons.

Stable teams compound. An agent in their second year has seen most edge cases and knows which colleague to ask about the rest. They also write better notes, which makes the next agent faster.

Stability also changes how agents treat customers. An agent who expects to be in the same role next year cares about the reputation of the team and the quality of the notes they leave behind. An agent who expects to leave in three months optimises for closing the ticket in front of them.

Stable teams also onboard new colleagues faster. A new agent sitting next to someone with two years of context learns in weeks what would otherwise take months, and the team's quality holds steady through the change instead of dipping every time someone joins.

## What a rural team changes

Rural operations teams tend to stay longer, because good jobs are scarcer and closer to home. That stability gives a support operation time to build real product knowledge, to document it, and to keep quality steady through peak season without a hiring scramble.

Lower living costs also mean a team can be staffed for quality rather than squeezed for volume. Agents get time to finish a case properly instead of closing it fast.

Dhiti's own teams work from Pune district, and the pattern is consistent: agents who have handled a supplier's quirks for a year resolve those cases in one reply, where a new agent would escalate. That is not a talent difference; it is the value of time in the role, protected by low attrition.

## Designing for first-contact resolution

First-contact resolution is designed, not demanded. Give agents the access they need to answer without escalating. Write short, current answers for the twenty questions that make up most of the volume. Define clear ownership for every handover, so a case never waits in a shared inbox. Review a small sample of closed cases every week, and fix the process behind each miss.

## Writing answers agents trust

A knowledge base only helps if agents believe it. Keep each answer short, dated and owned by a named person. Write it in the words customers use, not the words of the internal system. Delete answers that are out of date rather than leaving them with a warning, because one wrong answer teaches agents to stop looking. Review the top twenty answers every month, and ask the agents who use them most to suggest changes. When agents see their suggestions published within a week, they start contributing more, and the knowledge base becomes a shared tool instead of a manager's document.

Illustrative example: a team that rewrites its ten most-used refund answers in plain language, with the exact steps and the expected timelines, typically sees fewer escalations within a few weeks, because agents can answer with confidence instead of passing the case upward.

## What to measure

Track the repeat-contact rate, first-contact resolution, and time to full resolution, not just first reply. Add a weekly sample of quality reviews scored against a simple rubric: was the answer correct, complete, and clear? Share the patterns with the whole team and the individual notes privately.

Resist the pull of speed metrics alone. A team that is measured only on first reply time learns to send fast, empty replies. A team measured on resolution learns to send complete ones. Look at both together, and when they disagree, trust resolution.

## The short version

Good support is designed, not hired. Fix the process gaps that create repeat contacts, keep the team stable long enough to build real knowledge, and measure resolution rather than speed. Quality follows, and cost falls with it.`;


/* ---------- fact lists (body.claims) for the sample blogs ---------- */
// Every claim_text is copied word for word from its blog, as the engine requires. The quotes are SAMPLE text written
// for this demo (the source titles say "Sample:"), so a screenshot never puts made-up words in a real organisation's
// mouth. Each quote says the same thing as its claim: that is the standard the owner checks.
const C = (id, claim_text, source_title, source_url, quote, extra = {}) => ({ id, claim_text, source_title, source_url, quote, kind: "fact", verified: true, fetched_at: "2026-11-23T09:12:00Z", match: "exact", ...extra });
const BSP = "https://www.iata.org/en/services/finance/bsp/";
const ADMP = "https://www.iata.org/en/programs/settlement-systems/agency-programs/adm/";
const ADM_CLAIMS = [
  { id: "e0", kind: "illustrative", verified: true, claim_text: "Illustrative example: it is 6:40 pm on a Friday, and an airline debit memo lands in the inbox of a mid-sized agency." },
  C("c1", "IATA describes BSP as a system designed to simplify how accredited agents sell, report and remit ticket money.", "Sample: IATA, Billing and Settlement Plan", BSP, "BSP is a system designed to facilitate and simplify the selling, reporting and remitting procedures of IATA Accredited Passenger Sales Agents."),
  C("c2", "Airlines may raise an ADM after a sale is reported in BSP, under their own ADM policy.", "Sample: IATA, ADM policy guidance", ADMP, "Airlines may issue ADMs for transactions after they are reported in BSP, according to their own ADM policy."),
  C("c3", "Common reasons include the wrong fare basis and a reissue without the change penalty.", "Sample: IATA, ADM policy guidance", ADMP, "Common reasons include incorrect fare calculation and the use of an incorrect fare basis.", { extra_quotes: [{ source_title: "Sample: IATA, ADM policy guidance", source_url: ADMP, quote: "Failure to collect applicable change penalties on reissued tickets may result in an ADM." }] }),
  C("c4", "Each BSP airline must publish its ADM policy.", "Sample: IATA, ADM policy guidance", ADMP, "Each BSP airline must publish its ADM policy and make it available to agents."),
  C("c5", "BSP runs in more than 170 countries and territories, so these rules reach almost every agency that issues tickets.", "Sample: IATA, Billing and Settlement Plan", BSP, "BSP operates in over 170 countries and territories and covers the large majority of agency ticket sales."),
  C("c6", "A void must usually be done on the day the ticket is issued, within the time the airline sets.", "Sample: IATA, BSP manual for agents", BSP, "A void must be processed within the period set by the airline, usually the same day of issue."),
  C("c7", "An agency can dispute an ADM within the period in the airline's policy, but every dispute takes time that could go to work that grows the business.", "Sample: IATA, ADM policy guidance", ADMP, "The agent may dispute the ADM within the dispute period stated in the airline's ADM policy."),
  { id: "d1", kind: "dhiti", claim_text: "Dhiti supports travel agencies with ticketing, finance and reporting, with more than 200 trained specialists.", phrase: "more than 200 trained specialists", verified: true },
  { id: "a1", kind: "advice", claim_text: "Review tickets issued late in the day first, while there is still time to void them.", note: "Our own process step, not a measured fact.", verified: true },
  { id: "e1", kind: "illustrative", verified: true, claim_text: "Illustrative example: an agency issuing 1,800 tickets a month with a 0.6% ADM rate and an average memo of ₹9,500 receives about 11 memos and loses roughly ₹1.03 lakh a month." },
];
const ROOMING_CLAIMS = [
  { id: "r0", kind: "illustrative", verified: true, claim_text: "Illustrative example: the group lands in Jaipur at 11 am." },
  C("r1", "Most hotel group desks want final names 48 to 72 hours before arrival.", "Sample: hotel group booking guide", "https://www.ahla.com/", "Final rooming lists are typically due 48 to 72 hours before arrival."),
  C("r2", "Hotel associations such as the American Hotel and Lodging Association publish group booking guidance that says the same thing in different words: one source of truth, one owner, and written confirmation of every change.", "Sample: hotel group booking guide", "https://www.ahla.com/", "Keep one master list, designate one point of contact, and confirm every change in writing."),
  { id: "r3", kind: "illustrative", verified: true, claim_text: "Illustrative example: a 40-room wedding group with six late changes and no change log can easily lose an hour at check-in." },
];
const SUPPORT_CLAIMS = [
  { id: "s0", kind: "illustrative", verified: true, claim_text: "Illustrative example: a customer writes in at 9 pm asking why their refund has not arrived." },
  C("s1", "Research from groups such as Gartner's customer service practice has shown for years that customers value low effort more than delight.", "Sample: customer service research summary", "https://www.gartner.com/en/customer-service-support", "Customer effort is a stronger driver of loyalty than delight."),
  C("s2", "Each repeat contact costs roughly as much as the first one and earns nothing.", "Sample: customer service research summary", "https://www.gartner.com/en/customer-service-support", "", { verified: false, match: null }),
  C("s3", "When these costs are added up, the true price of a weak support process is often twice the line in the budget.", "Travel trade forum thread", "https://example.com/forum/support", "", { verified: false, fetched_at: null, match: null }),
  { id: "s4", kind: "illustrative", verified: true, claim_text: "Illustrative example: a travel support team handling 6,000 contacts a month finds that 1,100 are repeats about refund status." },
];

const ADM_CAPTION = `An airline debit memo can land long after the ticket was issued, when it can no longer be voided.

Most ADMs are not caused by bad agents. They are caused by a missing second look.

A small second-check desk reviews every ticket on the day it is issued, while it can usually still be voided. The checks are boring on purpose:

1. Fare basis and booking class match the filed fare
2. Reissue penalties are applied correctly
3. Duplicate segments are cancelled before the ticketing deadline
4. Tour codes and endorsements match the deal
5. Names match the passport format

The desk flags, the issuing agent fixes, and the desk confirms the fix in the same thread. No blame, just a weekly note of what was caught.

We wrote up how to set one up in two weeks, who should sit on the desk, and the numbers to track.

Full guide in the first comment.

#TravelOperations #AirlineTicketing #BackOffice`;

const ROOMING_CAPTION = `Two couples standing in a hotel lobby with their bags is what a wrong rooming list looks like.

A rooming list is only as good as the last time someone checked it against the hotel.

A good group desk runs the same short checklist at 72 hours, at 48 hours and the night before arrival. Each run ends the same way: ask the hotel for its version and compare it line by line.

One named coordinator owns each group. Everyone else, sales included, sends changes to that person.

The full 48-hour checklist is in the first comment.

#HotelOperations #GroupTravel #MICE`;

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
  const tA = T({ title: "A second-check desk for airline ADMs", primary_keyword: "airline ADM prevention", category: "Travel operations", planned_publish_date: nextMon, priority: 1, rationale: "Carrier audits tighten in January; owners are actively searching for ADM fixes.", angle: "Calm daily process beats heroic month-end clean-ups." });
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
  const blogBody = (topic, { slug, description, md, image, claims, keywords = [], sources = [], faq = [] }) => ({
    slug,
    frontmatter: { title: topic.title, description, category: topic.category, image: `${slug}.webp`, imageAlt: "Operations team at work", order: 15, date: topic.planned_publish_date },
    markdown: md,
    word_count: countWords(md),
    meta: { primary_keyword: topic.primary_keyword, secondary_keywords: keywords, faq },
    sources,
    checks: { passed: true, messages: [] },
    cover_stock: { id: "71829", title: image },
    ...(claims ? { claims } : {}),
  });

  const bA = blog(tA, { status: "pending_review", cover: "office.jpg", body: blogBody(tA, { slug: "second-check-desk-airline-adm", description: "A small second-check desk reviews every ticket on the day it is issued, while it can still be voided. Here is how to set one up in two weeks.", md: ADM_MD, image: "office", claims: ADM_CLAIMS,
    keywords: ["debit memo", "BSP", "ticketing audit"],
    sources: [{ title: "Sample: IATA, Billing and Settlement Plan", url: BSP }, { title: "Sample: IATA, ADM policy guidance", url: ADMP }],
    faq: [{ q: "What is an ADM?", a: "An agency debit memo is a charge an airline raises against an agency after a sale is reported in BSP." }] }) });
  const bB = blog(tB, { status: "approved", approved_at: ago(180), approved_by: "demo-owner@example.com", cover: "manager.jpg", body: blogBody(tB, { slug: "group-rooming-list-checklist", description: "The 48-hour rooming list checklist our group desk uses to stop check-in surprises for wedding and MICE groups.", md: ROOMING_MD, image: "manager", claims: ROOMING_CLAIMS,
    keywords: ["rooming list", "group booking", "hotel check-in"],
    sources: [{ title: "Sample: hotel group booking guide", url: "https://www.ahla.com/" }] }) });
  const bC = blog(tC, { status: "changes_requested", feedback: "Open with a real scenario from an OTA, and cite one external source on repeat contacts.", cover: "phone.jpg", body: blogBody(tC, { slug: "support-quality-without-cost", description: "Support quality is a process problem before it is a people problem. How rural teams keep quality high and costs steady.", md: SUPPORT_MD, image: "phone", claims: SUPPORT_CLAIMS,
    keywords: ["repeat contacts", "first-contact resolution", "support outsourcing"],
    sources: [{ title: "Sample: customer service research summary", url: "https://www.gartner.com/en/customer-service-support" }, { title: "Travel trade forum thread", url: "https://example.com/forum/support" }] }) });
  const pub = (topic, slug, cover, daysAgo, md) => {
    const it = blog(topic, { status: "published", cover, approved_at: ago(60 * 24 * (daysAgo + 1)), approved_by: "demo-owner@example.com", published_at: ago(60 * 24 * daysAgo), published_url: `https://www.dhitiservices.com/blog/${slug}/`, scheduled_for: ago(60 * 24 * daysAgo), body: blogBody(topic, { slug, description: "Published last week.", md, image: cover }) });
    return it;
  };
  const pL1 = pub(tL1, "corporate-hotel-rate-loading", "manager.jpg", 5, "Load corporate hotel rates the day the contract lands, not the day before the first booking.\n\n## Why rates go wrong\n\nA rate loaded in a hurry is a rate loaded wrong. Give one person the job, and check every loaded rate against the contract before the first booking.");
  const pL2 = pub(tL2, "corporate-travel-reporting", "office.jpg", 3, "A reporting pack that arrives on the same day every month earns more trust than a prettier one that arrives late.\n\n## What goes in it\n\nSpend by traveller, by route and by supplier, the bookings outside policy, and the savings against the agreed rates.");
  pub(tL3, "first-operations-job-training", "phone.jpg", 1, "A first operations hire learns fastest from real cases with a patient colleague, not from a manual.\n\n## The first 30 days\n\nWeek one: shadow. Week two: do the work while someone checks it. Weeks three and four: do it alone, with a daily review.");

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

  const cA = carouselFor(bA, tA, "pending_review");
  graphicFor(bA, tA, "pending_review", { kind: "stat", stat: "₹1L", headline: "lost every month to avoidable ADMs", body: "at an agency issuing 1,800 tickets" });
  graphicFor(bA, tA, "pending_review", { kind: "tip", headline: "Check tickets issued after 4 pm first", body: "That is when most fare errors happen." });
  videoFor(bA, tA, "awaiting_voiceover");

  const cB = carouselFor(bB, tB, "approved", { approved_at: ago(170), approved_by: "demo-owner@example.com" });
  graphicFor(bB, tB, "approved", { kind: "quote", headline: "Check twice, send once, confirm in writing.", body: "", attribution: "Dhiti group desk" }, { approved_at: ago(160) });
  graphicFor(bB, tB, "changes_requested", { kind: "stat", stat: "72h", headline: "is the new rooming list cut-off", body: "at large Rajasthan properties" }, { feedback: "Use 48h to match the blog." });
  videoFor(bB, tB, "pending_review");

  derived(bC, "carousel", { status: "generating", title: `${tC.title} · carousel`, body: {} });
  const cL1 = carouselFor(pL1, tL1, "published", { published_at: ago(60 * 24 * 4), published_url: "https://www.linkedin.com/feed/" });
  const gL2 = graphicFor(pL2, tL2, "published", { kind: "tip", headline: "One reporting pack, sent the same day every month", body: "Clients trust numbers that arrive on time." }, { published_at: ago(60 * 24 * 2) });
  graphicFor(pL1, tL1, "approved", { kind: "tip", headline: "Load corporate rates the day the contract lands", body: "Not the day before the first booking." }, { approved_at: ago(60 * 30) });

  // LinkedIn posts (social_posts rows, LINKEDIN.md 2.4), one per blog.
  const SP = (blogItem, o) => ({
    id: id("social"), blog_item_id: blogItem.id, source_item_id: null, platform: "linkedin", recommended_format: "carousel",
    recommendation_reason: "", format: "carousel", caption: "", first_comment: "", status: "pending_review", stage: null,
    comment_status: "none", approved_at: null, approved_by: null, scheduled_for: null, media_urn: null, media_status: null,
    post_urn: null, post_url: null, comment_id: null, comment_urn: null, comment_text_sent: null, attempts: 0, comment_attempts: 0,
    next_attempt_at: null, lock_until: null, last_error: null, published_at: null, created_by: "engine", created_at: ago(60 * 23), updated_at: ago(60 * 2), ...o,
  });
  const socialPosts = [
    SP(bA, { source_item_id: cA.id, recommendation_reason: "5-step checklist: a document post lets readers swipe the steps.", caption: ADM_CAPTION, first_comment: "The full guide, with the five checks and every source:" }),
    SP(bB, { source_item_id: cB.id, status: "approved", approved_at: ago(170), approved_by: "demo-owner@example.com", recommendation_reason: "A checklist with timed steps works best as swipe pages.", caption: ROOMING_CAPTION, first_comment: "The 48-hour rooming list checklist:" }),
    SP(bC, { recommended_format: "graphic", format: "graphic", status: "draft", recommendation_reason: "One strong point works alone as a picture.", caption: "Support quality is a process problem long before it is a people problem.\n\nFull post in the first comment.\n\n#CustomerSupport #TravelOperations", first_comment: "How to fix the process behind repeat contacts:" }),
    SP(pL1, { source_item_id: cL1.id, status: "published", stage: "post_created", comment_status: "posted", approved_at: ago(60 * 24 * 6), published_at: ago(60 * 24 * 5 - 12), post_urn: "urn:li:share:7262011445810556928", post_url: "https://www.linkedin.com/feed/update/urn:li:share:7262011445810556928/", recommendation_reason: "Step-by-step guide: swipe pages work best.", caption: "Corporate hotel rates loaded the day before the first booking is how rate errors start.\n\nLoad them the day the contract lands.\n\nFull guide in the first comment.\n\n#HotelOperations #CorporateTravel", first_comment: "How we load corporate rates without errors:" }),
    SP(pL2, { source_item_id: gL2.id, recommended_format: "graphic", format: "graphic", status: "published", stage: "post_created", comment_status: "failed", comment_attempts: 3, last_error: "LinkedIn was busy and did not take the comment.", approved_at: ago(60 * 24 * 4), published_at: ago(60 * 24 * 3 - 8), post_urn: "urn:li:share:7263770019283745792", post_url: "https://www.linkedin.com/feed/update/urn:li:share:7263770019283745792/", recommendation_reason: "One clear tip works alone as a picture.", caption: "A reporting pack that arrives on the same day every month earns more trust than a prettier one that arrives late.\n\nFull post in the first comment.\n\n#CorporateTravel #TravelOperations", first_comment: "What a good travel reporting pack looks like:" }),
  ];

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

  return { settings, runs, logs, briefs: [brief, oldBrief], topics, items, assets, jobs, library, socialPosts };
}
