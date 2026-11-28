# Stock selection: photos and footage (licensed stock only)

Every image and clip Dhiti publishes is either the owner's own media (the library) or licensed Magnific (Freepik)
stock. **Never** call any Magnific generation or editing tool (`images_generate`, `video_generate`, upscale,
relight, expand, reimagine, TTS, music, SFX, anything that creates or alters media). The only Magnific tools you
may call are `stock_search`, `stock_get`, `stock_download` and `account_balance`. Always pass
`ai_generated: "excluded"` to `stock_search`, and reject any result whose `aiGenerated` is true.

## 1. Owner library first

The owner uploads their own photos and clips (table `library_assets`). Real Dhiti photos beat any stock photo when
they fit the topic. At the start of the run, list them once with the Supabase connector
(`mcp__Supabase__execute_sql`, project `yexxrcgxhwsopssfyylo`):

```sql
select id, kind, storage_path, mime, title, notes, tags, used_count, created_at
from public.library_assets where kind in ('photo','video') order by used_count asc, created_at desc limit 200;
```

(If the table does not exist yet, skip this section.) Prefer a library item when its title, notes or tags match the
scene and it has been used less often. Download one with:

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && node --input-type=module -e "import {downloadFile} from './src/store.js'; import fs from 'node:fs'; fs.writeFileSync(process.argv[2], await downloadFile(process.argv[1])); console.log(JSON.stringify({ok:true,out:process.argv[2]}))" "library/<uuid>/<file>" "$WORK/stock/lib-<uuid>.<ext>"
```

Then Read it (photos) or extract frames (video) and judge it with the same criteria as stock (section 4). After
saving the item that uses it, record usage:

```sql
update public.library_assets set used_count = used_count + 1 where id = '<library asset id>';
```

Stock trail entry for a library file: `{"provider":"library","library_asset_id":"<uuid>","title":"<title>"}`.

## 2. Search well

`mcp__Magnific__stock_search` (load it with ToolSearch `select:mcp__Magnific__stock_search,mcp__Magnific__stock_get,mcp__Magnific__stock_download,mcp__Magnific__account_balance`):

| Use | Parameters |
|---|---|
| Blog cover | `content_type: "photo"`, `orientation: "landscape"`, `people: "include"`, `ai_generated: "excluded"` |
| Carousel / graphic photo | `content_type: "photo"`, `orientation` to suit the layout (portrait or square for carousel covers, landscape for graphics' landscape panels), `ai_generated: "excluded"` |
| Reel footage | `content_type: "video"`, `video_type: "footage"`, `orientation: "portrait"`, `ai_generated: "excluded"` |
| Reel still (Ken Burns) | `content_type: "photo"`, `orientation: "portrait"`, `ai_generated: "excluded"` |

Query craft:
- 3 to 6 concrete, filmable words: who + doing what + where. "indian woman checking invoices laptop office",
  "hotel front desk india receptionist", "airport departure board", "hands typing spreadsheet", "travel agent phone
  call office india", "team meeting whiteboard india office".
- Add "indian" or "south asian" when people appear. Results without it skew American and European.
- No abstract concepts ("efficiency", "growth", "success"), no brand names.
- Run 3 to 5 query variants per need and look at more than the first page when the first is weak (`page: 2`).
- Search results return 50 items: `id`, `title`, `previewUrl`, `videoPreviewUrl` (watermarked preview for video),
  `premium`, `aiGenerated`, `creditCost` (free photo 40, premium photo 150, video 600).

## 3. Look before you buy

Titles lie. Never download (spend credits) on an item you have not seen.

**Photos:** download 6 to 12 promising previews (free, no credits) and tile them into one contact sheet, then Read
the sheet:

```bash
source ~/dhiti-work/env.sh && mkdir -p "$WORK/prev" && cd "$WORK/prev"
curl -sSL -o 3629477.jpg "<previewUrl>"      # repeat per candidate, file named by stock id
ENGINE_DIR="$ENGINE" node ~/dhiti-work/bin/contact.mjs sheet-<slug>-cover.jpg "3629477 free=3629477.jpg" "425360440 prem=425360440.jpg" ...
```

Then `Read` `$WORK/prev/sheet-<slug>-cover.jpg`. Shortlist 1 to 2, Read their full previews individually, and
`stock_get` the winner for author and format size.

**Video:** for each candidate, fetch the watermarked preview and tile frames across the clip, then Read the strip:

```bash
source ~/dhiti-work/env.sh && curl -sSL -o "$WORK/prev/v-<id>.mp4" "<videoPreviewUrl>"
ffmpeg -v error -y -i "$WORK/prev/v-<id>.mp4" -vf "fps=1,scale=240:-2,tile=6x2" -frames:v 1 "$WORK/prev/v-<id>-strip.jpg"
```

Reject before buying any clip whose title or strip shows aircraft, tails, tarmac, liveries or signage: a legible
airline or airport name anywhere in the shot breaks the clean-frame rule and wastes 600 credits.

The strip shows how the shot evolves (does the subject leave frame, does a logo appear, is there a usable 3 to 5
second stretch). The Magnific watermark on previews is expected; it is not on the licensed file.

## 4. Selection criteria (all must hold)

- **Authentic and editorial.** Looks like a real moment at real work. Natural posture, not posing, not looking at
  the camera, no forced smile. Bright, warm natural light; modern Indian office, hotel back office, reservations
  desk, airport, travel counter.
- **Relevant.** The image tells the story of this specific post: the document, the call, the reconciliation, the
  front desk. A cover could not be swapped onto a different post.
- **India, verified from the provider.** Ethnicity and place come from the provider's title or tags (`stock_get`),
  never from looking at the face, and the stock entry's `note` records which ("Ethnicity from the provider title
  (Indian business man); tags are mixed"). A title that does not say Indian or South Asian is not enough, however
  the person looks. Reject any frame showing a non-Indian airport code (JHB, LHR, DXB on a boarding pass), foreign
  currency or signage; for airline topics prefer an Indian code (DEL, BOM, BLR) or no code at all.
- **Real offices.** Reject home sets (sofa, floor lamp, curtains), trading-floor or stock-chart walls and studio
  backdrops for an office story. A 4K clip whose background fails can still give a clean close-up with `zoom`.
- **People.** Indian or South Asian professionals in smart-casual office clothes whenever people appear. Real
  diversity of age and gender across the week. No children. Expression matches the post: concentrated, neutral
  or mildly concerned for problem topics; no smiling at a lost-money story.
- **Clean frame.** No readable text, numbers, logos, brand names, airline or hotel liveries, flags, famous
  landmarks, watermarks, uniforms of real companies, or on-screen UI with legible words.
- **Never cheesy.** Reject: handshakes over desks, thumbs-up, pointing at blank screens, jumping or cheering
  teams, headset grins at the lens, glowing holograms, robots, "AI brain" imagery, lightbulbs, chess pieces,
  puzzle pieces, staged high-fives, white-background cutouts, heavy filters or HDR.
- **Not AI.** `aiGenerated` must be false. Also reject anything that looks synthetic: waxy skin, warped hands or
  fingers, melted text, impossible reflections.
- **Composition.** Covers: landscape, subject on a third, calm negative space, works when cropped to 1600x900.
  Carousel cover photos: the subject survives a 1080x1350 portrait crop (set `focus` if needed). Reel: portrait
  9:16 footage; landscape clips get centre-cropped and usually lose the subject, so avoid them.
- **Resolution.** Photos at least 2000 px on the long edge (covers ideally 3000+). Video at least 1080x1920.
- **Variety.** Do not reuse the same model or set across the three posts in a week; vary settings (office,
  hotel, airport, phone desk).
  Within one blog, one stock file belongs to one creative: the cover stays on the blog (it is every link preview's
  image), and the carousel, each graphic and the reel use different photos and clips. `make-*` refuses a reuse.
  Never use one clip or photo twice in the same reel.

Prefer a free (40-credit) photo when it is as good as a premium one. Pay for premium when it is clearly better.

## 5. Buy and fetch immediately

Signed download URLs expire (about 5 minutes for video, about 15 for photos). Call `stock_download` and run
`cli.js fetch` in the very next step, nothing in between:

```text
mcp__Magnific__stock_download { "id": 3629477, "type": "photo" }
mcp__Magnific__stock_download { "id": 7411509, "type": "video", "max_bytes": 120000000 }
```

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && node src/cli.js fetch "<signed url>" --out "$WORK/stock/3629477.jpg"
```

If `fetch` fails because the URL expired, call `stock_download` again and fetch at once (it is the same licence;
note it in the log). Then verify the file:

```bash
source ~/dhiti-work/env.sh && cd "$ENGINE" && node --input-type=module -e "import sharp from 'sharp'; const m = await sharp(process.argv[1]).metadata(); console.log(JSON.stringify({w:m.width,h:m.height,format:m.format}))" "$WORK/stock/3629477.jpg"
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,duration -of json "$WORK/stock/7411509.mp4"
```

Reject and choose again if the real file is too small or not what the preview showed.

## 6. Keep the licence trail and the credit ledger

- Every downloaded file gets a sidecar entry. For the blog cover write `$WORK/<slug>/stock.json`:
  `{"provider":"magnific","id":3629477,"type":"photo","title":"<provider title, verbatim>","url":"<webUrl>","url_preview":"<previewUrl>","author":"<author name>","credit_cost":40,"note":"<optional editorial note>"}`
  `title` is the provider's own title copied exactly (from the search result or `stock_get`; when `stock_get`
  returns none, the words of the provider URL slug). Never rewrite it to fit the story: put any description of your
  own, and the ethnicity source, in `note`.
- Every creative spec carries a top-level `"stock"` array listing each file it uses:
  `[{"file":"/abs/path/3629477.jpg","provider":"magnific","id":3629477,"type":"photo","title":"...","url_preview":"..."}]`
  (library files: `{"file":"...","provider":"library","library_asset_id":"...","title":"..."}`).
- Append one line per download to `$WORK/credits.jsonl`:
  `{"slug":"<slug>","use":"cover|carousel|graphic|reel","id":3629477,"type":"photo","credit_cost":40}`.
- Keep files in `$WORK/stock/` named by stock id and check there before buying: never download the same item twice.
  A file bought for one creative is not reused in another creative of the same blog (one photo per creative).
