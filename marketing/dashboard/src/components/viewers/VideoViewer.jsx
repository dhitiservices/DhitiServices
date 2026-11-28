import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Mic, UploadCloud, Clock3, FileAudio, AlertTriangle, Timer, VolumeX, X, Library } from "lucide-react";
import { useData } from "../../lib/store.jsx";
import { assetsFor, captionOf } from "../../lib/model.js";
import { downloadPath, downloadName } from "../../lib/media.js";
import { relative, seconds, bytes } from "../../lib/format.js";
import { SignedVideo } from "../Media.jsx";
import { WavePlayer } from "../Wave.jsx";
import { Sheet } from "../Sheet.jsx";
import { checkFile, mediaDuration, AUDIO_ACCEPT_ATTR } from "../../lib/files.js";
import { Button, IconButton, CopyButton, EmptyState, Chip, cx } from "../ui.jsx";
import { MetaSection, MetaRow, CaptionBox, Hashtags } from "./Meta.jsx";

export function videoAssets(assets, item) {
  const list = assetsFor(assets, item.id);
  return { video: list.find((a) => a.kind === "video"), poster: list.find((a) => a.kind === "video_poster") };
}

/** Header "Upload voiceover" button and the U key ask the studio to open its picker (or show what is staged). */
export const VO_UPLOAD_EVENT = "dhiti:voiceover-upload";
export const requestVoiceoverUpload = () => window.dispatchEvent(new CustomEvent(VO_UPLOAD_EVENT));

/** One status label for a reel while the owner-voiceover step runs (replaces "Needs voiceover" while rendering). */
export function voiceoverChip(item, jobs) {
  if (item?.status !== "awaiting_voiceover") return null;
  const vo = voiceoverState(item, jobs);
  if (vo.state !== "rendering") return null;
  return vo.job.status === "running" ? { label: "Rendering", tone: "active", pulse: true } : { label: "Queued for render", tone: "active", pulse: true };
}

/** Where the owner-voiceover step stands for a reel: idle | rendering (queued/running) | failed. */
export function voiceoverState(item, jobs) {
  const list = jobs
    .filter((j) => j.kind === "render_video" && j.payload?.content_item_id === item.id)
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const latest = list[0];
  if (latest && (latest.status === "queued" || latest.status === "running")) return { state: "rendering", job: latest };
  // A failure belongs to this cycle only if it was requested after the item last changed (a new script resets it).
  if (latest && latest.status === "failed" && (latest.created_at || "") > (item.updated_at || "")) return { state: "failed", job: latest };
  return { state: "idle", job: null };
}

export function VideoStage({ item }) {
  const { assets, jobs } = useData();
  const { video, poster } = videoAssets(assets, item);
  const awaiting = item.status === "awaiting_voiceover";
  const vo = awaiting ? voiceoverState(item, jobs) : { state: "idle" };
  const phone = video ? (
    <div className="relative rounded-[42px] bg-[#0d0d10] p-[10px] shadow-[0_0_0_1px_rgb(255_255_255/0.06)_inset,0_0_0_1px_rgb(0_0_0/0.4),0_30px_80px_-30px_rgb(var(--shadow)/0.55)]">
      <SignedVideo path={video.storage_path} posterPath={poster?.storage_path} className="aspect-[9/16] w-[min(300px,72vw)] rounded-[32px] sm:w-[300px]" />
      <AnimatePresence>
        {vo.state === "rendering" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="vo-aurora absolute inset-[10px] flex flex-col items-center justify-center rounded-[32px] text-center text-white backdrop-blur-[3px]">
            <Bars className="h-10" />
            <div className="mt-4 text-headline font-semibold">{vo.job.status === "running" ? "Rendering with your voice" : "Queued: your voice is next"}</div>
            <div className="mt-1 px-8 text-[12.5px] text-white/70">{vo.job.status === "running" ? "Re-timing scenes and mixing your recording" : "The next revisions run picks it up"}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  ) : <EmptyState title="No reel rendered yet" />;

  if (!awaiting) return <div className="mx-auto flex w-full flex-col items-center">{phone}</div>;
  return (
    <div className="mx-auto w-full max-w-[760px] space-y-8">
      <VoiceoverStudio item={item} vo={vo} />
      <div className="flex flex-col items-center">
        <div className="mb-3 flex items-center gap-2 text-[12.5px] font-medium text-ink-mute">
          <VolumeX className="h-4 w-4" /> Silent captioned preview. Your recording replaces this.
        </div>
        {phone}
      </div>
    </div>
  );
}

function Bars({ className, count = 7 }) {
  return (
    <span className={cx("flex items-center gap-[5px]", className)} aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="vo-bar h-full w-[5px] rounded-full bg-white" style={{ animationDelay: `${(i % 4) * 0.12 + (i > 3 ? 0.06 : 0)}s`, opacity: 0.55 + (i % 3) * 0.15 }} />
      ))}
    </span>
  );
}

const WPS = 2.3; // natural spoken pace the session writes scripts for
const MIN_S = 15; // the render accepts 15 to 40 s (playbook revisions.md section 6)
const MAX_S = 40;
const words = (t) => (t ? String(t).trim().split(/\s+/).filter(Boolean).length : 0);

/**
 * The owner's recording step: read the script (big, copyable), check the per-scene lines, then drop the recording
 * (or reuse a take from the library). Creates the library_assets row and queues render_video.
 */
function VoiceoverStudio({ item, vo }) {
  const { library, actions } = useData();
  const b = item.body || {};
  const scenes = (b.scenes || []).filter((s) => s.vo_line || s.on_screen_text);
  const script = (b.voiceover_script || scenes.map((s) => s.vo_line).filter(Boolean).join(" ")).trim();
  const count = words(script);
  const target = count / WPS;
  const takes = useMemo(() => {
    // Takes recorded for this reel first, then unassigned ones. A take recorded for another reel follows a
    // different script, so it is not offered (the database refuses that render too).
    const all = library.filter((l) => l.kind === "voiceover" && (!l.content_item_id || l.content_item_id === item.id));
    return [...all.filter((l) => l.content_item_id === item.id), ...all.filter((l) => l.content_item_id !== item.id)];
  }, [library, item.id]);

  const [file, setFile] = useState(null);
  const [mime, setMime] = useState(null);
  const [dur, setDur] = useState(null);
  const [progress, setProgress] = useState(null);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState(null);
  const [picking, setPicking] = useState(false);
  const input = useRef(null);
  const zone = useRef(null);
  const zoneButton = useRef(null);
  const uploadArea = useRef(null);
  const rendering = vo.state === "rendering";
  const busy = progress !== null;
  const reveal = (el, block = "nearest") => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block });
  };

  const pick = async (f) => {
    setErr(null);
    if (!f) return;
    const check = await checkFile(f, { only: ["audio"] });
    if (!check.ok) { setFile(null); return setErr(check.error); }
    const d = await mediaDuration(f);
    if (d && (d < MIN_S || d > MAX_S)) {
      setFile(null);
      return setErr(`This recording is ${Math.round(d)} s. Reels need ${MIN_S} to ${MAX_S} s (the script reads in about ${Math.round(target)} s). Record it again at a ${d > MAX_S ? "brisker" : "more relaxed"} pace.`);
    }
    setFile(f); setMime(check.mime); setDur(d);
  };
  const upload = async () => {
    if (!file || busy) return;
    setErr(null);
    setProgress(0);
    try {
      await actions.uploadVoiceover(item, file, { mime, onProgress: setProgress });
      setFile(null); setDur(null);
    } catch (e) { setErr(e.message || "Upload failed"); }
    finally { setProgress(null); }
  };
  const applyTake = async (row) => {
    setErr(null);
    try { await actions.renderWithVoiceover(item, row); setPicking(false); }
    catch (e) { setErr(e.message); setPicking(false); }
  };
  const soft = dur && (dur < 20 || dur > 35);

  // Header button / U key: open the picker, or bring the staged file or the render status into view.
  const stateRef = useRef({});
  stateRef.current = { rendering, file, busy };
  useEffect(() => {
    const on = () => {
      const st = stateRef.current;
      if (st.rendering || st.file || st.busy) { reveal(uploadArea.current, "center"); return; }
      reveal(zone.current, "center");
      zoneButton.current?.focus({ preventScroll: true });
      input.current?.click();
    };
    window.addEventListener(VO_UPLOAD_EVENT, on);
    return () => window.removeEventListener(VO_UPLOAD_EVENT, on);
  }, []);
  // Once a file is staged, uploading, or the render is queued, keep that card on screen.
  useEffect(() => { if (file || rendering) { const t = setTimeout(() => reveal(uploadArea.current), 60); return () => clearTimeout(t); } return undefined; }, [file, rendering]);

  // A recording dropped anywhere on the page lands here (and never makes the browser open the file instead).
  const pickRef = useRef(pick);
  pickRef.current = pick;
  useEffect(() => {
    const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
    const over = (e) => { if (hasFiles(e)) e.preventDefault(); };
    const drop = (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (!rendering && progress === null) pickRef.current(e.dataTransfer.files?.[0]);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => { window.removeEventListener("dragover", over); window.removeEventListener("drop", drop); };
  }, [rendering, progress]);

  return (
    <section className="card overflow-hidden" aria-labelledby="vo-title">
      <div className="relative overflow-hidden px-5 pb-5 pt-5 sm:px-7 sm:pt-6">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-brand/[0.06] to-transparent" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="eyebrow !text-brand-ink">Your voiceover</div>
            <h2 id="vo-title" className="mt-1 text-title-2 font-bold text-ink">Record this script</h2>
          </div>
          <div className="flex items-center gap-2">
            <Chip tone="neutral" dot={false} size="md"><span className="tnum">{count} words</span></Chip>
            <Chip tone="neutral" dot={false} size="md"><Timer className="h-3 w-3" /><span className="tnum">Spoken ~{Math.round(target)} s</span></Chip>
          </div>
        </div>

        <blockquote className="relative mt-5 whitespace-pre-wrap rounded-2xl bg-surface-sunken/70 p-5 text-[19px] font-medium leading-[30px] tracking-[-0.012em] text-ink shadow-[inset_0_0_0_1px_var(--hairline)] sm:p-6 sm:text-[21px] sm:leading-[33px]" data-testid="vo-script">
          {script || <span className="text-ink-faint">No script yet. The next revisions run writes one.</span>}
        </blockquote>
        <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[12.5px] text-ink-mute">Natural pace, about {WPS} words a second. Reels run {MIN_S} to {MAX_S} s; aim for 22 to 35.</span>
          <CopyButton text={script} label="Copy script" variant="secondary" size="md" />
        </div>
      </div>

      <div ref={uploadArea} className="hairline-t scroll-mt-24 bg-ink/[0.015] px-5 py-5 sm:px-7">
        <AnimatePresence mode="wait" initial={false}>
          {rendering ? (
            <motion.div key="rendering" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="vo-aurora flex items-start gap-4 rounded-2xl p-5 text-white" role="status" data-testid="vo-rendering">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10"><Bars className="h-6" count={5} /></span>
              <div className="min-w-0 flex-1">
                <span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-white/[0.12] px-2 text-[11px] font-semibold text-white/90">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white motion-reduce:animate-none" />
                  {vo.job.status === "running" ? "Rendering" : "Queued"}
                </span>
                <div className="mt-2 truncate text-headline font-semibold">{vo.job.status === "running" ? "Rendering with your voice" : "Queued: your voice is next"}</div>
                <div className="mt-0.5 text-[13px] text-white/75">
                  {vo.job.status === "running"
                    ? "Re-timing every scene to your recording and mixing it at broadcast loudness."
                    : "The next revisions run picks it up, then the reel comes back here for review."}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="upload" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
              {vo.state === "failed" && (
                <div className="flex items-start gap-2.5 rounded-xl bg-brand/[0.07] px-3.5 py-3 text-callout text-brand-deep dark:text-brand-bright" role="alert">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div><span className="font-semibold">The last render didn't go through. </span>{vo.job.error || "Upload the recording again."}</div>
                </div>
              )}
              <div
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
                ref={zone}
                className={cx("scroll-mt-24 rounded-2xl border-[1.5px] border-dashed p-4 transition-colors", drag ? "border-brand bg-brand/[0.05]" : "border-ink/[0.14] hover:border-ink/30")}
                data-testid="vo-dropzone"
              >
                <input ref={input} type="file" accept={AUDIO_ACCEPT_ATTR} className="hidden" data-testid="vo-input" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
                {file ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/[0.08] text-brand-ink"><FileAudio className="h-5 w-5" /></span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-callout font-semibold">{file.name}</div>
                        <div className="tnum text-[12px] text-ink-mute">{bytes(file.size)}{dur ? ` · ${dur.toFixed(1)} s` : " · length unknown"}</div>
                      </div>
                      {!busy && <IconButton icon={X} label="Remove recording" size="sm" onClick={() => { setFile(null); setDur(null); }} />}
                    </div>
                    <WavePlayer file={file} label="your recording" bars={64} />
                    {soft && <div className="flex items-center gap-1.5 text-[12px] font-medium text-warn"><AlertTriangle className="h-3.5 w-3.5" /> Works, but reels feel best at 22 to 35 seconds.</div>}
                    {busy && (
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.08]" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Uploading voiceover">
                          <motion.div className="h-full rounded-full bg-brand" initial={false} animate={{ width: `${Math.max(3, progress * 100)}%` }} transition={{ ease: "easeOut", duration: 0.2 }} />
                        </div>
                        <span className="tnum text-[12px] font-semibold text-ink-soft">{Math.round(progress * 100)}%</span>
                      </div>
                    )}
                    <Button variant="primary" size="lg" icon={UploadCloud} className="w-full" onClick={upload} loading={busy} disabled={busy}>
                      {busy ? "Uploading…" : "Upload and render with my voice"}
                    </Button>
                  </div>
                ) : (
                  <button ref={zoneButton} type="button" onClick={() => input.current?.click()} className="flex w-full flex-col items-center rounded-xl py-4 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-brand/15 to-brand/5 text-brand-ink"><Mic className="h-5 w-5" /></span>
                    <span className="mt-3 text-body font-semibold text-ink">Upload voiceover</span>
                    <span className="mt-0.5 text-[12.5px] text-ink-mute">Drop the recording here or click to choose. MP3, M4A or WAV, {MIN_S} to {MAX_S} s.</span>
                  </button>
                )}
              </div>
              {!file && takes.length > 0 && (
                <button type="button" onClick={() => setPicking(true)} className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-callout font-semibold text-ink-soft transition-colors hover:bg-ink/[0.05] hover:text-ink">
                  <Library className="h-4 w-4" /> Or pick a take from your library ({takes.length})
                </button>
              )}
              {err && <div className="flex items-start gap-2 rounded-xl bg-brand/[0.07] px-3.5 py-2.5 text-[12.5px] font-medium text-brand-deep dark:text-brand-bright" role="alert"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{err}</div>}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {scenes.length > 0 && (
        <div className="hairline-t px-5 py-5 sm:px-7">
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">Line by scene</h3>
          <ol className="space-y-2.5">
            {scenes.map((sc, i) => (
              <li key={i} className="flex gap-3">
                <span className="tnum mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-ink/[0.06] text-[12px] font-bold text-ink-soft">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] leading-[22px] text-ink">{sc.vo_line || <span className="italic text-ink-faint">No line (music only)</span>}</div>
                  {sc.on_screen_text && <div className="mt-0.5 text-[12px] text-ink-mute">On screen: {sc.on_screen_text}</div>}
                </div>
                <span className="tnum shrink-0 pt-0.5 text-[11.5px] text-ink-faint">{words(sc.vo_line)} w</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <Sheet open={picking} onClose={() => setPicking(false)} title="Pick a take" description="The reel is re-timed to the recording you choose." width={560}>
        <div className="space-y-3">
          {takes.map((t) => (
            <div key={t.id} className="rounded-2xl bg-ink/[0.03] p-3 shadow-[inset_0_0_0_1px_var(--hairline)]">
              <div className="mb-2.5 flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-callout font-semibold">{t.title || "Untitled"}</div>
                  <div className="text-[12px] text-ink-mute">{t.content_item_id === item.id ? "Recorded for this reel · " : ""}{relative(t.created_at)}</div>
                </div>
                <Button size="sm" variant="primary" onClick={() => applyTake(t)}>Use this take</Button>
              </div>
              <WavePlayer path={t.storage_path} label={t.title} />
            </div>
          ))}
        </div>
      </Sheet>
    </section>
  );
}

export function VideoMeta({ item, baseName }) {
  const { assets } = useData();
  const { video, poster } = videoAssets(assets, item);
  const b = item.body || {};
  const total = useMemo(() => (b.scenes || []).reduce((s, x) => s + (Number(x.duration) || 0), 0), [b.scenes]);
  return (
    <>
      {item.status === "awaiting_voiceover" && <VoiceoverStatus item={item} />}
      <MetaSection title="Files">
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" icon={Download} disabled={!video} onClick={() => downloadPath(video.storage_path, downloadName(baseName, video, "reel"))}>Reel MP4</Button>
          <Button size="sm" variant="ghost" icon={Download} disabled={!poster} onClick={() => downloadPath(poster.storage_path, downloadName(baseName, poster, "cover"))}>Cover</Button>
        </div>
      </MetaSection>
      <MetaSection title="Caption">
        <CaptionBox text={b.caption} />
        <Hashtags tags={b.hashtags} />
        <CopyButton text={captionOf(item)} label="Copy caption" className="mt-3 w-full" />
      </MetaSection>
      {b.scenes?.length > 0 && (
        <MetaSection title={`Scenes · ${b.scenes.length}`} aside={<span title={b.voiceover ? "Length of the reel, synced to your voiceover" : "Total length of the cut (the spoken script estimate is on the script card)"}>{b.voiceover ? "Synced" : "Cut"} {seconds(b.voiceover?.duration || total).replace(/s$/, " s")}</span>}>
          <ol className="space-y-2">
            {b.scenes.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-xl p-2 -mx-2 transition-colors hover:bg-ink/[0.03]">
                <span className="tnum mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-ink/[0.06] text-[11px] font-bold text-ink-mute">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold leading-[18px] text-ink">{s.on_screen_text}</div>
                  {s.vo_line && <div className="mt-0.5 text-[12px] italic leading-[17px] text-ink-mute">“{s.vo_line}”</div>}
                </div>
                <span className="tnum flex shrink-0 items-center gap-1 text-[11.5px] text-ink-faint"><Clock3 className="h-3 w-3" />{Number(s.duration).toFixed(1)}s</span>
              </li>
            ))}
          </ol>
          {b.voiceover && <Chip tone="ok" className="mt-3" size="sm">Synced to voiceover · {seconds(b.voiceover.duration)}</Chip>}
        </MetaSection>
      )}
      {video?.meta?.stock?.length > 0 && (
        <MetaSection title="Footage licence">
          {video.meta.stock.map((s) => <MetaRow key={s.id} label={`#${s.id}`}>{s.title}</MetaRow>)}
        </MetaSection>
      )}
    </>
  );
}

function VoiceoverStatus({ item }) {
  const { jobs } = useData();
  const vo = voiceoverState(item, jobs);
  const text = vo.state === "rendering" ? (vo.job.status === "running" ? "Rendering with your voice now." : "Queued to render with your voice.")
    : vo.state === "failed" ? "The last render failed. Upload the recording again."
      : "Waiting for your recording. Read the script in the main panel and upload it there.";
  return (
    <MetaSection title="Voiceover">
      <div className={cx("flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-[12.5px] font-medium", vo.state === "failed" ? "bg-brand/[0.07] text-brand-deep dark:text-brand-bright" : "bg-ink/[0.045] text-ink-soft")}>
        <Mic className="mt-px h-4 w-4 shrink-0" /> {text}
      </div>
    </MetaSection>
  );
}
