// Reel renderer: 1080x1920, 30 fps, H.264 High / yuv420p, +faststart, silent AAC track, 20-40 s.
//
//   renderVideo(body, {brand, workDir}) -> { mp4, poster, posterMime, duration, width, height, fps, timeline }
//
// Pipeline (robust by construction: every scene is encoded on its own, then joined):
//   1. Normalise scenes (duration 1.5-12 s, total incl. 3 s outro clamped to 20-40 s).
//   2. Playwright renders transparent overlays: one scrim (gradients + small wordmark), one text layer per scene,
//      the outro background and the outro foreground. Text stays inside x 90..990, y 280..1500.
//   3. ffmpeg encodes each scene: stock clip (scaled + cropped to fill, trimmed, looped only if too short) or photo
//      (Ken Burns via zoompan on a 2x still), scrim on top, text fading in with a slight rise, fading out before the cut.
//   4. Scenes + outro are joined with crossfades (xfade); if that fails, with hard cuts (concat demuxer). Final encode
//      is a single libx264 pass with platform-friendly settings, BT.709 tagged.
//   5. Poster = a frame from the first scene once its text is fully visible (JPEG).
// Stock only: inputs are local Magnific stock files. Nothing here generates imagery.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import ffmpegStatic from 'ffmpeg-static';
import { withPage, resolveBrand, htmlDocument, richText, cleanText, plainText, escapeHtml } from './browser.js';
import { log } from '../log.js';

export const VIDEO_SIZE = Object.freeze({ width: 1080, height: 1920 });
const W = VIDEO_SIZE.width;
const H = VIDEO_SIZE.height;
const FPS = 30;
const OUTRO_SECONDS = 3;
const XFADE = 0.4; // crossfade length (s)
const TEXT_IN_AT = 0.35; // text starts appearing (s into scene)
const TEXT_IN_DUR = 0.6;
const TEXT_OUT_DUR = 0.3;
const RISE_PX = 48;
const MIN_TOTAL = 20;
const MAX_TOTAL = 40;
const MAX_SCENES = 12;
const SITE = 'www.dhitiservices.com';
const TRANSITIONS = new Set(['fade', 'fadeblack', 'dissolve', 'smoothleft', 'smoothup', 'slideleft', 'slideup', 'wipeleft', 'circleopen', 'cut']);

export const FFMPEG_PATH = process.env.FFMPEG_PATH || ffmpegStatic;

// ---------------------------------------------------------------------------------------------
// ffmpeg helpers
// ---------------------------------------------------------------------------------------------

/** Runs ffmpeg with args (no shell). Resolves {stderr}; rejects with the stderr tail on failure. */
export function runFfmpeg(args, { label = 'ffmpeg', timeoutMs = 10 * 60_000, allowFail = false } = {}) {
  if (!FFMPEG_PATH) return Promise.reject(new Error('ffmpeg binary not found (ffmpeg-static missing and FFMPEG_PATH unset)'));
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_PATH, ['-hide_banner', '-nostdin', ...args], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => {
      err += d;
      if (err.length > 64_000) err = err.slice(-32_000);
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(`${label}: could not start ffmpeg: ${e.message}`));
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0 || allowFail) resolve({ code, stderr: err });
      else reject(new Error(`${label} failed (${signal || `exit ${code}`}): ${err.trim().split('\n').slice(-12).join('\n')}`));
    });
  });
}

/** Minimal probe from `ffmpeg -i` output: {duration, width, height, fps, codec, pixFmt}. */
export async function probeMedia(file) {
  const { stderr } = await runFfmpeg(['-i', file], { label: 'probe', allowFail: true, timeoutMs: 60_000 });
  const d = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const v = /Stream #\S+.*?Video:\s*(\w+)[^,]*,\s*([\w]+)(?:\([^)]*\))?[^,]*,\s*(\d{2,5})x(\d{2,5})/.exec(stderr);
  const f = /,\s*([\d.]+)\s*fps/.exec(stderr);
  return {
    duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0,
    codec: v?.[1] || '',
    pixFmt: v?.[2] || '',
    width: v ? +v[3] : 0,
    height: v ? +v[4] : 0,
    fps: f ? +f[1] : 0,
    hasAudio: /Stream #\S+.*?Audio:/.test(stderr),
  };
}

const r3 = (n) => Math.round(n * 1000) / 1000;
const frames = (s) => Math.max(1, Math.round(s * FPS));
const fileOk = (p) => typeof p === 'string' && p.trim() && existsSync(path.resolve(p.trim()));

// ---------------------------------------------------------------------------------------------
// Scene planning
// ---------------------------------------------------------------------------------------------

function planScenes(body) {
  const raw = Array.isArray(body?.scenes) ? body.scenes.filter(Boolean) : [];
  if (!raw.length) throw new Error('renderVideo: body.scenes must be a non-empty array');
  if (raw.length > MAX_SCENES) log.warn(`renderVideo: ${raw.length} scenes, keeping the first ${MAX_SCENES}`);
  const scenes = raw.slice(0, MAX_SCENES).map((s, i) => {
    const clip = fileOk(s.clip) ? path.resolve(s.clip.trim()) : null;
    const photo = fileOk(s.photo) ? path.resolve(s.photo.trim()) : null;
    if (s.clip && !clip) log.warn(`renderVideo: scene ${i + 1} clip not found: ${s.clip}`);
    if (s.photo && !photo) log.warn(`renderVideo: scene ${i + 1} photo not found: ${s.photo}`);
    const dur = Number(s.duration);
    return {
      index: i,
      duration: Math.min(12, Math.max(1.5, Number.isFinite(dur) && dur > 0 ? dur : 4)),
      text: cleanText(s.on_screen_text ?? s.text ?? ''),
      eyebrow: cleanText(s.eyebrow ?? ''),
      clip,
      clipStart: Number.isFinite(Number(s.clip_start)) ? Math.max(0, Number(s.clip_start)) : null,
      photo: clip ? null : photo,
    };
  });
  // Clamp the total (content + outro) to 20-40 s by scaling scene durations proportionally.
  const content = scenes.reduce((a, s) => a + s.duration, 0);
  const total = content + OUTRO_SECONDS;
  const target = Math.min(MAX_TOTAL, Math.max(MIN_TOTAL, total));
  if (Math.abs(target - total) > 0.01) {
    const k = (target - OUTRO_SECONDS) / content;
    log.warn(`renderVideo: total ${total.toFixed(1)}s outside ${MIN_TOTAL}-${MAX_TOTAL}s, scaling scenes by ${k.toFixed(2)}`);
    for (const s of scenes) s.duration *= k;
  }
  for (const s of scenes) s.duration = frames(s.duration) / FPS; // frame-accurate
  return scenes;
}

// ---------------------------------------------------------------------------------------------
// Overlays (Playwright)
// ---------------------------------------------------------------------------------------------

async function renderOverlays(scenes, brand, dir, body) {
  const css = ['creative.css', 'video.css'];
  const doc = (body, transparent = true) => htmlDocument({ body, css, colors: brand.colors, width: W, height: H, transparent });
  const files = { scrim: path.join(dir, 'scrim.png'), text: [], outroBg: path.join(dir, 'outro-bg.png'), outroFg: path.join(dir, 'outro-fg.png'), fallback: null };
  await withPage(VIDEO_SIZE, async (render) => {
    const scrim = await render(doc(`<div class="v v-scrim"><div class="v-brand"><img src="${brand.logo.reverse}" alt="Dhiti"></div></div>`), { transparent: true });
    await fs.writeFile(files.scrim, scrim.buffer);
    for (const s of scenes) {
      if (!s.text) {
        files.text.push(null);
        continue;
      }
      const html = doc(`<div class="v"><div class="v-safe" data-fit-box="scene-${s.index + 1}" data-fit-min="0.45">
        ${s.eyebrow ? `<div class="v-kicker">${escapeHtml(s.eyebrow)}</div>` : ''}
        <h1 class="v-text${s.index === 0 ? ' hook' : ''}">${richText(s.text)}</h1>
        <div class="v-rule"></div>
      </div></div>`);
      const { buffer } = await render(html, { transparent: true });
      const f = path.join(dir, `text-${s.index}.png`);
      await fs.writeFile(f, buffer);
      files.text.push(f);
    }
    const bg = await render(doc(`<div class="v v-outro-bg"><img class="watermark" src="${brand.mark.white}" alt=""></div>`, false));
    await fs.writeFile(files.outroBg, bg.buffer);
    const fg = await render(doc(`<div class="v"><div class="v-outro">
        <img class="logo" src="${brand.logo.white}" alt="Dhiti">
        <div class="tag">${richText(body?.outro_text || 'Operations teams for the travel industry')}</div>
        <div class="pill">${SITE}</div>
      </div></div>`), { transparent: true });
    await fs.writeFile(files.outroFg, fg.buffer);
    if (scenes.some((s) => !s.clip && !s.photo)) {
      const fb = await render(doc('<div class="v v-fallback"></div>', false));
      files.fallback = path.join(dir, 'fallback.png');
      await fs.writeFile(files.fallback, fb.buffer);
    }
  });
  return files;
}

// ---------------------------------------------------------------------------------------------
// Scene encoding
// ---------------------------------------------------------------------------------------------

const INTERMEDIATE = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];
const TO_YUV = `scale=w=${W}:h=${H}:out_color_matrix=bt709:out_range=tv,format=yuv420p`;

// Ken Burns presets: zoom from z0 to z1 while drifting across the spare area (fractions 0..1).
const MOTIONS = [
  { z0: 1.0, z1: 1.12, x0: 0.5, x1: 0.5, y0: 0.5, y1: 0.45 },
  { z0: 1.12, z1: 1.02, x0: 0.7, x1: 0.35, y0: 0.5, y1: 0.5 },
  { z0: 1.02, z1: 1.13, x0: 0.35, x1: 0.6, y0: 0.6, y1: 0.4 },
];

/** 2x still for zoompan (cover-cropped with attention so faces/subjects stay in frame). */
async function prepareStill(src, out) {
  await sharp(src, { failOn: 'none', limitInputPixels: false })
    .rotate()
    .resize({ width: W * 2, height: H * 2, fit: 'cover', position: sharp.strategy.attention })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toFile(out);
  return out;
}

function textFilters(len, fadeOutEnd) {
  const outAt = Math.max(TEXT_IN_AT + TEXT_IN_DUR + 0.2, fadeOutEnd - TEXT_OUT_DUR);
  const rise = `if(lt(t,${TEXT_IN_AT}),${RISE_PX},if(lt(t,${TEXT_IN_AT + TEXT_IN_DUR}),${RISE_PX}*pow(1-(t-${TEXT_IN_AT})/${TEXT_IN_DUR},3),0))`;
  return {
    prep: `format=rgba,fade=t=in:st=${TEXT_IN_AT}:d=${TEXT_IN_DUR}:alpha=1,fade=t=out:st=${r3(outAt)}:d=${TEXT_OUT_DUR}:alpha=1`,
    y: `'${rise}'`,
  };
}

async function encodeScene(scene, len, { overlays, dir, clipCursor, fadeOutEnd, clipInfo }) {
  const out = path.join(dir, `scene-${scene.index}.mp4`);
  const n = frames(len);
  const args = ['-y', '-loglevel', 'error'];
  let bgChain;
  if (scene.clip) {
    const info = clipInfo.get(scene.clip);
    const clipDur = info.duration || 0;
    let start = scene.clipStart ?? clipCursor.get(scene.clip) ?? 0;
    let loop = false;
    if (clipDur > 0) {
      if (start + len > clipDur) start = clipDur >= len ? Math.max(0, clipDur - len - 0.05) : 0;
      loop = clipDur < len;
      clipCursor.set(scene.clip, (start + len) % Math.max(clipDur, 0.001));
    }
    if (loop) args.push('-stream_loop', '-1');
    args.push('-ss', String(r3(start)), '-t', String(r3(len + 0.5)), '-i', scene.clip);
    bgChain = `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H},setsar=1,fps=${FPS},format=gbrp,trim=end_frame=${n},setpts=PTS-STARTPTS[bg]`;
  } else {
    const still = await prepareStill(scene.photo || overlays.fallback, path.join(dir, `still-${scene.index}.jpg`));
    const m = MOTIONS[scene.index % MOTIONS.length];
    const p = `(on/${Math.max(1, n - 1)})`;
    const z = `${m.z0}+(${r3(m.z1 - m.z0)})*${p}`;
    const x = `(iw-iw/zoom)*(${m.x0}+(${r3(m.x1 - m.x0)})*${p})`;
    const y = `(ih-ih/zoom)*(${m.y0}+(${r3(m.y1 - m.y0)})*${p})`;
    args.push('-i', still);
    bgChain = `[0:v]zoompan=z='${z}':x='${x}':y='${y}':d=${n}:s=${W}x${H}:fps=${FPS},setsar=1,format=gbrp,trim=end_frame=${n},setpts=PTS-STARTPTS[bg]`;
  }
  args.push('-loop', '1', '-framerate', String(FPS), '-t', String(r3(len)), '-i', overlays.scrim);
  const textFile = overlays.text[scene.index];
  const chains = [bgChain, `[1:v]format=rgba[scrim]`, `[bg][scrim]overlay=0:0:format=gbrp:shortest=0[b1]`];
  if (textFile) {
    args.push('-loop', '1', '-framerate', String(FPS), '-t', String(r3(len)), '-i', textFile);
    const t = textFilters(len, fadeOutEnd);
    chains.push(`[2:v]${t.prep}[txt]`, `[b1][txt]overlay=x=0:y=${t.y}:format=gbrp:eval=frame[b2]`, `[b2]${TO_YUV}[out]`);
  } else {
    chains.push(`[b1]${TO_YUV}[out]`);
  }
  args.push('-filter_complex', chains.join(';'), '-map', '[out]', '-frames:v', String(n), ...INTERMEDIATE, out);
  await runFfmpeg(args, { label: `scene ${scene.index + 1}` });
  return out;
}

async function encodeOutro(len, overlays, dir) {
  const out = path.join(dir, 'outro.mp4');
  const n = frames(len);
  const rise = `if(lt(t,0.15),36,if(lt(t,0.85),36*pow(1-(t-0.15)/0.7,3),0))`;
  const args = [
    '-y', '-loglevel', 'error',
    '-loop', '1', '-framerate', String(FPS), '-t', String(r3(len)), '-i', overlays.outroBg,
    '-loop', '1', '-framerate', String(FPS), '-t', String(r3(len)), '-i', overlays.outroFg,
    '-filter_complex',
    [
      `[0:v]format=gbrp,setsar=1[bg]`,
      `[1:v]format=rgba,fade=t=in:st=0.15:d=0.7:alpha=1[fg]`,
      `[bg][fg]overlay=x=0:y='${rise}':format=gbrp:eval=frame[b]`,
      `[b]${TO_YUV}[out]`,
    ].join(';'),
    '-map', '[out]', '-frames:v', String(n), ...INTERMEDIATE, out,
  ];
  await runFfmpeg(args, { label: 'outro' });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Join + final encode
// ---------------------------------------------------------------------------------------------

const FINAL = [
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p',
  '-r', String(FPS), '-g', String(FPS * 2), '-keyint_min', String(FPS), '-maxrate', '12M', '-bufsize', '24M',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
  '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2',
  '-movflags', '+faststart', '-metadata', 'title=Dhiti Services', '-metadata', 'comment=www.dhitiservices.com',
];

async function joinXfade(parts, lens, transition, out) {
  const total = lens.reduce((a, b) => a + b, 0) - XFADE * (parts.length - 1);
  const args = ['-y', '-loglevel', 'error'];
  for (const p of parts) args.push('-i', p);
  args.push('-f', 'lavfi', '-t', String(r3(total)), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
  const chains = parts.map((_, i) => `[${i}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=${FPS},format=yuv420p[v${i}]`);
  let prev = 'v0';
  let acc = lens[0];
  for (let k = 1; k < parts.length; k++) {
    const offset = acc - XFADE;
    const label = k === parts.length - 1 ? 'vx' : `x${k}`;
    chains.push(`[${prev}][v${k}]xfade=transition=${transition}:duration=${XFADE}:offset=${r3(offset)}[${label}]`);
    prev = label;
    acc = acc + lens[k] - XFADE;
  }
  if (parts.length === 1) chains.push('[v0]null[vx]');
  chains.push(`[vx]format=yuv420p[v]`);
  args.push('-filter_complex', chains.join(';'), '-map', '[v]', '-map', `${parts.length}:a`, ...FINAL, '-t', String(r3(total)), out);
  await runFfmpeg(args, { label: 'join (crossfade)' });
  return total;
}

async function joinConcat(parts, lens, out, dir) {
  const list = path.join(dir, 'concat.txt');
  await fs.writeFile(list, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const total = lens.reduce((a, b) => a + b, 0);
  const args = [
    '-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', list,
    '-f', 'lavfi', '-t', String(r3(total)), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-map', '0:v', '-map', '1:a', '-vf', 'format=yuv420p', ...FINAL, '-t', String(r3(total)), out,
  ];
  await runFfmpeg(args, { label: 'join (concat)' });
  return total;
}

// ---------------------------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------------------------

/**
 * renderVideo(body, {brand, workDir, keepWork}) ->
 *   { mp4: Buffer, poster: Buffer (JPEG 1080x1920), posterMime: 'image/jpeg', duration: seconds, width, height, fps, timeline }
 * body = { scenes: [{ duration, on_screen_text, clip|null, photo|null, eyebrow?, clip_start? }], transition?: 'fade'|'cut'|xfade name,
 *          outro_text?: tagline on the end card (default "Operations teams for the travel industry") }
 * workDir: scratch directory (a unique subfolder is created inside and removed afterwards unless keepWork).
 */
export async function renderVideo(body, { brand, workDir, keepWork = false } = {}) {
  const scenes = planScenes(body);
  const resolved = await resolveBrand(brand);
  const base = workDir ? path.resolve(workDir) : os.tmpdir();
  await fs.mkdir(base, { recursive: true });
  const dir = await fs.mkdtemp(path.join(base, 'reel-'));
  const started = Date.now();
  try {
    let transition = String(body?.transition || 'fade').toLowerCase();
    if (!TRANSITIONS.has(transition)) transition = 'fade';
    const cut = transition === 'cut';

    const overlays = await renderOverlays(scenes, resolved, dir, body);

    const clipInfo = new Map();
    for (const s of scenes) if (s.clip && !clipInfo.has(s.clip)) clipInfo.set(s.clip, await probeMedia(s.clip));

    // With crossfades each scene (except the outro) is extended by XFADE so the total stays sum(durations) + outro.
    const lens = [...scenes.map((s) => s.duration + (cut ? 0 : XFADE)), OUTRO_SECONDS];
    const clipCursor = new Map();
    const parts = [];
    for (const s of scenes) {
      const len = lens[s.index];
      parts.push(await encodeScene(s, len, { overlays, dir, clipCursor, clipInfo, fadeOutEnd: cut ? len : len - XFADE }));
    }
    parts.push(await encodeOutro(OUTRO_SECONDS, overlays, dir));

    const outFile = path.join(dir, 'reel.mp4');
    let joinedWith = cut ? 'cut' : transition;
    if (cut) await joinConcat(parts, lens, outFile, dir);
    else {
      try {
        await joinXfade(parts, lens, transition, outFile);
      } catch (err) {
        log.warn(`renderVideo: crossfade join failed, falling back to hard cuts: ${err.message.split('\n')[0]}`);
        joinedWith = 'cut';
        await joinConcat(parts, lens, outFile, dir);
      }
    }

    const info = await probeMedia(outFile);
    if (info.width !== W || info.height !== H) throw new Error(`renderVideo: unexpected output size ${info.width}x${info.height}`);

    // Timeline (output seconds) for captions / review.
    const timeline = [];
    let t = 0;
    scenes.forEach((s, i) => {
      timeline.push({ scene: i + 1, start: r3(t), duration: r3(s.duration), text: plainText(s.text), source: s.clip ? 'clip' : s.photo ? 'photo' : 'fallback' });
      t += joinedWith === 'cut' ? lens[i] : lens[i] - XFADE;
    });
    timeline.push({ scene: 'outro', start: r3(t), duration: OUTRO_SECONDS });

    // Poster: first scene once its text has fully landed.
    const posterAt = Math.min(TEXT_IN_AT + TEXT_IN_DUR + 0.5, Math.max(0.1, scenes[0].duration - 0.5));
    const posterPng = path.join(dir, 'poster.png');
    await runFfmpeg(['-y', '-loglevel', 'error', '-ss', String(r3(posterAt)), '-i', outFile, '-frames:v', '1', '-update', '1', posterPng], { label: 'poster' });
    const poster = await sharp(posterPng).jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
    const mp4 = await fs.readFile(outFile);
    log(`renderVideo: ${scenes.length} scenes + outro, ${info.duration.toFixed(2)}s, ${(mp4.length / 1e6).toFixed(1)} MB, ${joinedWith}, ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return { mp4, poster, posterMime: 'image/jpeg', duration: r3(info.duration), width: W, height: H, fps: FPS, transition: joinedWith, timeline };
  } finally {
    if (!keepWork) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
