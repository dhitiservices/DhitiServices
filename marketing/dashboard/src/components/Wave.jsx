import { useEffect, useRef, useState } from "react";
import { Play, Pause, AudioLines } from "lucide-react";
import { useSignedUrl } from "../lib/media.js";
import { cx } from "./ui.jsx";

/* Waveform peaks, decoded in the browser from the local file (before upload) or the signed URL (library).
   Cached per file/path; decoded only once the player scrolls into view. */
const cache = new Map();
const inflight = new Map();

async function decodePeaks(getBuffer, bars) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) throw new Error("No Web Audio");
  const ctx = new Ctx();
  try {
    const audio = await ctx.decodeAudioData(await getBuffer());
    const data = audio.getChannelData(0);
    const step = Math.max(1, Math.floor(data.length / bars));
    const stride = Math.max(1, Math.floor(step / 400)); // sample ~400 points per bar: fast and accurate enough
    const peaks = [];
    for (let i = 0; i < bars; i++) {
      let max = 0;
      for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j += stride) { const v = Math.abs(data[j]); if (v > max) max = v; }
      peaks.push(max);
    }
    const top = Math.max(...peaks, 0.0001);
    return { peaks: peaks.map((p) => Math.max(0.06, Math.pow(p / top, 0.8))), duration: audio.duration };
  } finally {
    ctx.close?.().catch(() => {});
  }
}

function usePeaks({ cacheKey, file, url, bars, visible }) {
  const [state, setState] = useState(() => cache.get(cacheKey) || null);
  useEffect(() => {
    if (!cacheKey || !visible) return undefined;
    if (cache.has(cacheKey)) { setState(cache.get(cacheKey)); return undefined; }
    if (!file && !url) return undefined;
    let alive = true;
    if (!inflight.has(cacheKey)) {
      const getBuffer = file ? () => file.arrayBuffer() : () => fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); });
      inflight.set(cacheKey, decodePeaks(getBuffer, bars).then((v) => { cache.set(cacheKey, v); return v; }).finally(() => inflight.delete(cacheKey)));
    }
    inflight.get(cacheKey).then((v) => alive && setState(v)).catch(() => alive && setState({ peaks: null, failed: true }));
    return () => { alive = false; };
  }, [cacheKey, file, url, bars, visible]);
  return state;
}

function useVisible(ref) {
  const [v, setV] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || v) return undefined;
    if (!("IntersectionObserver" in window)) { setV(true); return undefined; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setV(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, v]);
  return v;
}

const fmt = (n) => (Number.isFinite(n) ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}` : "0:00");

/**
 * Audio player with a real waveform: play/pause, click or arrow keys to seek, elapsed/total time.
 * Pass `file` (a local File before upload) or `path` (a storage path) or `url`.
 */
export function WavePlayer({ file, path, url: directUrl, bars = 56, label = "Voiceover", tone = "violet", className, onDuration }) {
  const signed = useSignedUrl(path);
  const [objectUrl, setObjectUrl] = useState(null);
  useEffect(() => {
    if (!file) { setObjectUrl(null); return undefined; }
    const u = URL.createObjectURL(file);
    setObjectUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  const src = objectUrl || directUrl || signed.url;
  const box = useRef(null);
  const visible = useVisible(box);
  const key = file ? `file:${file.name}:${file.size}:${file.lastModified}:${bars}` : path ? `path:${path}:${bars}` : directUrl ? `url:${directUrl}:${bars}` : null;
  const wave = usePeaks({ cacheKey: key, file, url: file ? null : src, bars, visible });
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const duration = dur || wave?.duration || 0;
  useEffect(() => { if (duration) onDuration?.(duration); }, [duration]); // eslint-disable-line react-hooks/exhaustive-deps

  const pct = duration ? Math.min(1, t / duration) : 0;
  const color = tone === "violet" ? "bg-violet" : "bg-brand";
  const toggle = () => { const a = audio.current; if (a) a.paused ? a.play().catch(() => {}) : a.pause(); };
  const failed = signed.error || wave?.failed;

  return (
    <div ref={box} className={cx("flex h-12 items-center gap-3 rounded-2xl bg-surface pl-1.5 pr-3.5 shadow-[0_0_0_1px_var(--hairline)]", className)}>
      {src && (
        <audio
          ref={audio}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setT(0); }}
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDur(e.currentTarget.duration)}
          onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
          onError={() => signed.retry?.()}
        />
      )}
      <button
        type="button"
        onClick={toggle}
        disabled={!src}
        aria-label={playing ? `Pause ${label}` : `Play ${label}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-canvas transition-transform active:scale-95 disabled:opacity-40"
      >
        {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />}
      </button>
      <div className="relative flex h-8 min-w-0 flex-1 items-center">
        {wave?.peaks ? (
          <div className="flex h-full w-full items-center gap-[2px]" aria-hidden>
            {wave.peaks.map((p, i) => (
              <span
                key={i}
                className={cx("min-w-[1.5px] flex-1 rounded-full transition-colors duration-150", i / wave.peaks.length < pct ? color : "bg-ink/[0.16]")}
                style={{ height: `${Math.round(p * 100)}%` }}
              />
            ))}
          </div>
        ) : failed ? (
          <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink-mute"><AudioLines className="h-4 w-4" /> Waveform unavailable</div>
        ) : (
          <div className="skeleton h-3 w-full rounded-full" />
        )}
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(t, duration || 0)}
          disabled={!duration}
          aria-label={`Seek ${label}`}
          aria-valuetext={`${fmt(t)} of ${fmt(duration)}`}
          onChange={(e) => { const a = audio.current; if (a) { a.currentTime = Number(e.target.value); setT(a.currentTime); } }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <span className="tnum shrink-0 text-[12px] font-medium text-ink-mute">{playing || t ? `${fmt(t)} / ${fmt(duration)}` : fmt(duration)}</span>
    </div>
  );
}
