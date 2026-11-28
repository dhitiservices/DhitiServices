import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationControls } from "framer-motion";
import { ArrowRight, ArrowLeft, Mail, ShieldCheck, FileText, ImagePlay, FlaskConical, Info, RotateCw } from "lucide-react";
import { Button, AppMark, Spinner, cx } from "../components/ui.jsx";
import { DEMO_AVAILABLE } from "../lib/config.js";
import { ease } from "../lib/motion.js";
import {
  CODE_LENGTH, RESEND_SECONDS, NEUTRAL_SENT, validEmail, classifySendError, verifyErrorText, savePending, loadPending, clearPending,
} from "../lib/session.js";

const FEATURES = [
  { icon: FileText, title: "Three researched blogs every week", body: "Written for travel operators, checked against the site's SEO rules." },
  { icon: ImagePlay, title: "Your media, licensed stock", body: "Your own photos and voice, plus Magnific stock with a licence trail. Never AI-generated." },
  { icon: ShieldCheck, title: "Nothing goes live without you", body: "Approve, edit or send back. Blogs publish on the days you choose." },
];

function BrandPanel() {
  return (
    <div className="mesh-ink grain relative hidden overflow-hidden lg:flex lg:w-[46%] xl:w-[50%]">
      <div className="relative z-[1] flex w-full flex-col justify-between p-12 xl:p-16">
        <img src="/brand/dhiti-logo-dark.webp" alt="Dhiti" className="h-8 w-auto self-start" />
        <div className="max-w-[520px]">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease }}
            className="text-[44px] font-bold leading-[1.05] tracking-[-0.034em] text-white xl:text-[52px]"
          >
            Your marketing,<br />on autopilot.<br /><span className="bg-gradient-to-r from-[#FF5C48] to-[#FF9A7A] bg-clip-text text-transparent">Approved by you.</span>
          </motion.h1>
          <div className="mt-10 space-y-5">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease, delay: 0.15 + i * 0.08 }}
                className="flex gap-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.08] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)]">
                  <f.icon className="h-[18px] w-[18px] text-[#FF7A66]" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-[15px] font-semibold tracking-[-0.01em] text-white">{f.title}</div>
                  <div className="mt-0.5 text-[14px] leading-5 text-white/55">{f.body}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between text-[12.5px] text-white/40">
          <span>Dhiti Services · Rural operations from Pune district</span>
          <span>Studio</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ code boxes */

/**
 * Six one-digit boxes that behave like one field: typing advances, Backspace steps back, arrows move, a pasted or
 * autofilled code (iOS/Android "From Messages/Mail", autocomplete="one-time-code") fills every box at once, and the
 * sixth digit submits.
 */
function CodeInput({ value, onChange, onComplete, disabled, invalid }) {
  const refs = useRef([]);
  const digits = Array.from({ length: CODE_LENGTH }, (_, i) => value[i] || "");
  const focus = (i) => { const el = refs.current[Math.max(0, Math.min(CODE_LENGTH - 1, i))]; el?.focus(); el?.select?.(); };

  const fill = (start, text) => {
    const incoming = text.replace(/\D/g, "");
    if (!incoming) return;
    const next = digits.slice();
    // A whole code (paste or autofill) always starts at the first box.
    const from = incoming.length >= CODE_LENGTH ? 0 : start;
    for (let k = 0; k < incoming.length && from + k < CODE_LENGTH; k++) next[from + k] = incoming[k];
    const joined = next.join("");
    onChange(joined);
    const firstEmpty = next.findIndex((d) => !d);
    if (firstEmpty === -1) {
      refs.current[CODE_LENGTH - 1]?.blur();
      onComplete(joined);
    } else focus(Math.min(firstEmpty, from + incoming.length));
  };

  const onKeyDown = (i, e) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = digits.slice();
      if (next[i]) { next[i] = ""; onChange(next.join("")); }
      else if (i > 0) { next[i - 1] = ""; onChange(next.join("")); focus(i - 1); }
    } else if (e.key === "Delete") {
      e.preventDefault();
      const next = digits.slice(); next[i] = ""; onChange(next.join(""));
    } else if (e.key === "ArrowLeft") { e.preventDefault(); focus(i - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); focus(i + 1); }
    else if (e.key === "Home") { e.preventDefault(); focus(0); }
    else if (e.key === "End") { e.preventDefault(); focus(CODE_LENGTH - 1); }
    else if (e.key.length === 1 && !/\d/.test(e.key) && !e.metaKey && !e.ctrlKey) e.preventDefault();
  };

  useEffect(() => { if (!disabled) focus(Math.max(0, digits.findIndex((d) => !d))); }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex justify-between gap-2 sm:gap-2.5" role="group" aria-label="6-digit code">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => (refs.current[i] = el)}
          value={d}
          disabled={disabled}
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          enterKeyHint={i === CODE_LENGTH - 1 ? "done" : "next"}
          aria-label={`Digit ${i + 1} of ${CODE_LENGTH}`}
          aria-invalid={invalid || undefined}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => { e.preventDefault(); fill(i, e.clipboardData.getData("text")); }}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, "");
            if (!v) return;
            // Typing over a filled box gives two characters: keep the new one.
            fill(i, v.length === 2 && d ? v.replace(d, "") || v[1] : v);
          }}
          className={cx(
            "code-box tnum h-[58px] w-full min-w-0 rounded-[14px] bg-surface text-center text-[26px] font-semibold text-ink caret-brand outline-none transition-[box-shadow,background-color] duration-150 sm:h-[62px]",
            invalid ? "code-box-invalid" : d ? "code-box-filled" : "",
            disabled && "opacity-60",
          )}
        />
      ))}
    </div>
  );
}

function Notice({ tone = "info", children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      role={tone === "error" ? "alert" : "status"}
      className={cx(
        "flex items-start gap-2.5 rounded-xl px-3.5 py-2.5 text-callout font-medium",
        tone === "error" ? "bg-brand/[0.07] text-brand-deep dark:text-brand-bright" : "bg-ink/[0.045] text-ink-soft",
      )}
    >
      <Info className="mt-px h-4 w-4 shrink-0 opacity-80" strokeWidth={2.2} />
      <span>{children}</span>
    </motion.div>
  );
}

const secondsLeft = (sentAt) => Math.max(0, Math.ceil(RESEND_SECONDS - (Date.now() - sentAt) / 1000));

/* ------------------------------------------------------------------------------------------------ login */

/**
 * Step 1: email -> signInWithOtp (shouldCreateUser; the database turns away anyone not on the allowlist).
 * Every address sees the same neutral message. Step 2: the 6-digit code -> verifyOtp. The emailed link works too
 * (handled by the Supabase client on load). The app shell appears only after the allowlist check in App.jsx.
 */
export function Login({ backend, notice, verifying, onDemo, onLeaveDemo }) {
  const pending = useRef(loadPending()).current;
  const [step, setStep] = useState(pending ? "code" : "email");
  const [email, setEmail] = useState(pending?.email || "");
  const [sentAt, setSentAt] = useState(pending?.sentAt || 0);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [left, setLeft] = useState(() => (pending ? secondsLeft(pending.sentAt) : 0));
  const shake = useAnimationControls();
  const emailRef = useRef(null);
  const demo = DEMO_AVAILABLE && backend.kind === "demo";

  useEffect(() => {
    if (step !== "code") return undefined;
    setLeft(secondsLeft(sentAt));
    const id = setInterval(() => setLeft(secondsLeft(sentAt)), 1000);
    return () => clearInterval(id);
  }, [step, sentAt]);

  // A notice from the gate (signed out for inactivity, access denied, expired link) always returns to step 1.
  useEffect(() => { if (notice) { setStep("email"); setCode(""); } }, [notice]);

  const send = useCallback(async (addr, { resend } = {}) => {
    setError(null);
    setInfo(null);
    setBusy(true);
    let res;
    try { await backend.auth.sendCode(addr); res = { kind: "sent" }; }
    catch (e) { res = classifySendError(e); }
    setBusy(false);
    if (res.kind !== "sent") { setError(res.text); return false; }
    // "wait" = a code for this address was requested moments ago: it is already in the inbox, so treat it as sent.
    const at = res.wait ? Date.now() - (RESEND_SECONDS - res.wait) * 1000 : Date.now();
    setSentAt(at);
    savePending(addr, at);
    setCode("");
    setStep("code");
    if (resend) setInfo(res.wait ? `You can ask for another code in ${res.wait} s.` : "If this email has access, a new code is on its way.");
    return true;
  }, [backend]);

  const submitEmail = (e) => {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!validEmail(addr)) { setError("Enter a valid email address."); emailRef.current?.focus(); return; }
    setEmail(addr);
    send(addr);
  };

  const verify = async (token) => {
    if (busy || verifying) return;
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      await backend.auth.verifyCode(email, token);
      // App.jsx takes it from here (allowlist check, then the app). Keep the busy state until it does.
    } catch (e) {
      setBusy(false);
      setError(verifyErrorText(e));
      setCode("");
      shake.start({ x: [0, -10, 9, -6, 4, 0], transition: { duration: 0.42, ease: "easeOut" } });
    }
  };
  useEffect(() => { if (!verifying) setBusy(false); }, [verifying]);

  const differentEmail = () => {
    clearPending();
    setStep("email");
    setCode("");
    setError(null);
    setInfo(null);
    setTimeout(() => emailRef.current?.focus(), 50);
  };

  const signingIn = busy && step === "code";

  return (
    <div className="flex min-h-dvh bg-canvas">
      <BrandPanel />
      <div className="aurora relative flex flex-1 items-center justify-center px-4 py-12 sm:px-8">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }} className="w-full max-w-[400px]">
          <AnimatePresence mode="wait" initial={false}>
            {step === "email" ? (
              <motion.div key="email" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.28, ease }}>
                <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-left">
                  <AppMark size={52} className="mb-6 shadow-lift" />
                  <h2 className="text-title-1 font-bold text-ink">Sign in to Studio</h2>
                  <p className="mt-2 text-body text-ink-mute">We'll email you a 6-digit code. No password needed.</p>
                </div>
                <form onSubmit={submitEmail} className="space-y-3" noValidate>
                  <AnimatePresence initial={false}>{notice && !error && <Notice key="notice" tone="info">{notice}</Notice>}</AnimatePresence>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink-faint" />
                    <input
                      ref={emailRef}
                      type="email"
                      name="email"
                      autoComplete="username email"
                      inputMode="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      autoFocus
                      placeholder="you@company.com"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                      className="input h-12 pl-10"
                      aria-label="Email"
                      aria-invalid={!!error || undefined}
                    />
                  </div>
                  <AnimatePresence initial={false}>{error && <Notice key="err" tone="error">{error}</Notice>}</AnimatePresence>
                  <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} iconRight={busy ? undefined : ArrowRight}>
                    {busy ? "Sending…" : "Email me a code"}
                  </Button>
                  {DEMO_AVAILABLE && !demo && (
                    <Button type="button" variant="ghost" size="md" className="w-full" icon={FlaskConical} onClick={onDemo}>Explore with sample data</Button>
                  )}
                  {demo && (
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-violet/[0.08] px-3.5 py-2.5 text-[12.5px] font-medium text-violet">
                      <span>Demo: any email works, the code is 123456.</span>
                      {onLeaveDemo && <button type="button" onClick={onLeaveDemo} className="shrink-0 font-semibold underline-offset-2 hover:underline">Leave demo</button>}
                    </div>
                  )}
                </form>
              </motion.div>
            ) : (
              <motion.div key="code" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.28, ease }}>
                <div className="mb-7 flex flex-col items-center text-center lg:items-start lg:text-left">
                  <span className="mb-6 flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-gradient-to-b from-[#FF4A33] to-[#C20600] text-white shadow-glow">
                    <Mail className="h-6 w-6" strokeWidth={2} />
                  </span>
                  <h2 className="text-title-1 font-bold text-ink">Check your email</h2>
                  <p className="mt-2 text-body text-ink-mute">{NEUTRAL_SENT}</p>
                  <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full bg-ink/[0.05] px-3 py-1 text-callout">
                    <Mail className="h-3.5 w-3.5 shrink-0 text-ink-mute" />
                    <span className="truncate font-semibold text-ink" data-testid="login-email">{email}</span>
                  </div>
                </div>

                <form onSubmit={(e) => { e.preventDefault(); if (code.length === CODE_LENGTH) verify(code); }} noValidate>
                  <label className="mb-2.5 block text-callout font-semibold text-ink-soft">Enter the 6-digit code</label>
                  <motion.div animate={shake}>
                    <CodeInput value={code} onChange={(v) => { setCode(v); if (error) setError(null); }} onComplete={verify} disabled={signingIn || verifying} invalid={!!error} />
                  </motion.div>
                  <div className="mt-3 min-h-[60px]">
                    <AnimatePresence mode="wait" initial={false}>
                      {signingIn || verifying ? (
                        <motion.div key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2 py-2.5 text-callout font-medium text-ink-mute" role="status">
                          <Spinner className="h-4 w-4" /> Signing you in…
                        </motion.div>
                      ) : error ? (
                        <Notice key="err" tone="error">{error}</Notice>
                      ) : info ? (
                        <Notice key="info">{info}</Notice>
                      ) : null}
                    </AnimatePresence>
                  </div>
                  <button type="submit" className="sr-only" tabIndex={-1}>Verify code</button>
                </form>

                <div className="mt-2 flex items-center justify-between gap-3">
                  <button type="button" onClick={differentEmail} disabled={signingIn} className="inline-flex items-center gap-1.5 rounded-lg py-1.5 text-callout font-semibold text-ink-soft transition-colors hover:text-ink disabled:opacity-50">
                    <ArrowLeft className="h-4 w-4" /> Use a different email
                  </button>
                  <button
                    type="button"
                    onClick={() => send(email, { resend: true })}
                    disabled={left > 0 || busy || verifying}
                    aria-live="polite"
                    className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-callout font-semibold text-brand-ink transition-colors hover:bg-brand/[0.07] disabled:bg-transparent disabled:text-ink-faint"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    {left > 0 ? <span>Resend in <span className="tnum">{Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</span></span> : "Resend code"}
                  </button>
                </div>

                <p className="mt-6 rounded-xl bg-ink/[0.035] px-3.5 py-3 text-[12.5px] leading-[18px] text-ink-mute">
                  The email also has a sign-in link. Opening it in this browser signs you in without the code. The code expires after an hour; only the newest one works.
                  {demo && <span className="mt-1 block font-semibold text-violet">Demo code: 123456</span>}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <p className="mt-8 flex items-center justify-center gap-1.5 text-center text-[12.5px] leading-[18px] text-ink-faint lg:justify-start lg:text-left">
            <ShieldCheck className="h-3.5 w-3.5" /> Private workspace. Only approved accounts can sign in.
          </p>
        </motion.div>
      </div>
    </div>
  );
}
