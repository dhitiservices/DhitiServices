import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ExternalLink, KeyRound, Link2, Unplug, AlertTriangle, ShieldCheck, Eye, EyeOff, RotateCw, Info, CheckCircle2, PartyPopper } from "lucide-react";
import { useData } from "../../lib/store.jsx";
import { useToast } from "../Toast.jsx";
import { Confirm } from "../Sheet.jsx";
import { Button, Card, CopyButton, Skeleton, Switch, cx } from "../ui.jsx";
import { formatDateTime, relative } from "../../lib/format.js";
import { navigate } from "../../lib/router.jsx";
import { expiryWords, warningText, friendlyError, RETURN_REASON, CLIENT_ID_RE, CLIENT_SECRET_RE, REDIRECT_URI } from "../../lib/linkedin.js";

const DEV_PORTAL = "https://www.linkedin.com/developers/apps/new";

/** What came back on the URL from the OAuth callback (?linkedin=connected | ?linkedin=error&reason=...). Read once. */
function takeReturn() {
  try {
    const q = new URLSearchParams(window.location.search);
    const v = q.get("linkedin");
    if (!v) return null;
    const reason = q.get("reason") || "";
    q.delete("linkedin"); q.delete("reason");
    const search = q.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}#linkedin`);
    return v === "connected" ? { ok: true } : { ok: false, text: RETURN_REASON[reason] || "Connecting didn't finish. Tap Connect LinkedIn to try again." };
  } catch { return null; }
}
// Read once per page load (StrictMode may run state initialisers twice); forgotten when the card unmounts.
const RET = { v: undefined };
const takeReturnOnce = () => { if (RET.v === undefined) RET.v = takeReturn(); return RET.v; };

function Step({ n, done, active, title, children }) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      <span className="absolute left-[15px] top-9 h-[calc(100%-36px)] w-px bg-ink/[0.08] [li:last-child>&]:hidden" aria-hidden />
      <span
        className={cx(
          "relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-callout font-bold transition-colors",
          done ? "bg-ok text-white" : active ? "bg-ink text-canvas" : "bg-ink/[0.06] text-ink-mute",
        )}
        aria-hidden
      >
        {done ? <Check className="h-4 w-4" strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <h3 className="text-body font-semibold text-ink">
          <span className="sr-only">Step {n}{done ? ", done" : ""}: </span>{title}
        </h3>
        <div className="mt-1 text-callout text-ink-mute">{children}</div>
      </div>
    </li>
  );
}

function Banner({ tone = "amber", title, children, action }) {
  return (
    <div className={cx("flex flex-col gap-3 rounded-2xl px-4 py-3.5 sm:flex-row sm:items-center", tone === "red" ? "bg-brand/[0.07] shadow-[inset_0_0_0_1px_rgb(var(--brand)/0.18)]" : tone === "ok" ? "bg-ok/[0.08] shadow-[inset_0_0_0_1px_rgb(var(--ok)/0.16)]" : tone === "info" ? "bg-ink/[0.045]" : "bg-warn/[0.09] shadow-[inset_0_0_0_1px_rgb(var(--warn)/0.18)]")} role={tone === "red" ? "alert" : "status"}>
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {tone === "ok" ? <PartyPopper className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : tone === "info" ? <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-mute" /> : <AlertTriangle className={cx("mt-0.5 h-4 w-4 shrink-0", tone === "red" ? "text-brand-ink" : "text-warn")} />}
        <div className="min-w-0">
          <div className={cx("text-callout font-semibold", tone === "red" ? "text-brand-ink" : tone === "ok" ? "text-ok" : tone === "info" ? "text-ink" : "text-warn")}>{title}</div>
          {children && <div className="mt-0.5 text-[12.5px] text-ink-soft">{children}</div>}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Client ID + Client Secret. The secret field is masked, never filled from anywhere, sent only to save_app and cleared. */
function KeysForm({ status, onSaved, disabled }) {
  const d = useData();
  const toast = useToast();
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const saved = !!status?.secret_saved;
  const [open, setOpen] = useState(!saved);
  useEffect(() => { setOpen(!saved); }, [saved]);
  useEffect(() => { if (open) setClientId(status?.client_id || ""); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const idOk = CLIENT_ID_RE.test(clientId.trim());
  const secretOk = CLIENT_SECRET_RE.test(secret);

  const submit = async (e) => {
    e.preventDefault();
    if (!idOk || !secretOk || busy) return;
    setBusy(true); setErr(null);
    // Take the value out of state before the call, so it lives only in this request.
    const value = secret;
    setSecret(""); setShow(false);
    try {
      await d.actions.linkedinSaveApp(clientId.trim(), value);
      toast({ tone: "ok", title: "Keys saved", description: "The secret is locked away. It can't be shown again.", duration: 3200 });
      setOpen(false);
      onSaved();
    } catch (ex) {
      setErr(friendlyError(ex));
    } finally { setBusy(false); }
  };

  if (!open) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-ink/[0.035] px-3.5 py-2.5">
        <ShieldCheck className="h-4 w-4 text-ok" />
        <span className="min-w-0 flex-1 text-[12.5px] text-ink-soft">
          <span className="font-semibold text-ink">Secret saved</span>{status?.app_saved_at ? ` ${relative(status.app_saved_at)}` : ""}. Client ID <span className="tnum font-medium text-ink">{status?.client_id}</span>.
        </span>
        <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => setOpen(true)} disabled={disabled}>Change keys</Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-2xl bg-surface p-4 shadow-[0_0_0_1px_var(--hairline-strong)]" autoComplete="off" data-testid="li-keys-form">
      <p className="text-[12.5px] text-ink-mute">Find both on LinkedIn: your app, then the <span className="font-semibold text-ink-soft">Auth</span> tab. Paste them here only, never in a chat or email.</p>
      <label className="block">
        <span className="mb-1.5 block text-callout font-semibold text-ink-soft">Client ID</span>
        <input className="input h-11 tnum" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="text" name="li-client-id" aria-label="Client ID" disabled={disabled || busy} aria-invalid={clientId && !idOk ? true : undefined} />
        {clientId && !idOk && <span className="mt-1 block text-[12px] font-medium text-brand-ink">Letters, numbers, - and _ only (6 to 64).</span>}
      </label>
      <label className="block">
        <span className="mb-1.5 block text-callout font-semibold text-ink-soft">Client Secret</span>
        <span className="relative block">
          <input
            className="input h-11 pr-11"
            type={show ? "text" : "password"}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            name="li-client-secret" aria-label="Client Secret"
            data-lpignore="true"
            data-1p-ignore="true"
            disabled={disabled || busy}
            placeholder={saved ? "Paste a new secret to replace the saved one" : ""}
            aria-invalid={secret && !secretOk ? true : undefined}
          />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-mute hover:bg-ink/[0.05] hover:text-ink" aria-label={show ? "Hide secret" : "Show secret"} aria-pressed={show}>
            {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
        <span className="mt-1 block text-[12px] text-ink-mute">Sent only to our LinkedIn service and locked away. It is never shown again.</span>
        {secret && !secretOk && <span className="mt-1 block text-[12px] font-medium text-brand-ink">That doesn't look like a Client Secret (8 or more characters, no spaces).</span>}
      </label>
      {err && <div className="flex items-start gap-2 rounded-xl bg-brand/[0.07] px-3.5 py-2.5 text-[12.5px] font-medium text-brand-deep dark:text-brand-bright" role="alert"><AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />{err}</div>}
      <div className="flex items-center justify-end gap-2">
        {saved && <Button type="button" variant="ghost" onClick={() => { setSecret(""); setOpen(false); }}>Cancel</Button>}
        <Button type="submit" variant="primary" icon={KeyRound} loading={busy} disabled={disabled || !idOk || !secretOk || busy}>Save keys</Button>
      </div>
    </form>
  );
}

export function LinkedInSettings() {
  const d = useData();
  const toast = useToast();
  const [status, setStatus] = useState(null);
  const [problem, setProblem] = useState(null); // { code, text }
  const [loading, setLoading] = useState(true);
  const [returned] = useState(takeReturnOnce);
  const [connecting, setConnecting] = useState(false);
  const [picking, setPicking] = useState(null);
  const [confirm, setConfirm] = useState(false);
  const [forget, setForget] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; RET.v = null; }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await d.actions.linkedinStatus();
      if (!alive.current) return;
      setStatus(s); setProblem(null);
    } catch (e) {
      if (!alive.current) return;
      setProblem({ code: e?.code, text: friendlyError(e) });
    } finally { if (alive.current) setLoading(false); }
  }, [d.actions]);
  useEffect(() => { refresh(); }, [refresh]);
  // A change pushed by realtime (another tab, the callback) refreshes the card.
  const rowKey = d.linkedin ? `${d.linkedin.status}|${d.linkedin.paused}|${d.linkedin.updated_at || ""}` : "";
  const firstRow = useRef(rowKey);
  useEffect(() => { if (rowKey !== firstRow.current) { firstRow.current = rowKey; refresh(); } }, [rowKey, refresh]);
  useEffect(() => {
    if (returned && window.location.hash === "#linkedin") requestAnimationFrame(() => document.getElementById("linkedin")?.scrollIntoView({ block: "start" }));
  }, [returned]);

  const s = status || (d.linkedin ? { ...d.linkedin, secret_saved: !!d.linkedin.client_id, org: d.linkedin.org_urn ? { name: d.linkedin.org_name, logo_url: d.linkedin.org_logo_url } : null, warnings: [] } : null);
  const st = s?.status || "not_configured";
  const unavailable = problem?.code === "UNAVAILABLE";
  const keysSaved = !!s?.secret_saved;
  const connected = st === "connected";
  const needsReconnect = ["expired", "revoked", "error"].includes(st);

  const connect = async () => {
    setConnecting(true);
    try { await d.actions.linkedinConnect(); } catch (e) {
      toast({ tone: "danger", title: "Couldn't open LinkedIn", description: friendlyError(e) });
      setConnecting(false);
    }
  };
  const selectOrg = async (urn) => {
    setPicking(urn);
    try { setStatus(await d.actions.linkedinSelectOrg(urn)); toast({ tone: "ok", title: "Page connected", duration: 2600 }); } catch (e) {
      toast({ tone: "danger", title: "Couldn't pick that page", description: friendlyError(e) });
    } finally { setPicking(null); }
  };
  const disconnect = async () => {
    try {
      await d.actions.linkedinDisconnect(forget);
      toast({ tone: "neutral", title: "LinkedIn disconnected", description: forget ? "Your keys were deleted too." : "Your keys are kept. Connect again any time." });
      await refresh();
    } catch (e) {
      toast({ tone: "danger", title: "Couldn't disconnect", description: friendlyError(e) });
    }
  };
  const pause = async (v) => {
    try { await d.actions.linkedinPause(v); setStatus((x) => (x ? { ...x, paused: v } : x)); } catch (e) {
      toast({ tone: "danger", title: "Couldn't change it", description: friendlyError(e) });
    }
  };

  const warnings = (s?.warnings || []).map((w) => ({ ...w, ...warningText(w) }));
  const expiry = connected ? expiryWords(s) : null;
  const failedPost = d.socialPosts.find((p) => p.status === "failed" || p.comment_status === "failed");

  return (
    <section id="linkedin" className="scroll-mt-20" aria-labelledby="li-settings-title" data-testid="li-settings" data-state={unavailable ? "unavailable" : st}>
      <h2 id="li-settings-title" className="mb-3 text-headline font-semibold">LinkedIn</h2>
      <Card className="overflow-hidden">
        {loading && !s ? (
          <div className="space-y-3 p-5"><Skeleton className="h-6 w-56" /><Skeleton className="h-4 w-80" /><Skeleton className="h-32 rounded-2xl" /></div>
        ) : (
          <>
            {/* top: who we're connected to, or what this does */}
            <div className="relative overflow-hidden px-5 py-5 sm:px-6">
              <div className={cx("pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b to-transparent", connected ? "from-ok/[0.07]" : "from-info/[0.06]")} aria-hidden />
              {connected ? (
                <div className="relative flex flex-wrap items-center gap-4">
                  <OrgLogo url={s?.org?.logo_url} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-headline font-semibold text-ink"><CheckCircle2 className="h-[18px] w-[18px] shrink-0 text-ok" /> <span className="truncate">Connected to {s?.org?.name || "your page"}</span></div>
                    <div className="mt-0.5 text-callout text-ink-mute" data-testid="li-expiry">{expiry || "Connected"}{s?.paused ? " · Posting is paused" : ""}</div>
                  </div>
                  <Button variant="danger" icon={Unplug} onClick={() => { setForget(false); setConfirm(true); }}>Disconnect</Button>
                </div>
              ) : (
                <div className="relative">
                  <div className="text-headline font-semibold text-ink">{needsReconnect ? "LinkedIn needs you to connect again" : "Post every blog on the Dhiti Services page"}</div>
                  <p className="mt-1 max-w-[560px] text-callout text-ink-mute">
                    {needsReconnect
                      ? "Approved posts wait safely until you connect again."
                      : "After a blog goes live, its LinkedIn post goes out on the page, with the blog link in the first comment. Nothing posts without your Approve."}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2.5 px-5 sm:px-6 [&:empty]:hidden">
              {returned?.ok && connected && <Banner tone="ok" title={`Connected to ${s?.org?.name || "your page"}`}>Approved blogs now post on LinkedIn after they go live.</Banner>}
              {returned && !returned.ok && <Banner tone="red" title="LinkedIn didn't connect">{returned.text}</Banner>}
              {unavailable && <Banner tone="info" title="LinkedIn posting is not switched on yet">Your developer needs to turn on the LinkedIn service first. You can come back here after that.</Banner>}
              {problem && !unavailable && <Banner tone="amber" title="Couldn't check LinkedIn" action={<Button size="sm" variant="secondary" icon={RotateCw} onClick={refresh}>Try again</Button>}>{problem.text}</Banner>}
              {warnings.map((w) => (
                <Banner key={w.code} tone={w.level === "red" ? "red" : "amber"} title={w.title}
                  action={w.action === "reconnect" ? <Button size="sm" variant="primary" icon={Link2} onClick={connect} loading={connecting}>Connect again</Button>
                    : w.action === "open_failed" && failedPost ? <Button size="sm" variant="secondary" onClick={() => navigate(`/review/${failedPost.blog_item_id}`)}>Open it</Button> : null}
                >
                  {w.text}
                </Banner>
              ))}
            </div>

            {connected && (
              <div className="mt-4 flex items-center justify-between gap-4 border-y border-[color:var(--hairline)] px-5 py-4 sm:px-6">
                <div>
                  <div className="text-body font-semibold text-ink">Pause LinkedIn posting</div>
                  <div className="mt-0.5 text-[12.5px] text-ink-mute">Nothing posts while this is on. Approved posts wait.</div>
                </div>
                <Switch checked={!!s?.paused} onChange={pause} label="Pause LinkedIn posting" />
              </div>
            )}

            {/* the four steps; folded away once connected */}
            {connected ? (
              <details className="group px-5 py-4 sm:px-6 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between text-callout font-semibold text-ink-soft hover:text-ink">
                  Setup steps (all done)
                  <span className="text-ink-faint transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <div className="pt-4"><Steps s={s} st={st} keysSaved={keysSaved} unavailable={unavailable} connecting={connecting} connect={connect} selectOrg={selectOrg} picking={picking} onSaved={refresh} /></div>
              </details>
            ) : (
              <div className="px-5 pb-6 pt-5 sm:px-6"><Steps s={s} st={st} keysSaved={keysSaved} unavailable={unavailable} connecting={connecting} connect={connect} selectOrg={selectOrg} picking={picking} onSaved={refresh} /></div>
            )}
          </>
        )}
      </Card>

      <Confirm
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Disconnect LinkedIn?"
        description="Nothing posts on LinkedIn until you connect again. Approved posts wait. Blogs still go live on the website."
        confirmLabel="Disconnect"
        tone="danger"
        onConfirm={disconnect}
      >
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-ink/[0.04] p-3 text-callout text-ink-soft">
          <input type="checkbox" checked={forget} onChange={(e) => setForget(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#C20600]" />
          <span>Also delete my app keys (Client ID and Secret)</span>
        </label>
      </Confirm>
    </section>
  );
}

function OrgLogo({ url }) {
  const [bad, setBad] = useState(false);
  const ok = url && !bad && (url.startsWith("/") || /^https:\/\/media\.licdn\.com\//.test(url));
  return (
    <span className="relative inline-flex h-14 w-14 shrink-0 overflow-hidden rounded-[14px] bg-white shadow-[0_0_0_1px_rgb(0_0_0/0.08),0_6px_18px_-8px_rgb(var(--shadow)/0.35)]">
      <img src={ok ? url : "/brand/dhiti-mark.webp"} onError={() => setBad(true)} alt="" className="h-full w-full scale-[1.12] object-cover" referrerPolicy="no-referrer" draggable={false} />
    </span>
  );
}

function Steps({ s, st, keysSaved, unavailable, connecting, connect, selectOrg, picking, onSaved }) {
  const connected = st === "connected";
  const redirect = s?.redirect_uri || REDIRECT_URI;
  const step = connected ? 5 : st === "choose_org" ? 4 : keysSaved ? 4 : 1;
  return (
    <ol data-testid="li-steps">
      <Step n={1} done={keysSaved} active={step === 1} title="Create the app">
        On LinkedIn Developers, create a new app for the <span className="font-semibold text-ink-soft">Dhiti Services</span> page. In its <span className="font-semibold text-ink-soft">Auth</span> tab, add this link under Redirect URLs:
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-ink/[0.04] p-2 pl-3">
          <code className="min-w-0 flex-1 break-all font-sans text-[12px] font-medium text-ink">{redirect}</code>
          <CopyButton text={redirect} label="Copy" />
        </div>
        <a href={DEV_PORTAL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-callout font-semibold text-info hover:underline">Open LinkedIn Developers <ExternalLink className="h-3.5 w-3.5" /></a>
      </Step>
      <Step n={2} done={keysSaved} active={step === 1} title="Ask LinkedIn for access">
        In the app's <span className="font-semibold text-ink-soft">Products</span> tab, ask for the <span className="font-semibold text-ink-soft">Community Management API</span>. LinkedIn checks it. This can take a few days to a few weeks.
      </Step>
      <Step n={3} done={keysSaved} active={step === 1 || step === 3} title="Paste your keys">
        Copy the Client ID and Client Secret from the app's Auth tab.
        <KeysForm status={s} onSaved={onSaved} disabled={unavailable} />
      </Step>
      <Step n={4} done={connected} active={step === 4} title="Connect the Dhiti page">
        {st === "choose_org" ? (
          <>
            <span>Your account looks after more than one page. Pick Dhiti Services.</span>
            <div className="mt-3 space-y-2" role="list">
              {(s?.org_candidates || []).map((o) => (
                <div key={o.org_urn} role="listitem" className="flex items-center gap-3 rounded-xl bg-surface p-3 shadow-[0_0_0_1px_var(--hairline-strong)]">
                  <span className="min-w-0 flex-1 truncate text-callout font-semibold text-ink">{o.org_name}</span>
                  <Button size="sm" variant={/dhiti services/i.test(o.org_name) ? "primary" : "secondary"} onClick={() => selectOrg(o.org_urn)} loading={picking === o.org_urn} disabled={!!picking}>Use this page</Button>
                </div>
              ))}
            </div>
          </>
        ) : connected ? (
          <span>Done. Connected {s?.connected_at ? formatDateTime(s.connected_at) : ""}.</span>
        ) : (
          <>
            <span>You go to LinkedIn, sign in as the page admin and tap Allow. Then you come back here.</span>
            <div className="mt-3">
              <Button variant="primary" icon={Link2} onClick={connect} loading={connecting} disabled={!keysSaved || unavailable || connecting} data-testid="li-connect">
                {["expired", "revoked", "error"].includes(st) ? "Connect again" : "Connect LinkedIn"}
              </Button>
              {!keysSaved && <span className="ml-3 text-[12px] text-ink-faint">Paste your keys first.</span>}
            </div>
          </>
        )}
      </Step>
    </ol>
  );
}

export default LinkedInSettings;
