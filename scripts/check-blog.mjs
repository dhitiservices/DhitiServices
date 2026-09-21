import { loadPosts } from './blog-data.mjs';
const posts = loadPosts();
if (posts.length < 10) throw new Error('At least ten articles are required.');
for (const post of posts) {
  if (post.words < 1000) throw new Error(`${post.slug}: only ${post.words} words`);
  if (post.toc.length < 5) throw new Error(`${post.slug}: add useful sections`);
  if (post.content.includes('—')) throw new Error(`${post.slug}: remove em dashes`);
  if (post.description.length > 160) throw new Error(`${post.slug}: description exceeds 160 characters`);
  if (!/\]\(https:/.test(post.content)) throw new Error(`${post.slug}: missing source reference`);
  console.log(`${post.words} words | ${post.minutes} min | ${post.title}`);
}
console.log(`PASS: ${posts.length} articles; ${posts.reduce((n,p) => n+p.words,0)} total words.`);
