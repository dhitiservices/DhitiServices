import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Download, Square, RectangleHorizontal } from "lucide-react";
import { useData } from "../../lib/store.jsx";
import { assetsFor, captionOf, graphicKind } from "../../lib/model.js";
import { downloadPath, downloadName } from "../../lib/media.js";
import { spring } from "../../lib/motion.js";
import { SignedImage } from "../Media.jsx";
import { Button, CopyButton, Segmented, EmptyState } from "../ui.jsx";
import { MetaSection, MetaRow, CaptionBox, Hashtags, useAutoPost, AutoPostNote } from "./Meta.jsx";

export function graphicVariants(assets, item) {
  const list = assetsFor(assets, item.id).filter((a) => a.kind === "graphic");
  const square = list.find((a) => a.meta?.variant === "square" || (a.width && a.width === a.height)) || list[0];
  const landscape = list.find((a) => a.meta?.variant === "landscape" || (a.width && a.height && a.width > a.height)) || list.find((a) => a !== square);
  return { square, landscape };
}

export function GraphicStage({ item, variant, setVariant }) {
  const { assets } = useData();
  const v = graphicVariants(assets, item);
  const asset = v[variant] || v.square || v.landscape;
  if (!asset) return <EmptyState title="The graphic isn't ready yet" />;
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col items-center">
      <Segmented
        value={variant}
        onChange={setVariant}
        className="mb-5"
        layoutId={`gv-${item.id}`}
        label="Shape" options={[{ value: "square", label: "Square", icon: Square }, { value: "landscape", label: "Wide", icon: RectangleHorizontal }]}
      />
      <motion.div layout transition={spring} className={variant === "landscape" ? "w-full" : "w-full max-w-[520px]"}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={asset.id} initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
            <SignedImage
              path={asset.storage_path}
              eager
              className={`w-full rounded-[18px] shadow-[0_0_0_1px_var(--hairline),0_24px_60px_-24px_rgb(var(--shadow)/0.4)] ${variant === "landscape" ? "aspect-[1200/627]" : "aspect-square"}`}
            />
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

export function GraphicMeta({ item, variant, baseName }) {
  const { assets } = useData();
  const auto = useAutoPost(item);
  const v = graphicVariants(assets, item);
  const b = item.body || {};
  const cap = captionOf(item);
  return (
    <>
      <MetaSection title="Files">
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant={variant === "square" ? "secondary" : "ghost"} icon={Download} disabled={!v.square} onClick={() => downloadPath(v.square.storage_path, downloadName(baseName, v.square, "square"))}>Square</Button>
          <Button size="sm" variant={variant === "landscape" ? "secondary" : "ghost"} icon={Download} disabled={!v.landscape} onClick={() => downloadPath(v.landscape.storage_path, downloadName(baseName, v.landscape, "landscape"))}>Wide</Button>
        </div>
      </MetaSection>
      {auto && <AutoPostNote item={item} post={auto} />}
      <MetaSection title={auto ? "Caption for other sites" : "Caption"}>
        <CaptionBox text={b.caption} />
        <Hashtags tags={b.hashtags} />
        <CopyButton text={cap} label="Copy caption" className="mt-3 w-full" />
      </MetaSection>
      <MetaSection title="What it shows">
        <MetaRow label="Style">{graphicKind(b.kind)}</MetaRow>
        {b.stat && <MetaRow label="Number">{b.stat}</MetaRow>}
        {b.attribution && <MetaRow label="Said by">{b.attribution}</MetaRow>}
      </MetaSection>
    </>
  );
}

export function useGraphicVariant(item) {
  const [variant, setVariant] = useState("square");
  useEffect(() => setVariant("square"), [item?.id]);
  return [variant, setVariant];
}
