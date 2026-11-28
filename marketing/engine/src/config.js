// Central configuration: environment parsing, paths and defaults (ARCHITECTURE.md v2/v3).
// Every module reads env through here so behaviour is predictable. No API keys live here: the engine
// authenticates to the Supabase Edge Function with ENGINE_TOKEN only, and never calls any AI API.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const flag = (name) => /^(1|true|yes|on)$/i.test(String(process.env[name] ?? '').trim());
const str = (name, fallback = '') => {
  const v = process.env[name];
  return v === undefined || String(v).trim() === '' ? fallback : String(v).trim();
};

export const isDryRun = flag('DRY_RUN');

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(str('REPO_ROOT', path.resolve(engineRoot, '../..')));
const outDir = path.resolve(str('OUT_DIR', path.join(engineRoot, 'out')));

/** Defaults for the `settings` row (id=1), from the contract. Stored values override these key by key. */
export const DEFAULT_SETTINGS = Object.freeze({
  blogs_per_week: 3,
  carousels_per_blog: 1,
  graphics_per_blog: 2,
  videos_per_blog: 1,
  publish_days: ['Monday', 'Wednesday', 'Friday'],
  audience:
    'Founders and operations heads at travel agencies, tour operators, TMCs, OTAs, travel-tech companies and hotels in India and abroad who need reliable back-office, data, support and operations work done.',
  avoid_topics: [],
  extra_guidance: '',
});

/** Blog categories the website already uses (scripts/check-blog.mjs + ARCHITECTURE.md). */
export const BLOG_CATEGORIES = Object.freeze(['Travel operations', 'Hotel operations', 'Operations', 'Customer support', 'Quality', 'People & careers']);

// GIT_PUSH: "0" never pushes. In DRY_RUN nothing is pushed unless GIT_PUSH=1 is set explicitly.
const gitPushEnv = str('GIT_PUSH');
const gitPush = gitPushEnv === '0' ? false : isDryRun ? /^(1|true|yes|on)$/i.test(gitPushEnv) : true;

export const config = Object.freeze({
  isDryRun,
  repoRoot,
  engineRoot,
  outDir,
  templatesDir: path.join(engineRoot, 'templates'),
  blogDir: path.join(repoRoot, 'content', 'blog'),
  photosDir: path.join(repoRoot, 'src', 'assets', 'photos'),
  logosDir: path.join(repoRoot, 'src', 'assets', 'logos'),

  engineUrl: str('ENGINE_URL', 'https://yexxrcgxhwsopssfyylo.supabase.co/functions/v1/engine'),
  storageBucket: 'marketing',

  gitPush,
  gitBranch: str('GIT_BRANCH', 'main'),
  gitRemote: str('GIT_REMOTE', 'origin'),
  gitAuthorName: 'Dhiti Marketing Bot',
  gitAuthorEmail: 'marketing-bot@dhitiservices.com',
  chromiumPath: str('CHROMIUM_PATH') || undefined,

  siteUrl: 'https://www.dhitiservices.com',
  timezone: 'Asia/Kolkata',
  /** Blogs go live at 10:00 IST (04:30 UTC) on their planned publish date. */
  publishTimeIST: '10:00',
});

/** Returns the env value or throws a clear, actionable error. */
export function requireEnv(name) {
  const v = str(name);
  if (!v) {
    throw new Error(
      `Missing required environment variable ${name}. In a Claude session get one with the Supabase connector ` +
        `(select public.issue_engine_token('session', 8, 'weekly run');), in GitHub Actions use the secret, ` +
        `or run with DRY_RUN=1 for local development.`,
    );
  }
  return v;
}
