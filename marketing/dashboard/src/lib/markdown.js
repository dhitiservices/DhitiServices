import { Marked } from "marked";
import DOMPurify from "dompurify";

const marked = new Marked({ gfm: true, breaks: false, async: false });

let hooked = false;
function hook() {
  if (hooked) return;
  hooked = true;
  // External links open in a new tab without leaking the dashboard as opener/referrer.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.getAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer nofollow");
    }
  });
}

/** Markdown -> sanitised HTML (safe to inject). Raw HTML, scripts, styles, iframes and event handlers are removed. */
export function renderMarkdown(md = "") {
  hook();
  const html = marked.parse(String(md));
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "script", "iframe", "form", "input", "button", "object", "embed", "svg", "math"],
    FORBID_ATTR: ["style", "class", "id"],
    ALLOW_DATA_ATTR: false,
  });
}

/** Headings for the in-article outline. */
export function outline(md = "") {
  return String(md)
    .split("\n")
    .filter((l) => /^##\s+/.test(l))
    .map((l) => l.replace(/^##\s+/, "").replace(/[*_`]/g, "").trim());
}
