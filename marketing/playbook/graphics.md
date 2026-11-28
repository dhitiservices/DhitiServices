# Graphics: two standalone single-image posts per blog

From one saved blog, create `settings.graphics_per_blog` (2) standalone graphics. Each renders as 1080x1080
(Instagram, LinkedIn feed) and 1200x627 (LinkedIn link-style, X). Each must make sense to someone who has never
seen the post and be worth saving or sharing. Output: `$WORK/<slug>/graphic-1.json`, `graphic-2.json`.

## 1. Kinds (use two different kinds per blog, never the same idea twice)

- **stat**: one striking number from the post.
  `stat`: the number exactly as the post writes it ("63%", "₹900", "1 in 4"); keep it short (up to 6 characters is
  ideal). `headline` (up to 12 words): what the number means for the reader. `body` (up to 25 words): the context
  or the so-what. `attribution`: the source exactly as the post names it, with year ("RateGain report, 2026").
  Only numbers the post attributes to a linked source; never an illustrative number.
  Tie the number to the reader's problem, and date a change instead of calling it news ("since Sept 2025", never
  "now carries"). Optional `compare`: 2 or 3 cells that give the number its context, for example
  `[{"label":"Economy","value":"5%"},{"label":"Before Sept 2025","value":"12%"}]` (add `"active": true` to the
  cell to accent). Do not repeat the big number in a cell.
- **quote**: one sharp, quotable sentence. Either the post's bold key sentence or another line from the post
  (attribution "Dhiti Services"), or a quotation from a named external source that appears in the post (attribute it
  exactly as the post does). `headline` holds the quote copied exactly (you may drop surrounding quotation marks
  and trailing punctuation). `body` empty or one short line of context. Keep quotes under about 30 words; with a
  photo, at most 18 words, or set `photo: null`.
- **tip**: one practical action a reader can take this week, from the post's method. `headline` (up to 10 words)
  is the instruction ("Call at day seven, not day sixty"); `body` (up to 30 words) says how. `attribution` empty.
  When the tip is a list (log columns, checklist steps), put the items in `chips` (short labels, up to 10) and keep
  `body` to one lead-in line: a comma sentence of eight columns is unreadable at feed size.
  Optional `eyebrow` overrides the default "Operations tip" label (for example "Collections tip").

Good pairs: stat + tip (most posts), quote + tip (posts with few strong numbers), stat + quote (evidence-heavy
posts). Prefer the pair that makes the two graphics feel like different reasons to read the post.

Each graphic must carry an idea that is not the headline of any carousel slide or reel scene. When the post has a
blockquote artefact (a log, checklist or ladder), one graphic should be that artefact as a tip: headline "Keep one
<artefact name>", `chips` naming the 6 to 8 most important columns or steps.

## 2. Photos (optional)

A photo is optional and should earn its place. Use one when it strengthens the message (a quote over a calm,
relevant workplace scene; a tip next to the desk where it happens). Never the blog cover and never a photo another
creative of the blog uses (the engine refuses it); a no-photo layout is the default. Stat and list-tip graphics read
best without a photo. A photo with a person needs `focus` ({x,y}) and `subject` (face box, see `carousel.md`) so the
text never crosses the face in either layout.

## 3. Caption and hashtags

- `caption`: 40 to 90 words for LinkedIn and Instagram. First line is a hook (under 12 words). Line breaks between
  short paragraphs. Last line points to the full guide with `https://www.dhitiservices.com/blog/<slug>/` exactly.
- `hashtags`: 4 to 8 relevant hashtags, each starting with `#`, CamelCase.

## 4. graphic.json shape

```json
{
  "kind": "stat",
  "eyebrow": "",
  "headline": "Most hotels in the region look more expensive on their own website",
  "body": "When a guest finds a lower price elsewhere, they stop trusting your site.",
  "stat": "63%",
  "attribution": "RateGain report, 2026",
  "compare": [],
  "chips": [],
  "caption": "...",
  "hashtags": ["#HotelRevenueManagement", "..."],
  "photo": null,
  "focus": null,
  "stock": []
}
```

Text may use `**word**` for one red highlight. Every fact must come from the post; never invent or round numbers.

## 5. Preview, look, fix (mandatory)

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && bash ~/dhiti-work/bin/lint.sh "$WORK/<slug>/graphic-1.json" \
  && node src/cli.js preview graphic --spec "$WORK/<slug>/graphic-1.json" --out "$WORK/<slug>/preview-graphic-1" --publish-date "<planned_publish_date>"
```

Read both PNGs (square and landscape). Check: the message reads in three seconds; nothing is clipped or squeezed
in the landscape layout (the tighter one); the number is large and unambiguous; the attribution is present for
stats and quotes; the photo crop works in both layouts. Shorten text rather than accept a cramped layout.
Then save each:

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js make-graphic --parent "<blog item id>" --spec "$WORK/<slug>/graphic-1.json"
```
