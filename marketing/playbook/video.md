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

The renderer appends a branded end card (logo, `outro_text`, www.dhitiservices.com; 3 s, longer if its spoken line
needs it) automatically, so your scenes should total **19 to 32 seconds**. Do not write your own logo scene.
`outro_text` is an action with a verb ("Read the full airline GST routine"), and `outro_vo_line` is the spoken
call to action that plays over the card ("Read the full routine on dhitiservices.com.").

1. **Hook scene, 2 to 3 s.** `on_screen_text` names a costly, recognisable problem or a surprising truth in **at
   most 7 words**, readable in under 2 seconds ("Your best client is funding your cash gap"). The footage must
   show the post's object in the first frame (the invoice, ledger, rooming list, refund email or desk where it
   happens), close or medium. Silhouettes, skylines and airport windows are establishing shots and are not
   allowed as hooks. The hook is this reel's own line: never the carousel cover's hook or any other creative's
   headline. If it comes from the post's illustrative scene, label it (eyebrow "Illustrative month", VO "Say
   eleven flights are missing ..."). The renderer shows the hook text fully from frame 0 and animates only its
   highlight, and the poster is taken from this scene.
2. **Problem and cause scenes (2 scenes).** Why it happens, one concrete detail each. A sourced number from the
   post may be used exactly as written.
3. **Method scenes (2 to 3 scenes).** The practical routine, one step per scene.
4. **Payoff scene (1 scene).** The outcome of doing it well. The call to action lives on the end card.
5. **Dates.** A deadline beat must still be ahead on the publish date and carry its year; otherwise drop it
   (the post's trap or method makes a better beat).

Rules for every scene:
- `on_screen_text`: **at most 9 words**, sentence case, one idea, no hashtags, no emoji, no em dashes. It is a
  condensed caption of the `vo_line`, not a word-for-word copy. Across scenes the text reads as one story even
  with the sound off.
- `vo_line`: the words spoken over this scene.
- `duration`: about `vo_line words / 2.3 + 0.4` seconds, at least 2.5 s (hook 2 to 3 s), at most 6 s. Text-heavy
  scenes need at least 0.4 s per on-screen word plus 1.5 s.
- `eyebrow` (optional): a 1 to 3 word kicker above the text ("Step 1", "The fix").
- Exactly one of `clip` (local MP4) or `photo` (local JPG) per scene. `clip_start` (seconds) picks the best stretch
  of the clip (watch the strip for people walking through the frame). `focus` steers the crop of photos and clips.
- `zoom` (clips, 1 to 3): punches into the clip around `focus`, for a close-up of hands, documents or a keyboard
  that leaves an unwanted background out of frame. Use it on 4K (2160x3840) sources so the crop stays sharp.
- `subject` (every scene with a person): the face box as fractions of the SOURCE frame at `clip_start` (or of the
  photo), with an explicit `{x,y}` focus. The text block sits in the band y 770 to 1240 (bottom-anchored at 1240),
  so faces belong in the top 40% of the frame; the renderer fails a scene whose text crosses the face box.
- `logo` (optional, "left" or "right"): forces the wordmark corner. By default each scene takes the top corner with
  the calmer background, or the side away from the subject box.

## 3. The voiceover script

- `voiceover_script`: the full narration, **natural spoken English for an Indian B2B travel audience**, about
  2.3 words per second: 45 to 75 words for 22 to 35 seconds. It is exactly the `vo_line`s joined in order with
  single spaces, followed by the `outro_vo_line`.
- Write for the ear: short sentences, everyday words, contractions are fine ("it's", "you'll"). Say numbers as
  people say them ("nine in ten", "fifteen to twenty-five percent", "nine hundred rupees"). Explain acronyms the
  first time if a listener might not know them ("airline debit memos, or ADMs").
- Calm, warm, confident. No hype, no questions stacked, no "Hey guys", no "Did you know". The first sentence is the
  hook; the last sentence is the `outro_vo_line`, a verb-led call to action ("Read the full routine on
  dhitiservices.com."), voiced over the end card.
- Same facts rule as everywhere: only what the blog says, sourced numbers exactly.
- Read the script aloud in your head at a relaxed pace. If you stumble, rewrite.

## 4. Footage and stills: budget-aware

- **Motion first:** at least 5 of 6 scenes are motion clips (4 to 5 stock clips, `content_type: "video"`,
  `video_type: "footage"`, `orientation: "portrait"`, `ai_generated: "excluded"`) or the owner's own footage. **Never
  more than 5 stock clips per reel**: each costs 600 Magnific credits. A still (owner photo first) fills at most one
  scene, or two when the credit cap leaves no room (log it). A reel of mostly Ken Burns stills reads as a slideshow.
- Free 1098-/1262-series Freepik photos are on thousands of sites: use them as reel stills only when nothing else fits.
- Choose with `stock-selection.md`: inspect each candidate's watermarked preview strip before buying. Look for
  Indian/South Asian professionals, real offices, hotels, airports, travel desks, hands on documents and keyboards,
  phones. Reject logos, readable screens, cheesy acting, people staring into the lens.
- Each clip must be portrait, at least 1080x1920, and at least `duration + 0.5` seconds long from `clip_start`
  (otherwise it loops, which looks cheap). Check with ffprobe after `cli.js fetch`.
- Download with `stock_download {"id": <id>, "type": "video", "max_bytes": 120000000}` and fetch **immediately**
  (video URLs expire in about 5 minutes).
- Vary shots: no two consecutive scenes with the same person or the same framing; mix wide, medium and close
  (hands, documents, screens without legible text).
- No clip or photo that the blog cover, the carousel or a graphic of the same blog uses (the engine refuses it).
- Reject home sets (sofa, floor lamp, curtains), trading-floor or chart walls, and any frame with a non-Indian
  airport code, currency or signage (a boarding pass reading JHB is a South African trip). Ethnicity comes from the
  provider title or tags, recorded in the stock entry's `note`.

## 5. Caption and hashtags

- `caption`: 50 to 110 words. Hook first line, short paragraphs with line breaks, last line points to the full guide
  with `https://www.dhitiservices.com/blog/<slug>/` exactly.
- `hashtags`: 6 to 12 relevant hashtags, each starting with `#`, CamelCase.

## 6. video.json shape

```json
{
  "caption": "...",
  "hashtags": ["#TravelAgency", "..."],
  "transition": "cut",
  "outro_text": "Read the full collections routine",
  "outro_vo_line": "Read the full routine on dhitiservices.com.",
  "voiceover_script": "Your best client might be funding your cash gap. ... Read the full routine on dhitiservices.com.",
  "voiceover": null,
  "scenes": [
    { "duration": 2.6, "on_screen_text": "Your best client is funding your cash gap", "vo_line": "Your best client might be funding your cash gap.", "eyebrow": "", "clip": "/abs/path/7411509.mp4", "clip_start": 1.5, "zoom": 1, "photo": null, "focus": {"x":0.5,"y":0.5}, "subject": {"x":0.35,"y":0.05,"w":0.4,"h":0.35} },
    { "duration": 4.2, "on_screen_text": "Airlines get paid on fixed dates", "vo_line": "Airlines get paid on fixed dates. Your corporate clients pay in sixty days, or later.", "clip": null, "photo": "/abs/path/3629477.jpg", "focus": "left" }
  ],
  "stock": [ { "file": "/abs/path/7411509.mp4", "provider": "magnific", "id": 7411509, "type": "video", "title": "...", "url_preview": "..." } ]
}
```

`transition`: `cut` (default and recommended: hard cuts on the voiceover beats, one short fade to black into the end
card only). `fadeblack` between every scene leaves dead, text-less beats; use other xfade transitions only with a
reason.

## 7. Preview, look, fix (mandatory)

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && bash ~/dhiti-work/bin/lint.sh "$WORK/<slug>/video.json" \
  && node src/cli.js preview video --spec "$WORK/<slug>/video.json" --out "$WORK/<slug>/preview-video" --publish-date "<planned_publish_date>" | tee "$WORK/<slug>/preview-video.json"
```

The output includes the MP4 path, a `timeline` (start, duration and wordmark corner of each scene), `warnings`
(dates to re-check) and `safe_zone_sheet`: one frame per scene with the platform zones shaded (top bar, the bottom
35% where Reels and LinkedIn draw captions and the audio row, the right-hand action rail) and the text band
outlined. Read the sheet first: text and faces must sit outside the shaded zones. Then extract at least 3 frames
(the hook once its text is visible, a middle scene, the last content scene) plus one from the outro, and Read them:

```bash
source ~/dhiti-work/env.sh && V="$WORK/<slug>/preview-video/<file>.mp4"   # the MP4 path from the preview output
for t in 1.3 12 22; do ffmpeg -v error -y -ss "$t" -i "$V" -frames:v 1 -vf scale=540:-2 "$WORK/<slug>/preview-video/frame-$t.jpg"; done
ffprobe -v error -show_entries format=duration -of csv=p=0 "$V"
```

Pick timestamps from the timeline (text is fully visible about 1 second into each scene). Check: text is legible
over the footage and inside the safe area (nothing hidden behind the platform's top bar or bottom caption zone);
the hook frame works as a thumbnail and its text is readable at t=0; no scene is a dark or empty frame; no
highlight box touches the line above; no watermark, logo or legible brand appears in the footage; the total
duration is 22 to 35 seconds; the hook scene is at most 3.0 s; no clip or photo appears twice; no text sits in
the right-hand action rail (x > 920) where Reels draws its buttons. Fix and preview again until it is right. Then save:

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js make-video --parent "<blog item id>" --spec "$WORK/<slug>/video.json"
```

Confirm from the JSON output that the item exists and its status is `awaiting_voiceover` (or `pending_review` if
the engine has no voiceover support yet; note which in the run log).
