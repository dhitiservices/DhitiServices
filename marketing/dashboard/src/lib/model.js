// Domain vocabulary shared by every page: labels, tones and small selectors over the loaded data.
import { FileText, GalleryHorizontalEnd, Image as ImageIcon, Clapperboard } from "lucide-react";

export const TYPE_META = {
  blog: { label: "Blog", plural: "Blogs", icon: FileText, order: 0 },
  carousel: { label: "Carousel", plural: "Carousels", icon: GalleryHorizontalEnd, order: 1 },
  graphic: { label: "Graphic", plural: "Graphics", icon: ImageIcon, order: 2 },
  video: { label: "Reel", plural: "Reels", icon: Clapperboard, order: 3 },
};

// tone -> chip colours (see components/ui.jsx StatusChip). Labels are the owner's words (ARCHITECTURE v3.2).
export const ITEM_STATUS = {
  generating: { label: "Making it", tone: "neutral", pulse: true },
  awaiting_voiceover: { label: "Needs your voice", tone: "brand" },
  pending_review: { label: "Ready for you", tone: "brand" },
  changes_requested: { label: "Sent back", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Not used", tone: "neutral" },
  published: { label: "Live", tone: "info" },
  failed: { label: "Something went wrong", tone: "danger" },
};

export const TOPIC_STATUS = {
  planned: { label: "Planned", tone: "neutral" },
  producing: { label: "Making it", tone: "active", pulse: true },
  ready: { label: "Ready", tone: "ok" },
  skipped: { label: "Skipped", tone: "neutral" },
  failed: { label: "Something went wrong", tone: "danger" },
};

export const JOB_STATUS = {
  queued: { label: "Waiting", tone: "neutral", pulse: true },
  running: { label: "Working", tone: "active", pulse: true },
  done: { label: "Done", tone: "ok" },
  failed: { label: "Didn't work", tone: "danger" },
};

export const RUN_STATUS = {
  running: { label: "Working", tone: "active", pulse: true },
  succeeded: { label: "Done", tone: "ok" },
  failed: { label: "Didn't work", tone: "danger" },
};

export const RUN_KIND = { weekly: "Making this week's blogs", jobs: "Daily fixes", publish: "Posting to the website", manual: "Extra work" };
export const JOB_KIND = { run_weekly: "Making this week's blogs", regenerate: "Fixing something you sent back", publish_now: "Putting a blog live now", render_video: "Adding your voice to a reel" };

/** Graphic styles (body.kind) in plain words. */
export const GRAPHIC_KIND = { stat: "Number", tip: "Tip", quote: "Quote" };
export const graphicKind = (k) => GRAPHIC_KIND[k] || (k ? k[0].toUpperCase() + k.slice(1) : "");

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
