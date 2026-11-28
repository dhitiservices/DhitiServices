// Publishes ONE approved blog item to the website repo (REPO_ROOT, branch main):
//
//   1. refuse to overwrite a different existing post or photo (identical content = already published, idempotent)
//   2. write content/blog/<slug>.md (house frontmatter, date = today IST) + src/assets/photos/<slug>.webp
//   3. run `node scripts/check-blog.mjs` in REPO_ROOT (npm ci first if node_modules is missing); revert on failure
//   4. commit "Blog: <title>" as Dhiti Marketing Bot, then `git pull --rebase` + `git push origin HEAD:main`
//      with retries (GIT_PUSH=0 skips the pull/push; DRY_RUN pushes only with GIT_PUSH=1)
//
//   publishBlog({ item, cover, repoRoot?, push?, today? }) ->
//     { slug, url, title, commit, pushed, files: [..], alreadyPublished, date, order }
//
// Errors carry `permanent: true` when a human must fix the content (validation, collision); otherwise the caller may
// retry later (network, git push races).
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import { config } from '../config.js';
import { log } from '../log.js';
import { sleep, todayIST } from '../util.js';
import { checkBlogText, renderFrontmatter, listExistingPosts } from '../blogcheck.js';

const permanent = (message) => Object.assign(new Error(message), { permanent: true });

/** Runs a command without a shell. Resolves { code, stdout, stderr }; rejects on spawn errors or non-zero (unless allowFail). */
export function run(cmd, args, { cwd, env, allowFail = false, timeoutMs = 10 * 60_000, label } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const res = { code: code ?? -1, stdout, stderr, signal };
      if (code === 0 || allowFail) return resolve(res);
      const tail = (stderr || stdout).trim().split('\n').slice(-15).join('\n');
      reject(Object.assign(new Error(`${label || `${cmd} ${args.join(' ')}`} failed (exit ${code ?? signal}): ${tail}`), res));
    });
  });
}

const git = (repoRoot, args, opts = {}) =>
  run('git', args, {
    cwd: repoRoot,
    label: `git ${args[0]}`,
    ...opts,
    env: {
      GIT_TERMINAL_PROMPT: '0',
      GIT_AUTHOR_NAME: config.gitAuthorName,
      GIT_AUTHOR_EMAIL: config.gitAuthorEmail,
      GIT_COMMITTER_NAME: config.gitAuthorName,
      GIT_COMMITTER_EMAIL: config.gitAuthorEmail,
      ...opts.env,
    },
  });

/** Makes sure the website's dependencies exist so scripts/check-blog.mjs can run. */
export async function ensureSiteDeps(repoRoot) {
  const need = ['gray-matter', 'marked'].filter((m) => !existsSync(path.join(repoRoot, 'node_modules', m, 'package.json')));
  if (!need.length) return false;
  log(`publish: ${need.join(', ')} missing in ${repoRoot}/node_modules, running npm ci`);
  await run('npm', ['ci', '--no-audit', '--no-fund', '--loglevel=error'], { cwd: repoRoot, label: 'npm ci (website)', timeoutMs: 15 * 60_000 });
  return true;
}

/** Runs the website's own blog check (all posts). Returns its stdout tail; throws with the error on failure. */
export async function runSiteBlogCheck(repoRoot) {
  await ensureSiteDeps(repoRoot);
  const res = await run(process.execPath, ['scripts/check-blog.mjs'], { cwd: repoRoot, label: 'node scripts/check-blog.mjs', allowFail: true, timeoutMs: 120_000 });
  if (res.code !== 0) {
    const msg = (res.stderr || res.stdout).split('\n').find((l) => /Error:/.test(l)) || (res.stderr || res.stdout).trim().split('\n').slice(-3).join(' ');
    throw permanent(`scripts/check-blog.mjs failed: ${msg.trim()}`);
  }
  return res.stdout.trim().split('\n').slice(-1)[0];
}

async function readOrNull(file) {
  try {
    return await fs.readFile(file);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** True when `rel` (repo-relative) is tracked in HEAD. */
async function trackedInHead(repoRoot, rel) {
  const r = await git(repoRoot, ['cat-file', '-e', `HEAD:${rel}`], { allowFail: true });
  return r.code === 0;
}

/** Reverts our working-tree changes for the given repo-relative paths. */
async function revertFiles(repoRoot, rels) {
  for (const rel of rels) {
    if (await trackedInHead(repoRoot, rel)) {
      await git(repoRoot, ['checkout', 'HEAD', '--', rel], { allowFail: true });
    } else {
      await git(repoRoot, ['rm', '--cached', '--quiet', '--ignore-unmatch', '--', rel], { allowFail: true });
      await fs.rm(path.join(repoRoot, rel), { force: true });
    }
  }
}

async function pullRebase(repoRoot) {
  const r = await git(repoRoot, ['pull', '--rebase', '--autostash', '--no-edit', config.gitRemote, config.gitBranch], { allowFail: true, timeoutMs: 180_000 });
  if (r.code !== 0) {
    await git(repoRoot, ['rebase', '--abort'], { allowFail: true });
    throw new Error(`git pull --rebase failed: ${(r.stderr || r.stdout).trim().split('\n').slice(-4).join(' ')}`);
  }
}

/** pull --rebase + push with retries (another commit may land on main between our pull and push). */
async function pushWithRetries(repoRoot, { attempts = 5 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      await pullRebase(repoRoot);
      const r = await git(repoRoot, ['push', config.gitRemote, `HEAD:${config.gitBranch}`], { allowFail: true, timeoutMs: 180_000 });
      if (r.code === 0) return true;
      lastErr = new Error(`git push failed: ${(r.stderr || r.stdout).trim().split('\n').slice(-4).join(' ')}`);
    } catch (err) {
      lastErr = err;
    }
    const wait = Math.min(30_000, 2000 * 2 ** i) + Math.round(Math.random() * 1000);
    log.warn(`publish: ${lastErr.message} (attempt ${i + 1}/${attempts}); retrying in ${(wait / 1000).toFixed(1)}s`);
    await sleep(wait);
  }
  throw lastErr;
}

/** Builds the final markdown for an item's body. */
export function buildMarkdown(body, { date, order }) {
  const fm = { ...body.frontmatter, image: `${body.slug}.webp`, date, order };
  const md = String(body.markdown ?? '').replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/^\n+/, '');
  return `${renderFrontmatter(fm)}\n${md.replace(/\s*$/, '')}\n`;
}

/**
 * Publishes one blog item. `cover` is the stored cover (Buffer, any image format; written as WebP).
 */
export async function publishBlog({ item, cover, repoRoot = config.repoRoot, push = config.gitPush, today = todayIST() } = {}) {
  const body = item?.body || {};
  const slug = String(body.slug || '').trim();
  const title = String(body.frontmatter?.title || item?.title || '').trim();
  if (!slug || !body.frontmatter || typeof body.markdown !== 'string') throw permanent(`item ${item?.id}: body must have slug, frontmatter and markdown`);
  if (!Buffer.isBuffer(cover) || !cover.length) throw permanent(`item ${item?.id}: cover image is missing`);
  repoRoot = path.resolve(repoRoot);
  if (!existsSync(path.join(repoRoot, '.git'))) throw new Error(`REPO_ROOT ${repoRoot} is not a git checkout`);
  if (!existsSync(path.join(repoRoot, 'scripts', 'check-blog.mjs'))) throw new Error(`REPO_ROOT ${repoRoot} does not look like the website repo`);

  const mdRel = `content/blog/${slug}.md`;
  const imgRel = `src/assets/photos/${slug}.webp`;
  const mdFile = path.join(repoRoot, mdRel);
  const imgFile = path.join(repoRoot, imgRel);

  // Start from the latest main so the order number and collision checks see every published post.
  if (push) await pullRebase(repoRoot);
  const dirty = (await git(repoRoot, ['status', '--porcelain', '--', mdRel, imgRel])).stdout.trim();
  if (dirty) throw new Error(`REPO_ROOT has uncommitted changes to ${mdRel} / ${imgRel}; refusing to publish over them`);

  const existingMd = await readOrNull(mdFile);
  const existingImg = await readOrNull(imgFile);

  // Idempotency: an earlier run may have committed (and maybe pushed) but failed before marking the item published.
  if (existingMd) {
    const existingText = existingMd.toString('utf8');
    const bodyOnly = (t) => t.replace(/^---[\s\S]*?\n---\n/, '').trim();
    const sameBody = bodyOnly(existingText) === String(body.markdown).replace(/\r\n/g, '\n').trim();
    const sameTitle = existingText.includes(`title: ${JSON.stringify(title)}`);
    if (sameBody && sameTitle && existingImg) {
      log(`publish: ${mdRel} already contains this post; treating as published`);
      let pushed = false;
      if (push) pushed = await pushWithRetries(repoRoot);
      const commit = (await git(repoRoot, ['log', '-1', '--format=%H', '--', mdRel])).stdout.trim() || null;
      const date = /date:\s*"(\d{4}-\d{2}-\d{2})"/.exec(existingText)?.[1] || today;
      return { slug, title, url: `${config.siteUrl}/blog/${slug}/`, commit, pushed, files: [mdRel, imgRel], alreadyPublished: true, date };
    }
    throw permanent(`${mdRel} already exists with different content; refusing to overwrite a published post (rename the slug)`);
  }
  if (existingImg) throw permanent(`${imgRel} already exists (another page uses it); refusing to overwrite it (rename the slug)`);

  // Order: keep the planned one unless another post already uses it.
  const posts = (await listExistingPosts({ repoRoot })).filter((p) => !p.error);
  const orders = posts.map((p) => Number(p.order)).filter(Number.isFinite);
  let order = Number.parseInt(body.frontmatter.order, 10);
  if (!Number.isInteger(order) || order < 1 || orders.includes(order)) order = (orders.length ? Math.max(...orders) : 0) + 1;
  const date = today;
  const markdown = buildMarkdown(body, { date, order });

  // Our own check first (clear messages), then the website's.
  const pre = await checkBlogText(markdown, { repoRoot, slug });
  if (!pre.passed) throw permanent(`blog check failed: ${pre.messages.join('; ')}`);

  const webp = await sharp(cover, { failOn: 'none' }).rotate().webp({ quality: 82, effort: 5, smartSubsample: true }).toBuffer();
  const meta = await sharp(webp).metadata();
  if (meta.width < 1200) throw permanent(`cover is only ${meta.width}px wide; expected 1600x900`);

  await fs.mkdir(path.dirname(mdFile), { recursive: true });
  await fs.mkdir(path.dirname(imgFile), { recursive: true });
  await fs.writeFile(mdFile, markdown);
  await fs.writeFile(imgFile, webp);
  const rels = [mdRel, imgRel];
  let committed = false;
  try {
    const summary = await runSiteBlogCheck(repoRoot);
    log(`publish: website check passed (${summary})`);
    await git(repoRoot, ['add', '--', ...rels]);
    await git(repoRoot, ['commit', '--no-verify', '--quiet', '-m', `Blog: ${title}`, '--', ...rels]);
    committed = true;
  } catch (err) {
    log.warn(`publish: reverting ${rels.join(', ')}: ${err.message}`);
    await revertFiles(repoRoot, rels);
    throw err;
  }
  const commit = (await git(repoRoot, ['rev-parse', 'HEAD'])).stdout.trim();
  log(`publish: committed ${commit.slice(0, 10)} "Blog: ${title}"`);

  let pushed = false;
  if (push) {
    try {
      pushed = await pushWithRetries(repoRoot);
    } catch (err) {
      // Undo the local commit so the next run starts clean and retries the whole publish.
      if (committed) {
        const head = (await git(repoRoot, ['rev-parse', 'HEAD'], { allowFail: true })).stdout.trim();
        const headMsg = (await git(repoRoot, ['log', '-1', '--format=%s'], { allowFail: true })).stdout.trim();
        if (head && headMsg === `Blog: ${title}`) await git(repoRoot, ['reset', '--hard', 'HEAD~1'], { allowFail: true });
      }
      throw err;
    }
    log(`publish: pushed to ${config.gitRemote}/${config.gitBranch}`);
  } else {
    log('publish: push skipped (GIT_PUSH=0 or DRY_RUN)');
  }
  const finalCommit = (await git(repoRoot, ['rev-parse', 'HEAD'])).stdout.trim();
  return { slug, title, url: `${config.siteUrl}/blog/${slug}/`, commit: pushed ? finalCommit : commit, pushed, files: rels, alreadyPublished: false, date, order };
}
