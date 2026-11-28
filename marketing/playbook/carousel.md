# Carousel: one document post per blog

You are Dhiti's social editor. Turn the saved blog into one LinkedIn document / Instagram carousel (1080x1350
slides, plus a PDF) that a busy operations head swipes to the end and saves. Output: `$WORK/<slug>/carousel.json`,
reviewed with `cli.js preview carousel`, saved with `cli.js make-carousel`.

## 1. Slide plan: 7 to 9 slides

1. **Cover** (`kind: "cover"`). `headline`: a hook of 5 to 10 words naming a costly, recognisable problem or a
   surprising truth from the post (see the hook examples in `quality-bar.md` section 6). `eyebrow`: a 2 to 4 word
   topic label ("Travel finance", "Hotel operations", "Group bookings"). `body`: one line of up to 14 words
   promising what the reader gets. `photo`: the blog cover photo or a second stock photo (see section 4). No
   clickbait.
2. **5 to 7 insight slides**, each carrying exactly **one** idea, in the order a reader needs them: problem, why it
   happens, method, the trap, ownership.
   - `headline`: up to 10 words, stated as a takeaway, not a topic label ("Most late payments start with a missing
     PO", not "Missing POs").
   - `body`: **at most 30 words** that explain or prove the headline, concrete and specific.
   - `eyebrow`: a short step or section label ("Why it happens", "Step 2", "The log").
   - `kind: "stat"` when the slide is built on one number from the post: `stat` holds the number exactly as the
     post writes it ("51%", "₹900", "15 to 25%"), `body` names the source ("HOTREC survey of 1,882 hotels, 2026").
     Only numbers the post attributes to a linked source; never an illustrative number.
   - `kind: "quote"` for one sentence that appears in the post (usually the bold key sentence); `headline` holds
     it exactly, `body` is "Dhiti Services" or the named source.
   - Otherwise `kind: "point"`.
   - At most two stat slides and one quote slide.
3. **CTA** (`kind: "cta"`, always last). `eyebrow`: "Dhiti Services". `headline`: up to 10 words inviting the
   reader to the full guide or a conversation, calm and specific ("Read the full collections routine"). `body`: up
   to 25 words on what Dhiti does that relates to this post, using only facts from `quality-bar.md`.

Text may use `**word**` to highlight one or two words in red. Use it at most once per slide, on the word that
carries the meaning. Every fact, number and claim must come from the blog. Leave `stat` empty on non-stat slides.

## 2. Captions and hashtags

Blog URL: `https://www.dhitiservices.com/blog/<slug>/`.

- `caption_linkedin`: **120 to 220 words.** Line 1 is a hook under 12 words that makes someone stop (a specific
  problem, a counter-intuitive truth, a sharp sourced number, or a scene), then a blank line. Then short
  paragraphs of 1 to 3 lines with blank lines between them, telling the story with 2 or 3 concrete specifics from
  the post. Then one line pointing to the full guide with the URL exactly. Last line: 3 relevant hashtags.
  At most one question in the whole caption. No "Excited to share", no "Swipe", no engagement bait.
- `caption_instagram`: 60 to 120 words, warmer and shorter, line breaks between short paragraphs, ending with the
  line "Full guide: link in bio." No hashtags in this caption.
- `hashtags`: **8 to 15** Instagram hashtags, each starting with `#`, no spaces, CamelCase, a mix of specific
  (#TravelAgency, #HotelRevenueManagement, #BackOfficeOperations, #CorporateTravel) and broader (#TravelIndustry,
  #TravelTrade, #IndianTravel, #Outsourcing). No banned, spammy or unrelated tags (#love, #instagood, #follow).

## 3. carousel.json shape

```json
{
  "caption_linkedin": "...",
  "caption_instagram": "...",
  "hashtags": ["#TravelAgency", "..."],
  "slides": [
    { "kind": "cover", "eyebrow": "Travel finance", "headline": "Your best client is funding your cash gap", "body": "A weekly collections routine that brings the money in sooner", "stat": "", "photo": "/abs/path/3629477.jpg", "focus": "right" },
    { "kind": "point", "eyebrow": "Why it happens", "headline": "Most late payments start with a missing PO", "body": "...", "stat": "", "photo": null },
    { "kind": "stat", "eyebrow": "How common it is", "headline": "Half of hotels say an OTA undercuts their own rate", "body": "HOTREC distribution study of 1,882 European hotels, 2026", "stat": "51%", "photo": null },
    { "kind": "cta", "eyebrow": "Dhiti Services", "headline": "Read the full collections routine", "body": "...", "stat": "", "photo": null }
  ],
  "stock": [ { "file": "/abs/path/3629477.jpg", "provider": "magnific", "id": 3629477, "type": "photo", "title": "...", "url_preview": "..." } ]
}
```

`focus` (optional, per slide with a photo) steers the crop: a number 0 to 1 (horizontal), `{"x":0.3,"y":0.4}`, or
`"left"`, `"right"`, `"top"`, `"bottom"`, `"center"`. Set it so faces and the key prop survive the portrait crop.

## 4. Photos: 1 or 2 per carousel

- Cover slide: use the blog cover photo (already licensed, no extra credits) unless its subject cannot survive a
  portrait crop. Then pick a portrait or square photo with `stock-selection.md`.
- Optionally one `point` slide with a photo (the renderer frames it on top of the slide) where an image genuinely
  helps (the document, the desk, the front office). Text-only slides read better than a weak photo.

## 5. Preview, look, fix (mandatory)

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && bash ~/dhiti-work/bin/lint.sh "$WORK/<slug>/carousel.json" \
  && node src/cli.js preview carousel --spec "$WORK/<slug>/carousel.json" --out "$WORK/<slug>/preview-carousel"
jq -r '.slides[] | (.body // "" | split(" ") | length | tostring) + " words: " + .headline' "$WORK/<slug>/carousel.json"
```

Read **every** PNG in the preview folder. For each slide check:
- Text is fully visible, not clipped, not crowded against edges or the footer; no single word orphaned on the last
  line of a headline; nothing auto-shrunk to a hard-to-read size (if so, shorten the text).
- The photo crop keeps faces and the key prop; the scrim keeps text legible; nothing in the photo competes with
  the text.
- The sequence reads as one story in under a minute; slide 2 pays off the cover's promise.
- Spelling, numbers and units match the blog exactly.

Fix the spec and preview again until every slide is right. Then save:

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js make-carousel --parent "<blog item id>" --spec "$WORK/<slug>/carousel.json"
```
