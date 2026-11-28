import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Mail, KeyRound, ShieldCheck, FileText, ImagePlay, CheckCircle2, FlaskConical, LogOut, Lock } from "lucide-react";
import { Button, AppMark, cx } from "../components/ui.jsx";
import { DEMO_AVAILABLE } from "../lib/config.js";
import { spring, ease } from "../lib/motion.js";

const FEATURES = [
  { icon: FileText, title: "Three researched blogs every week", body: "Written for travel operators, checked against the site's SEO rules." },
  { icon: ImagePlay, title: "Licensed stock only", body: "Every photo and clip is Magnific stock with a licence trail. Never AI-generated." },
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
          <span>Studio v2</span>
        </div>
      </div>
    </div>
  );
}

export function Login({ backend, onDemo }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState("link"); // link | password
  const [state, setState] = useState({ busy: false, sent: false, error: null });

  const submit = async (e) => {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(addr)) return setState({ busy: false, sent: false, error: "Enter a valid email address." });
    setState({ busy: true, sent: false, error: null });
    try {
      if (mode === "link") {
        await backend.auth.signInWithOtp(addr);
        setState({ busy: false, sent: true, error: null });
      } else {
        await backend.auth.signInWithPassword(addr, password);
      }
    } catch (err) {
      const msg = /rate|seconds/i.test(err.message) ? "Too many attempts. Wait a minute and try again." : /invalid/i.test(err.message) ? "That email and password don't match." : err.message;
      setState({ busy: false, sent: false, error: msg });
    }
  };

  return (
    <div className="flex min-h-dvh bg-canvas">
      <BrandPanel />
      <div className="aurora relative flex flex-1 items-center justify-center px-5 py-12 sm:px-8">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease }}
          className="w-full max-w-[400px]"
        >
          <div className="mb-8 flex flex-col items-center text-center lg:items-start lg:text-left">
            <AppMark size={52} className="mb-6 shadow-lift" />
            <h2 className="text-title-1 font-bold text-ink">Sign in to Studio</h2>
            <p className="mt-2 text-body text-ink-mute">Review and approve this week's blogs, carousels, graphics and reels.</p>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {state.sent ? (
              <motion.div
                key="sent"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={spring}
                className="card p-6 text-center"
              >
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-ok/10">
                  <CheckCircle2 className="h-6 w-6 text-ok" strokeWidth={2} />
                </div>
                <div className="text-headline font-semibold">Check your inbox</div>
                <p className="mt-1.5 text-body text-ink-mute">
                  We sent a sign-in link to <span className="font-semibold text-ink">{email.trim()}</span>. It works once and expires in an hour.
                </p>
                <button className="mt-5 text-callout font-semibold text-brand-ink hover:underline" onClick={() => setState({ busy: false, sent: false, error: null })}>
                  Use a different email
                </button>
              </motion.div>
            ) : (
              <motion.form key="form" onSubmit={submit} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3" noValidate>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink-faint" />
                  <input
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    autoFocus
                    placeholder="you@dhitiservices.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input h-12 pl-10"
                    aria-label="Email"
                  />
                </div>
                <AnimatePresence initial={false}>
                  {mode === "password" && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease }} className="overflow-hidden">
                      <div className="relative pt-0">
                        <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-ink-faint" />
                        <input
                          type="password"
                          autoComplete="current-password"
                          placeholder="Password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="input h-12 pl-10"
                          aria-label="Password"
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {state.error && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-xl bg-brand/[0.07] px-3.5 py-2.5 text-callout font-medium text-brand-deep dark:text-brand-bright">
                      {state.error}
                    </motion.div>
                  )}
                </AnimatePresence>
                <Button type="submit" variant="primary" size="lg" className="w-full" loading={state.busy} iconRight={state.busy ? undefined : ArrowRight}>
                  {mode === "link" ? "Email me a sign-in link" : "Sign in"}
                </Button>
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-ink/[0.08]" />
                  <span className="text-caption font-semibold uppercase tracking-[0.08em] text-ink-faint">or</span>
                  <div className="h-px flex-1 bg-ink/[0.08]" />
                </div>
                <Button type="button" variant="secondary" size="lg" className="w-full" icon={mode === "link" ? KeyRound : Mail} onClick={() => { setMode(mode === "link" ? "password" : "link"); setState({ busy: false, sent: false, error: null }); }}>
                  {mode === "link" ? "Sign in with a password" : "Use a sign-in link instead"}
                </Button>
                {DEMO_AVAILABLE && (
                  <Button type="button" variant="ghost" size="md" className="w-full" icon={FlaskConical} onClick={onDemo}>
                    Explore with sample data
                  </Button>
                )}
              </motion.form>
            )}
          </AnimatePresence>

          <p className="mt-8 text-center text-[12.5px] leading-[18px] text-ink-faint lg:text-left">
            Access is limited to the Dhiti team. Your email must be on the team list.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export function NotAuthorised({ email, onSignOut }) {
  return (
    <div className="aurora flex min-h-dvh items-center justify-center px-5">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }} className="card w-full max-w-[420px] p-8 text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-brand/15 to-brand/5">
          <Lock className="h-6 w-6 text-brand-ink" strokeWidth={2} />
        </div>
        <h1 className="text-title-2 font-bold">This account isn't on the team</h1>
        <p className="mt-2 text-body text-ink-mute">
          <span className={cx("font-semibold text-ink")}>{email}</span> is signed in, but it isn't on Dhiti Studio's team list.
          Ask the owner to add it, then sign in again.
        </p>
        <Button variant="secondary" size="lg" className="mt-6 w-full" icon={LogOut} onClick={onSignOut}>Sign out</Button>
      </motion.div>
    </div>
  );
}
