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
          onError={() => setFailedUrl(url)}
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
  return (
    <div className={cx("relative overflow-hidden bg-black", className)}>
      {!v.url && <div className="skeleton absolute inset-0 rounded-none !bg-white/5" />}
      {v.url && (
        <video
          key={v.url}
          src={v.url}
          poster={p.url || undefined}
          controls
          playsInline
          preload="metadata"
          className="h-full w-full object-cover"
          {...rest}
        />
      )}
    </div>
  );
}

/** Compact native-feeling audio player (play/pause, scrubber, time) for voiceovers and music. */
export function SignedAudio({ path, className }) {
  const { url } = useSignedUrl(path);
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
  const seek = (e) => {
    const a = ref.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur;
  };
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
      />
      <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-canvas transition-transform active:scale-95">
        {playing ? <Pause className="h-3.5 w-3.5" fill="currentColor" /> : <Play className="ml-0.5 h-3.5 w-3.5" fill="currentColor" />}
      </button>
      <div onClick={seek} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={Math.round(dur)} aria-valuenow={Math.round(t)} className="group relative h-6 flex-1 cursor-pointer">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink/[0.1]" />
        <div className="absolute left-0 top-1/2 h-1 w-full origin-left -translate-y-1/2 rounded-full bg-violet" style={{ transform: `translateY(-50%) scaleX(${pct / 100})` }} />
      </div>
      <span className="tnum shrink-0 text-[11.5px] font-medium text-ink-mute">{fmt(playing || t ? t : dur)}</span>
    </div>
  );
}
