import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { UploadCloud, Image as ImageIcon, Film, Mic, Music, Shapes, FolderOpen, MoreHorizontal, Trash2, Download, X, Check } from "lucide-react";
import { useData } from "../lib/store.jsx";
import { PageHeader } from "../components/Shell.jsx";
import { Button, IconButton, Segmented, Skeleton, EmptyState, Card, Chip, cx } from "../components/ui.jsx";
import { Sheet, Confirm } from "../components/Sheet.jsx";
import { Menu } from "../components/Menu.jsx";
import { SignedImage, SignedAudio } from "../components/Media.jsx";
import { useSignedUrl, downloadPath } from "../lib/media.js";
import { relative, bytes } from "../lib/format.js";
import { spring } from "../lib/motion.js";

const KINDS = {
  photo: { label: "Photos", one: "Photo", icon: ImageIcon },
  video: { label: "Videos", one: "Video", icon: Film },
  voiceover: { label: "Voiceovers", one: "Voiceover", icon: Mic },
  music: { label: "Music", one: "Music", icon: Music },
  logo: { label: "Logos", one: "Logo", icon: Shapes },
  other: { label: "Other", one: "Other", icon: FolderOpen },
};
const guessKind = (f) => (f.type.startsWith("image/") ? "photo" : f.type.startsWith("video/") ? "video" : f.type.startsWith("audio/") ? "voiceover" : "other");
const MAX = 200 * 1024 * 1024;

function VideoThumb({ path }) {
  const { url } = useSignedUrl(path);
  return (
    <div className="relative h-full w-full bg-black">
      {url ? <video src={`${url}#t=0.5`} muted playsInline preload="metadata" className="h-full w-full object-cover" /> : <div className="skeleton absolute inset-0 rounded-none" />}
      <span className="absolute bottom-2 left-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"><Film className="h-3 w-3" /></span>
    </div>
  );
}

export default function Library() {
  const d = useData();
  const loading = d.status === "loading";
  const [kind, setKind] = useState("all");
  const [queue, setQueue] = useState([]); // pending uploads
  const [drag, setDrag] = useState(false);
  const [del, setDel] = useState(null);
  const input = useRef(null);

  const rows = useMemo(() => d.library.filter((r) => kind === "all" || r.kind === kind), [d.library, kind]);
  const counts = useMemo(() => Object.fromEntries(Object.keys(KINDS).map((k) => [k, d.library.filter((r) => r.kind === k).length])), [d.library]);

  const addFiles = (files) => {
    const list = [...files].map((f) => ({ id: Math.random().toString(36).slice(2), file: f, kind: guessKind(f), title: f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " "), tags: "", status: f.size > MAX ? "too_big" : "ready" }));
    if (list.length) setQueue((q) => [...q, ...list]);
  };

  const uploadAll = async () => {
    for (const q of queue) {
      if (q.status !== "ready") continue;
      setQueue((s) => s.map((x) => (x.id === q.id ? { ...x, status: "uploading" } : x)));
      try {
        await d.actions.uploadLibrary(q.file, { kind: q.kind, title: q.title.trim() || q.file.name, tags: q.tags.split(",").map((t) => t.trim()).filter(Boolean) });
        setQueue((s) => s.map((x) => (x.id === q.id ? { ...x, status: "done" } : x)));
      } catch (e) {
        setQueue((s) => s.map((x) => (x.id === q.id ? { ...x, status: "error", error: e.message } : x)));
      }
    }
    setTimeout(() => setQueue((s) => s.filter((x) => x.status !== "done")), 900);
  };
  const uploading = queue.some((q) => q.status === "uploading");

  // Drag and drop anywhere in the window: a file dropped outside the centred column must never make the browser
  // navigate away to it. A depth counter stops the overlay flickering as the pointer crosses child elements.
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

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-8 lg:py-10">
      <PageHeader
        title="Library"
        subtitle="Your own photos, footage and voiceovers. The weekly run prefers these over stock when they fit."
        actions={<Button variant="primary" icon={UploadCloud} onClick={() => input.current?.click()}>Upload</Button>}
      />
      <input ref={input} type="file" multiple accept="image/*,video/*,audio/*" className="hidden" onChange={(e) => { addFiles(e.target.files || []); e.target.value = ""; }} />

      <div className="no-scrollbar -mx-4 mb-5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Segmented
          value={kind}
          onChange={setKind}
          layoutId="lib-kind"
          options={[{ value: "all", label: "All", count: d.library.length }, ...Object.entries(KINDS).filter(([k]) => counts[k] || ["photo", "video", "voiceover"].includes(k)).map(([value, k]) => ({ value, label: k.label, count: counts[value] }))]}
        />
      </div>

      <AnimatePresence>
        {drag && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-brand/[0.06] backdrop-blur-[2px]">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} transition={spring} className="popover flex flex-col items-center px-10 py-8">
              <UploadCloud className="h-8 w-8 text-brand-ink" />
              <div className="mt-3 text-headline font-semibold">Drop to add to the library</div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="aspect-[4/3] rounded-2xl" />)}</div>
      ) : !rows.length ? (
        <Card>
          <EmptyState icon={FolderOpen} title={kind === "all" ? "Your library is empty" : `No ${KINDS[kind]?.label.toLowerCase()} yet`} action={<Button icon={UploadCloud} onClick={() => input.current?.click()}>Upload files</Button>}>
            Add real photos of your team and office, b-roll, and voiceovers. Drag files anywhere on this page.
          </EmptyState>
        </Card>
      ) : (
        <motion.div layout className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          <AnimatePresence>
            {rows.map((r) => {
              const K = KINDS[r.kind] || KINDS.other;
              return (
                <motion.div key={r.id} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={spring} className="card group overflow-hidden">
                  <div className="relative aspect-[4/3] overflow-hidden">
                    {r.kind === "photo" || r.kind === "logo" ? (
                      <SignedImage path={r.storage_path} className="h-full w-full transition-transform duration-500 ease-apple group-hover:scale-[1.03]" />
                    ) : r.kind === "video" ? (
                      <VideoThumb path={r.storage_path} />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-violet/[0.1] to-brand/[0.05] p-4">
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-violet shadow-card"><K.icon className="h-5 w-5" /></span>
                        <SignedAudio path={r.storage_path} className="w-full" />
                      </div>
                    )}
                    <div className="absolute right-2 top-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [&:has([aria-expanded=true])]:opacity-100 max-lg:opacity-100">
                      <Menu
                        items={[
                          { label: "Download", icon: Download, onClick: () => downloadPath(r.storage_path, r.storage_path.split("/").pop()) },
                          "divider",
                          { label: "Delete", icon: Trash2, danger: true, onClick: () => setDel(r) },
                        ]}
                        trigger={({ toggle, open, triggerProps }) => (
                          <button onClick={toggle} {...triggerProps} aria-label="File actions" className="flex h-8 w-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md hover:bg-black/60"><MoreHorizontal className="h-4 w-4" /></button>
                        )}
                      />
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="truncate text-callout font-semibold text-ink">{r.title || "Untitled"}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-mute">
                      <K.icon className="h-3 w-3" /> {K.one} · {relative(r.created_at)}
                      {r.used_count > 0 && <span className="ml-auto font-semibold text-ok">Used {r.used_count}×</span>}
                    </div>
                    {r.tags?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{r.tags.slice(0, 4).map((t) => <span key={t} className="rounded-md bg-ink/[0.05] px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">{t}</span>)}</div>}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      <Sheet
        open={queue.length > 0}
        onClose={() => !uploading && setQueue([])}
        title={`Add ${queue.length} ${queue.length === 1 ? "file" : "files"}`}
        description="Name them so the weekly run can find the right one. Tags are comma separated."
        width={620}
        footer={
          <>
            <Button variant="ghost" onClick={() => setQueue([])} disabled={uploading}>Cancel</Button>
            <Button variant="primary" icon={UploadCloud} onClick={uploadAll} loading={uploading} disabled={!queue.some((q) => q.status === "ready")}>Upload</Button>
          </>
        }
      >
        <div className="space-y-3">
          {queue.map((q) => (
            <div key={q.id} className="rounded-2xl bg-ink/[0.03] p-3 shadow-[inset_0_0_0_1px_var(--hairline)]">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface shadow-card">{(() => { const I = KINDS[q.kind].icon; return <I className="h-4 w-4 text-ink-soft" />; })()}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-callout font-semibold">{q.file.name}</div>
                  <div className="text-[12px] text-ink-mute">{bytes(q.file.size)}</div>
                </div>
                {q.status === "uploading" && <div className="h-1 w-16 overflow-hidden rounded-full bg-brand/15"><div className="progress-indeterminate h-full w-1/3 rounded-full bg-brand" /></div>}
                {q.status === "done" && <Chip tone="ok" size="sm"><Check className="h-3 w-3" /> Added</Chip>}
                {q.status === "too_big" && <Chip tone="danger" size="sm">Over 200 MB</Chip>}
                {q.status === "error" && <Chip tone="danger" size="sm">Failed</Chip>}
                {q.status === "ready" && <IconButton icon={X} label="Remove" size="sm" onClick={() => setQueue((s) => s.filter((x) => x.id !== q.id))} />}
              </div>
              {q.status === "ready" && (
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_140px]">
                  <input className="input h-9 text-callout" value={q.title} onChange={(e) => setQueue((s) => s.map((x) => (x.id === q.id ? { ...x, title: e.target.value } : x)))} placeholder="Title" aria-label={`Title for ${q.file.name}`} />
                  <select aria-label={`Kind of ${q.file.name}`} className="input h-9 text-callout" value={q.kind} onChange={(e) => setQueue((s) => s.map((x) => (x.id === q.id ? { ...x, kind: e.target.value } : x)))}>
                    {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.one}</option>)}
                  </select>
                  <input className="input h-9 text-callout sm:col-span-2" value={q.tags} onChange={(e) => setQueue((s) => s.map((x) => (x.id === q.id ? { ...x, tags: e.target.value } : x)))} placeholder="Tags: team, office, saswad" aria-label={`Tags for ${q.file.name}`} />
                </div>
              )}
              {q.error && <div className={cx("mt-2 text-[12px] text-brand-ink")}>{q.error}</div>}
            </div>
          ))}
        </div>
      </Sheet>

      <Confirm open={!!del} onClose={() => setDel(null)} title="Delete this file?" description="It's removed from the library and storage. Published content that already used it is not affected." confirmLabel="Delete" tone="danger" onConfirm={() => d.actions.deleteLibrary(del)}>
        <div className="rounded-xl bg-ink/[0.04] p-3 text-callout font-semibold">{del?.title}</div>
      </Confirm>
    </div>
  );
}
