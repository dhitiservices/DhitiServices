import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { root, loadPosts } from './blog-data.mjs';
const dist=path.join(root,'dist');
const posts=loadPosts();
const pages=['blog/index.html',...posts.map(p=>`blog/${p.slug}/index.html`)];
let checked=0;
for(const filename of pages) {
  const file=path.join(dist,filename);
  const html=fs.readFileSync(file,'utf8');
  assert.equal((html.match(/<h1[ >]/g)||[]).length,1,`${filename}: one H1`);
  assert.match(html,/<link rel="canonical" href="https:\/\/dhitiservices.com\/blog\//);
  assert.match(html,/<meta name="description" content="[^"]+"/);
  assert.match(html,/<meta property="og:image"/);
  JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const link=match[1].replaceAll('&amp;','&');
    if(/^(https?:|mailto:|data:)/.test(link))continue;
    if(link.startsWith('#')){
      assert(html.includes(`id="${link.slice(1)}"`),`${filename}: missing anchor ${link}`);
      continue;
    }
    const clean=link.split('#')[0].split('?')[0];
    let target=clean.startsWith('/')?path.join(dist,clean):path.resolve(path.dirname(file),clean);
    assert(fs.existsSync(target),`${filename}: broken link ${link}`);
    if(fs.statSync(target).isDirectory())target=path.join(target,'index.html');
    assert(fs.existsSync(target),`${filename}: missing directory index ${link}`);
    checked++;
  }
  if(filename!=='blog/index.html'){
    assert.equal((html.match(/class="db-card"/g)||[]).length,3,'three related articles');
    assert.equal((html.match(/<h2 id=/g)||[]).length,8,'eight content sections');
  }
}
const sitemap=fs.readFileSync(path.join(dist,'sitemap.xml'),'utf8');
assert.equal((sitemap.match(/<url>/g)||[]).length,12);
const rss=fs.readFileSync(path.join(dist,'blog/feed.xml'),'utf8');
assert.equal((rss.match(/<item>/g)||[]).length,10);
assert(fs.existsSync(path.join(dist,'404.html')));
console.log(`PASS: ${pages.length} blog pages, ${checked} local resources and links, 10 RSS entries, 12 sitemap URLs.`);
