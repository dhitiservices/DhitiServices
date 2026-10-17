import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('dist');
function files(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?files(path.join(dir,f.name)):[path.join(dir,f.name)]);}
const pages=files(root).filter(f=>f.endsWith('.html'));
let links=0,images=0;
for(const file of pages){
 const h=fs.readFileSync(file,'utf8'), name=path.relative(root,file);
 assert.equal((h.match(/<h1[ >]/g)||[]).length,1,`${name}: H1`);
 assert(h.includes('class="ds-header"'),`${name}: shared header`);
 assert(h.includes('class="ds-footer"'),`${name}: shared footer`);
 assert.match(h,/<title>[^<]+<\/title>/,`${name}: title`);
 assert.match(h,/<meta name="description" content="[^"]+"/,`${name}: description`);
 assert.match(h,/<link rel="canonical" href="https:\/\/www.dhitiservices.com\//,`${name}: canonical`);
 for(const script of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g))JSON.parse(script[1]);
 for(const im of h.matchAll(/<img [^>]+>/g)){assert.match(im[0],/ alt="/,`${name}: image alt`);images++;}
 for(const m of h.matchAll(/(?:src|href)="([^"]+)"/g)){
   const link=m[1].replaceAll('&amp;','&');
   if(/^(https?:|mailto:|tel:|data:)/.test(link))continue;
   const [p,fragment]=link.split('#'), clean=p.split('?')[0];
   let target=clean?(clean.startsWith('/')?path.join(root,clean):path.resolve(path.dirname(file),clean)):file;
   assert(fs.existsSync(target),`${name}: missing ${link}`);
   if(fs.statSync(target).isDirectory())target=path.join(target,'index.html');
   if(fragment&&target.endsWith('.html'))assert(fs.readFileSync(target,'utf8').includes(`id="${fragment}"`),`${name}: missing fragment ${link}`);
   links++;
 }
 if(h.includes('data-preview="true"')){
   assert(!/googletagmanager|api\.web3forms\.com/.test(h),`${name}: preview tracking`);
   assert.match(h,/<meta name="robots" content="noindex/,`${name}: preview noindex`);
 }
}
console.log(`PASS: ${pages.length} HTML pages, ${links} local links/resources, ${images} image alt attributes; shared navigation, metadata, structured data and fragments verified.`);
