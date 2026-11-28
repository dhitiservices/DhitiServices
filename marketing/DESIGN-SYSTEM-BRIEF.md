# Dhiti Creative Design System — brief (owner, binding for carousel, graphics and reels)

Owner: current creatives are "too basic". Target: world-class, Apple x Stripe x Linear, top YouTube motion-designer level
(kinetic typography, smooth easing, purposeful motion), built ONCE as a reusable system so each weekly blog costs little Claude usage:
Claude only writes text and picks layout/preset names; the engine does all design and animation in code.

## Principles
- One idea per frame. Big confident type, generous space, strict 8 pt grid, max 2 type sizes per frame plus one accent.
- Restraint: Dhiti red (#EE0800 / deep #C20600 / bright #FF3322) as accent and premium gradient, warm ink (#161110 / #4A403E / #857A77), off-white #FAF7F2, deep warm black #120C0B. Grain + soft light to avoid flat digital look.
- Inter (creatives) with tight tracking on display sizes (-0.03 to -0.045em), tabular numbers for stats.
- Every number becomes a visual: big counter, bar, ring, before/after split, timeline.
- Continuity: carousel slides share a continuous line/shape that flows across slide edges when swiped.

## Carousel layout library (12, each a named template with text slots and safe limits)
cover-photo, cover-type (no photo, giant headline + gradient), big-stat (counter + qualifier + source), compare (before/after split),
steps-list (numbered with icons), checklist, quote (pull quote, editorial), timeline (dates on a line), diagram (simple flow 3-4 nodes),
myth-fact, table-mini (3x3 max), cta-end (brand gradient, logo, next action). Instagram 1080x1350 + LinkedIn PDF.

## Motion presets for reels (8, deterministic, 30 fps, rendered frame-by-frame from HTML/CSS/WAAPI in Chromium, composited over stock with ffmpeg)
1. word-rise: words rise 24px with blur 8->0 and opacity, 40 ms stagger, ease cubic-bezier(.2,.8,.2,1).
2. counter: number counts up with easing, unit slides in, underline draws.
3. highlight-sweep: red marker sweeps behind a key phrase.
4. line-draw: SVG stroke draws a path / arrow / timeline.
5. mask-wipe: scene change by a soft-edged diagonal mask or brand-red bar sweep.
6. push-zoom: slow Ken Burns on footage with parallax on the text layer (1.00 -> 1.06).
7. card-stack: UI-like cards (invoice, GSTR-2B row, checklist) slide in with soft shadow, Apple style.
8. logo-outro: logo mark builds from strokes, tagline word-rise, URL.
Rules: every motion lasts 300-700 ms, holds long enough to read (≈ 0.35 s per word + 0.8 s), sync beats to voiceover line starts, captions burned in (word-by-word active highlight), safe zones for Reels/LinkedIn, no more than 2 animated elements at once, cut on action, subtle whoosh-free (silent until owner voiceover).

## Quality bar
Each template is screenshot/frame-checked at phone size; text never overflows (auto-fit with min sizes); contrast AA on footage (adaptive scrim); looks like a premium brand's motion package, not a template app.

## Reference direction (owner): josephswork, Tom Lulofs, top SaaS launch-film motion designers
Style = premium SaaS product-launch motion, adapted to Dhiti's travel-operations stories:
- Abstracted UI: simplified, beautiful versions of real artefacts (airline invoice, GSTR-2B row, booking profile, reconciliation sheet, email) built as HTML cards, animated in and assembled like a product demo.
- Depth: subtle 3D perspective tilt (rotateX/Y 6-12deg), soft layered shadows, depth-of-field blur on background layers, glass panels, grain, glow from a Dhiti-red gradient light source.
- Camera: virtual camera moves across one big canvas (pan, push-in, zoom-through a card into the next scene) instead of plain cuts.
- Kinetic type: large stacked headlines, word/line masks, weight and colour emphasis, tight tracking; numbers that count and morph.
- Cursor and interaction cues: an animated pointer clicks, toggles, ticks a checklist, highlights a row.
- Spring physics easing (overshoot 3-6%) and expo-out curves; motion on beats; holds long enough to read.
- Backgrounds: off-white or deep warm black with a faint grid, soft red gradient orbs moving slowly.
- Stock footage used sparingly as texture/b-roll inside masks or cards, not as the main visual.
To match taste exactly, the owner will send screen recordings; extract frames with ffmpeg (1-2 fps + scene-change frames) and study timing, easing, type scale and transitions before building.

## House visual language (owner screenshot of the new website service cards, 2026-11-28)
The creatives must feel like the new website: abstracted UI cards on a soft Dhiti-red gradient with a faint dot grid.
- White rounded cards (radius ~20px), soft red-tinted shadow, a small header ("Supplier statement", "Monthly client report", "Second check") with a grey "Example" pill.
- Rows with status pills: green "Matched/Verified/Done", red "Flagged/Merged", amber dot for in-progress; red check-circle ticks for completed steps; stacked offset chips for checklists; chat bubbles for support; a red area-line chart for reporting.
- Icon tile in a soft red rounded square, numbered "01..06" in light grey, bold tight headline, grey body, red text link with chevron.
These card types become reusable components for carousel slides, graphics and reel scenes (animated in like a product demo).
Each service has its own signature card: Back-office = checklist chips; Accounts = statement rows Matched/Flagged; Reporting = chart card; Customer support = chat bubbles; Sales = lead/CRM rows with avatars; Quality = "Second check" verification list.
