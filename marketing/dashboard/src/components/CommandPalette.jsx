import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Search, CornerDownLeft, Play, Sun, Moon, ArrowRight } from "lucide-react";
import { NAV, useTheme } from "./Shell.jsx";
import { navigate } from "../lib/router.jsx";
import { useData } from "../lib/store.jsx";
import { TYPE_META, ITEM_STATUS, itemTitle } from "../lib/model.js";
import { spring } from "../lib/motion.js";
import { cx, Kbd } from "./ui.jsx";

const norm = (s) => String(s || "").toLowerCase();
function score(text, q) {
  if (!q) return 1;
  const t = norm(text);
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.every((w) => t.includes(w))) return 0;
  return t.startsWith(words[0]) ? 3 : t.includes(` ${words[0]}`) ? 2 : 1;
}

export function CommandPalette({ open, onClose }) {
  const data = useData();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const [, setTheme] = useTheme();
  const listRef = useRef(null);

  // Focus returns to whatever opened the palette.
  useEffect(() => {
    if (!open) return;
    setQ(""); setIndex(0);
    const prev = document.activeElement;
    return () => { if (prev && prev !== document.body) prev.focus?.({ preventScroll: true }); };
  }, [open]);

  const results = useMemo(() => {
    const out = [];
    const pages = NAV.map((n) => ({ id: `nav:${n.to}`, group: "Go to", label: n.label, icon: n.icon, run: () => navigate(n.to), s: score(n.label, q) }));
    const acts = [
      { id: "act:run", group: "Actions", label: "Make this week's blogs now", icon: Play, run: () => data.actions.runWeekly(), s: score("make this week blogs now run weekly", q) },
      { id: "act:light", group: "Actions", label: "Use the light look", icon: Sun, run: () => setTheme("light"), s: score("light theme appearance", q) },
      { id: "act:dark", group: "Actions", label: "Use the dark look", icon: Moon, run: () => setTheme("dark"), s: score("dark theme appearance", q) },
    ];
    const items = data.items
      .filter((i) => i.status !== "rejected")
      .map((i) => {
        const topic = data.topicById.get(i.topic_id);
        const label = itemTitle(i, topic);
        return {
          id: `item:${i.id}`, group: "Blogs and posts", label, icon: TYPE_META[i.type]?.icon,
          hint: `${TYPE_META[i.type]?.label} · ${ITEM_STATUS[i.status]?.label || i.status}`,
          run: () => navigate(`/review/${i.id}`),
          s: q ? score(`${label} ${i.type} ${topic?.title || ""} ${i.status}`, q) : 0,
        };
      });
    for (const r of [...pages, ...acts]) if (r.s) out.push(r);
    out.push(...items.filter((r) => r.s).sort((a, b) => b.s - a.s).slice(0, 8));
    return out;
  }, [q, data, setTheme]);

  useEffect(() => { setIndex(0); }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  const run = (r) => { onClose(); setTimeout(() => r.run(), 10); };

  const onKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); results[index] && run(results[index]); }
    else if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "Tab") e.preventDefault(); // modal: focus stays in the search field (options are aria-activedescendant)
  };

  let lastGroup = null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center px-3 pt-[12vh] sm:px-6">
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}
            className="absolute inset-0 bg-[#120d0c]/30 dark:bg-black/55"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
            transition={spring}
            className="popover relative w-full max-w-[620px] overflow-hidden !bg-surface-raised/95 backdrop-blur-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Command menu"
          >
            <div className="hairline-b flex items-center gap-3 px-4">
              <Search className="h-[18px] w-[18px] text-ink-mute" strokeWidth={2} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKey}
                placeholder="Search blogs, posts and pages"
                className="h-[54px] flex-1 bg-transparent text-[16px] tracking-[-0.01em] text-ink outline-none placeholder:text-ink-faint focus-visible:outline-none"
                aria-label="Search"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls="cmdk-list"
                aria-autocomplete="list"
                aria-activedescendant={results[index] ? `cmdk-opt-${index}` : undefined}
              />
              <Kbd>esc</Kbd>
            </div>
            <div ref={listRef} id="cmdk-list" role="listbox" aria-label="Results" className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
              {results.length === 0 && <div className="px-3 py-10 text-center text-body text-ink-mute">No matches for “{q}”</div>}
              {results.map((r, i) => {
                const header = r.group !== lastGroup ? r.group : null;
                lastGroup = r.group;
                const Icon = r.icon || ArrowRight;
                const active = i === index;
                return (
                  <div key={r.id} role="presentation">
                    {header && <div role="presentation" className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint">{header}</div>}
                    <button
                      id={`cmdk-opt-${i}`}
                      role="option"
                      aria-selected={active}
                      tabIndex={-1}
                      data-index={i}
                      onMouseMove={() => setIndex(i)}
                      onClick={() => run(r)}
                      className={cx("relative flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left transition-colors duration-100", active ? "bg-ink/[0.06]" : "bg-transparent")}
                    >
                      <span className={cx("relative flex h-7 w-7 items-center justify-center rounded-lg", active ? "bg-brand-deep text-white" : "bg-ink/[0.05] text-ink-soft")}>
                        <Icon className="h-[15px] w-[15px]" strokeWidth={2.1} />
                      </span>
                      <span className="relative flex-1 truncate text-body font-medium text-ink">{r.label}</span>
                      {r.hint && <span className="relative hidden text-callout text-ink-mute sm:block">{r.hint}</span>}
                      {active && <CornerDownLeft className="relative h-4 w-4 text-ink-mute" />}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="hairline-t hidden items-center gap-4 px-4 py-2.5 text-[11.5px] text-ink-mute sm:flex">
              <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
              <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> open</span>
              <span className="ml-auto flex items-center gap-1.5">Review shortcuts: <Kbd>J</Kbd><Kbd>K</Kbd><Kbd>A</Kbd><Kbd>R</Kbd></span>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
