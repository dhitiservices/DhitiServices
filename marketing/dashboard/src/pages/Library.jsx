import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  UploadCloud, Image as ImageIcon, Film, Mic, Music, Shapes, FolderOpen, Trash2, Download, X, Check, Search, AlertCircle, RotateCw, Clapperboard,
} from "lucide-react";
import { useData } from "../lib/store.jsx";
import { useToast } from "../components/Toast.jsx";
import { PageHeader } from "../components/Shell.jsx";
import { Button, IconButton, Segmented, Skeleton, EmptyState, Card, Chip, Field, cx } from "../components/ui.jsx";
import { Sheet, Confirm } from "../components/Sheet.jsx";
import { SignedImage } from "../components/Media.jsx";
import { WavePlayer } from "../components/Wave.jsx";
import { useSignedUrl, downloadPath } from "../lib/media.js";
import { relative, bytes, seconds } from "../lib/format.js";
import { checkFile, mediaDuration, imageSize, ACCEPT_ATTR, ACCEPT } from "../lib/files.js";
import { spring } from "../lib/motion.js";

const KINDS = {
  photo: { label: "Photos", one: "Photo", icon: ImageIcon },
  video: { label: "Videos", one: "Video", icon: Film },
  voiceover: { label: "Voice recordings", one: "Voice recording", icon: Mic },
  music: { label: "Music", one: "Music", icon: Music },
  logo: { label: "Logos", one: "Logo", icon: Shapes },
  other: { label: "Other", one: "Other", icon: FolderOpen },
};
// Which library kinds a file of each group may be filed under.
const KIND_CHOICES = { photo: ["photo", "logo", "other"], audio: ["voiceover", "music"], video: ["video", "other"] };
const isAudio = (r) => r.kind === "voiceover" || r.kind === "music" || /^audio\//.test(r.mime || "");
const isImage = (r) => /^image\//.test(r.mime || "") || r.kind === "photo" || r.kind === "logo";

const parseTags = (s) => [...new Set(String(s).split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
const niceTitle = (name) => name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();

function VideoThumb({ path }) {
  const { url } = useSignedUrl(path);
  return (
    <div className="relative h-full w-full bg-black">
      {url ? <video src={`${url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : <div className="skeleton absolute inset-0 rounded-none" />}
      <span className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"><Film className="h-3 w-3" /></span>
    </div>
  );
}

function LocalThumb({ file }) {
  const [url, setUrl] = useState(null);
  useEffect(() => { const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u); }, [file]);
  return url ? <img src={url} alt="" className="h-full w-full object-cover" draggable={false} /> : null;
}

/* --------------------------------------------------------------------------------------------- upload queue */

let seq = 0;
async function prepare(file) {
  const check = await checkFile(file);
  const base = { id: `q${++seq}`, file, title: niceTitle(file.name), tags: "", notes: "", progress: 0 };
  if (!check.ok) return { ...base, status: "rejected", error: check.error };
  const meta = check.group === "photo" ? await imageSize(file) : { duration: await mediaDuration(file) };
  return { ...base, status: "ready", group: check.group, kind: check.kind, mime: check.mime, meta };
}

function QueueRow({ q, onChange, onRemove, onRetry }) {
  const editable = q.status === "ready" || q.status === "error";
  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98 }} transition={spring} className="rounded-2xl bg-ink/[0.03] p-3 shadow-[inset_0_0_0_1px_var(--hairline)]">
      <div className="flex items-center gap-3">
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface shadow-card">
          {q.group === "photo" ? <LocalThumb file={q.file} /> : q.group === "video" ? <Film className="h-5 w-5 text-ink-soft" /> : q.group === "audio" ? <Mic className="h-5 w-5 text-brand-ink" /> : <AlertCircle className="h-5 w-5 text-brand-ink" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-callout font-semibold">{q.file.name}</div>
          <div className="tnum text-[12px] text-ink-mute">
            {bytes(q.file.size)}
            {q.meta?.width ? ` · ${q.meta.width}×${q.meta.height}` : ""}
            {q.meta?.duration ? ` · ${seconds(q.meta.duration)}` : ""}
          </div>
        </div>
        {q.status === "uploading" && <span className="tnum text-[12px] font-semibold text-ink-soft">{Math.round(q.progress * 100)}%</span>}
        {q.status === "done" && <Chip tone="ok" size="sm"><Check className="h-3 w-3" /> Added</Chip>}
        {q.status === "error" && <IconButton icon={RotateCw} label="Retry upload" size="sm" onClick={onRetry} />}
        {(q.status === "ready" || q.status === "rejected" || q.status === "error") && <IconButton icon={X} label={`Remove ${q.file.name}`} size="sm" onClick={onRemove} />}
      </div>
      {q.status === "uploading" && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]" role="progressbar" aria-valuenow={Math.round(q.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`Uploading ${q.file.name}`}>
          <motion.div className="h-full rounded-full bg-gradient-to-r from-brand-bright to-brand-deep" initial={false} animate={{ width: `${Math.max(3, q.progress * 100)}%` }} transition={{ ease: "easeOut", duration: 0.2 }} />
        </div>
      )}
      {(q.status === "rejected" || q.status === "error") && (
        <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-brand/[0.07] px-3 py-2 text-[12.5px] font-medium text-brand-deep dark:text-brand-bright" role="alert">
          <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" /> {q.error}
        </div>
      )}
      {q.group === "audio" && q.status !== "rejected" && <WavePlayer file={q.file} className="mt-3" label={q.file.name} />}
      {editable && (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_150px]">
          <input className="input h-9 text-callout" value={q.title} maxLength={200} onChange={(e) => onChange({ title: e.target.value })} placeholder="Name" aria-label={`Name for ${q.file.name}`} />
          <select aria-label={`Type of ${q.file.name}`} className="input h-9 text-callout" value={q.kind} onChange={(e) => onChange({ kind: e.target.value })}>
            {KIND_CHOICES[q.group].map((k) => <option key={k} value={k}>{KINDS[k].one}</option>)}
          </select>
          <input className="input h-9 text-callout sm:col-span-2" value={q.tags} onChange={(e) => onChange({ tags: e.target.value })} placeholder="Tags, comma separated: team, office, saswad" aria-label={`Tags for ${q.file.name}`} />
          <textarea rows={2} className="input resize-none text-callout sm:col-span-2" value={q.notes} maxLength={1000} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Notes: where it was taken, who is in it, when to use it" aria-label={`Notes for ${q.file.name}`} />
        </div>
      )}
    </motion.div>
  );
}

/* --------------------------------------------------------------------------------------------- detail sheet */

function DetailSheet({ row: current, onClose, onDelete }) {
  const d = useData();
  const last = useRef(current);
  if (current) last.current = current;
  const row = current || last.current; // keep the content during the closing animation
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (current) setForm({ title: current.title || "", tags: (current.tags || []).join(", "), notes: current.notes || "" }); }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!row) return null;
  const K = KINDS[row.kind] || KINDS.other;
  const linked = row.content_item_id ? d.itemById.get(row.content_item_id) : null;
  const dirty = form && (form.title !== (row.title || "") || form.notes !== (row.notes || "") || parseTags(form.tags).join(",") !== (row.tags || []).join(","));
  const save = async () => {
    setBusy(true);
    try {
      await d.actions.updateLibrary(row, { title: form.title.trim() || row.title, notes: form.notes.trim(), tags: parseTags(form.tags) });
      onClose();
    } catch { /* toast shown */ } finally { setBusy(false); }
  };
  return (
    <Sheet
      open={!!current}
      onClose={onClose}
      title={row.title || "Untitled"}
      description={`${K.one} · added ${relative(row.created_at)}${row.used_count ? ` · used ${row.used_count} ${row.used_count === 1 ? "time" : "times"}` : ""}`}
      width={560}
      footer={
        <>
          <Button variant="danger" icon={Trash2} onClick={() => onDelete(row)} className="mr-auto">Delete</Button>
          <Button variant="ghost" icon={Download} onClick={() => downloadPath(row.storage_path, row.storage_path.split("/").pop())}>Download</Button>
          <Button variant="primary" icon={Check} onClick={save} loading={busy} disabled={!dirty}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl bg-ink/[0.04]">
          {isImage(row) ? <SignedImage path={row.storage_path} fit="contain" className="aspect-[4/3] w-full" eager /> : row.kind === "video" ? <div className="aspect-video"><VideoThumb path={row.storage_path} /></div> : <div className="p-3"><WavePlayer path={row.storage_path} bars={72} label={row.title} /></div>}
        </div>
        {linked && (
          <div className="flex items-center gap-2 rounded-xl bg-ink/[0.045] px-3 py-2 text-[12.5px] font-medium text-ink-soft">
            <Clapperboard className="h-4 w-4" /> Recorded for: <span className="truncate font-semibold">{linked.title}</span>
          </div>
        )}
        {form && (
          <>
            <Field label="Name"><input className="input" value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
            <Field label="Tags" hint="Put commas between tags. We search names, tags and notes to pick your photos and recordings."><input className="input" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="team, office, saswad" /></Field>
            <Field label="Notes"><textarea rows={3} className="input resize-y" value={form.notes} maxLength={1000} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Where it was taken, who is in it, when to use it" /></Field>
          </>
        )}
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------------------------------------------------- cards */

const Tags = ({ tags, max = 4 }) => (tags?.length > 0 ? (
  <div className="flex flex-wrap gap-1">{tags.slice(0, max).map((t) => <span key={t} className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">{t}</span>)}</div>
) : null);

function AudioCard({ r, onOpen }) {
  const K = KINDS[r.kind] || KINDS.other;
  const linked = useData().itemById.get(r.content_item_id);
  return (
    <div className="flex h-full flex-col gap-3 bg-gradient-to-br from-brand/[0.05] via-transparent to-transparent p-3.5">
      <button type="button" onClick={onOpen} className="flex items-center gap-3 text-left" aria-label={`Open ${r.title || "file"}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-brand-ink shadow-card"><K.icon className="h-[18px] w-[18px]" /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-callout font-semibold text-ink">{r.title || "Untitled"}</span>
          <span className="block truncate text-[11.5px] text-ink-mute">{K.one} · {relative(r.created_at)}{linked ? ` · for ${linked.title}` : ""}</span>
        </span>
        {r.used_count > 0 && <span className="shrink-0 text-[11.5px] font-semibold text-ok">Used {r.used_count}×</span>}
      </button>
      <WavePlayer path={r.storage_path} label={r.title} />
      <Tags tags={r.tags} max={6} />
    </div>
  );
}

function VisualCard({ r, onOpen }) {
  const K = KINDS[r.kind] || KINDS.other;
  return (
    <button type="button" onClick={onOpen} className="block w-full text-left" aria-label={`Open ${r.title || "file"}`}>
      <div className="relative aspect-[4/3] overflow-hidden">
        {r.kind === "video" ? <VideoThumb path={r.storage_path} /> : <SignedImage path={r.storage_path} className="h-full w-full transition-transform duration-500 ease-apple group-hover:scale-[1.03]" />}
      </div>
      <div className="p-3">
        <div className="truncate text-callout font-semibold text-ink">{r.title || "Untitled"}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-mute">
          <K.icon className="h-3 w-3" /> {K.one} · {relative(r.created_at)}
          {r.used_count > 0 && <span className="ml-auto font-semibold text-ok">Used {r.used_count}×</span>}
        </div>
        {r.tags?.length > 0 && <div className="mt-2"><Tags tags={r.tags} /></div>}
      </div>
    </button>
  );
}

/* --------------------------------------------------------------------------------------------- page */

export default function Library() {
  const d = useData();
  const toast = useToast();
  const loading = d.status === "loading";
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [queue, setQueue] = useState([]);
  const [drag, setDrag] = useState(false);
  const [open, setOpen] = useState(null);
  const [del, setDel] = useState(null);
  const input = useRef(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return d.library.filter((r) => (kind === "all" || r.kind === kind) && (!q || `${r.title} ${(r.tags || []).join(" ")} ${r.notes}`.toLowerCase().includes(q)));
  }, [d.library, kind, query]);
  const counts = useMemo(() => Object.fromEntries(Object.keys(KINDS).map((k) => [k, d.library.filter((r) => r.kind === k).length])), [d.library]);
  const openRow = open ? d.library.find((r) => r.id === open) || null : null;

  const patch = (id, p) => setQueue((s) => s.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const addFiles = async (files) => {
    const list = [...files];
    if (!list.length) return;
    const prepared = await Promise.all(list.map(prepare));
    setQueue((q) => [...q, ...prepared]);
  };

  const uploadOne = async (q) => {
    patch(q.id, { status: "uploading", progress: 0, error: null });
    try {
      await d.actions.uploadLibrary(q.file, {
        kind: q.kind, mime: q.mime, title: q.title.trim() || niceTitle(q.file.name), tags: parseTags(q.tags), notes: q.notes.trim(),
        onProgress: (p) => patch(q.id, { progress: p }),
      });
      patch(q.id, { status: "done", progress: 1 });
      return true;
    } catch (e) {
      patch(q.id, { status: "error", error: e.message || "Upload failed" });
      return false;
    }
  };
  const uploadAll = async () => {
    const ready = queue.filter((q) => q.status === "ready" || q.status === "error");
    let ok = 0;
    for (const q of ready) if (await uploadOne(q)) ok += 1;
    const failed = ready.length - ok;
    const skipped = queue.filter((q) => q.status === "rejected").length;
    // All good: close the sheet (files that couldn't be accepted were already explained). Failures stay for a retry.
    setTimeout(() => setQueue((s) => (failed ? s.filter((x) => x.status !== "done") : [])), 900);
    if (ok) toast({ tone: "ok", title: `${ok} ${ok === 1 ? "file" : "files"} added to the library`, description: skipped ? `${skipped} skipped: we can't use those files.` : undefined, duration: 3200 });
    return ok;
  };
  const uploading = queue.some((q) => q.status === "uploading");
  const uploadable = queue.filter((q) => q.status === "ready" || q.status === "error").length;
  const rejected = queue.filter((q) => q.status === "rejected").length;

  // Drag and drop anywhere in the window: a file dropped outside the drop zone must never make the browser navigate
  // to it. A depth counter stops the overlay flickering as the pointer crosses child elements.
  const addRef = useRef(addFiles);
  addRef.current = addFiles;
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
    const enter = (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth += 1; setDrag(true); };
    const over = (e) => { if (hasFiles(e)) e.preventDefault(); };
    const leave = (e) => { if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) setDrag(false); };
    const drop = (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth = 0; setDrag(false); addRef.current(e.dataTransfer.files || []); };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, []);

  const browse = () => input.current?.click();

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-8 lg:py-10">
      <PageHeader
        title="Library"
        subtitle="Your own photos, videos and voice recordings. We use these before stock photos when they fit."
        actions={<Button variant="primary" icon={UploadCloud} onClick={browse}>Upload</Button>}
      />
      <input ref={input} type="file" multiple accept={ACCEPT_ATTR} className="hidden" data-testid="library-input" onChange={(e) => { addFiles(e.target.files || []); e.target.value = ""; }} />

      <button
        type="button"
        onClick={browse}
        className="group mb-6 flex w-full items-center gap-4 rounded-2xl border-[1.5px] border-dashed border-ink/[0.14] bg-surface/60 px-5 py-4 text-left transition-colors hover:border-brand/40 hover:bg-brand/[0.025]"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-brand/15 to-brand/5 text-brand-ink"><UploadCloud className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold text-ink">Drop photos or voice recordings here, or tap to choose</span>
          <span className="block text-[12.5px] text-ink-mute">Photos: {ACCEPT.photo.label}, up to 40 MB · Voice: {ACCEPT.audio.label}, up to 50 MB · Videos: {ACCEPT.video.label}</span>
        </span>
        <span className="hidden text-callout font-semibold text-brand-ink sm:block">Choose files</span>
      </button>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Segmented
            value={kind}
            onChange={setKind}
            layoutId="lib-kind"
            label="Show"
            options={[{ value: "all", label: "All", count: d.library.length }, ...Object.entries(KINDS).filter(([k]) => counts[k] || ["photo", "voiceover"].includes(k)).map(([value, k]) => ({ value, label: k.label, count: counts[value] }))]}
          />
        </div>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input className="input h-9 pl-9 text-callout" placeholder="Search names, tags, notes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the library" />
        </div>
      </div>

      <AnimatePresence>
        {drag && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-brand/[0.06] backdrop-blur-[2px]">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} transition={spring} className="popover flex flex-col items-center px-10 py-8">
              <UploadCloud className="h-8 w-8 text-brand-ink" />
              <div className="mt-3 text-headline font-semibold">Drop to add to the library</div>
              <div className="mt-1 text-callout text-ink-mute">Photos, voice recordings and videos</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />)}</div>
      ) : !rows.length ? (
        <Card>
          <EmptyState icon={FolderOpen} title={query ? "Nothing matches" : kind === "all" ? "Your library is empty" : `No ${KINDS[kind]?.label.toLowerCase()} yet`} action={!query && <Button icon={UploadCloud} onClick={browse}>Upload files</Button>}>
            {query ? "Try another word, or clear the search." : "Add real photos of your team and office, short videos, and your voice recordings."}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-8">
          {[
            { key: "audio", title: "Voice and music", list: rows.filter(isAudio), grid: "grid gap-3 sm:grid-cols-2", Card: AudioCard },
            { key: "visual", title: "Photos and videos", list: rows.filter((r) => !isAudio(r)), grid: "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4", Card: VisualCard },
          ].filter((g) => g.list.length).map((g, _i, groups) => (
            <section key={g.key} aria-label={g.title}>
              {groups.length > 1 && <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{g.title} · {g.list.length}</h2>}
              <motion.div layout className={g.grid}>
                <AnimatePresence>
                  {g.list.map((r) => (
                    <motion.div key={r.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={spring} className="card group overflow-hidden" data-testid="library-card">
                      <g.Card r={r} onOpen={() => setOpen(r.id)} />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </motion.div>
            </section>
          ))}
        </div>
      )}

      <Sheet
        open={queue.length > 0}
        onClose={() => !uploading && setQueue([])}
        title={`Add ${queue.length} ${queue.length === 1 ? "file" : "files"}`}
        description={rejected ? `${rejected} can't be used (see below). Give the rest a name so we can find the right one.` : "Give each one a name so we can find the right one."}
        width={640}
        footer={
          <>
            <Button variant="ghost" icon={UploadCloud} onClick={browse} disabled={uploading} className="mr-auto">Add more</Button>
            <Button variant="ghost" onClick={() => setQueue([])} disabled={uploading}>Cancel</Button>
            <Button variant="primary" icon={UploadCloud} onClick={uploadAll} loading={uploading} disabled={!uploadable || uploading}>
              {uploadable > 1 ? `Upload ${uploadable}` : "Upload"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {queue.map((q) => (
              <QueueRow key={q.id} q={q} onChange={(p) => patch(q.id, p)} onRemove={() => setQueue((s) => s.filter((x) => x.id !== q.id))} onRetry={() => uploadOne(q)} />
            ))}
          </AnimatePresence>
        </div>
      </Sheet>

      <DetailSheet row={openRow} onClose={() => setOpen(null)} onDelete={(r) => { setOpen(null); setDel(r); }} />

      <Confirm
        open={!!del}
        onClose={() => setDel(null)}
        title="Delete this file?"
        description="It's deleted for good. Posts already made with it stay as they are."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => d.actions.deleteLibrary(del)}
      >
        <div className="rounded-xl bg-ink/[0.04] p-3 text-callout font-semibold">{del?.title}</div>
      </Confirm>
    </div>
  );
}
