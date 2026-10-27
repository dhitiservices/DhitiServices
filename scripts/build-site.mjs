import fs from 'node:fs';
import path from 'node:path';
import {root, esc, loadPosts} from './blog-data.mjs';
import {services, stages, businessFaqs} from './site-content.mjs';

const out = path.join(root, 'dist');
const preview = globalThis.process.env.BLOG_PUBLISH === '0';
const origin = (globalThis.process.env.SITE_URL || 'https://www.dhitiservices.com').replace(/\/$/, '');
const posts = loadPosts();
const arrow = '<span aria-hidden="true">↗</span>';
const pagePaths = ['', 'services', ...services.map(s=>`services/${s.slug}`), 'travel-operations', 'how-we-work', 'about', 'careers', 'contact'];
fs.cpSync(path.join(root, 'src/assets/photos'), path.join(out, 'media/photos'), {recursive:true});
fs.cpSync(path.join(root, 'src/assets/logos'), path.join(out, 'media/logos'), {recursive:true});
// Preserve the existing production analytics configuration; never load tracking in a preview.
const sourceHead = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tracking = [...sourceHead.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)]
  .map(m=>m[0]).filter(s=>!s.includes('/src/')&&!s.includes('src="/consent.js"')).join('\n');
const prefix = route => route ? '../'.repeat(route.split('/').length) : './';
const url = (base, route='') => `${base}${route?route+'/':''}index.html`;
// Real source dimensions reserve the right space before images decode.
const photoDimensions = {
  'band-team.webp':[1600,620], 'door-business.webp':[1140,641],
  'door-careers.webp':[1000,563], 'problem.webp':[720,900],
  'story.webp':[900,1125], 'why-choose.webp':[1040,780],
  ...Object.fromEntries(['dignity','income','norelocation','skills'].map(n=>[`impact-${n}.webp`,[800,500]])),
  ...Object.fromEntries(['komal','prajakta','vidya'].map(n=>[`leader-${n}.webp`,[560,560]])),
  ...Object.fromEntries(['data','group','quality','support'].map(n=>[`service-${n}.webp`,[940,588]])),
  ...Object.fromEntries(['deliver','mentor','recruit','train'].map(n=>[`train-${n}.webp`,[800,500]]))
};
// Reads width and height from a WebP header, so newly added blog photos need no manual table entry.
const webpSize = name => {
  const file = path.join(root, 'src/assets/photos', name);
  if (!name.endsWith('.webp') || !fs.existsSync(file)) return null;
  const b = fs.readFileSync(file);
  const chunk = b.toString('ascii', 12, 16);
  if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (chunk === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  return null;
};
const image = (base, name, alt, eager=false, cls='') => {
  const dimensions = photoDimensions[name] || webpSize(name);
  if (!dimensions) throw new Error(`Missing image dimensions: ${name}`);
  return `<img class="${cls}" src="${base}media/photos/${name}" alt="${esc(alt)}" width="${dimensions[0]}" height="${dimensions[1]}" ${eager?'fetchpriority="high"':'loading="lazy"'} decoding="async">`;
};
const label = text => `<span class="ds-label">${text}</span>`;
const button = (base, text='Discuss your process', route='contact') => `<a class="ds-btn" href="${url(base,route)}">${text} ${arrow}</a>`;
const textLink = (base, text, route) => `<a class="ds-link" href="${url(base,route)}">${text} ${arrow}</a>`;

function header(base, active='', blog=false) {
  const links = [['Services','services'],['Travel operations','travel-operations'],['How we work','how-we-work'],['About','about'],['Resources','blog']];
  const dropdowns = {
    services: services.map(s=>[s.full,'services/'+s.slug]),
    about: [['Our story','about'],['Our impact','about','impact'],['Leadership','about','leadership'],['Careers & training','careers']],
    blog: [['Blog','blog'],['Operations playbooks','blog/operations-pilot-first-30-days'],['Customer support guides','blog/customer-support-playbook'],['Data quality guides','blog/data-entry-quality-checks']]
  };
  const descriptions={
    services:services.map(s=>s.summary),
    about:['Why we bring skilled work closer to home.','The difference a career makes in a community.','Meet the people behind the work.','Find your path into training and working life.'],
    blog:['Ideas and practical advice for better everyday work.','Plan and evaluate your first operations pilot.','Build a playbook that leaves room to listen.','Put reliable checks around your everyday data.']
  };
  const navItems = links.map(([name,route])=>{
    const link=`<a class="ds-navlink" href="${url(base,route)}"${active===route?' aria-current="page"':''}>${name}</a>`;
    if(!dropdowns[route])return link;
    return `<div class="ds-navgroup"><div class="ds-navrow">${link}<button class="ds-submenu-toggle" aria-label="Toggle ${name} submenu" aria-expanded="false" aria-controls="nav-${route}"><span class="ds-chevron" aria-hidden="true"></span></button></div><div class="ds-submenu ds-mega-panel" id="nav-${route}" hidden><div class="ds-mega-inner"><span class="ds-submenu-label">Explore ${name.toLowerCase()}</span><div class="ds-mega-links">${dropdowns[route].map(([t,r,hash],i)=>`<a href="${url(base,r)}${hash?'#'+hash:''}"><strong>${t}</strong><span class="ds-mega-description">${descriptions[route][i]}</span><span class="ds-mega-arrow" aria-hidden="true">↗</span></a>`).join('')}</div></div></div></div>`;
  }).join('');
  return `<a class="ds-skip" href="#main">Skip to content</a><header class="ds-header"><div class="ds-wrap ds-nav">
    <a class="ds-brand" href="${url(base)}" aria-label="Dhiti Services home"><img src="${base}media/logos/dhiti-logo.webp" alt="Dhiti Services" width="108" height="44"></a>
    <nav class="ds-navlinks" id="main-navigation" aria-label="Main navigation">${navItems}</nav>
    <div class="ds-nav-actions">${blog?'<button class="db-theme" aria-label="Switch to dark theme" title="Change reading theme">◐</button>':''}${button(base,"Let’s talk")}<button class="ds-menu" aria-label="Open navigation" aria-controls="main-navigation" aria-expanded="false">☰</button></div>
  </div></header><div class="ds-nav-shade" hidden aria-hidden="true"></div>`;
}
function footer(base) {
  return `<footer class="ds-footer"><div class="ds-wrap"><div class="ds-footergrid">
    <div><a class="ds-brand" href="${url(base)}"><img src="${base}media/logos/dhiti-logo.webp" alt="Dhiti Services" width="108" height="44"></a><p>Dependable operations.<br>Meaningful careers.<br>Built in the village.</p></div>
    <div><strong>Our services</strong>${services.map(s=>`<a href="${url(base,'services/'+s.slug)}">${s.name}</a>`).join('')}</div>
    <div><strong>Explore Dhiti</strong>${[['Travel operations','travel-operations'],['How we work','how-we-work'],['About & impact','about'],['Careers & training','careers'],['The Dhiti blog','blog']].map(([t,r])=>`<a href="${url(base,r)}">${t}</a>`).join('')}</div>
    <div><strong>Start a conversation</strong><a href="mailto:info@dhitiservices.com">info@dhitiservices.com</a><p>Dawadi, Pune District,<br>Maharashtra, India</p><a href="${url(base,'contact')}">Bring your work to Dhiti ${arrow}</a></div>
    </div><div class="ds-footerbottom"><span>© ${new Date().getFullYear()} Dhiti Services</span><div><a href="${url(base,'privacy')}">Privacy notice</a><a href="${url(base,'privacy')}#analytics-choices">Analytics settings</a><a href="${base}blog/feed.xml">RSS feed</a></div></div></div></footer>`;
}
function cta(base, title='Let’s make your everyday work run better.', subtitle='Start with a conversation. Prove the fit with a pilot.') {
  return `<section class="ds ds-cta"><div class="ds-wrap"><div>${label('A practical next step')}<h2>${title}</h2><p>${subtitle}</p></div>${button(base)}</div></section>`;
}
function head(route, title, description, active, blog=false) {
  const base=prefix(route), canonical=`${origin}/${route?route+'/':''}`;
  const structured = {'@context':'https://schema.org','@type':'WebPage',name:title,description,url:canonical,isPartOf:{'@type':'WebSite',name:'Dhiti Services',url:origin}};
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | Dhiti Services</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${preview?'noindex, nofollow':'index, follow'}"><link rel="canonical" href="${canonical}"><meta property="og:type" content="website"><meta property="og:title" content="${esc(title)} | Dhiti Services"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${canonical}"><meta property="og:image" content="${origin}/og-image.jpg"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${origin}/og-image.jpg"><link rel="icon" href="${base}favicon.ico"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${base}site.css"><script src="${base}site.js" defer></script>${preview?'':`${tracking}<script src="${base}consent.js" defer></script>`}<script type="application/ld+json">${JSON.stringify(structured).replace(/</g,'\\u003c')}</script></head><body class="ds" data-preview="${preview}" data-home="${!route}">${header(base,active,blog)}`;
}
function save(route,title,description,content,active='',end=true) {
  const base=prefix(route);
  const target=path.join(out,route);
  fs.mkdirSync(target,{recursive:true});
  fs.writeFileSync(path.join(target,'index.html'),`${head(route,title,description,active)}<main id="main">${route?`<nav class="ds-wrap ds-breadcrumb" aria-label="Breadcrumb"><a href="${url(base)}">Home</a><span aria-hidden="true">/</span>${route.startsWith('services/')?`<a href="${url(base,'services')}">Services</a><span aria-hidden="true">/</span>`:''}<span aria-current="page">${esc(title)}</span></nav>`:''}${content}</main>${end?cta(base):''}${footer(base)}</body></html>`);
}
function hero(base, eyebrow, title, intro, photo, alt, ctaText='Discuss your process', target='contact') {
  return `<section class="ds-innerhero ds-wrap"><div>${label(eyebrow)}<h1>${title}</h1><p class="ds-lede">${intro}</p><div class="ds-actions">${button(base,ctaText,target)}</div></div>${image(base,photo,alt,true)}</section>`;
}
function steps() {return `<div class="ds-steps">${stages.map(([t,p],i)=>`<div class="ds-step"><span>${String(i+1).padStart(2,'0')}</span><div><h3>${t}</h3><p>${p}</p></div></div>`).join('')}</div>`;}
function process(base) {return `<section class="ds-section ds-wrap ds-process"><div class="ds-processintro">${label('From handover to ownership')}<h2>Start small.<br>Get it right.<br>Then grow.</h2><p>A dependable engagement starts with a clear process, not a promise of instant scale.</p>${textLink(base,'See how we work','how-we-work')}</div>${steps()}</section>`;}
function faq(base, list=businessFaqs) {
  return `<section class="ds-section ds-wrap ds-faq"><div>${label('Questions, answered')}<h2>Clarity before<br>commitment.</h2></div><div>${list.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div></section>`;
}
function serviceCards(base,photos=true) {
  return `<div class="ds-servicegrid">${services.map((s,i)=>`<a class="ds-servicecard" href="${url(base,'services/'+s.slug)}">${photos?image(base,s.image,s.full):''}<span class="ds-cardnumber">0${i+1} / SERVICE</span><h3>${s.full}</h3><p>${s.summary}</p><span class="ds-link">Explore the service ${arrow}</span></a>`).join('')}</div>`;
}
function reading(base,selected=posts.slice(0,3)) {
  return `<section class="ds-section ds-wrap"><div class="ds-sectionhead"><div>${label('The Dhiti journal')}<h2>Useful thinking.<br>Better everyday work.</h2></div>${textLink(base,'Explore all guides','blog')}</div><div class="ds-reading">${selected.map(p=>`<article class="ds-article"><a href="${url(base,'blog/'+p.slug)}">${image(base,p.image,p.imageAlt)}${label(esc(p.category)+' · '+p.minutes+' MIN READ')}<h3>${esc(p.title)}</h3><span class="ds-link">Read the guide ${arrow}</span></a></article>`).join('')}</div></section>`;
}
function form(base,career=false) {
  return `<form class="ds-form" data-inquiry-form="${career?'career':'business'}"><div class="ds-formbody"><h2>${career?'Your next step starts here.':'Tell us about the work.'}</h2><div class="ds-fields">
  <label class="ds-field">Your name <input name="name" autocomplete="name" required maxlength="120"></label><label class="ds-field">Email address <input type="email" name="email" autocomplete="email" required maxlength="200"></label>
  <label class="ds-field">${career?'Village / location':'Company'} <input name="org" autocomplete="${career?'address-level2':'organization'}" required maxlength="200"></label><label class="ds-field"><span>Phone <span class="ds-muted">(optional)</span></span><input type="tel" name="phone" autocomplete="tel" maxlength="40"></label>
  ${career?'':`<label class="ds-field full">What do you need help with?<select name="service" required><option value="">Choose a service</option>${services.map(s=>`<option value="${s.slug}">${s.full}</option>`).join('')}<option value="travel-operations">Travel operations</option><option value="not-sure">Help me scope the right fit</option></select></label>`}
  <label class="ds-field full">${career?'Tell us about yourself':'Tell us about your process'}<textarea name="message" required minlength="15" maxlength="5000" placeholder="${career?'Your location, education and what you would like to learn.':'What work needs doing? Include approximate volume, current challenges and timing.'}"></textarea></label>
  </div><div class="ds-honeypot" aria-hidden="true"><label>Leave this empty<input name="botcheck" tabindex="-1" autocomplete="off"></label></div>
  <p class="ds-fine">We’ll use these details to respond to your enquiry. Please do not include passwords, customer records or other sensitive information. Read our <a href="${url(base,'privacy')}">privacy notice</a>.</p>
  ${preview?'<p class="ds-fine">Review preview: form delivery is disabled here. Nothing you enter will be sent.</p>':''}
  <button class="ds-btn" type="submit">${career?'Send training enquiry':'Send enquiry'} ${arrow}</button></div>
  <div class="ds-formsuccess" hidden><h3 tabindex="-1">Thank you. Your enquiry is with us.</h3><p>Dhiti will review the details you shared and follow up using your contact information.</p><button type="button" class="ds-btn secondary" data-form-reset>Send another enquiry</button></div><p class="ds-formstatus" role="status" aria-live="polite"></p></form>`;
}

// Home: a concise business entry point, with deeper pages for each audience.
{
  const b='./';
  save('', 'Reliable Operations. Meaningful Careers.', 'Dhiti builds trained teams for data, back-office work, customer support and quality review. Dependable operations and meaningful careers, built in the village.',
  `<section class="ds-homehero ds-wrap"><div>${label('Operations & talent. Built in the village.')}<h1>Good people.<br>Better <span>operations.</span></h1><p class="ds-lede">Dependable teams for the work that keeps your business moving. Data, support and back-office processes, delivered with discipline and care.</p><div class="ds-actions">${button(b)}${textLink(b,'Explore our services','services')}</div><div class="ds-hero-foot"><span class="ds-dot"></span>Process-trained teams. A named owner. A pilot first.</div></div><figure class="ds-heroimage">${image(b,'story.webp','Dhiti’s existing workplace imagery showing people at work',true)}<figcaption class="ds-image-note"><strong>Built around the work. Rooted in community.</strong><span>Skilled careers, closer to home.</span></figcaption></figure></section>
  <section class="ds-logos"><div class="ds-wrap ds-logos-inner"><p>Brands that<br>trust Dhiti</p><div class="ds-logorow">${[['vervotech','Vervotech'],['zentrumhub','ZentrumHub'],['zealconnect','Zeal Connect'],['techspian','Techspian'],['xeni','Xeni'],['ahotel','@hotel']].map(([f,n])=>`<img src="${b}media/logos/${f}.webp" alt="${n}" width="110" height="36" loading="lazy">`).join('')}</div></div></section>
  <section class="ds-section ds-wrap"><div class="ds-sectionhead"><div>${label('What we do')}<h2>Your essential work.<br>Our everyday focus.</h2></div><p>Four focused service lines. Teams trained on the process they own, with quality built into the way work gets done.</p></div>${serviceCards(b)}</section>
  <section class="ds-wrap ds-travel">${image(b,'service-group.webp','Colleagues collaborating on operational work')}<div class="ds-travelcopy">${label('For travel businesses')}<h2>Behind every good journey is work done well.</h2><p>From catalogue data to customer queries, travel operations depend on thousands of small details. Give those details a team that takes them seriously.</p>${textLink(b,'Explore travel operations','travel-operations')}</div></section>
  ${process(b)}
  <section class="ds-soft"><div class="ds-section ds-wrap ds-story">${image(b,'impact-norelocation.webp','Existing Dhiti imagery of work close to home')}<div>${label('A different way to build a team')}<h2>Opportunity should not depend on a postcode.</h2><p>Talent exists far beyond the city. We bring work to the village, train people properly and create a path into skilled employment without asking them to leave home.</p><p>For businesses, that means a team with a reason to stay and a process worth taking ownership of.</p>${textLink(b,'Meet the idea behind Dhiti','about')}</div></div></section>
  ${reading(b)}${faq(b)}`);
}

// Services hub and substantial, independently addressable detail pages.
{
  const b='../';
  save('services','Our Services','Explore Dhiti’s data and back-office operations, customer support, quality review and dedicated operational teams. Start with a clearly scoped pilot.',
    `<section class="ds-wrap ds-intro">${label('Our services')}<h1>Operational work.<br>Owned end to end.</h1><p>Choose the process you need help with. We’ll work through the inputs, quality requirements and handover before recommending a team or a timeline.</p></section><section class="ds-section ds-wrap" style="padding-top:var(--space-6)">${serviceCards(b)}</section>${process(b)}${faq(b)}`,'services');
  for(const s of services) {
    const base='../../';
    const related=posts.filter(p=>p.slug===s.guide);
    save('services/'+s.slug,s.full,s.intro,
      hero(base,s.eyebrow,s.headline,s.intro,s.image,s.full)+
      `<section class="ds-wrap ds-fit">${label('A good fit when')}<p>${s.fit}</p></section>
      <section class="ds-section ds-wrap"><div class="ds-sectionhead"><div>${label('Scope of work')}<h2>Practical support.<br>Clearly defined.</h2></div></div><div class="ds-worklist">${s.work.map(([t,p])=>`<div class="ds-workitem"><h3>${t}</h3><p>${p}</p></div>`).join('')}</div></section>
      <section class="ds-soft"><div class="ds-section ds-wrap ds-handover"><div>${label('The handover')}<h2>What we start with.</h2><ul class="ds-list">${s.inputs.map(x=>`<li>${x}</li>`).join('')}</ul></div><div>${label('The working relationship')}<h2>What you can expect.</h2><ul class="ds-list">${s.outputs.map(x=>`<li>${x}</li>`).join('')}</ul></div></div></section><div class="ds-wrap"><p class="ds-note">${s.note}</p></div>
      <section class="ds-section ds-wrap ds-process"><div class="ds-processintro">${label('Start with evidence')}<h2>Try the process.<br>Then build the team.</h2><p>Use a pilot to test the work, the communication and the quality of the handover before scaling.</p><a class="ds-btn" href="${url(base,'contact')}?service=${s.slug}">Discuss this service ${arrow}</a></div>${steps()}</section>
      ${reading(base,[...related,...posts.filter(p=>p.slug!==s.guide).slice(0,2)])}`,'services');
  }
}
{
 const b='../';
 save('travel-operations','Travel Operations','Discuss travel data, catalogue maintenance, customer queries and back-office workflows with Dhiti. Process-specific teams and a pilot-first approach.',
 hero(b,'For travel businesses','Keep the details moving.<br>Keep your team focused.','Travel is personal. The operations behind it need to be precise. We help scope dependable support for the repeatable work behind your customers’ experience.','service-group.webp','Dhiti operations imagery','Discuss your travel workflow')+
 `<section class="ds-wrap ds-fit">${label('Built around your process')}<p>For travel businesses that need support with recurring data, customer and administrative workflows. We assess your systems, permissions and specialist requirements before committing to delivery.</p></section>
 <section class="ds-section ds-wrap"><div class="ds-sectionhead"><div>${label('Workflows to discuss')}<h2>The detail behind<br>the destination.</h2></div><p>These are starting points for scoping, not a promise that every platform or specialist task is already supported.</p></div><div class="ds-worklist">${[
 ['Catalogue & content upkeep','Maintain and review property, product or supplier information against your approved sources and rules.','data-back-office'],
 ['Data checking & reconciliation','Compare records, flag inconsistencies and prepare exception lists for your operations team.','quality-audit'],
 ['Customer & partner queries','Handle agreed queries and follow-ups using approved answers, with a clear escalation route.','customer-support'],
 ['Recurring back-office workflows','Support structured queues, documentation and coordination around a defined operating process.','dedicated-operations']
 ].map(([t,p,s])=>`<div class="ds-workitem"><h3>${t}</h3><p>${p}</p>${textLink(b,'Related service','services/'+s)}</div>`).join('')}</div></section>
 <section class="ds-soft"><div class="ds-section ds-wrap ds-story">${image(b,'train-mentor.webp','Mentoring and process training')}<div>${label('Set the boundaries first')}<h2>Your systems.<br>Your rules.<br>A clear handover.</h2><p>Before a pilot, we clarify what the team may update, what needs approval and what must be escalated. Booking changes, payments, refunds and ticketing are never assumed to be authorised.</p><p>Coverage hours, language needs, access controls and any specialist travel-system skills are agreed during scoping.</p>${textLink(b,'Understand our approach','how-we-work')}</div></div></section>${process(b)}${faq(b)}`,'travel-operations');
}
{
 const b='../';
 save('how-we-work','How We Work','See how Dhiti scopes a process, trains a team, validates delivery through a pilot and scales with clear quality checks and accountable ownership.',
 hero(b,'A considered start. A steadier operation.','Good delivery begins<br>before the first task.','We do not put an unprepared team onto live work. Training, clear instructions and a practical pilot come first.','train-mentor.webp','A mentor supporting workplace learning')+
 `<section class="ds-section ds-wrap ds-process"><div class="ds-processintro">${label('Your engagement')}<h2>Four stages.<br>One accountable relationship.</h2><p>We agree the scope together. The process becomes the shared reference point for the team doing the work and the people reviewing it.</p></div>${steps()}</section>
 <section class="ds-soft"><div class="ds-section ds-wrap"><div class="ds-sectionhead"><div>${label('How we prepare people')}<h2>Nobody starts<br>on live work.</h2></div><p>Every team member moves through a deliberate path, from local recruitment to guided practice.</p></div><div class="ds-worklist">${[
 ['Recruit','We look for willingness to learn, not just a polished résumé. Local talent gets a route into professional work.'],
 ['Train','Communication, computer literacy and process-specific skills come before responsibility for live output.'],
 ['Mentor','New team members shadow experienced colleagues and work through examples with direct feedback.'],
 ['Deliver','Once ready, the team takes on defined work with quality checks and a named owner.']
 ].map(([t,p])=>`<div class="ds-workitem"><h3>${t}</h3><p>${p}</p></div>`).join('')}</div></div></section>
 <section class="ds-section ds-wrap ds-handover"><div>${label('Before a pilot')}<h2>Agree what good looks like.</h2><ul class="ds-list"><li>Scope, sample volume and turnaround expectations</li><li>Quality rules and acceptance criteria</li><li>Access permissions and data handling</li><li>Escalation contacts and approval boundaries</li></ul></div><div>${label('Before expanding')}<h2>Review the real work.</h2><ul class="ds-list"><li>Check the output against your criteria</li><li>Resolve gaps in the working instructions</li><li>Review exceptions and handover quality</li><li>Agree capacity and ongoing review cadence</li></ul></div></section>${faq(b)}`,'how-we-work');
}
{
 const b='../';
 save('about','About & Impact','Dhiti brings operational work and skilled careers to villages. Meet the idea, the people and the training-led approach behind our business.',
 hero(b,'The idea behind Dhiti','Talent is everywhere.<br>Opportunity should be, too.','We bring the work to the people. We train properly. And we build careers that do not begin with leaving home.','problem.webp','Dhiti’s existing village imagery','Explore our services','services')+
 `<section class="ds-section ds-wrap ds-story">${image(b,'story.webp','Dhiti’s existing workplace imagery')}<div>${label('Our story')}<h2>Work that keeps<br>giving back.</h2><p>Dhiti began with a question: what does welfare look like years from now, not just on the day it is handed over?</p><p>Our answer is skilled work. Instead of asking people to move to a city, we build operational teams close to where they already live. Businesses get dependable execution. People get a path into a career.</p><p>The name Dhiti means steadfastness and resolve. That is the standard we want to bring to every process we take on.</p></div></section>
 <section class="ds-quote"><div class="ds-wrap"><h2>No one should have to leave home to do work that matters.</h2><p>The work comes to the village. The wages stay local. The skills grow at home.</p></div></section>
 <section class="ds-section ds-wrap" id="impact"><div class="ds-sectionhead"><div>${label('Beyond the work')}<h2>A career changes<br>more than a working day.</h2></div></div><div class="ds-values">${[
 ['impact-income.webp','Income that stays local','Wages earned nearby support the same shops, schools and households that make up the community.'],
 ['impact-skills.webp','Skills that stay with people','Computer fluency, process discipline and communication build a foundation people can carry throughout their careers.'],
 ['impact-norelocation.webp','Work without relocation','A professional path should not require choosing between opportunity and staying close to family.'],
 ['impact-dignity.webp','Dignity through skilled work','Responsibility, earned income and progression build confidence and a sense of ownership.']
 ].map(([im,t,p])=>`<div class="ds-value">${image(b,im,t)}<h3>${t}</h3><p>${p}</p></div>`).join('')}</div></section>
 <section class="ds-soft" id="leadership"><div class="ds-section ds-wrap">${label('Leadership')}<h2>The people behind the work.</h2><div class="ds-leaders">${[['leader-komal.webp','Komal Ghare','Co-Founder &amp; President'],['leader-vidya.webp','Vidya Kolekar','Director'],['leader-prajakta.webp','Prajakta Hundare','Leader, Travel Operations']].map(([im,n,r])=>`<article class="ds-leader">${image(b,im,n)}<h3>${n}</h3><p>${r}</p></article>`).join('')}</div></div></section>
 <section class="ds-section ds-wrap ds-process"><div>${label('Two ways to be part of it')}<h2>Good work.<br>Good careers.</h2></div><div class="ds-steps"><div class="ds-step"><span>01</span><div><h3>Bring your process to Dhiti.</h3><p>Explore a trained team for your operational work.</p>${textLink(b,'Talk about your requirements','contact')}</div></div><div class="ds-step"><span>02</span><div><h3>Build a career closer to home.</h3><p>Explore the training path and tell us about yourself.</p>${textLink(b,'Explore careers & training','careers')}</div></div></div></section>`,'about');
}
{
 const b='../';
 save('careers','Careers & Training','Explore a career with Dhiti. Learn communication, computer and process skills through structured training and mentoring, with work closer to home.',
 hero(b,'For people starting out','Your first opportunity.<br>Not your last step.','You do not need a polished résumé to begin. If you can read and write comfortably and are willing to learn, tell us about yourself.','door-careers.webp','Dhiti’s existing career and training imagery','Ask about training','careers') .replace(`href="${url(b,'careers')}"`,'href="#apply"')+
 `<section class="ds-wrap ds-fit">${label('Know the path')}<p>Training comes first. You are paid once you move onto live work. We will explain the process and any available opportunities when we speak; an enquiry is not a job offer.</p></section>
 <section class="ds-section ds-wrap ds-handover"><div>${label('Your starting point')}<h2>Willingness to learn matters.</h2><ul class="ds-list"><li>Open to different education levels, with assessment for the right role</li><li>Comfortable reading, writing and learning new skills</li><li>Based nearby, or able to commute comfortably</li><li>Ready to practise, take feedback and work with a team</li></ul></div><div>${label('What you build')}<h2>Skills for working life.</h2><ul class="ds-list"><li>Computer literacy and everyday workplace tools</li><li>Clear communication and customer awareness</li><li>Process discipline and attention to detail</li><li>A path from trainee to team member and, over time, leadership</li></ul></div></section>
 <section class="ds-wrap ds-contact" id="apply"><div class="ds-contactcopy">${label('Make a start')}<h2>Tell us a little<br>about yourself.</h2><p>Share where you live, your education and what you would like to learn. Our team can explain the training path and discuss fit.</p><p>Dawadi, Pune District,<br>Maharashtra, India</p><a class="ds-link" href="mailto:info@dhitiservices.com">info@dhitiservices.com ${arrow}</a></div>${form(b,true)}</section>
 ${faq(b,[
 ['Do I need prior office experience?','No prior office experience is required to enquire. We look for willingness to learn and assess which role or training path may be suitable.'],
 ['Is the training paid?','You are paid once you move onto live work. Training comes first. The team will explain the terms and progression clearly before you begin.'],
 ['Does applying guarantee a job?','No. Your enquiry starts a conversation about suitability, training and available opportunities. A placement is not guaranteed.'],
 ['Where would I work?','Dhiti is based in Dawadi, Pune District, Maharashtra. Tell us where you live so we can discuss whether a comfortable commute is practical.']
 ])}`,'',false);
}
{
 const b='../';
 save('contact','Contact Dhiti','Tell Dhiti about your data, back-office, support or quality-review requirements. Discuss process fit, training and a pilot with our team.',
 `<section class="ds-wrap ds-intro">${label('Let’s talk')}<h1>Tell us what needs<br>a steadier pair of hands.</h1><p>Share the work, the volume and what is getting in the way. We’ll start with fit, not a sales pitch.</p></section>
 <section class="ds-wrap ds-contact"><div class="ds-contactcopy"><h2>A clear conversation.<br>A practical next step.</h2><p>We review your process, clarify the requirements and discuss whether a pilot makes sense. Timelines and commercials follow the scope.</p><a class="ds-link" href="mailto:info@dhitiservices.com">info@dhitiservices.com ${arrow}</a><p>Dawadi, Pune District,<br>Maharashtra, India</p><div class="ds-contactnote"><h3>Looking for a career?</h3><p>Use the training enquiry page so we can understand your background and location.</p>${textLink(b,'Careers & training','careers')}</div></div>${form(b)}</section>`,'',false);
}

// Reuse the complete existing articles and blog features, but give them the shared site shell.
for (const route of ['blog', ...posts.map(p=>'blog/'+p.slug)]) {
  const file=path.join(out,route,'index.html'), b=prefix(route);
  let html=fs.readFileSync(file,'utf8');
  html=html.replace(/<a class="db-skip"[\s\S]*?<\/header>/,header(b,'blog',true))
    .replace(/<section class="db-bottom-cta">[\s\S]*?<\/footer>/,cta(b)+footer(b));
  html=html.replace('</head>',`<link rel="stylesheet" href="${b}site.css"><script src="${b}site.js" defer></script></head>`);
  html=html.replace(/<body class="db">/,`<body class="db" data-preview="${preview}">`);
  // All internal links resolve as actual files, including in hosted previews.
  html=html.replace(/href="((?:\.\.\/|\.\/)[^"#?]*\/|\.\/|\.\.\/)"/g, (_,h)=>`href="${h}index.html"`);
  if(preview) {
    html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,s=>/googletagmanager|consent\.js|localStorage/.test(s)?'':s);
    html=html.replace(/<noscript>[\s\S]*?<\/noscript>/g,'');
    html=html.replace(/<span class="db-preview-note">[\s\S]*?<\/span>/g,'');
  }
  fs.writeFileSync(file,html);
}

// Retain the live privacy wording and controls, with a consistent shell.
{
 const b='../', raw=fs.readFileSync(path.join(root,'public/privacy/index.html'),'utf8');
 let content=raw.match(/<main class="wrap">([\s\S]*?)<\/main>/)[1];
 if(preview) content=content.replace(/<div class="notice" id="analytics-choices">[\s\S]*?<\/div>/,
   '<div class="notice" id="analytics-choices"><p>This preview does not load analytics. Your live website’s analytics preferences are unchanged.</p></div>');
 fs.writeFileSync(path.join(out,'privacy/index.html'),
 `${head('privacy','Privacy Notice','How Dhiti Services handles website, enquiry and analytics information.','').replace('content="index, follow"','content="noindex, follow"')}<main id="main" class="ds-wrap ds-privacy">${content}</main>${footer(b)}</body></html>`);
}
const notFound = `${head('','Page not found','Find your way back to Dhiti Services.','').replace('data-home="true"','data-home="false"')}<main id="main" class="ds-wrap ds-404">${label('Page not found')}<h1>Let’s find the<br>right way forward.</h1><p>This page may have moved, or the address may be incomplete.</p><div class="ds-actions">${button('./','Back to home','')}${textLink('./','Explore our services','services')}</div></main>${footer('./')}</body></html>`;
fs.writeFileSync(path.join(out,'404.html'),notFound.replaceAll('href="./','href="/').replaceAll('src="./','src="/'));
const allRoutes=[...pagePaths,'blog',...posts.map(p=>'blog/'+p.slug)];
fs.writeFileSync(path.join(out,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${allRoutes.map(r=>`<url><loc>${origin}/${r?r+'/':''}</loc></url>`).join('')}</urlset>`);
// Version the navigation assets so returning visitors receive the paired markup, CSS and JS.
for(const r of [...allRoutes,'privacy']) {
  const f=path.join(out,r,'index.html');
  fs.writeFileSync(f,fs.readFileSync(f,'utf8').replaceAll('site.css"','site.css?v=mobile2"').replaceAll('site.js"','site.js?v=nav2"'));
}
const notFoundFile=path.join(out,'404.html');
fs.writeFileSync(notFoundFile,fs.readFileSync(notFoundFile,'utf8').replaceAll('site.css"','site.css?v=mobile2"').replaceAll('site.js"','site.js?v=nav2"'));
if(preview) fs.writeFileSync(path.join(out,'consent.js'),'/* Analytics intentionally disabled in the private review preview. */');
// The static pages do not need the former React homepage bundle.
fs.rmSync(path.join(out,'assets'),{recursive:true,force:true});
console.log(`Built ${pagePaths.length} marketing pages + ${posts.length+1} blog pages + privacy and 404. Analytics and form delivery: ${preview?'disabled in preview':'existing production configuration preserved'}.`);
