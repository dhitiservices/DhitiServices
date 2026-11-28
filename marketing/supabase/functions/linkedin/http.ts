// Dhiti Marketing: outbound HTTP for the linkedin function.
//
// Why this file exists (LINKEDIN.md 10.1 #16): Deno's fetch silently sends a request a second time when it went out on
// a pooled keep-alive connection that the other side closed before any response byte arrived. For POST /rest/posts or
// a comment create that means LinkedIn can create the post or comment twice while our code only sees one clean 201,
// so reconcile never runs. Reproduced with Deno 2.9.6.
//
// Fix: every request that is not GET/HEAD goes over its own HTTP client that keeps no idle connections and speaks
// HTTP/1.1 only. Such a request always goes out on a new connection, so a lost connection surfaces as a network error
// (our code then reconciles by reading LinkedIn back) and is never re-sent behind our back. GETs keep the shared pool.

type ClientInit = RequestInit & { client?: unknown };

let noReuse: unknown = null;
let mode: "no-reuse" | "default" = "default";
try {
  // deno-lint-ignore no-explicit-any
  const create = (Deno as any).createHttpClient;
  if (typeof create === "function") {
    noReuse = create({ poolMaxIdlePerHost: 0, http1: true, http2: false });
    mode = "no-reuse";
  }
} catch (_e) {
  noReuse = null;
  mode = "default";
}

/** "no-reuse" when writes go over the dedicated client; "default" means the runtime has no createHttpClient. */
export const WRITE_CLIENT_MODE = mode;

export function linkedinFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const method = String(init.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || !noReuse) return fetch(input, init);
  return fetch(input, { ...init, client: noReuse } as ClientInit);
}
