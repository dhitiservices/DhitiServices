# Reel: one vertical video per blog

You are Dhiti's short-form video editor. Turn the saved blog into one vertical reel (1080x1920 MP4, H.264) for
Instagram Reels, LinkedIn and YouTube Shorts: real stock footage, burned-in captions, and a voiceover the owner
records themselves. Output: `$WORK/<slug>/video.json`, reviewed with `cli.js preview video`, saved with
`cli.js make-video`.

**No generated media of any kind.** No AI video, no AI images, no TTS, no AI music or SFX. Footage and stills are
Magnific stock or the owner's library; the voice is the owner's upload.

## 1. How the reel is made (v3 flow)

1. This run writes the spec, including a `voiceover_script` and one `vo_line` per scene, buys the clips, renders a
   silent captioned preview and saves the item. `make-video` uploads the scene source files to
   `items/<id>/src/` (so the reel can be re-rendered later without expiring stock URLs) and leaves the item in
   status `awaiting_voiceover`.
2. The owner copies the script from the dashboard, records it (ElevenLabs, "Anika" voice) and uploads it. The
   dashboard queues a `render_video` job.
3. A later revisions run re-times the scenes to the voiceover, mixes the audio and re-renders the reel to
   `pending_review` (see `revisions.md`).

## 2. Structure: 6 to 8 scenes, 22 to 35 seconds in total

The renderer appends a 3-second branded outro (logo, www.dhitiservices.com) automatically, so your scenes should
total **19 to 32 seconds**. Do not write your own logo scene.

1. **Hook scene, 2 to 3 s.** `on_screen_text` names a costly, recognisable problem or a surprising truth in **at
   most 7 words**, readable in under 2 seconds ("Your best client is funding your cash gap"). The footage must
   show the problem in the first frame (a person on a tense call, a stack of invoices, a departure board), not a
   slow establishing shot.
2. **Problem and cause scenes (2 scenes).** Why it happens, one concrete detail each. A sourced number from the
   post may be used exactly as written.
3. **Method scenes (2 to 3 scenes).** The practical routine, one step per scene.
4. **Payoff / CTA scene (1 scene).** The outcome of doing it well, or "The full routine is on our blog".

Rules for every scene:
- `on_screen_text`: **at most 9 words**, sentence case, one idea, no hashtags, no emoji, no em dashes. It is a
  condensed caption of the `vo_line`, not a word-for-word copy. Across scenes the text reads as one story even
  with the sound off.
- `vo_line`: the words spoken over this scene.
- `duration`: about `vo_line words / 2.3 + 0.4` seconds, at least 2.5 s (hook 2 to 3 s), at most 6 s. Text-heavy
  scenes need at least 0.4 s per on-screen word plus 1.5 s.
- `eyebrow` (optional): a 1 to 3 word kicker above the text ("Step 1", "The fix").
- Exactly one of `clip` (local MP4) or `photo` (local JPG) per scene. `clip_start` (seconds) picks the best stretch
  of the clip. `focus` steers the crop of photos and non-portrait clips.

## 3. The voiceover script

- `voiceover_script`: the full narration, **natural spoken English for an Indian B2B travel audience**, about
  2.3 words per second: 45 to 75 words for 22 to 35 seconds. It is exactly the `vo_line`s joined in order with
  single spaces.
- Write for the ear: short sentences, everyday words, contractions are fine ("it's", "you'll"). Say numbers as
  people say them ("nine in ten", "fifteen to twenty-five percent", "nine hundred rupees"). Explain acronyms the
  first time if a listener might not know them ("airline debit memos, or ADMs").
- Calm, warm, confident. No hype, no questions stacked, no "Hey guys", no "Did you know". The first sentence is the
  hook; the last sentence is "The full guide is on dhitiservices.com." or a close variant.
- Same facts rule as everywhere: only what the blog says, sourced numbers exactly.
- Read the script aloud in your head at a relaxed pace. If you stumble, rewrite.

## 4. Footage and stills: budget-aware

- **Mostly video:** 3 to 5 stock clips (`content_type: "video"`, `video_type: "footage"`, `orientation: "portrait"`,
  `ai_generated: "excluded"`). **Never more than 5 clips per reel**: each costs 600 Magnific credits. Fill the
  remaining scenes with portrait photos (40 to 150 credits; the renderer animates them with a slow Ken Burns move)
  or library media. Follow the weekly budget in `PLAYBOOK.md` section B; when it is tight, use 3 clips.
- Put clips on the scenes that need motion most: the hook, the problem and the payoff. Method steps work well on
  photos.
- Choose with `stock-selection.md`: inspect each candidate's watermarked preview strip before buying. Look for
  Indian/South Asian professionals, real offices, hotels, airports, travel desks, hands on documents and keyboards,
  phones. Reject logos, readable screens, cheesy acting, people staring into the lens.
- Each clip must be portrait, at least 1080x1920, and at least `duration + 0.5` seconds long from `clip_start`
  (otherwise it loops, which looks cheap). Check with ffprobe after `cli.js fetch`.
- Download with `stock_download {"id": <id>, "type": "video", "max_bytes": 120000000}` and fetch **immediately**
  (video URLs expire in about 5 minutes).
- Vary shots: no two consecutive scenes with the same person or the same framing; mix wide, medium and close
  (hands, documents, screens without legible text).

## 5. Caption and hashtags

- `caption`: 50 to 110 words. Hook first line, short paragraphs with line breaks, last line points to the full guide
  with `https://www.dhitiservices.com/blog/<slug>/` exactly.
- `hashtags`: 6 to 12 relevant hashtags, each starting with `#`, CamelCase.

## 6. video.json shape

```json
{
  "caption": "...",
  "hashtags": ["#TravelAgency", "..."],
  "transition": "fade",
  "voiceover_script": "Your best client might be funding your cash gap. ...",
  "voiceover": null,
  "scenes": [
    { "duration": 2.6, "on_screen_text": "Your best client is funding your cash gap", "vo_line": "Your best client might be funding your cash gap.", "eyebrow": "", "clip": "/abs/path/7411509.mp4", "clip_start": 1.5, "photo": null, "focus": null },
    { "duration": 4.2, "on_screen_text": "Airlines get paid on fixed dates", "vo_line": "Airlines get paid on fixed dates. Your corporate clients pay in sixty days, or later.", "clip": null, "photo": "/abs/path/3629477.jpg", "focus": "left" }
  ],
  "stock": [ { "file": "/abs/path/7411509.mp4", "provider": "magnific", "id": 7411509, "type": "video", "title": "...", "url_preview": "..." } ]
}
```

`transition`: `fade` (default, calm) or `cut` for a punchier edit; others exist (`smoothleft`, `slideup`, ...) but
use them sparingly.

## 7. Preview, look, fix (mandatory)

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && bash ~/dhiti-work/bin/lint.sh "$WORK/<slug>/video.json" \
  && node src/cli.js preview video --spec "$WORK/<slug>/video.json" --out "$WORK/<slug>/preview-video" | tee "$WORK/<slug>/preview-video.json"
```

The output includes the MP4 path and a `timeline` (start and duration of each scene). Extract at least 3 frames
(the hook once its text is visible, a middle scene, the last content scene) plus one from the outro, and Read them:

```bash
source ~/dhiti-work/env.sh && V="$WORK/<slug>/preview-video/<file>.mp4"   # the MP4 path from the preview output
for t in 1.3 12 22; do ffmpeg -v error -y -ss "$t" -i "$V" -frames:v 1 -vf scale=540:-2 "$WORK/<slug>/preview-video/frame-$t.jpg"; done
ffprobe -v error -show_entries format=duration -of csv=p=0 "$V"
```

Pick timestamps from the timeline (text is fully visible about 1 second into each scene). Check: text is legible
over the footage and inside the safe area (nothing hidden behind the platform's top bar or bottom caption zone);
the hook frame works as a thumbnail; no watermark, logo or legible brand appears in the footage; the total
duration is 22 to 35 seconds. Fix and preview again until it is right. Then save:

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js make-video --parent "<blog item id>" --spec "$WORK/<slug>/video.json"
```

Confirm from the JSON output that the item exists and its status is `awaiting_voiceover` (or `pending_review` if
the engine has no voiceover support yet; note which in the run log).
