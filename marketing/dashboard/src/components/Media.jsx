import { useEffect, useRef, useState } from "react";
import { ImageOff, Play, Pause } from "lucide-react";
import { useSignedUrl } from "../lib/media.js";
import { cx } from "./ui.jsx";

/**
 * Image from the private bucket: skeleton shimmer until the bytes arrive, then a soft fade/scale-in.
 * `path` is a storage path; `src` (already-public URL) also works.
 */
export function SignedImage({ path, src, alt = "", className, imgClassName, fit = "cover", eager, onLoad, style }) {
  const signed = useSignedUrl(src ? null : path);
  const url = src || signed.url;
  const retry = signed.retry;
  // Track which URL finished loading (a cached image can fire onLoad before effects run).
  const [loadedUrl, setLoadedUrl] = useState(null);
  const [failedUrl, setFailedUrl] = useState(null);
  const imgRef = useRef(null);
  const loaded = !!url && loadedUrl === url;
  const failed = !!url && failedUrl === url;
  useEffect(() => {
    const el = imgRef.current;
    if (el && url && el.complete && el.naturalWidth > 0) setLoadedUrl(url);
  }, [url]);
  const broken = failed || signed.error || (!url && !path && !src);

  return (
    <div className={cx("relative overflow-hidden bg-ink/[0.05]", className)} style={style}>
      {!loaded && !broken && <div className="skeleton absolute inset-0 rounded-none" />}
      {broken ? (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#2a1512] via-[#1c1c21] to-[#15161a] text-white/40">
          <ImageOff className="h-5 w-5" strokeWidth={1.8} />
        </div>
      ) : url ? (
        <img
          ref={imgRef}
          src={url}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => { setLoadedUrl(url); onLoad?.(); }}
          onError={() => { if (src || !retry()) setFailedUrl(url); }}
          className={cx(
            "h-full w-full transition-[opacity,transform] duration-500 ease-apple",
            fit === "contain" ? "object-contain" : "object-cover",
            loaded ? "scale-100 opacity-100" : "scale-[1.015] opacity-0",
            imgClassName,
          )}
        />
      ) : null}
    </div>
  );
}

export function SignedVideo({ path, posterPath, className, ...rest }) {
  const v = useSignedUrl(path);
  const p = useSignedUrl(posterPath);
  const ref = useRef(null);
  const resumeAt = useRef(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [path]);
  // An expired URL (after sleep) fails on the next range request: re-sign once and continue where it stopped.
  const onError = () => {
    resumeAt.current = ref.current?.currentTime || 0;
    if (!v.retry()) setFailed(true);
  };
  const broken = failed || v.error;
  return (
    <div className={cx("relative overflow-hidden bg-black", className)}>
      {!v.url && !broken && <div className="skeleton absolute inset-0 rounded-none !bg-white/5" />}
      {broken && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/55" role="alert">
          <ImageOff className="h-5 w-5" strokeWidth={1.8} />
          <span className="text-[12.5px] font-medium">Video unavailable</span>
        </div>
      )}
      {v.url && !broken && (
        <video
          ref={ref}
          src={v.url}
          poster={p.url || undefined}
          controls
          playsInline
          preload="metadata"
          onError={onError}
          onLoadedMetadata={(e) => { if (resumeAt.current) { e.currentTarget.currentTime = resumeAt.current; resumeAt.current = 0; } }}
          className="h-full w-full object-cover"
          {...rest}
        />
      )}
    </div>
  );
}

/** Compact native-feeling audio player (play/pause, scrubber, time) for voiceovers and music. */
export function SignedAudio({ path, className, label = "Voiceover" }) {
  const { url, error, retry } = useSignedUrl(path);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [path]);
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [dur, setDur] = useState(0);
  const fmt = (n) => (Number.isFinite(n) ? `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}` : "0:00");
  const toggle = () => {
    const a = ref.current;
    if (!a) return;
    a.paused ? a.play().catch(() => {}) : a.pause();
  };
  if (failed || error) {
    return (
      <div className={cx("flex h-10 items-center gap-2 rounded-full bg-surface px-3.5 text-[12.5px] font-medium text-ink-mute shadow-[0_0_0_1px_var(--hairline)]", className)} role="alert">
        <ImageOff className="h-4 w-4" strokeWidth={1.8} /> Audio unavailable
      </div>
    );
  }
  if (!url) return <div className={cx("skeleton h-10 rounded-full", className)} />;
  const pct = dur ? (t / dur) * 100 : 0;
  return (
    <div className={cx("flex h-10 items-center gap-2.5 rounded-full bg-surface pl-1 pr-3.5 shadow-[0_0_0_1px_var(--hairline)]", className)}>
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onError={() => { if (!retry()) setFailed(true); }}
      />
      <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-canvas transition-transform active:scale-95">
        {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />}
      </button>
      <div className="group relative h-6 flex-1">
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink/[0.1]" />
        <div className="pointer-events-none absolute left-0 top-1/2 h-1 w-full origin-left -translate-y-1/2 rounded-full bg-violet" style={{ transform: `translateY(-50%) scaleX(${pct / 100})` }} />
        {/* A real range input: keyboard (arrows, Home/End) and screen readers work. */}
        <input
          type="range"
          min={0}
          max={dur || 0}
          step={0.1}
          value={Math.min(t, dur || 0)}
          disabled={!dur}
          aria-label={`Seek ${label}`}
          aria-valuetext={`${fmt(t)} of ${fmt(dur)}`}
          onChange={(e) => { const a = ref.current; if (a) { a.currentTime = Number(e.target.value); setT(a.currentTime); } }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
      <span className="tnum shrink-0 text-[11.5px] font-medium text-ink-mute">{fmt(playing || t ? t : dur)}</span>
    </div>
  );
}
