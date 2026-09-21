import fs from 'node:fs';
import path from 'node:path';
import { root, esc, loadPosts } from './blog-data.mjs';

const posts = loadPosts();
const out = path.join(root,'dist');
const origin = (process.env.SITE_URL || 'https://dhitiservices.com').replace(/\/$/, '');
const preview = process.env.BLOG_PUBLISH === '0';
const categories = [...new Set(posts.map(p=>p.category))];
if (posts.length < 10 || posts.some(p=>p.words<1000)) throw new Error('Every one of the ten launch articles must contain at least 1,000 words.');
fs.mkdirSync(path.join(out,'blog/images'), {recursive:true});
for (const p of posts) fs.copyFileSync(path.join(root,'src/assets/photos',p.image),path.join(out,'blog/images',p.image));
fs.copyFileSync(path.join(root,'src/assets/logos/dhiti-logo.webp'),path.join(out,'blog/images/logo.webp'));

const arrow = '<span aria-hidden="true">↗</span>';
const readableDate = date => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
function header(home,blog) {
  return `<a class="db-skip" href="#main">Skip to content</a>
  <header class="db-nav"><div class="db-wrap db-nav-inner">
    <a href="${home}" aria-label="Dhiti Services home"><img class="db-logo" src="${blog}images/logo.webp" alt="Dhiti Services" width="103" height="38"></a>
    <nav aria-label="Main navigation"><a href="${home}#services">What we do</a><a href="${home}#training">How we train</a><a href="${home}#impact">Impact</a><a class="active" href="${blog}" aria-current="page">Blog</a></nav>
    <div class="db-nav-actions"><button class="db-theme" aria-label="Switch to dark theme" title="Change reading theme">◐</button><a class="db-button db-nav-cta" href="${home}#business">Let’s talk ${arrow}</a></div>
  </div></header>`;
}
function footer(home,blog) {
  return `<section class="db-bottom-cta"><div class="db-wrap"><div><span class="db-label">From reading to doing</span><h2>Good work starts with<br>a clear conversation.</h2><p>Tell us which part of your operations needs a steadier pair of hands.</p></div><a class="db-button" href="${home}#business">Talk to Dhiti ${arrow}</a></div></section>
  <footer class="db-footer"><div class="db-wrap"><a href="${home}"><img class="db-logo" src="${blog}images/logo.webp" alt="Dhiti Services" width="103" height="38"></a><p>Operations & talent. Built in the village.</p><nav aria-label="Footer navigation"><a href="${blog}">All articles</a><a href="${home}#careers">Careers</a><a href="mailto:info@dhitiservices.com">Contact</a><a href="${blog}feed.xml">RSS feed</a></nav><small>© ${new Date().getFullYear()} Dhiti Services</small></div></footer>`;
}
function meta(p,home,blog) {
  const url = `${origin}/blog/${p ? `${p.slug}/` : ''}`;
  const title = p ? `${p.title} | Dhiti` : 'Dhiti Blog | People, Process & Better Work';
  const description = p?.description || 'Practical guides to better operations, customer support, quality and careers. Clear thinking for the people doing the work.';
  const image = `${origin}/blog/images/${p?.image || posts[0].image}`;
  const schema = p ? {
    '@context':'https://schema.org','@type':'BlogPosting',headline:p.title,description,
    datePublished:p.date,dateModified:p.date,author:{'@type':'Organization',name:'Dhiti Services',url:origin},
    publisher:{'@type':'Organization',name:'Dhiti Services',logo:{'@type':'ImageObject',url:`${origin}/blog/images/logo.webp`}},
    image:[image],mainEntityOfPage:url,wordCount:p.words,articleSection:p.category,inLanguage:'en'
  } : {'@context':'https://schema.org','@type':'Blog',name:'Dhiti Blog',url,description,
    blogPost:posts.map(x=>({'@type':'BlogPosting',headline:x.title,url:`${origin}/blog/${x.slug}/`}))};
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${esc(title)}</title><meta name="description" content="${esc(description)}">
    <meta name="robots" content="${preview?'noindex, nofollow':'index, follow'}"><link rel="canonical" href="${esc(url)}">
    <meta property="og:type" content="${p?'article':'website'}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(url)}"><meta property="og:image" content="${image}">
    <meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${image}">
    <link rel="icon" href="${home}favicon.ico"><link rel="alternate" type="application/rss+xml" title="Dhiti Blog" href="${blog}feed.xml">
    <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="${home}blog.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g,'\\u003c')}</script>
    <script src="${home}blog.js" defer></script></head><body class="db">${header(home,blog)}`;
}
function card(p,blog,index) {
  return `<article class="db-card" data-category="${esc(p.category)}" data-search="${esc(`${p.title} ${p.description} ${p.category}`.toLowerCase())}">
    <a class="db-card-image" href="${blog}${p.slug}/" tabindex="-1" aria-hidden="true"><img src="${blog}images/${p.image}" alt="" loading="lazy" width="640" height="420"><span class="db-card-number">${String(index+1).padStart(2,'0')}</span></a>
    <div class="db-meta"><span>${esc(p.category)}</span><span>${p.minutes} min read</span></div>
    <h3><a href="${blog}${p.slug}/">${esc(p.title)}</a></h3><p>${esc(p.description)}</p>
    <a class="db-read" href="${blog}${p.slug}/" aria-label="Read ${esc(p.title)}">Read the guide ${arrow}</a></article>`;
}
const f=posts[0];
const landing = `${meta(null,'../','./')}<main id="main">
  <section class="db-intro db-wrap"><div><p class="db-label">The Dhiti blog</p><h1>People. Process.<br><span>Better work.</span></h1></div><p class="db-intro-note">Practical ideas for the everyday work<br class="db-desktop"> that keeps a business moving.<br><span>For teams. For leaders. For people starting out.</span></p></section>
  <section class="db-feature db-wrap" aria-label="Featured article"><a class="db-feature-photo" href="./${f.slug}/" tabindex="-1" aria-hidden="true"><img src="./images/${f.image}" alt="${esc(f.imageAlt)}" width="1000" height="750" fetchpriority="high"><span class="db-photo-label">The operating playbook</span></a>
    <div class="db-feature-copy"><p class="db-label">Editor’s pick / Operations</p><h2><a href="./${f.slug}/">${esc(f.title)}</a></h2><p>${esc(f.description)}</p><div class="db-feature-end"><span>${f.minutes} min read · A practical guide</span><a class="db-round" href="./${f.slug}/" aria-label="Read the featured guide">${arrow}</a></div></div></section>
  <section class="db-library db-wrap" id="articles"><div class="db-section-title"><div><p class="db-label">A little clarity goes a long way</p><h2>Notes for the work ahead.</h2></div><p>${posts.length} in-depth guides</p></div>
    <div class="db-tools"><div class="db-filters" role="group" aria-label="Filter articles by category"><button class="selected" data-filter="All" aria-pressed="true">All articles</button>${categories.map(c=>`<button data-filter="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}</div><label class="db-search"><span class="sr-only">Search articles</span><input type="search" placeholder="Find a useful read" aria-label="Search articles"><span aria-hidden="true">⌕</span></label></div>
    <p class="db-result-count sr-only" aria-live="polite">${posts.length} articles</p><div class="db-grid">${posts.map((p,i)=>card(p,'./',i)).join('')}</div>
    <div class="db-empty" hidden><h3>No articles match that search.</h3><p>Try another phrase or explore all our guides.</p><button class="db-button db-reset">Clear filters</button></div>
  </section><aside class="db-editor-note db-wrap"><span class="db-label">Our editorial approach</span><p>Useful over impressive. Specific over sweeping. These guides offer practical starting points, not promises of results. Examples are illustrative, and external references are linked where used.</p>${preview?'<span class="db-preview-note">Editorial preview. Prepared for review before publication.</span>':''}</aside>
  </main>${footer('../','./')}</body></html>`;
fs.writeFileSync(path.join(out,'blog/index.html'),landing);
for (const p of posts) {
  const related = posts.filter(x=>x.slug!==p.slug).sort((a,b)=>(b.category===p.category)-(a.category===p.category)).slice(0,3);
  const html = `${meta(p,'../../','../')}<div class="db-reading-progress" aria-hidden="true"></div><main id="main">
    <header class="db-article-head db-wrap"><a class="db-back" href="../">← All articles</a><div class="db-meta"><span>${esc(p.category)}</span><span>${p.minutes} min read</span></div><h1>${esc(p.title)}</h1><p class="db-deck">${esc(p.description)}</p><div class="db-byline"><span class="db-author-mark">d.</span><div><strong>Dhiti Editorial</strong><span>${preview?'Prepared':'Published'} <time datetime="${p.date}">${readableDate(p.date)}</time> · ${p.words.toLocaleString('en-IN')} words</span></div><button class="db-share">Copy article link</button><span class="db-share-status sr-only" role="status"></span></div></header>
    <figure class="db-article-cover db-wrap"><img src="../images/${p.image}" alt="${esc(p.imageAlt)}" width="1180" height="650" fetchpriority="high"></figure>
    <div class="db-reading-layout db-wrap"><aside class="db-toc"><p class="db-label">In this guide</p><nav aria-label="Article contents">${p.toc.map(t=>`<a href="#${t.id}">${t.text}</a>`).join('')}</nav><a class="db-back" href="../">Browse all guides ${arrow}</a></aside><article class="db-prose">${p.html}<div class="db-article-end"><span class="db-label">A note on this guide</span><p>Examples and suggested targets are illustrative, not Dhiti client results or contractual commitments. Adapt the approach to your process, risk and team.</p></div></article></div>
    <section class="db-related db-wrap"><div class="db-section-title"><h2>Keep the good work going.</h2><a class="db-read" href="../">All articles ${arrow}</a></div><div class="db-grid">${related.map((x,i)=>card(x,'../',posts.indexOf(x))).join('')}</div></section>
    </main>${footer('../../','../')}</body></html>`;
  fs.mkdirSync(path.join(out,'blog',p.slug),{recursive:true});
  fs.writeFileSync(path.join(out,'blog',p.slug,'index.html'),html);
}
fs.writeFileSync(path.join(out,'blog/feed.xml'),`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Dhiti Blog</title><link>${origin}/blog/</link><description>People, process and better work.</description><language>en</language>${posts.map(p=>`<item><title>${esc(p.title)}</title><link>${origin}/blog/${p.slug}/</link><guid isPermaLink="true">${origin}/blog/${p.slug}/</guid><description>${esc(p.description)}</description><category>${esc(p.category)}</category><pubDate>${new Date(`${p.date}T06:30:00Z`).toUTCString()}</pubDate></item>`).join('')}</channel></rss>`);
fs.writeFileSync(path.join(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/','/blog/',...posts.map(p=>`/blog/${p.slug}/`)].map(u=>`<url><loc>${origin}${u}</loc></url>`).join('')}</urlset>`);
fs.writeFileSync(path.join(out,'robots.txt'),preview?'User-agent: *\nDisallow: /\n':`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
fs.writeFileSync(path.join(out,'404.html'),`${meta(null,'./','./blog/')}<main id="main" class="db-wrap db-not-found"><p class="db-label">Page not found</p><h1>Let’s get you back<br>to something useful.</h1><p>This page may have moved, or the address may be incomplete.</p><a class="db-button" href="/blog/">Explore the blog ${arrow}</a></main></body></html>`.replace(/href="\.\/(?!blog)/g,'href="/').replace(/src="\.\/(?!blog)/g,'src="/').replaceAll('./blog/','/blog/'));
console.log(`Built blog index, ${posts.length} article pages, sitemap, RSS and 404. Mode: ${preview?'PREVIEW (noindex)':'PUBLICATION'}`);
