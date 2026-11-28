import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, FileDown, Download } from "lucide-react";
import { useData } from "../../lib/store.jsx";
import { assetsFor } from "../../lib/model.js";
import { downloadPath, downloadMany, downloadName } from "../../lib/media.js";
import { useHotkeys } from "../../lib/hotkeys.js";
import { spring } from "../../lib/motion.js";
import { SignedImage } from "../Media.jsx";
import { Button, CopyButton, Segmented, EmptyState, cx } from "../ui.jsx";
import { MetaSection, CaptionBox, Hashtags } from "./Meta.jsx";

export function slidesOf(assets, item) {
  return assetsFor(assets, item.id).filter((a) => a.kind === "carousel_slide");
}

export function CarouselStage({ item }) {
  const { assets } = useData();
  const slides = slidesOf(assets, item);
  const [[index, dir], setIndex] = useState([0, 0]);
  useEffect(() => setIndex([0, 0]), [item.id]);
  const go = (n) => setIndex(([i]) => [Math.max(0, Math.min(slides.length - 1, i + n)), n]);

  useHotkeys({ arrowright: () => go(1), arrowleft: () => go(-1) });

  if (!slides.length) return <EmptyState title="No slides rendered yet" />;

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col items-center">
      <div className="relative w-full">
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[18px] bg-ink/[0.05] shadow-[0_0_0_1px_var(--hairline),0_24px_60px_-24px_rgb(var(--shadow)/0.4)]">
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={index}
              custom={dir}
              variants={{
                enter: (d) => ({ x: d > 0 ? "100%" : d < 0 ? "-100%" : 0, opacity: d ? 1 : 0 }),
                center: { x: 0, opacity: 1 },
                exit: (d) => ({ x: d > 0 ? "-30%" : "30%", opacity: 0 }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={spring}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.18}
              onDragEnd={(_, info) => {
                if (info.offset.x < -60 || info.velocity.x < -400) go(1);
                else if (info.offset.x > 60 || info.velocity.x > 400) go(-1);
              }}
              className="absolute inset-0 cursor-grab touch-pan-y active:cursor-grabbing"
            >
              <SignedImage path={slides[index].storage_path} className="h-full w-full" eager alt={`Slide ${index + 1}`} />
            </motion.div>
          </AnimatePresence>
          <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/45 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-md tnum">
            {index + 1} / {slides.length}
          </div>
        </div>
        <button onClick={() => go(-1)} disabled={index === 0} aria-label="Previous slide" className="absolute -left-5 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface-raised text-ink shadow-lift transition-opacity disabled:opacity-0 sm:flex">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <button onClick={() => go(1)} disabled={index === slides.length - 1} aria-label="Next slide" className="absolute -right-5 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface-raised text-ink shadow-lift transition-opacity disabled:opacity-0 sm:flex">
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
      <div className="no-scrollbar mt-4 flex max-w-full gap-2 overflow-x-auto px-1 py-1">
        {slides.map((s, i) => (
          <button key={s.id} onClick={() => setIndex([i, i > index ? 1 : -1])} className="relative shrink-0" aria-label={`Slide ${i + 1}`}>
            <SignedImage path={s.storage_path} className={cx("h-[60px] w-12 rounded-lg transition-opacity", i === index ? "opacity-100" : "opacity-55 hover:opacity-90")} />
            {i === index && <motion.span layoutId={`slide-ring-${item.id}`} transition={spring} className="absolute -inset-[3px] rounded-[11px] ring-2 ring-brand" />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CarouselMeta({ item, baseName }) {
  const { assets } = useData();
  const b = item.body || {};
  const [tab, setTab] = useState("linkedin");
  const pdf = assetsFor(assets, item.id).find((a) => a.kind === "carousel_pdf");
  const slides = slidesOf(assets, item);
  const caption = tab === "linkedin" ? b.caption_linkedin : b.caption_instagram;
  const tags = (b.hashtags || []).map((h) => `#${h.replace(/^#/, "")}`).join(" ");
  const full = [caption, tags].filter(Boolean).join("\n\n");
  return (
    <>
      <MetaSection title="Files">
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" icon={FileDown} disabled={!pdf} onClick={() => downloadPath(pdf.storage_path, downloadName(baseName, pdf, "carousel"))}>PDF</Button>
          <Button size="sm" icon={Download} disabled={!slides.length} onClick={() => downloadMany(slides.map((s, i) => ({ path: s.storage_path, name: downloadName(baseName, s, `slide-${i + 1}`) })))}>
            {slides.length} slides
          </Button>
        </div>
      </MetaSection>
      <MetaSection title="Caption">
        <Segmented size="sm" value={tab} onChange={setTab} className="mb-2.5 w-full [&>button]:flex-1 [&>button]:justify-center" options={[{ value: "linkedin", label: "LinkedIn" }, { value: "instagram", label: "Instagram" }]} />
        <CaptionBox text={caption} />
        <Hashtags tags={b.hashtags} />
        <CopyButton text={full} label="Copy caption" className="mt-3 w-full" />
      </MetaSection>
    </>
  );
}
