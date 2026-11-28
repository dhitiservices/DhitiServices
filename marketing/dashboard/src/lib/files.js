// What the media library accepts, checked by extension, declared type AND the file's first bytes (a renamed HEIC
// or a text file called .mp3 is caught before anything is uploaded).

const MB = 1024 * 1024;

export const ACCEPT = {
  photo: { exts: ["jpg", "jpeg", "png", "webp"], max: 40 * MB, label: "JPG, PNG or WebP" },
  audio: { exts: ["mp3", "m4a", "wav"], max: 50 * MB, label: "MP3, M4A or WAV" },
  video: { exts: ["mp4", "mov"], max: 500 * MB, label: "MP4 or MOV" },
};
export const ACCEPT_ATTR = ".jpg,.jpeg,.png,.webp,.heic,.heif,.mp3,.m4a,.wav,.mp4,.mov,image/jpeg,image/png,image/webp,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,video/mp4,video/quicktime";
export const AUDIO_ACCEPT_ATTR = ".mp3,.m4a,.wav,audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav";

const MIME = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav",
  mp4: "video/mp4", mov: "video/quicktime",
};

export const extOf = (name = "") => (name.includes(".") ? name.split(".").pop().toLowerCase() : "");

async function head(file, n = 16) {
  const buf = await file.slice(0, n).arrayBuffer();
  return new Uint8Array(buf);
}
const ascii = (b, from, to) => String.fromCharCode(...b.slice(from, to));

/** Detected container from magic bytes: jpeg | png | webp | heic | mp3 | wav | mp4 (ISO BMFF: m4a/mp4/mov) | null */
export async function sniff(file) {
  let b;
  try { b = await head(file, 16); } catch { return null; }
  if (b.length < 4) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x89 && ascii(b, 1, 4) === "PNG") return "png";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "webp";
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE") return "wav";
  if (ascii(b, 4, 8) === "ftyp") {
    const brand = ascii(b, 8, 12).toLowerCase();
    if (/^(heic|heix|heim|heis|hevc|hevx|mif1|msf1|avif)/.test(brand)) return "heic";
    return "mp4";
  }
  if (ascii(b, 0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "mp3";
  return null;
}

const SNIFF_OK = { jpg: ["jpeg"], jpeg: ["jpeg"], png: ["png"], webp: ["webp"], mp3: ["mp3"], wav: ["wav"], m4a: ["mp4"], mp4: ["mp4"], mov: ["mp4"] };

const HEIC_MSG = "HEIC photos aren't supported. On iPhone, share the photo as JPEG (or set Settings › Camera › Formats to Most Compatible) and upload that.";

/**
 * -> { ok: true, group: 'photo'|'audio'|'video', kind, mime } | { ok: false, error }
 * `only` limits the groups (the voiceover drop zone passes ['audio']).
 */
export async function checkFile(file, { only } = {}) {
  const ext = extOf(file.name);
  const type = (file.type || "").toLowerCase();
  if (ext === "heic" || ext === "heif" || /heic|heif/.test(type)) return { ok: false, error: HEIC_MSG };
  const group = Object.keys(ACCEPT).find((g) => ACCEPT[g].exts.includes(ext));
  const allowed = only || Object.keys(ACCEPT);
  if (!group || !allowed.includes(group)) {
    const list = allowed.map((g) => ACCEPT[g].label).join("; ");
    return { ok: false, error: `${ext ? `.${ext} files aren't` : "This file type isn't"} supported. Use ${list}.` };
  }
  if (file.size === 0) return { ok: false, error: "The file is empty." };
  if (file.size > ACCEPT[group].max) return { ok: false, error: `Over ${ACCEPT[group].max / MB} MB. Export a smaller file and try again.` };
  const real = await sniff(file);
  if (real === "heic") return { ok: false, error: HEIC_MSG };
  if (!real || !SNIFF_OK[ext].includes(real)) return { ok: false, error: `This doesn't look like a real .${ext} file. Re-export it and try again.` };
  const kind = group === "photo" ? "photo" : group === "video" ? "video" : "voiceover";
  return { ok: true, group, kind, mime: MIME[ext] };
}

/** Duration in seconds of a local audio/video file, or null. */
export function mediaDuration(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type.startsWith("video/") || /\.(mp4|mov)$/i.test(file.name) ? "video" : "audio");
    let settled = false;
    const done = (v) => { if (settled) return; settled = true; URL.revokeObjectURL(url); resolve(v); };
    el.preload = "metadata";
    el.onloadedmetadata = () => done(Number.isFinite(el.duration) ? el.duration : null);
    el.onerror = () => done(null);
    setTimeout(() => done(null), 8000);
    el.src = url;
  });
}

/** Pixel size of a local image, or null. */
export function imageSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    img.src = url;
  });
}
