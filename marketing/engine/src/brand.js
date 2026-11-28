// Brand context for the Claude session and the renderers (ARCHITECTURE.md "Brand").
//
//   getBrandContext({ voiceSamples = 3, sampleChars = 1800 }) ->
//     { colors, fonts, logoDataUri, markDataUri, voiceSamples, existingPosts, categories, nextOrder, voiceRules, site }
//
// Everything comes from the website repo (REPO_ROOT): logos in src/assets/logos, posts in content/blog.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config, BLOG_CATEGORIES } from './config.js';
import { listExistingPosts } from './blogcheck.js';

export const BRAND_COLORS = Object.freeze({
  red: '#EE0800',
  redDeep: '#C20600',
  redBright: '#FF3322',
  ink: '#15161A',
  inkSoft: '#3a3d45',
  inkMute: '#6b6f7a',
  white: '#FFFFFF',
  paper: '#FAF7F2',
});

export const BRAND_FONTS = Object.freeze({
  dashboard: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", sans-serif',
  creatives: 'Inter (templates/fonts/InterVariable.woff2, SIL Open Font License)',
});

export const VOICE_RULES = Object.freeze([
  'Practical, specific, plain English. Write for busy founders and operations heads.',
  'Open with a short, concrete scenario (a person, a queue, a deadline), then name the problem.',
  'Exactly one bold key sentence (**...**) near the top that states the core insight.',
  'Cite real external sources inline as markdown links to https URLs. Never invent statistics.',
  'Label illustrative examples as illustrative. No client names, no promised results.',
  'No hype, no buzzwords, no em dashes (—). Short paragraphs, active voice.',
  'Exactly 8 "##" sections, at least 1000 words (1200-1600 is the sweet spot), no raw HTML, no "#" H1.',
  'Link 2-5 related Dhiti posts with relative links like ../<slug>/ where they genuinely help.',
]);

async function dataUri(file, mime) {
  try {
    const buf = await fs.readFile(file);
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return '';
  }
}

/** First `chars` characters of a post body, cut at a paragraph boundary. */
function excerpt(content, chars) {
  const text = String(content || '').trim();
  if (text.length <= chars) return text;
  const cut = text.slice(0, chars);
  const at = cut.lastIndexOf('\n\n');
  return (at > chars * 0.5 ? cut.slice(0, at) : cut).trim();
}

export async function getBrandContext({ voiceSamples = 3, sampleChars = 1800 } = {}) {
  const repoRoot = config.repoRoot;
  const [logoDataUri, markDataUri, posts] = await Promise.all([
    dataUri(path.join(config.logosDir, 'dhiti-logo.webp'), 'image/webp'),
    dataUri(path.join(config.logosDir, 'dhiti-mark.webp'), 'image/webp'),
    listExistingPosts({ repoRoot }),
  ]);
  const good = posts.filter((p) => !p.error);
  const orders = good.map((p) => Number(p.order)).filter(Number.isFinite);
  const usedCategories = [...new Set(good.map((p) => p.category).filter(Boolean))];
  const samples = good.slice(0, Math.max(0, voiceSamples)).map((p) => ({
    slug: p.slug,
    title: p.title,
    category: p.category,
    excerpt: excerpt(p.content, sampleChars),
  }));
  return {
    colors: { ...BRAND_COLORS },
    fonts: { ...BRAND_FONTS },
    logoDataUri,
    markDataUri,
    voiceRules: [...VOICE_RULES],
    voiceSamples: samples,
    existingPosts: good.map((p) => ({
      slug: p.slug,
      title: p.title,
      description: p.description,
      category: p.category,
      date: p.date,
      order: p.order,
      words: p.words,
      url: `${config.siteUrl}/blog/${p.slug}/`,
    })),
    brokenPosts: posts.filter((p) => p.error).map((p) => ({ slug: p.slug, error: p.error })),
    categories: [...BLOG_CATEGORIES, ...usedCategories.filter((c) => !BLOG_CATEGORIES.includes(c))],
    categoryCounts: Object.fromEntries(BLOG_CATEGORIES.map((c) => [c, good.filter((p) => p.category === c).length])),
    nextOrder: (orders.length ? Math.max(...orders) : 0) + 1,
    site: { url: config.siteUrl, blog: `${config.siteUrl}/blog/` },
  };
}
