/**
 * URL guard for every link built from stored data (research sources, blog sources, published URLs).
 * React does not block `javascript:` hrefs, and these values come from the engine (which reads untrusted web
 * pages), so only absolute http(s) URLs are ever rendered as links or opened. Anything else returns undefined,
 * which renders a non-navigating element.
 */
export function safeHref(value) {
  if (typeof value !== "string") return undefined;
  const v = value.trim();
  if (!v) return undefined;
  try {
    const u = new URL(v);
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** Opens a stored URL in a new tab only when it is a safe http(s) URL. */
export function openSafe(value) {
  const href = safeHref(value);
  if (href) window.open(href, "_blank", "noopener,noreferrer");
  return Boolean(href);
}
