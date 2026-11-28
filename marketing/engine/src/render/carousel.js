// Carousel renderer: body.slides -> 1080x1350 PNG slides + one PDF (LinkedIn document post).
//
// Slide kinds (content_items.body.slides[].kind):
//   cover : full-bleed photo (slide.photo) + dark gradient + eyebrow pill + big headline + body. No photo -> ink.
//   point : off-white, eyebrow, headline, red rule, body, top-anchored so every slide's headline starts at the same y.
//           One numbering system only: the counter in the header (an eyebrow may say "Step 1" for method steps).
//           Optional photo -> framed image on top.
//   stat  : ink, huge number (slide.stat), headline, body as a small note (typically the source).
//   quote : off-white, giant red quote mark, headline = the quote, body = attribution/context.
//   cta   : brand red, white wordmark, headline, body. Rendered per platform: the PNG slides (Instagram) get a
//           non-link action line ("Full guide: link in bio" + a save prompt), the PDF (LinkedIn) gets the URL button.
//           slide.cta_instagram / slide.save_line override the Instagram lines.
// Text supports **highlight** for a red accent. Em dashes are removed (brand rule).
// Optional slide.focus steers the photo crop: 0..1 (horizontal), {x,y}, "left"/"right"/..., default smart crop.
// Optional slide.subject ({x,y,w,h} fractions of the source photo, normally the face) is mapped through the crop; a
// render whose text crosses it fails (needs an explicit focus).
import { withPage, imagesToPdf, resolveBrand, htmlDocument, photoDataUri, richText, cleanText, splitStat, escapeHtml, coverCropRect, subjectInOutput, subjectMarker, photoSize, assertNoCollisions } from './browser.js';
import { log } from '../log.js';

export const CAROUSEL_SIZE = Object.freeze({ width: 1080, height: 1350 });
const KINDS = new Set(['cover', 'point', 'stat', 'quote', 'cta']);
const SITE = 'www.dhitiservices.com';
const MAX_SLIDES = 20; // Instagram limit; LinkedIn documents allow more but 20 is plenty.

const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
export const QUOTE_SVG = '<svg viewBox="0 0 120 92" fill="currentColor"><path d="M0 92V58C0 25.6 15.2 6.2 45.6 0l5.6 11.4C35.4 16 27.4 25.4 26 39.6h22.8V92H0Zm68.4 0V58c0-32.4 15.2-51.8 45.6-58l5.6 11.4C103.8 16 95.8 25.4 94.4 39.6h22.8V92H68.4Z"/></svg>';
const pad2 = (n) => String(n).padStart(2, '0');

function normalizeSlides(body) {
  const raw = Array.isArray(body?.slides) ? body.slides : [];
  if (!raw.length) throw new Error('renderCarousel: body.slides must be a non-empty array');
  if (raw.length > MAX_SLIDES) log.warn(`renderCarousel: ${raw.length} slides, keeping the first ${MAX_SLIDES}`);
  return raw.slice(0, MAX_SLIDES).map((s, i, all) => {
    let kind = String(s?.kind || '').toLowerCase().trim();
    if (!KINDS.has(kind)) kind = i === 0 ? 'cover' : i === all.length - 1 ? 'cta' : 'point';
    if (kind === 'stat' && !cleanText(s?.stat)) kind = 'point';
    return {
      kind,
      eyebrow: cleanText(s?.eyebrow),
      headline: cleanText(s?.headline),
      body: cleanText(s?.body),
      stat: cleanText(s?.stat),
      photo: typeof s?.photo === 'string' && s.photo.trim() ? s.photo.trim() : null,
      focus: s?.focus ?? null,
      subject: s?.subject ?? null,
      ctaInstagram: cleanText(s?.cta_instagram) || 'Full guide: link in bio',
      saveLine: cleanText(s?.save_line),
    };
  });
}

const header = ({ index, total, logo, tone }) => `
  <header class="top">
    <img class="wordmark" src="${tone === 'paper' ? logo.color : tone === 'red' ? logo.white : logo.reverse}" alt="Dhiti">
    <span class="counter"><b>${pad2(index + 1)}</b><i>/</i>${pad2(total)}</span>
  </header>`;

const footer = ({ index, total, last }) => `
  <footer class="bottom">
    <span class="url">${SITE}</span>
    <div class="progress"><i style="width:${(((index + 1) / total) * 100).toFixed(2)}%"></i></div>
    ${last ? '' : `<span class="next">${ARROW}</span>`}
  </footer>`;

const eyebrowHtml = (text, cls = '') => (text ? `<div class="eyebrow ${cls}">${escapeHtml(text)}</div>` : '');

async function subjectBox(slide, size) {
  if (!slide.photo || !slide.subject) return '';
  const { width: iw, height: ih } = await photoSize(slide.photo);
  const crop = coverCropRect(iw, ih, { ...size, focus: slide.focus });
  if (!crop) throw new Error('renderCarousel: a slide with "subject" needs an explicit focus ({x,y}) so the crop is known');
  return subjectMarker(subjectInOutput(slide.subject, crop, iw, ih), 'face');
}

async function slideHtml(slide, ctx) {
  const { index, total, brand, platform } = ctx;
  const { logo, mark } = brand;
  const last = index === total - 1;
  const H = richText(slide.headline);
  const B = richText(slide.body);

  switch (slide.kind) {
    case 'cover': {
      const photo = await photoDataUri(slide.photo, { ...CAROUSEL_SIZE, focus: slide.focus });
      const subj = photo ? await subjectBox(slide, CAROUSEL_SIZE) : '';
      return `
<div class="frame slide slide--cover on-dark ${photo ? 'has-photo' : 'no-photo bg-ink'}">
  ${photo ? `<img class="photo" src="${photo}" alt=""><div class="scrim-bottom"></div>${subj}` : ''}
  ${header({ index, total, logo, tone: 'dark' })}
  <main class="content" data-fit-box="cover" data-fit-min="0.5" data-text-scope>
    ${eyebrowHtml(slide.eyebrow, 'pill')}
    <h1 class="headline">${H}</h1>
    ${B ? `<p class="body">${B}</p>` : ''}
  </main>
  <footer class="bottom">
    <span class="url">${SITE}</span>
    ${last ? '' : `<span class="swipe">Swipe <span class="next">${ARROW}</span></span>`}
  </footer>
</div>`;
    }

    case 'stat': {
      const { prefix, main, unit } = splitStat(slide.stat);
      const unitIsWord = /[a-z]{2,}/i.test(unit);
      return `
<div class="frame slide slide--stat bg-ink on-dark">
  ${header({ index, total, logo, tone: 'dark' })}
  <main class="content" data-fit-box="stat" data-fit-min="0.5" data-text-scope>
    ${eyebrowHtml(slide.eyebrow)}
    <div class="stat" data-fit-box="stat-number" data-fit-axis="x" data-fit-min="0.3">${prefix ? `<span class="pre">${escapeHtml(prefix)}</span>` : ''}<span class="main">${escapeHtml(main)}</span>${unit ? `<span class="unit${unitIsWord ? ' word' : ''}">${escapeHtml(unit)}</span>` : ''}</div>
    ${H ? `<h2 class="headline">${H}</h2>` : ''}
    ${B ? `<p class="note">${B}</p>` : ''}
  </main>
  ${footer({ index, total, last })}
</div>`;
    }

    case 'quote': {
      return `
<div class="frame slide slide--quote bg-paper">
  ${header({ index, total, logo, tone: 'paper' })}
  <main class="content" data-fit-box="quote" data-fit-min="0.5" data-text-scope>
    <div class="qmark" aria-hidden="true">${QUOTE_SVG}</div>
    ${eyebrowHtml(slide.eyebrow)}
    <blockquote class="headline" style="margin:0">${H || B}</blockquote>
    ${H && B ? `<div class="rule"></div><div class="attrib">${B}</div>` : ''}
  </main>
  ${footer({ index, total, last })}
</div>`;
    }

    case 'cta': {
      return `
<div class="frame slide slide--cta bg-red on-red">
  <img class="watermark" src="${mark.white}" alt="">
  ${header({ index, total, logo, tone: 'red' })}
  <main class="content" data-fit-box="cta" data-fit-min="0.5" data-text-scope>
    ${eyebrowHtml(slide.eyebrow)}
    <h2 class="headline">${H || 'Talk to Dhiti Services'}</h2>
    ${B ? `<p class="body">${B}</p>` : ''}
    ${platform === 'linkedin'
      ? `<div class="cta-row"><span class="btn">${SITE}<span class="arrow">${ARROW}</span></span></div>`
      : `<div class="cta-row"><span class="action">${escapeHtml(slide.ctaInstagram)}</span></div>`}
  </main>
  <footer class="bottom">
    <span class="follow">${platform === 'linkedin' ? 'Follow Dhiti Services for weekly operations playbooks' : escapeHtml(slide.saveLine || 'Save this for your month-end close')}</span>
  </footer>
</div>`;
    }

    default: {
      // point
      const photo = slide.photo ? await photoDataUri(slide.photo, { width: 904, height: 470, focus: slide.focus }) : '';
      if (photo) {
        return `
<div class="frame slide slide--point has-photo bg-paper">
  ${header({ index, total, logo, tone: 'paper' })}
  <main class="content" data-fit-box="point" data-fit-min="0.5" data-text-scope>
    <figure class="figure" style="margin:0"><img src="${photo}" alt=""></figure>
    <div class="stack text">
      ${eyebrowHtml(slide.eyebrow)}
      <h2 class="headline">${H}</h2>
      ${B ? `<div class="rule"></div><p class="body">${B}</p>` : ''}
    </div>
  </main>
  ${footer({ index, total, last })}
</div>`;
      }
      return `
<div class="frame slide slide--point bg-paper">
  ${header({ index, total, logo, tone: 'paper' })}
  <main class="content" data-fit-box="point" data-fit-min="0.5" data-text-scope>
    <div class="stack text">
      ${eyebrowHtml(slide.eyebrow)}
      <h2 class="headline">${H}</h2>
      ${B ? `<div class="rule"></div><p class="body">${B}</p>` : ''}
    </div>
  </main>
  ${footer({ index, total, last })}
</div>`;
    }
  }
}

/**
 * renderCarousel(body, {brand}) -> { slides: Buffer[] (PNG 1080x1350), pdf: Buffer, reports }
 * brand = { colors, logoDataUri, markDataUri } from brand.js (missing parts fall back to repo logos + contract colours).
 */
export async function renderCarousel(body, { brand } = {}) {
  const slides = normalizeSlides(body);
  const resolved = await resolveBrand(brand);
  const total = slides.length;
  const doc = (html) => htmlDocument({ body: html, css: ['creative.css', 'carousel.css'], colors: resolved.colors, ...CAROUSEL_SIZE });
  const docs = [];
  const linkedinDocs = new Map(); // index -> LinkedIn variant (CTA slides only)
  for (let index = 0; index < total; index++) {
    const slide = slides[index];
    docs.push(doc(await slideHtml(slide, { index, total, brand: resolved, platform: 'instagram' })));
    if (slide.kind === 'cta') linkedinDocs.set(index, doc(await slideHtml(slide, { index, total, brand: resolved, platform: 'linkedin' })));
  }
  const pngs = [];
  const reports = [];
  const pdfPages = [];
  await withPage(CAROUSEL_SIZE, async (render) => {
    for (const [i, html] of docs.entries()) {
      const { buffer, report } = await render(html);
      assertNoCollisions(report, `carousel slide ${i + 1}`);
      pngs.push(buffer);
      reports.push(report);
      if (linkedinDocs.has(i)) pdfPages.push((await render(linkedinDocs.get(i))).buffer);
      else pdfPages.push(buffer);
    }
  });
  const pdf = await imagesToPdf(pdfPages, CAROUSEL_SIZE);
  return { slides: pngs, pdf, reports };
}
