import { useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Mic, UploadCloud, Clock3, FileAudio, CheckCircle2, AlertTriangle } from "lucide-react";
import { useData } from "../../lib/store.jsx";
import { assetsFor, captionOf } from "../../lib/model.js";
import { downloadPath, downloadName } from "../../lib/media.js";
import { relative, seconds, bytes, plural } from "../../lib/format.js";
import { SignedVideo, SignedAudio } from "../Media.jsx";
import { Button, CopyButton, EmptyState, Chip, cx } from "../ui.jsx";
import { MetaSection, MetaRow, CaptionBox, Hashtags } from "./Meta.jsx";

export function videoAssets(assets, item) {
  const list = assetsFor(assets, item.id);
  return { video: list.find((a) => a.kind === "video"), poster: list.find((a) => a.kind === "video_poster") };
}

export function VideoStage({ item }) {
  const { assets } = useData();
  const { video, poster } = videoAssets(assets, item);
  if (!video) return <EmptyState title="No reel rendered yet" />;
  return (
    <div className="mx-auto flex w-full flex-col items-center">
      <div className="relative rounded-[42px] bg-[#0d0d10] p-[10px] shadow-[0_0_0_1px_rgb(255_255_255/0.06)_inset,0_0_0_1px_rgb(0_0_0/0.4),0_30px_80px_-30px_rgb(var(--shadow)/0.55)]">
        <SignedVideo path={video.storage_path} posterPath={poster?.storage_path} className="aspect-[9/16] w-[min(300px,72vw)] rounded-[32px] sm:w-[320px]" />
      </div>
      {item.status === "awaiting_voiceover" && (
        <div className="mt-4 flex items-center gap-2 text-[12.5px] font-medium text-violet">
          <Mic className="h-4 w-4" /> Silent captioned preview. Upload your voiceover to finish the reel.
        </div>
      )}
    </div>
  );
}

const WPS = 2.3;

function useAudioDuration() {
  return (file) => new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => { resolve(Number.isFinite(a.duration) ? a.duration : null); URL.revokeObjectURL(url); };
    a.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
    a.src = url;
  });
}

export function VoiceoverPanel({ item }) {
  const { library, actions, jobs } = useData();
  const b = item.body || {};
  const renderJob = jobs.find((j) => j.kind === "render_video" && j.payload?.content_item_id === item.id && (j.status === "queued" || j.status === "running"));
  const script = b.voiceover_script || (b.scenes || []).map((s) => s.vo_line).filter(Boolean).join(" ");
  const words = script ? script.split(/\s+/).filter(Boolean).length : 0;
  const uploads = library.filter((l) => l.kind === "voiceover" && l.content_item_id === item.id);
  const [file, setFile] = useState(null);
  const [dur, setDur] = useState(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState(null);
  const input = useRef(null);
  const measure = useAudioDuration();

  const pick = async (f) => {
    setErr(null);
    if (!f) return;
    if (!/^audio\//.test(f.type) && !/\.(mp3|wav|m4a|aac|ogg)$/i.test(f.name)) return setErr("Choose an audio file (MP3, WAV or M4A).");
    if (f.size > 50 * 1024 * 1024) return setErr("That file is over 50 MB.");
    setFile(f);
    setDur(await measure(f));
  };
  const upload = async () => {
    setBusy(true);
    try { await actions.uploadVoiceover(item, file, { duration: dur }); setFile(null); setDur(null); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };
  const target = words / WPS;
  const off = dur && (dur < 15 || dur > 45);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-callout font-semibold text-ink">Voiceover script</span>
          <span className="tnum text-[12px] text-ink-mute">{words} words · ~{Math.round(target)} s</span>
        </div>
        <div className="max-h-[220px] overflow-y-auto rounded-xl bg-violet/[0.06] p-3.5 text-[14px] leading-[22px] text-ink-soft shadow-[inset_0_0_0_1px_rgb(var(--violet)/0.12)]">{script || "No script yet."}</div>
        <CopyButton text={script} label="Copy script" className="mt-2 w-full" />
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
        className={cx(
          "relative rounded-2xl border-[1.5px] border-dashed p-4 text-center transition-colors",
          drag ? "border-violet bg-violet/[0.06]" : "border-ink/[0.14] hover:border-ink/25",
        )}
      >
        <input ref={input} type="file" accept="audio/*,.mp3,.wav,.m4a" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <AnimatePresence mode="wait" initial={false}>
          {file ? (
            <motion.div key="file" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-left">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet/10 text-violet"><FileAudio className="h-[18px] w-[18px]" /></span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-callout font-semibold">{file.name}</div>
                  <div className="tnum text-[12px] text-ink-mute">{bytes(file.size)}{dur ? ` · ${seconds(dur)}` : ""}</div>
                </div>
              </div>
              {off && <div className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-warn"><AlertTriangle className="h-3.5 w-3.5" /> Reels work best at 20 to 40 seconds.</div>}
              {busy && <div className="mt-3 h-1 overflow-hidden rounded-full bg-violet/15"><div className="progress-indeterminate h-full w-1/3 rounded-full bg-violet" /></div>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => { setFile(null); setDur(null); }} disabled={busy}>Change</Button>
                <Button size="sm" variant="primary" className="flex-1" icon={UploadCloud} onClick={upload} loading={busy}>Upload & render</Button>
              </div>
            </motion.div>
          ) : (
            <motion.button key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => input.current?.click()} className="flex w-full flex-col items-center py-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet/10 text-violet"><Mic className="h-[18px] w-[18px]" /></span>
              <span className="mt-2 text-callout font-semibold text-ink">{uploads.length ? "Upload a new take" : "Drop your voiceover here"}</span>
              <span className="mt-0.5 text-[12px] text-ink-mute">MP3, WAV or M4A. The reel is re-timed to match it.</span>
            </motion.button>
          )}
        </AnimatePresence>
        {err && <div className="mt-2 text-[12px] font-medium text-brand">{err}</div>}
      </div>

      {renderJob && (
        <div className="flex items-center gap-2 rounded-xl bg-violet/[0.08] px-3 py-2.5 text-[12.5px] font-medium text-violet">
          <span className="relative flex h-2 w-2"><span className="absolute inset-0 animate-ping rounded-full bg-violet opacity-60 motion-reduce:hidden" /><span className="relative h-2 w-2 rounded-full bg-violet" /></span>
          {renderJob.status === "running" ? "Rendering the reel with your voiceover…" : "Render queued. The reel updates on the next run."}
        </div>
      )}
      {uploads.length > 0 && (
        <div className="space-y-2">
          {uploads.map((u) => (
            <div key={u.id} className="rounded-xl bg-ink/[0.035] p-3">
              <div className="mb-2 flex items-center gap-2 text-[12.5px]">
                <CheckCircle2 className="h-4 w-4 text-ok" />
                <span className="min-w-0 flex-1 truncate font-semibold">{u.title}</span>
                <span className="text-ink-mute">{relative(u.created_at)}</span>
              </div>
              <SignedAudio path={u.storage_path} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function VideoMeta({ item, baseName }) {
  const { assets } = useData();
  const { video, poster } = videoAssets(assets, item);
  const b = item.body || {};
  const total = useMemo(() => (b.scenes || []).reduce((s, x) => s + (Number(x.duration) || 0), 0), [b.scenes]);
  return (
    <>
      {item.status === "awaiting_voiceover" && (
        <MetaSection title="Voiceover">
          <VoiceoverPanel item={item} />
        </MetaSection>
      )}
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
        <MetaSection title={`Scenes · ${plural(b.scenes.length, "scene")} · ${seconds(b.voiceover?.duration || total)}`}>
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
          {b.voiceover && <Chip tone="violet" className="mt-3" size="sm">Synced to voiceover · {seconds(b.voiceover.duration)}</Chip>}
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
