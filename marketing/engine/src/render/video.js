// Reel renderer: 1080x1920, 30 fps, H.264 High / yuv420p, +faststart, silent AAC track, 20-40 s.
//
//   renderVideo(body, {brand, workDir}) -> { mp4, poster, posterMime, duration, width, height, fps, timeline }
//
// Pipeline (robust by construction: every scene is encoded on its own, then joined):
//   1. Normalise scenes (duration 1.5-12 s, total incl. 3 s outro clamped to 20-40 s).
//   2. Playwright renders transparent overlays: two scrims (gradients + small wordmark top-left or top-right; each
//      scene takes the corner with the lower subject saliency, or the side away from a declared subject box), one text
//      layer per scene, the outro background and the outro foreground. Text sits in the band y 770..1240, x 90..920:
//      clear of the Reels/LinkedIn bottom UI (bottom ~35%) and of the right-hand action rail.
//   3. ffmpeg encodes each scene: stock clip (scaled + cropped to fill, trimmed, looped only if too short) or photo
//      (Ken Burns via zoompan on a 2x still), scrim on top. The hook's text is fully visible from frame 0 and only its
//      highlight animates in; later scenes' text rises in quickly. scene.zoom (>= 1) punches into a clip (4K sources
//      stay sharp) and scene.subject ({x,y,w,h} of the source frame) fails the render if text would cross the face.
//   4. Default transition "cut": hard cuts between content scenes on the voiceover beats, one short fade to black into
//      the outro only. Other xfade transitions remain available. Final encode is a single libx264 pass, BT.709.
//   5. Poster = a frame from the first scene with its text and highlight fully visible (JPEG).
//   6. Voiceover (v3, optional body.voiceover_path): scenes are re-timed so the content matches the voiceover length,
//      each scene's share proportional to the word count of its vo_line; the voiceover is loudness-normalised to
//      -14 LUFS (true peak -1.5 dB) and becomes the only audio track (stock clip audio is always muted).
// Stock only: inputs are local Magnific stock files. Nothing here generates imagery.
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import ffmpegStatic from 'ffmpeg-static';
import { withPage, resolveBrand, htmlDocument, richText, cleanText, plainText, escapeHtml, loadPhoto, parseFocus, coverCropRect, clipCropRect, subjectInOutput, subjectMarker, photoSize, assertNoCollisions } from './browser.js';
import { log } from '../log.js';

export const VIDEO_SIZE = Object.freeze({ width: 1080, height: 1920 });
const W = VIDEO_SIZE.width;
const H = VIDEO_SIZE.height;
const FPS = 30;
const OUTRO_SECONDS = 3;
const XFADE = 0.4; // crossfade length (s)
const TEXT_IN_AT = 0.12; // text starts appearing (s into scene); the hook's text is visible from frame 0
const TEXT_IN_DUR = 0.4;
const TEXT_OUT_DUR = 0.3;
const RISE_PX = 32;
const HOOK_HL_AT = 0.1; // hook: the highlight box fades in over the already visible text
const HOOK_HL_DUR = 0.4;
// Wordmark boxes (output px) for the two allowed corners, used for the saliency pick.
const LOGO_BOX = { left: { x: 90, y: 270, w: 260, h: 90 }, right: { x: 730, y: 270, w: 260, h: 90 } };
const MIN_TOTAL = 20;
const MAX_TOTAL = 40;
const MAX_SCENES = 12;
const MAX_TOTAL_VO = 90; // with a voiceover the reel follows the recording (up to this length)
const VO_LEAD = 0.25; // voiceover starts this long after the first frame (s)
const VO_TAIL = 0.45; // breathing room after the last word before the outro (s)
const SITE = 'www.dhitiservices.com';
const TRANSITIONS = new Set(['fade', 'fadeblack', 'dissolve', 'smoothleft', 'smoothup', 'slideleft', 'slideup', 'wipeleft', 'circleopen', 'cut']);
const DEFAULT_TRANSITION = 'cut';

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

const words = (s) => String(s ?? '').replace(/\*\*?/g, '').split(/\s+/).filter(Boolean).length;

function planScenes(body, voDuration = null) {
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
      focus: s.focus ?? null,
      zoom: Math.min(3, Math.max(1, Number(s.zoom) || 1)),
      subject: s.subject ?? null,
      logo: s.logo === 'left' || s.logo === 'right' ? s.logo : null,
    };
  });
  scenes.outro = OUTRO_SECONDS;
  if (voDuration) {
    // Re-time to the voiceover: content = lead + voiceover + tail, split by each scene's vo_line word count
    // (scenes without a vo_line keep their relative duration as weight). Minimum 1.5 s per scene.
    // An outro_vo_line (the spoken call to action) is voiced over the end card: the outro takes its share of the
    // recording (at least OUTRO_SECONDS) and the scenes share the rest.
    const outroWords = words(body?.outro_vo_line);
    const allWords = raw.slice(0, MAX_SCENES).reduce((a, s) => a + words(s.vo_line), 0) + outroWords;
    const frac = outroWords && allWords ? outroWords / allWords : 0;
    if (frac) scenes.outro = Math.max(OUTRO_SECONDS, frames(voDuration * frac + VO_TAIL + 0.3) / FPS);
    // Content ends where the outro's words start (speech rate assumed even across the script).
    const want = Math.min(MAX_TOTAL_VO - scenes.outro, frac ? VO_LEAD + voDuration * (1 - frac) : VO_LEAD + voDuration + VO_TAIL);
    const wc = raw.slice(0, MAX_SCENES).map((s) => words(s.vo_line));
    const totalWords = wc.reduce((a, b) => a + b, 0);
    const baseDur = scenes.reduce((a, s) => a + s.duration, 0);
    const weights = scenes.map((s, i) => (totalWords > 0 ? (wc[i] || 0) / totalWords : s.duration / baseDur));
    // Words-only weights would give a vo_line-less scene 0 s: give those a short beat instead.
    const fixed = scenes.map((s, i) => (totalWords > 0 && !wc[i] ? 1.5 : 0));
    const flexible = Math.max(0, want - fixed.reduce((a, b) => a + b, 0));
    scenes.forEach((s, i) => {
      s.duration = fixed[i] || Math.max(1.5, flexible * weights[i]);
    });
    const got = scenes.reduce((a, s) => a + s.duration, 0);
    if (got > want + 0.01) {
      // Minimums pushed us over: shrink the scenes above the minimum proportionally.
      const over = got - want;
      const room = scenes.reduce((a, s) => a + Math.max(0, s.duration - 1.5), 0);
      if (room > 0) for (const s of scenes) s.duration -= (Math.max(0, s.duration - 1.5) / room) * Math.min(over, room);
    }
    for (const s of scenes) s.duration = frames(s.duration) / FPS;
    return scenes;
  }
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
// Scene geometry: where the subject lands, which corner the wordmark takes
// ---------------------------------------------------------------------------------------------

/** Source size + crop rect (source px -> output px) of a scene's first frame. */
async function sceneGeometry(scene, clipInfo) {
  if (scene.clip) {
    const info = clipInfo.get(scene.clip);
    if (!info?.width) return null;
    return { iw: info.width, ih: info.height, crop: clipCropRect(info.width, info.height, { width: W, height: H, focus: scene.focus, zoom: scene.zoom }) };
  }
  if (!scene.photo) return null;
  const { width: iw, height: ih } = await photoSize(scene.photo);
  // Stills are prepared at 2x and Ken Burns starts at (about) zoom 1: map through the 2x crop, then halve.
  const c = coverCropRect(iw, ih, { width: W * 2, height: H * 2, focus: scene.focus });
  if (!c) return { iw, ih, crop: null };
  return { iw, ih, crop: { ...c, scale: c.scale / 2 } };
}

/** Small grey sample (W/4 x H/4) of a scene's first frame, for the saliency pick. */
async function sampleFrame(scene, dir) {
  const w = W / 4, h = H / 4;
  if (scene.clip) {
    const f = parseFocus(scene.focus);
    const fx = typeof f === 'object' ? f.x : 0.5, fy = typeof f === 'object' ? f.y : 0.5;
    const out = path.join(dir, `sample-${scene.index}.png`);
    const z = scene.zoom || 1;
    await runFfmpeg(['-y', '-loglevel', 'error', '-ss', String(r3(scene.clipStart ?? 0)), '-i', scene.clip, '-frames:v', '1',
      '-vf', `scale=${Math.round(w * z)}:${Math.round(h * z)}:force_original_aspect_ratio=increase,crop=${w}:${h}:(iw-${w})*${fx}:(ih-${h})*${fy}`, out], { label: 'sample' });
    return sharp(out).greyscale().raw().toBuffer({ resolveWithObject: true });
  }
  if (scene.photo) return (await loadPhoto(scene.photo, { width: w, height: h, focus: scene.focus })).greyscale().raw().toBuffer({ resolveWithObject: true });
  return null;
}

/** Detail (mean absolute Laplacian) + brightness penalty inside an output-px box of a grey sample. */
function cornerBusyness(sample, box) {
  const { data, info } = sample;
  const k = info.width / W;
  const x0 = Math.max(1, Math.round(box.x * k)), x1 = Math.min(info.width - 2, Math.round((box.x + box.w) * k));
  const y0 = Math.max(1, Math.round(box.y * k)), y1 = Math.min(info.height - 2, Math.round((box.y + box.h) * k));
  let lap = 0, lum = 0, n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * info.width + x;
      const v = data[i];
      lap += Math.abs(4 * v - data[i - 1] - data[i + 1] - data[i - info.width] - data[i + info.width]);
      lum += v;
      n++;
    }
  }
  if (!n) return 0;
  return lap / n + Math.max(0, lum / n - 150) * 0.25; // a white wordmark also needs a darker patch
}

const overlaps = (a, b) => a && b && a.left < b.x + b.w && a.left + a.width > b.x && a.top < b.y + b.h && a.top + a.height > b.y;

async function pickLogoCorner(scene, subjectRect, dir) {
  if (scene.logo) return scene.logo;
  const hitL = overlaps(subjectRect, LOGO_BOX.left), hitR = overlaps(subjectRect, LOGO_BOX.right);
  if (hitL && !hitR) return 'right';
  if (hitR && !hitL) return 'left';
  try {
    const sample = await sampleFrame(scene, dir);
    if (!sample) return 'left';
    const l = cornerBusyness(sample, LOGO_BOX.left), r = cornerBusyness(sample, LOGO_BOX.right);
    return r + 1.5 < l ? 'right' : 'left'; // prefer the left (reading order) unless the right is clearly calmer
  } catch (err) {
    log.warn(`renderVideo: saliency sample failed for scene ${scene.index + 1}: ${err.message.split('\n')[0]}`);
    return 'left';
  }
}

// ---------------------------------------------------------------------------------------------
// Overlays (Playwright)
// ---------------------------------------------------------------------------------------------

async function renderOverlays(scenes, brand, dir, body, geo) {
  const css = ['creative.css', 'video.css'];
  const doc = (body, transparent = true) => htmlDocument({ body, css, colors: brand.colors, width: W, height: H, transparent });
  const files = { scrim: {}, text: [], hookBase: null, outroBg: path.join(dir, 'outro-bg.png'), outroFg: path.join(dir, 'outro-fg.png'), fallback: null };
  await withPage(VIDEO_SIZE, async (render) => {
    for (const side of ['left', 'right']) {
      const scrim = await render(doc(`<div class="v v-scrim"><div class="v-brand ${side}"><img src="${brand.logo.reverse}" alt="Dhiti"></div></div>`), { transparent: true });
      files.scrim[side] = path.join(dir, `scrim-${side}.png`);
      await fs.writeFile(files.scrim[side], scrim.buffer);
    }
    for (const s of scenes) {
      if (!s.text) {
        files.text.push(null);
        continue;
      }
      const inner = (extra = '') => `<div class="v${extra}">${subjectMarker(geo[s.index]?.subjectRect, 'face')}<div class="v-safe" data-fit-box="scene-${s.index + 1}" data-fit-min="0.45" data-text-scope>
        ${s.eyebrow ? `<div class="v-kicker">${escapeHtml(s.eyebrow)}</div>` : ''}
        <h1 class="v-text${s.index === 0 ? ' hook' : ''}">${richText(s.text)}</h1>
        <div class="v-rule"></div>
      </div></div>`;
      const { buffer, report } = await render(doc(inner()), { transparent: true });
      assertNoCollisions(report, `reel scene ${s.index + 1}`);
      const f = path.join(dir, `text-${s.index}.png`);
      await fs.writeFile(f, buffer);
      files.text.push(f);
      if (s.index === 0) {
        // Hook: the same text without highlight boxes, visible from frame 0; the boxed version fades in over it.
        const base = await render(doc(inner(' no-hl-box')), { transparent: true });
        files.hookBase = path.join(dir, 'text-0-base.png');
        await fs.writeFile(files.hookBase, base.buffer);
      }
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
async function prepareStill(src, out, focus) {
  const img = await loadPhoto(src, { width: W * 2, height: H * 2, focus });
  await img.jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(out);
  return out;
}

/** Text layer animation. fadeOutEnd = null keeps the text up to the last frame (hard cut). */
function textFilters(fadeOutEnd) {
  const rise = `if(lt(t,${TEXT_IN_AT}),${RISE_PX},if(lt(t,${TEXT_IN_AT + TEXT_IN_DUR}),${RISE_PX}*pow(1-(t-${TEXT_IN_AT})/${TEXT_IN_DUR},3),0))`;
  const out = fadeOutEnd == null ? '' : `,fade=t=out:st=${r3(Math.max(TEXT_IN_AT + TEXT_IN_DUR + 0.2, fadeOutEnd - TEXT_OUT_DUR))}:d=${TEXT_OUT_DUR}:alpha=1`;
  return { prep: `format=rgba,fade=t=in:st=${TEXT_IN_AT}:d=${TEXT_IN_DUR}:alpha=1${out}`, y: `'${rise}'` };
}

async function encodeScene(scene, len, { overlays, dir, clipCursor, fadeOutEnd, clipInfo, logoSide }) {
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
    const f = parseFocus(scene.focus);
    const fx = typeof f === 'object' ? f.x : 0.5;
    const fy = typeof f === 'object' ? f.y : 0.5;
    const zw = Math.round(W * scene.zoom), zh = Math.round(H * scene.zoom);
    bgChain = `[0:v]scale=${zw}:${zh}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}:(iw-${W})*${fx}:(ih-${H})*${fy},setsar=1,fps=${FPS},format=gbrp,trim=end_frame=${n},setpts=PTS-STARTPTS[bg]`;
  } else {
    const still = await prepareStill(scene.photo || overlays.fallback, path.join(dir, `still-${scene.index}.jpg`), scene.photo ? scene.focus : 'center');
    const m = MOTIONS[scene.index % MOTIONS.length];
    const p = `(on/${Math.max(1, n - 1)})`;
    const z = `${m.z0}+(${r3(m.z1 - m.z0)})*${p}`;
    const x = `(iw-iw/zoom)*(${m.x0}+(${r3(m.x1 - m.x0)})*${p})`;
    const y = `(ih-ih/zoom)*(${m.y0}+(${r3(m.y1 - m.y0)})*${p})`;
    args.push('-i', still);
    bgChain = `[0:v]zoompan=z='${z}':x='${x}':y='${y}':d=${n}:s=${W}x${H}:fps=${FPS},setsar=1,format=gbrp,trim=end_frame=${n},setpts=PTS-STARTPTS[bg]`;
  }
  args.push('-loop', '1', '-framerate', String(FPS), '-t', String(r3(len)), '-i', overlays.scrim[logoSide] || overlays.scrim.left);
  const textFile = overlays.text[scene.index];
  const chains = [bgChain, `[1:v]format=rgba[scrim]`, `[bg][scrim]overlay=0:0:format=gbrp:shortest=0[b1]`];
  if (textFile && scene.index === 0 && overlays.hookBase) {
    // Hook: base text static from frame 0; the highlighted version fades in over it (only the boxes change).
    args.push('-loop', '1', '-framerate', String(FPS), '-t', String(r3(len)), '-i', overlays.hookBase);
    args.push('-loop', '1', '-framerate', String(FPS), '-t', String(r3(len)), '-i', textFile);
    const outFade = fadeOutEnd == null ? '' : `,fade=t=out:st=${r3(Math.max(1, fadeOutEnd - TEXT_OUT_DUR))}:d=${TEXT_OUT_DUR}:alpha=1`;
    chains.push(`[2:v]format=rgba${outFade}[base]`, `[3:v]format=rgba,fade=t=in:st=${HOOK_HL_AT}:d=${HOOK_HL_DUR}:alpha=1${outFade}[hl]`,
      `[b1][base]overlay=0:0:format=gbrp[b2]`, `[b2][hl]overlay=0:0:format=gbrp[b3]`, `[b3]${TO_YUV}[out]`);
  } else if (textFile) {
    args.push('-loop', '1', '-framerate', String(FPS), '-t', String(r3(len)), '-i', textFile);
    const t = textFilters(fadeOutEnd);
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

/** Hard cuts between content scenes, then one fade to black into the outro (the last content part carries XFADE extra). */
async function joinCutsThenFade(parts, lens, out, dir) {
  const k = parts.length - 1; // content parts; the last part is the outro
  const contentLen = lens.slice(0, k).reduce((a, b) => a + b, 0);
  // 1) Content scenes share one intermediate encoding, so the concat demuxer joins them losslessly (stream copy).
  const list = path.join(dir, 'content.txt');
  await fs.writeFile(list, parts.slice(0, k).map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const content = path.join(dir, 'content.mp4');
  await runFfmpeg(['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', content], { label: 'join (content cuts)' });
  // 2) One fade to black into the end card.
  return joinXfade([content, parts[k]], [contentLen, lens[k]], 'fadeblack', out);
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

/** Replaces the silent track with the voiceover: delayed by VO_LEAD, -14 LUFS, padded/trimmed to the reel length. */
async function mixVoiceover(videoFile, voFile, total, out) {
  const a = `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${Math.round(VO_LEAD * 1000)}:all=1,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,apad,atrim=0:${r3(total)},afade=t=out:st=${r3(Math.max(0, total - 0.4))}:d=0.4[a]`;
  await runFfmpeg([
    '-y', '-loglevel', 'error', '-i', videoFile, '-i', voFile,
    '-filter_complex', a, '-map', '0:v', '-map', '[a]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    '-movflags', '+faststart', '-t', String(r3(total)), out,
  ], { label: 'voiceover mix' });
  return out;
}

/**
 * renderVideo(body, {brand, workDir, keepWork}) ->
 *   { mp4: Buffer, poster: Buffer (JPEG 1080x1920), posterMime: 'image/jpeg', duration: seconds, width, height, fps, timeline }
 * body = { scenes: [{ duration, on_screen_text, clip|null, photo|null, eyebrow?, clip_start?, focus?, zoom?, subject?, logo? }],
 *          transition?: 'cut' (default: hard cuts, fade into the outro) | 'fadeblack' | other xfade name,
 *          outro_text?: action line on the end card (default "Operations teams for the travel industry"),
 *          outro_vo_line?: the spoken call to action, voiced over the end card,
 *          voiceover_path?: local audio file (scenes are re-timed to it using scenes[].vo_line word counts) }
 * workDir: scratch directory (a unique subfolder is created inside and removed afterwards unless keepWork).
 */
export async function renderVideo(body, { brand, workDir, keepWork = false } = {}) {
  let voFile = null;
  let voDuration = null;
  if (body?.voiceover_path) {
    if (!fileOk(body.voiceover_path)) throw new Error(`renderVideo: voiceover not found: ${body.voiceover_path}`);
    voFile = path.resolve(String(body.voiceover_path).trim());
    const vi = await probeMedia(voFile);
    if (!vi.hasAudio || !(vi.duration > 0)) throw new Error(`renderVideo: ${voFile} has no readable audio`);
    voDuration = vi.duration;
  }
  const scenes = planScenes(body, voDuration);
  const outroLen = scenes.outro || OUTRO_SECONDS;
  const resolved = await resolveBrand(brand);
  const base = workDir ? path.resolve(workDir) : os.tmpdir();
  await fs.mkdir(base, { recursive: true });
  const dir = await fs.mkdtemp(path.join(base, 'reel-'));
  const started = Date.now();
  try {
    let transition = String(body?.transition || DEFAULT_TRANSITION).toLowerCase();
    if (!TRANSITIONS.has(transition)) transition = DEFAULT_TRANSITION;
    const cut = transition === 'cut';

    const clipInfo = new Map();
    for (const s of scenes) if (s.clip && !clipInfo.has(s.clip)) clipInfo.set(s.clip, await probeMedia(s.clip));

    // Subject boxes in output px and the wordmark corner per scene.
    const geo = [];
    for (const s of scenes) {
      const g = s.subject ? await sceneGeometry(s, clipInfo) : null;
      if (s.subject && !g?.crop) throw new Error(`renderVideo: scene ${s.index + 1} has "subject" but no explicit focus ({x,y}); the crop must be known to check it`);
      const subjectRect = g ? subjectInOutput(s.subject, g.crop, g.iw, g.ih) : null;
      geo[s.index] = { subjectRect, logo: await pickLogoCorner(s, subjectRect, dir) };
    }

    const overlays = await renderOverlays(scenes, resolved, dir, body, geo);

    // Crossfade mode: every scene is extended by XFADE so the total stays sum(durations) + outro. Cut mode: only the
    // last content scene is (it fades into the outro).
    const last = scenes.length - 1;
    const lens = [...scenes.map((s) => s.duration + (!cut || s.index === last ? XFADE : 0)), outroLen];
    const clipCursor = new Map();
    const parts = [];
    for (const s of scenes) {
      const len = lens[s.index];
      const fadeOutEnd = cut ? (s.index === last ? len - XFADE : null) : len - XFADE;
      parts.push(await encodeScene(s, len, { overlays, dir, clipCursor, clipInfo, fadeOutEnd, logoSide: geo[s.index].logo }));
    }
    parts.push(await encodeOutro(outroLen, overlays, dir));

    const outFile = path.join(dir, voFile ? 'reel-silent.mp4' : 'reel.mp4');
    let joinedWith = transition;
    try {
      if (cut) await joinCutsThenFade(parts, lens, outFile, dir);
      else await joinXfade(parts, lens, transition, outFile);
    } catch (err) {
      log.warn(`renderVideo: join failed, falling back to plain hard cuts: ${err.message.split('\n')[0]}`);
      joinedWith = 'concat';
      await joinConcat(parts, lens, outFile, dir);
    }

    let finalFile = outFile;
    if (voFile) {
      const silent = await probeMedia(outFile);
      finalFile = await mixVoiceover(outFile, voFile, silent.duration, path.join(dir, 'reel.mp4'));
    }
    const info = await probeMedia(finalFile);
    if (info.width !== W || info.height !== H) throw new Error(`renderVideo: unexpected output size ${info.width}x${info.height}`);

    // Timeline (output seconds) for captions / review.
    const timeline = [];
    let t = 0;
    scenes.forEach((s, i) => {
      timeline.push({ scene: i + 1, start: r3(t), duration: r3(s.duration), text: plainText(s.text), source: s.clip ? 'clip' : s.photo ? 'photo' : 'fallback', logo: geo[i].logo });
      t += joinedWith === 'concat' ? lens[i] : cut ? (i === last ? lens[i] - XFADE : lens[i]) : lens[i] - XFADE;
    });
    timeline.push({ scene: 'outro', start: r3(t), duration: r3(outroLen) });

    // Poster: the hook with its text and highlight fully visible.
    const posterAt = Math.min(HOOK_HL_AT + HOOK_HL_DUR + 0.3, Math.max(0.1, scenes[0].duration - 0.5));
    const posterPng = path.join(dir, 'poster.png');
    await runFfmpeg(['-y', '-loglevel', 'error', '-ss', String(r3(posterAt)), '-i', finalFile, '-frames:v', '1', '-update', '1', posterPng], { label: 'poster' });
    const poster = await sharp(posterPng).jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' }).toBuffer();
    const mp4 = await fs.readFile(finalFile);
    log(`renderVideo: ${scenes.length} scenes + outro, ${info.duration.toFixed(2)}s, ${(mp4.length / 1e6).toFixed(1)} MB, ${joinedWith}${voFile ? `, voiceover ${voDuration.toFixed(2)}s` : ''}, ${((Date.now() - started) / 1000).toFixed(1)}s`);
    return { mp4, poster, posterMime: 'image/jpeg', duration: r3(info.duration), width: W, height: H, fps: FPS, transition: joinedWith, timeline, voiceover_duration: voDuration ? r3(voDuration) : null };
  } finally {
    if (!keepWork) await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
