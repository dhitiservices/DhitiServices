import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { marked } from 'marked';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const esc = (value = '') => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const slugify = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export function loadPosts() {
  return fs.readdirSync(path.join(root, 'content/blog')).filter(f => f.endsWith('.md')).map(file => {
    const { data, content } = matter(fs.readFileSync(path.join(root, 'content/blog', file), 'utf8'));
    const slug = file.replace(/\.md$/, '');
    for (const key of ['title','description','category','image','imageAlt','order','date']) {
      if (!data[key]) throw new Error(`${file}: missing ${key}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error(`${file}: date must be a quoted YYYY-MM-DD value`);
    // Markdown is trusted repository content, not a public input surface.
    // Prohibit raw HTML so articles remain content-only.
    if (/<\/?[a-z][^>]*>/i.test(content)) throw new Error(`${file}: raw HTML is not allowed`);
    const plain = content.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#*`>|]/g, '');
    const words = plain.trim().split(/\s+/).length;
    const toc = [];
    const html = marked.parse(content).replace(/<h2>(.*?)<\/h2>/g, (_, text) => {
      const id = slugify(text.replace(/<[^>]*>/g,''));
      toc.push({ id, text });
      return `<h2 id="${id}">${text}</h2>`;
    }).replace(/<a href="(https?:[^"]+)"/g, '<a target="_blank" rel="noopener noreferrer" href="$1"');
    return {...data, slug, content, html, toc, words, minutes: Math.ceil(words / 220)};
  }).sort((a,b) => a.order-b.order);
}
