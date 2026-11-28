// Graphic renderer: one idea, two reflowed layouts.
//   renderGraphic(body, {brand}) -> { square: PNG 1080x1080, landscape: PNG 1200x627, reports }
//
// body.kind:
//   quote : headline = the quote (falls back to body), attribution = who said it, body = optional context line.
//           No photo -> off-white editorial. Photo -> square: photo + dark scrim; landscape: photo panel left.
//   stat  : stat = the number, headline = what it means, body/attribution = source note. Ink background
//           (photo, if given, sits behind a heavy scrim). Landscape: number left, red divider, text right.
//   tip   : headline = the tip, body = how/why. Off-white with "Operations tip" label (body.eyebrow overrides).
//           Photo -> square: photo band on top; landscape: photo panel right.
// Text supports **highlight**. Em dashes are removed (brand rule). body.focus steers the photo crop (see parseFocus).
import { withPage, resolveBrand, htmlDocument, photoDataUri, richText, cleanText, splitStat, escapeHtml } from './browser.js';
import { QUOTE_SVG } from './carousel.js';

export const GRAPHIC_SIZES = Object.freeze({
  square: { width: 1080, height: 1080 },
  landscape: { width: 1200, height: 627 },
});
const SITE = 'www.dhitiservices.com';
const KINDS = new Set(['quote', 'stat', 'tip']);
const TIP_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M7.5 12.4l3 3 6-6.4"/></svg>';

function normalize(body) {
  if (!body || typeof body !== 'object') throw new Error('renderGraphic: body must be an object');
  let kind = String(body.kind || '').toLowerCase().trim();
  if (!KINDS.has(kind)) kind = cleanText(body.stat) ? 'stat' : 'tip';
  if (kind === 'stat' && !cleanText(body.stat)) kind = 'tip';
  const g = {
    kind,
    eyebrow: cleanText(body.eyebrow),
    headline: cleanText(body.headline),
    body: cleanText(body.body),
    stat: cleanText(body.stat),
    attribution: cleanText(body.attribution),
    photo: typeof body.photo === 'string' && body.photo.trim() ? body.photo.trim() : null,
    focus: body.focus ?? null,
  };
  if (kind === 'quote' && !g.headline) [g.headline, g.body] = [g.body, ''];
  if (!g.headline && kind !== 'stat') throw new Error('renderGraphic: headline is required');
  return g;
}

const foot = (logoSrc) => `<footer class="g-foot"><img class="wordmark" src="${logoSrc}" alt="Dhiti"><span class="url">${SITE}</span></footer>`;

function statHtml(stat) {
  const { prefix, main, unit } = splitStat(stat);
  const word = /[a-z]{2,}/i.test(unit);
  return `<div class="stat" data-fit-box="stat-number" data-fit-axis="x" data-fit-min="0.3">${prefix ? `<span class="pre">${escapeHtml(prefix)}</span>` : ''}<span class="main">${escapeHtml(main)}</span>${unit ? `<span class="unit${word ? ' word' : ''}">${escapeHtml(unit)}</span>` : ''}</div>`;
}

function attribHtml(g) {
  const a = g.attribution ? `<b>${richText(g.attribution)}</b>` : '';
  const c = g.body ? `<span>${richText(g.body)}</span>` : '';
  return a || c ? `<div class="rule"></div><div class="attrib">${a}${c}</div>` : '';
}

function noteHtml(g) {
  const parts = [g.body, g.attribution ? `Source: ${g.attribution}` : ''].filter(Boolean).map((t) => richText(t));
  return parts.length ? `<p class="note">${parts.join('<br>')}</p>` : '';
}

async function squareHtml(g, brand) {
  const { logo, mark } = brand;
  const { width, height } = GRAPHIC_SIZES.square;
  if (g.kind === 'quote') {
    const photo = g.photo ? await photoDataUri(g.photo, { width, height, focus: g.focus }) : '';
    return `
<div class="frame g g-square g-quote ${photo ? 'has-photo on-dark bg-ink' : 'bg-paper'}">
  ${photo ? `<img class="photo" src="${photo}" alt=""><div class="scrim-full"></div>` : ''}
  <main class="g-main" data-fit-box="quote" data-fit-min="0.5">
    <div class="qmark">${QUOTE_SVG}</div>
    <blockquote class="quote">${richText(g.headline)}</blockquote>
    ${attribHtml(g)}
  </main>
  ${foot(photo ? logo.reverse : logo.color)}
</div>`;
  }
  if (g.kind === 'stat') {
    const photo = g.photo ? await photoDataUri(g.photo, { width, height, focus: g.focus }) : '';
    return `
<div class="frame g g-square g-stat bg-ink on-dark ${photo ? 'has-photo-bg' : ''}">
  ${photo ? `<img class="photo" src="${photo}" alt=""><div class="scrim-full" style="background:rgba(16,17,20,0.84)"></div>` : ''}
  <main class="g-main" data-fit-box="stat" data-fit-min="0.5">
    ${g.eyebrow ? `<div class="eyebrow">${escapeHtml(g.eyebrow)}</div>` : ''}
    ${statHtml(g.stat)}
    ${g.headline ? `<h1 class="headline">${richText(g.headline)}</h1>` : ''}
    ${noteHtml(g)}
  </main>
  ${foot(logo.reverse)}
</div>`;
  }
  // tip
  const label = `<div class="label">${TIP_ICON}${escapeHtml(g.eyebrow || 'Operations tip')}</div>`;
  const text = `<h1 class="headline">${richText(g.headline)}</h1>${g.body ? `<div class="rule"></div><p class="body">${richText(g.body)}</p>` : ''}`;
  const photo = g.photo ? await photoDataUri(g.photo, { width, height: 430, focus: g.focus }) : '';
  if (photo) {
    return `
<div class="frame g g-square g-tip has-photo bg-paper">
  <div class="band"><img src="${photo}" alt="">${label}</div>
  <div class="lower">
    <main class="g-main" data-fit-box="tip" data-fit-min="0.5" style="justify-content:center">${text}</main>
    ${foot(logo.color)}
  </div>
</div>`;
  }
  return `
<div class="frame g g-square g-tip bg-paper">
  <img class="bigmark" src="${mark.color}" alt="">
  <main class="g-main" data-fit-box="tip" data-fit-min="0.5">${label}${text}</main>
  ${foot(logo.color)}
</div>`;
}

async function landscapeHtml(g, brand) {
  const { logo, mark } = brand;
  const { height } = GRAPHIC_SIZES.landscape;
  if (g.kind === 'quote') {
    const photo = g.photo ? await photoDataUri(g.photo, { width: 470, height, focus: g.focus }) : '';
    if (photo) {
      return `
<div class="frame g-land g-quote has-photo bg-paper">
  <div class="panel"><img src="${photo}" alt=""></div>
  <div class="textcol">
    <main class="g-main" data-fit-box="quote" data-fit-min="0.5" style="justify-content:center">
      <div class="qmark">${QUOTE_SVG}</div>
      <blockquote class="quote">${richText(g.headline)}</blockquote>
      ${attribHtml(g)}
    </main>
    ${foot(logo.color)}
  </div>
</div>`;
    }
    return `
<div class="frame g g-land g-quote bg-paper">
  <div class="split">
    <div class="qmark">${QUOTE_SVG}</div>
    <main class="text" data-fit-box="quote" data-fit-min="0.5">
      <blockquote class="quote">${richText(g.headline)}</blockquote>
      ${attribHtml(g)}
    </main>
  </div>
  ${foot(logo.color)}
</div>`;
  }
  if (g.kind === 'stat') {
    const photo = g.photo ? await photoDataUri(g.photo, { ...GRAPHIC_SIZES.landscape, focus: g.focus }) : '';
    return `
<div class="frame g g-land g-stat bg-ink on-dark ${photo ? 'has-photo-bg' : ''}">
  ${photo ? `<img class="photo" src="${photo}" alt=""><div class="scrim-full" style="background:rgba(16,17,20,0.84)"></div>` : ''}
  <div class="split">
    <div class="left">
      ${g.eyebrow ? `<div class="eyebrow">${escapeHtml(g.eyebrow)}</div>` : ''}
      ${statHtml(g.stat)}
    </div>
    <main class="right" data-fit-box="stat" data-fit-min="0.5">
      ${g.headline ? `<h1 class="headline">${richText(g.headline)}</h1>` : ''}
      ${noteHtml(g)}
    </main>
  </div>
  ${foot(logo.reverse)}
</div>`;
  }
  const label = `<div class="label">${TIP_ICON}${escapeHtml(g.eyebrow || 'Operations tip')}</div>`;
  const text = `${label}<h1 class="headline">${richText(g.headline)}</h1>${g.body ? `<div class="rule"></div><p class="body">${richText(g.body)}</p>` : ''}`;
  const photo = g.photo ? await photoDataUri(g.photo, { width: 440, height, focus: g.focus }) : '';
  if (photo) {
    return `
<div class="frame g-land g-tip has-photo bg-paper">
  <div class="textcol">
    <main class="g-main" data-fit-box="tip" data-fit-min="0.5" style="justify-content:center">${text}</main>
    ${foot(logo.color)}
  </div>
  <div class="panel"><img src="${photo}" alt=""></div>
</div>`;
  }
  return `
<div class="frame g g-land g-tip bg-paper">
  <img class="bigmark" src="${mark.color}" alt="">
  <main class="g-main" data-fit-box="tip" data-fit-min="0.5">${text}</main>
  ${foot(logo.color)}
</div>`;
}

/**
 * renderGraphic(body, {brand}) -> { square: Buffer (PNG 1080x1080), landscape: Buffer (PNG 1200x627), reports }
 */
export async function renderGraphic(body, { brand } = {}) {
  const g = normalize(body);
  const resolved = await resolveBrand(brand);
  const css = ['creative.css', 'graphic.css'];
  const out = { reports: {} };
  for (const [name, size] of Object.entries(GRAPHIC_SIZES)) {
    const inner = name === 'square' ? await squareHtml(g, resolved) : await landscapeHtml(g, resolved);
    const html = htmlDocument({ body: inner, css, colors: resolved.colors, ...size });
    await withPage(size, async (render) => {
      const { buffer, report } = await render(html);
      out[name] = buffer;
      out.reports[name] = report;
    });
  }
  return out;
}
