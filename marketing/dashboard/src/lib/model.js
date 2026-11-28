// Domain vocabulary shared by every page: labels, tones and small selectors over the loaded data.
import { FileText, GalleryHorizontalEnd, Image as ImageIcon, Clapperboard } from "lucide-react";

export const TYPE_META = {
  blog: { label: "Blog", plural: "Blogs", icon: FileText, order: 0 },
  carousel: { label: "Carousel", plural: "Carousels", icon: GalleryHorizontalEnd, order: 1 },
  graphic: { label: "Graphic", plural: "Graphics", icon: ImageIcon, order: 2 },
  video: { label: "Reel", plural: "Reels", icon: Clapperboard, order: 3 },
};

// tone -> chip colours (see components/ui.jsx StatusChip)
export const ITEM_STATUS = {
  generating: { label: "Generating", tone: "neutral", pulse: true },
  awaiting_voiceover: { label: "Needs voiceover", tone: "brand" },
  pending_review: { label: "Needs review", tone: "brand" },
  changes_requested: { label: "Changes requested", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "neutral" },
  published: { label: "Published", tone: "info" },
  failed: { label: "Failed", tone: "danger" },
};

export const TOPIC_STATUS = {
  planned: { label: "Planned", tone: "neutral" },
  producing: { label: "Producing", tone: "active", pulse: true },
  ready: { label: "Ready", tone: "ok" },
  skipped: { label: "Skipped", tone: "neutral" },
  failed: { label: "Failed", tone: "danger" },
};

export const JOB_STATUS = {
  queued: { label: "Queued", tone: "neutral", pulse: true },
  running: { label: "Running", tone: "active", pulse: true },
  done: { label: "Done", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
};

export const RUN_STATUS = {
  running: { label: "Running", tone: "active", pulse: true },
  succeeded: { label: "Succeeded", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
};

export const RUN_KIND = { weekly: "Weekly run", jobs: "Revisions", publish: "Publisher", manual: "Manual run" };
export const JOB_KIND = { run_weekly: "Weekly run", regenerate: "Revision", publish_now: "Publish now", render_video: "Render reel" };

export const REVIEWABLE = ["pending_review", "awaiting_voiceover"];

export const byType = (a, b) => (TYPE_META[a.type]?.order ?? 9) - (TYPE_META[b.type]?.order ?? 9);

export function itemTitle(item, topic) {
  if (!item) return "";
  if (item.type === "blog") return item.body?.frontmatter?.title || item.title || topic?.title || "Untitled blog";
  const base = item.title || topic?.title || "Untitled";
  return base;
}

export function captionOf(item) {
  const b = item?.body || {};
  const tags = (b.hashtags || []).map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ");
  const text = b.caption || b.caption_linkedin || b.caption_instagram || "";
  return [text, tags].filter(Boolean).join("\n\n");
}

export function assetsFor(assets, itemId) {
  return assets.filter((a) => a.content_item_id === itemId).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

export const coverOf = (assets, item) => assetsFor(assets, item.id).find((a) => a.kind === "blog_cover");

/** Small thumbnail asset for any item type. */
export function thumbOf(assets, item) {
  const list = assetsFor(assets, item.id);
  return (
    list.find((a) => a.kind === "blog_cover") ||
    list.find((a) => a.kind === "carousel_slide") ||
    list.find((a) => a.kind === "graphic" && (a.width === a.height || a.meta?.variant === "square")) ||
    list.find((a) => a.kind === "graphic") ||
    list.find((a) => a.kind === "video_poster") ||
    null
  );
}

export function blogUrl(item) {
  return item?.published_url || (item?.body?.slug ? `https://www.dhitiservices.com/blog/${item.body.slug}/` : null);
}
