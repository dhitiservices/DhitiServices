// Central configuration: environment parsing, paths and defaults.
// Every other module reads env through here so behaviour is predictable.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const flag = (name) => /^(1|true|yes|on)$/i.test(String(process.env[name] ?? '').trim());
const str = (name, fallback = '') => {
  const v = process.env[name];
  return v === undefined || String(v).trim() === '' ? fallback : String(v).trim();
};

export const isMock = flag('MOCK_AI');
export const isDryRun = flag('DRY_RUN');

const engineRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(str('REPO_ROOT', path.resolve(engineRoot, '../..')));
const outDir = path.resolve(str('OUT_DIR', path.join(engineRoot, 'out')));

/** Defaults for the `settings` row (id=1). Stored values override these key by key. */
export const DEFAULT_SETTINGS = Object.freeze({
  blogs_per_week: 2,
  carousels_per_blog: 1,
  graphics_per_blog: 2,
  videos_per_blog: 1,
  publish_days: ['Tuesday', 'Thursday'],
  audience:
    'Owners, founders and operations heads at travel agencies, tour operators, OTAs, DMCs, hotel groups and travel tech companies who are weighing outsourced back-office and operations support.',
  avoid_topics: [],
  extra_guidance: '',
  writer_model: 'claude-opus-5-5',
  image_model: 'gemini-3.1-flash-image',
});

export const config = Object.freeze({
  isMock,
  isDryRun,
  repoRoot,
  engineRoot,
  outDir,
  promptsDir: path.join(engineRoot, 'prompts'),
  templatesDir: path.join(engineRoot, 'templates'),
  blogDir: path.join(repoRoot, 'content', 'blog'),
  photosDir: path.join(repoRoot, 'src', 'assets', 'photos'),
  logosDir: path.join(repoRoot, 'src', 'assets', 'logos'),

  supabaseUrl: str('SUPABASE_URL', 'https://yexxrcgxhwsopssfyylo.supabase.co'),
  supabaseServiceRoleKey: str('SUPABASE_SERVICE_ROLE_KEY'),
  storageBucket: 'marketing',

  anthropicApiKey: str('ANTHROPIC_API_KEY'),
  geminiApiKey: str('GEMINI_API_KEY'),
  pexelsApiKey: str('PEXELS_API_KEY'),

  defaultWriterModel: DEFAULT_SETTINGS.writer_model,
  defaultImageModel: DEFAULT_SETTINGS.image_model,
  fallbackImageModel: 'gemini-2.5-flash-image',

  gitPush: str('GIT_PUSH', '1') !== '0' && !isDryRun,
  chromiumPath: str('CHROMIUM_PATH') || undefined,

  siteUrl: 'https://www.dhitiservices.com',
  timezone: 'Asia/Kolkata',
});

/** Returns the env value or throws a clear, actionable error. */
export function requireEnv(name) {
  const v = str(name);
  if (!v) {
    throw new Error(
      `Missing required environment variable ${name}. Set it as a GitHub Actions secret (or export it locally), ` +
        `or run with MOCK_AI=1 / DRY_RUN=1 for development.`,
    );
  }
  return v;
}
