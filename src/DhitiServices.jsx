import { useState, useEffect, useRef } from "react";
import {
  Database, Headphones, ShieldCheck, Building2, UserPlus, GraduationCap,
  Users, CheckCircle2, BadgeCheck, ArrowUpRight, ArrowRight, MoveRight,
  MapPin, Mail, Phone, Plus, Minus, Menu, X, Sprout, Home, HeartHandshake,
  Coins, Scale, Sparkles, Camera, ChevronDown
} from "lucide-react";

import { motion } from "framer-motion";
import logoAhotel from "./assets/logos/ahotel.png";
import logoVillageTokri from "./assets/logos/villagetokri.png";
import logoDhiti from "./assets/logos/dhiti-logo.png";
import leaderVidya from "./assets/photos/leader-vidya.jpg";
import leaderPrajakta from "./assets/photos/leader-prajakta.jpg";
import imgProblem from "./assets/photos/problem.jpg";
import imgStory from "./assets/photos/story.jpg";
import imgServiceData from "./assets/photos/service-data.jpg";
import imgServiceSupport from "./assets/photos/service-support.jpg";
import imgServiceQuality from "./assets/photos/service-quality.jpg";
import imgServiceGroup from "./assets/photos/service-group.jpg";
import imgTrainRecruit from "./assets/photos/train-recruit.jpg";
import imgTrainTrain from "./assets/photos/train-train.jpg";
import imgTrainMentor from "./assets/photos/train-mentor.jpg";
import imgTrainDeliver from "./assets/photos/train-deliver.jpg";
import imgWhy from "./assets/photos/why-choose.jpg";
import imgImpactIncome from "./assets/photos/impact-income.jpg";
import imgImpactSkills from "./assets/photos/impact-skills.jpg";
import imgImpactNoReloc from "./assets/photos/impact-norelocation.jpg";
import imgImpactDignity from "./assets/photos/impact-dignity.jpg";
import imgDoorBusiness from "./assets/photos/door-business.jpg";
import imgDoorCareers from "./assets/photos/door-careers.jpg";
import imgBandTeam from "./assets/photos/band-team.jpg";
import logoVervotech from "./assets/logos/vervotech.png";
import logoZentrumHub from "./assets/logos/zentrumhub.png";
import logoZealConnect from "./assets/logos/zealconnect.png";
import logoTechspian from "./assets/logos/techspian.png";
import logoGuestara from "./assets/logos/guestara.png";
import logoXeni from "./assets/logos/xeni.png";

const DHITI_LOGOS = [{"name": "Vervotech", "src": logoVervotech, "dark": false}, {"name": "ZentrumHub", "src": logoZentrumHub, "dark": false}, {"name": "Zeal Connect", "src": logoZealConnect, "dark": false}, {"name": "techspian", "src": logoTechspian, "dark": false}, {"name": "guestara", "src": logoGuestara, "dark": false}, {"name": "XENI", "src": logoXeni, "dark": false}, {"name": "@hotel", "src": logoAhotel, "dark": false}, {"name": "Bay Organics", "src": logoVillageTokri, "dark": false}];


/* ============================================================
   DHITI SERVICES premium marketing site (single file)
   Brand color: #ee0800 (vivid red). White bg, near-black text,
   red as the single confident accent + warm-charcoal feature bands.
   (Temp logo recreated as a red wordmark, swap when final logo lands.)
   ============================================================ */



/* ---------- data ---------- */
const STATS = [
  { v: 50, suf: "+", l: "people trained and working" },
  { v: 4, suf: "", l: "service lines run end to end" },
  { v: 100, suf: "%", l: "of work passes a quality check" },
  { v: 6, suf: "", l: "brands that trust us" },
];

const DHITI_IMAGES = {
  prob: imgProblem,
  story: imgStory,
  svc1: imgServiceData,
  svc2: imgServiceSupport,
  svc3: imgServiceQuality,
  svc4: imgServiceGroup,
  step1: imgTrainRecruit,
  step2: imgTrainTrain,
  step3: imgTrainMentor,
  step4: imgTrainDeliver,
  why: imgWhy,
  imp1: imgImpactIncome,
  imp2: imgImpactSkills,
  imp3: imgImpactNoReloc,
  imp4: imgImpactDignity,
  doorBiz: imgDoorBusiness,
  doorPpl: imgDoorCareers,
  band: imgBandTeam,
};

const SERVICES = [
  { idx: "01", Icon: Database, img: DHITI_IMAGES.svc1, tag: "Entry, cataloguing and reconciliation, verified.", shot: "Close-up of hands typing data on a laptop", t: "Data & Back Office Operations", b: "Data entry, cataloguing, document processing and reconciliation, each with a verification step built in. You hand us the volume; we return work that is checked before it ever reaches you. Accuracy is the product, not an afterthought." },
  { idx: "02", Icon: Headphones, img: DHITI_IMAGES.svc2, tag: "A calm, trained front line for customers.", shot: "A team member on a headset, mid-call", t: "Customer & Process Support", b: "Phone and written support, query handling and follow ups for businesses that need a dependable front line. Calm, trained and consistent, so your customers get the same quality of answer every time, no matter who picks up." },
  { idx: "03", Icon: ShieldCheck, img: DHITI_IMAGES.svc3, tag: "An independent second pass on every output.", shot: "Two people checking work on one screen", t: "Quality & Audit", b: "Checking, verification and compliance passes on operational work, where accuracy matters more than speed. A second set of eyes that catches what a busy team misses, before a small error becomes an expensive one." },
  { idx: "04", Icon: Building2, img: DHITI_IMAGES.svc4, tag: "A dedicated, embedded extension of your team.", shot: "A small team working together at desks", t: "Group & Internal Operations", b: "Ongoing operational support run as a dedicated, embedded extension of your team. The same standards and accountability on every process, proven on real operations and held to the last detail." },
];

const STEPS = [
  { Icon: UserPlus, img: DHITI_IMAGES.step1, shot: "A new joinee welcomed at the reception desk", t: "Recruit", b: "We hire locally. No prior office experience required. We look for willingness to learn, not a polished resume, because everything else can be taught to someone who genuinely wants to grow." },
  { Icon: GraduationCap, img: DHITI_IMAGES.step2, shot: "A trainer teaching in front of a screen or board", t: "Train", b: "We teach communication, computer literacy and the specific skills each role needs, before anyone is put in front of real work. Structured and deliberate, never improvised on the job." },
  { Icon: Users, img: DHITI_IMAGES.step3, shot: "A senior and a junior looking at one laptop", t: "Mentor", b: "New hires shadow experienced team members on practice work, with direct feedback at every step, until they are genuinely ready to go live. No one is thrown in unprepared." },
  { Icon: BadgeCheck, img: DHITI_IMAGES.step4, shot: "A focused person owning live work at their desk", t: "Deliver", b: "Trained teams take full ownership of live work, for group companies first and then external clients, with quality checks built into every stage. Ownership, not just attendance." },
];

const REASONS = [
  { Icon: ShieldCheck, t: "Quality is built in, not bolted on", b: "Verification is part of the process from the first day, not a separate step we add when something goes wrong." },
  { Icon: Users, t: "Low turnover, deep knowledge", b: "Our people are not passing through on the way to something else. They stay, they get better, and your process gets sharper with them." },
  { Icon: Scale, t: "Honest about fit", b: "If a process is not right for us yet, we say so. We would rather earn trust than win a contract we cannot deliver on." },
  { Icon: Sparkles, t: "A team with something to prove", b: "For most of our people, this is the first real career they have had. That shows up in how seriously they take the work." },
];

const IMPACT = [
  { Icon: Coins, img: DHITI_IMAGES.imp1, shot: "A team member smiling at their workstation", t: "Income that stays local", b: "Wages earned here are spent here, at the same shops, schools and homes the Foundation already works with. The money circulates instead of leaving with the worker." },
  { Icon: Sprout, img: DHITI_IMAGES.imp2, shot: "Someone confidently using the computer", t: "Skills that travel", b: "Process discipline, computer fluency and client facing communication hold their value well beyond this one job. What people learn here stays with them for life." },
  { Icon: Home, img: DHITI_IMAGES.imp3, shot: "Wide shot of the office or building in the village", t: "Work without relocation", b: "No one has to choose between staying close to family and doing work that is taken seriously. Both are possible in the same place, for the first time." },
  { Icon: HeartHandshake, img: DHITI_IMAGES.imp4, shot: "A proud portrait of a team member at work", t: "Dignity, not dependence", b: "A wage earned is different from aid received. It builds confidence, standing and a sense of ownership that no handout ever can." },
];

const LEADERS = [
  { name: "Vidya Kolekar", role: "Leader, People & Culture", img: leaderVidya },
  { name: "Prajakta Hundare", role: "Leader, Travel Operations", img: leaderPrajakta },
];

const FAQS = [
  { q: "What kind of work can you take on?", a: "Data and back office operations, customer and process support, and quality and audit work. If you are unsure whether your process fits, send it over and we will tell you honestly." },
  { q: "How do you ensure quality?", a: "Verification is built into the process, and our quality and audit line runs independent checks. Every team is trained on its specific process before going live, and a named owner is accountable for the output." },
  { q: "Do I need experience to apply for training?", a: "No. We hire for willingness to learn, not for a resume. If you can read and write comfortably, we can teach you the rest." },
  { q: "Is the training paid?", a: "Training comes first and prepares you for live work. You are paid once you move onto live work. We will explain the full path clearly when you apply." },
  { q: "How fast can you start on our work?", a: "It depends on the process and volume. We always begin with a small pilot batch, then scale once quality is steady. Reach out and we will give you a realistic timeline." },
];

/* ---------- count-up stat ---------- */
function Stat({ v, suf, l }) {
  const ref = useRef(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setN(v); return; }
    let done = false;
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (e.isIntersecting && !done) {
          done = true;
          const dur = 1500, t0 = performance.now();
          const tick = (t) => {
            const p = Math.min(1, (t - t0) / dur);
            const eased = 1 - Math.pow(1 - p, 3);
            setN(Math.round(v * eased));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      });
    }, { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [v]);
  return (
    <div className="dh-stat" ref={ref}>
      <div className="n dh-grad">{n}{suf}</div>
      <div className="l">{l}</div>
    </div>
  );
}

export default function DhitiSite() {
  const [scrolled, setScrolled] = useState(false);
  const [menu, setMenu] = useState(false);
  const [open, setOpen] = useState(0);
  const [prog, setProg] = useState(0);
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      setScrolled(y > 24);
      const h = document.documentElement.scrollHeight - window.innerHeight;
      setProg(h > 0 ? (y / h) * 100 : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const els = document.querySelectorAll(".dh [data-reveal]");
    if (reduce) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const id = setInterval(() => setActive((a) => (a + 1) % 4), 2200);
    return () => clearInterval(id);
  }, []);

  const go = (id) => (e) => {
    e.preventDefault();
    setMenu(false);
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const GROUPS = ["Group Co. 01", "Group Co. 02", "Group Co. 03", "Group Co. 04", "Group Co. 05", "Group Co. 06"];

  const NAV = [
    ["What we do", "services"],
    ["How we train", "training"],
    ["Impact", "impact"],
    ["Careers", "careers"],
    ["FAQ", "faq"],
  ];

  return (
    <div className="dh">
      <div className="dh-progress" style={{ width: prog + "%" }} />

      {/* NAV */}
      <nav className={"dh-nav" + (scrolled ? " scrolled" : "")}>
        <div className="dh-nav-inner">
          <div className="dh-logo" onClick={go("top")}>
            <img src={logoDhiti} alt="Dhiti" className="dh-logo-img" />
            
          </div>
          <div className="dh-links">
            {NAV.map(([t, id]) => (
              <a key={id} href={"#" + id} className="dh-link" onClick={go(id)}>{t}</a>
            ))}
          </div>
          <div className="dh-nav-cta">
            <a href="#business" className="dh-btn dh-btn-primary" onClick={go("business")}>
              Bring your work to us <ArrowUpRight size={17} />
            </a>
            <button className="dh-burger" aria-label="Open menu" onClick={() => setMenu(true)}><Menu size={22} /></button>
          </div>
        </div>
      </nav>

      <div className={"dh-mobile" + (menu ? " open" : "")}>
        <button className="dh-burger" aria-label="Close menu" style={{ position: "absolute", top: "1.5rem", right: "8vw" }} onClick={() => setMenu(false)}><X size={22} /></button>
        {NAV.map(([t, id]) => <a key={id} href={"#" + id} onClick={go(id)}>{t}</a>)}
        <a href="#business" className="dh-btn dh-btn-primary" onClick={go("business")}>Bring your work to us <ArrowUpRight size={17} /></a>
      </div>

      <span id="top" />

      {/* HERO */}
      <header className="dh-hero">
        <div className="dh-hero-deco">
          <span className="dh-hero-blob b1" />
          <span className="dh-hero-blob b2" />
          <span className="dh-hero-dots" />
        </div>
        <div className="dh-wrap dh-hero-grid">
          <div>
            <div className="dh-eyebrow" data-reveal>Operations &amp; Talent · built in the village</div>
            <h1 className="dh-hero-title" data-reveal style={{ "--d": 1 }}>
              Steady hands. Sharper processes. <span className="dh-grad">Real careers.</span>
            </h1>
            <p className="dh-hero-sub" data-reveal style={{ "--d": 2 }}>
              Dhiti Services trains people who have never had a desk job and turns them into operational teams businesses rely on. Data, support, quality and back office work, run with discipline and delivered with care.
            </p>
            <div className="dh-hero-cta" data-reveal style={{ "--d": 3 }}>
              <motion.a href="#business" className="dh-btn dh-btn-primary" onClick={go("business")} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>Bring your work to us <ArrowUpRight size={18} /></motion.a>
              <motion.a href="#careers" className="dh-btn dh-btn-glass" onClick={go("careers")} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>Apply for training <ArrowRight size={17} /></motion.a>
            </div>
          </div>
          <div className="dh-hero-visual" data-reveal style={{ "--d": 2 }}>
            <div className="dh-hv-blob" />
            <motion.div className="dh-hsv-grid" initial="hidden" whileInView="show" viewport={{ once: true, margin: "-40px" }} variants={{ show: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } } }}>
              {SERVICES.map((s, i) => (
                <motion.div className={"dh-hsv-card" + (active === i ? " active" : "")} key={s.idx} variants={{ hidden: { opacity: 0 }, show: { opacity: 1 } }} transition={{ duration: 0.5 }}>
                  <div className="dh-hsv-top">
                    <span className="dh-hsv-ic"><s.Icon size={22} /></span>
                    <span className="dh-hsv-idx">{s.idx}</span>
                  </div>
                  <h4>{s.t}</h4>
                  <p>{s.tag}</p>
                  <span className="dh-hsv-prog" />
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </header>

      {/* STATS */}
      <section className="dh-section" id="stats">
        <div className="dh-wrap">
          <div className="dh-stats" data-reveal>
            {STATS.map((s, i) => <Stat key={i} {...s} />)}
          </div>
          <p style={{ textAlign: "center", marginTop: "1rem", fontSize: ".82rem", color: "var(--ink-3)" }} data-reveal>
            Figures are moderate estimates from day one. Confirm before publishing.
          </p>
        </div>
      </section>

      {/* CLIENT LOGOS (continuous marquee) */}
      <section className="dh-marquee">
        <div className="dh-marquee-label">Brands that trust us</div>
        <div className="dh-track-wrap">
          <div className="dh-track">
            {[...DHITI_LOGOS, ...DHITI_LOGOS].map((g, i) => (
              <div className={"dh-logo-tile" + (g.dark ? " dark" : "")} key={i}>
                <img src={g.src} alt={g.name} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PROBLEM */}
      <section className="dh-section dh-problem">
        <div className="dh-wrap">
          <div className="dh-eyebrow" data-reveal>The problem we set out to solve</div>
          <h2 className="dh-h2s" data-reveal style={{ "--d": 1, maxWidth: "16ch", margin: ".9rem 0 2.4rem" }}>
            Talent is everywhere.<br /><span className="dh-grad">Opportunity</span> is not.
          </h2>
          <div className="dh-prob-grid">
            <div className="dh-prob-media" data-reveal>
              <div className="dh-ph dh-ph-prob"><img src={DHITI_IMAGES.prob} alt="A capable young person in the village" /></div>
            </div>
            <div className="dh-prob-body">
              <p data-reveal style={{ "--d": 1 }}>In villages across the country, there are people who are sharp, reliable and willing to work hard. What they do not have is a way in. The good jobs sit in cities, hours away from home, and reaching them means leaving everything familiar behind.</p>
              <p data-reveal style={{ "--d": 2 }}>So the choice becomes brutal: stay close to family and settle for whatever work is nearby, or chase a real career and give up the life you know. Most people should never have to make that trade.</p>
              <p data-reveal style={{ "--d": 3 }}>We built Dhiti to remove the choice entirely. We bring the work to the people, train them properly, and pay them for skilled jobs they can be proud of, without asking anyone to pack a bag.</p>
            </div>
          </div>
        </div>
      </section>

      {/* STORY */}
      <section className="dh-section">
        <div className="dh-wrap">
          <div className="dh-story-grid">
            <div>
              <div className="dh-eyebrow" data-reveal>Our story</div>
              <div className="dh-story-media" data-reveal style={{ "--d": 1, marginTop: "1.6rem" }}>
                <div className="dh-ph dh-ph-story">
                  <img src={DHITI_IMAGES.story} alt="Inside the Dhiti Services office" />
                </div>
                <div className="dh-quote-card">
                  <p>Welfare that runs out is charity. Welfare that pays wages, every month, for years, is <span className="dh-grad" style={{ fontStyle: "normal" }}>kalyan</span>.</p>
                </div>
              </div>
            </div>
            <div className="dh-story-body">
              <p data-reveal>Dhiti Services began with a single question: what does welfare look like ten years from now, not just on the day it is handed over? Most help fades the moment the funding stops. We wanted to build something that keeps paying, month after month, long after the first gesture is forgotten.</p>
              <p data-reveal style={{ "--d": 1 }}>So we did the opposite of what most companies do. Instead of opening a city office and asking people to travel to it, we built the work where the people already are. <strong>The work comes to them. The wages stay local. The skills grow at home.</strong></p>
              <p data-reveal style={{ "--d": 2 }}>We recruit locally. We train properly. We put people to work on real operations for clients who need reliable, well managed execution. The name <strong>Dhiti</strong> means steadfastness and resolve. That is the standard we hold every piece of work to.</p>
              <p data-reveal style={{ "--d": 3 }}>No one should have to leave home to do work that matters. That is the entire premise, and everything here is built to prove it.</p>
            </div>
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section className="dh-section" id="services">
        <div className="dh-wrap">
          <div className="dh-head">
            <div className="dh-eyebrow" data-reveal>What we do</div>
            <h2 className="dh-h2" data-reveal style={{ "--d": 1 }}>Operational work, run end to end.</h2>
            <p className="dh-lead dh-kicker" data-reveal style={{ "--d": 2 }}>Four focused service lines, each staffed by people trained on that specific process, not a general purpose floor that handles everything and masters nothing.</p>
          </div>
          <div className="dh-grid-2">
            {SERVICES.map((s, i) => (
              <div className="dh-svc" key={s.idx} data-reveal style={{ "--d": i % 2 }}>
                <div className="dh-svc-img">
                  {s.img ? <img src={s.img} alt={s.t} /> : <div className="dh-ph-mini"><Camera size={20} /><span>{s.shot}</span></div>}
                </div>
                <div className="dh-svc-body">
                  <div className="dh-svc-top">
                    <span className="dh-svc-ic"><s.Icon size={24} /></span>
                    <span className="dh-idx">{s.idx}</span>
                  </div>
                  <h3>{s.t}</h3>
                  <p>{s.b}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TRAIN */}
      <section className="dh-section dh-train" id="training">
        <div className="dh-train-glow" />
        <div className="dh-wrap" style={{ position: "relative" }}>
          <div className="dh-head">
            <div className="dh-eyebrow" data-reveal>How we train</div>
            <h2 className="dh-h2" data-reveal style={{ "--d": 1 }}>Nobody starts on live work.</h2>
            <p className="dh-lead dh-kicker" data-reveal style={{ "--d": 2 }}>Every hire moves through the same four stages before they touch a client process. It is slower at the start, and it is the exact reason the work holds up later.</p>
          </div>
          <div className="dh-steps">
            <div className="dh-flowline"><span className="dh-flowdot" /></div>
            {STEPS.map((s, i) => (
              <div className="dh-step" key={s.t} data-reveal style={{ "--d": i }}>
                <div className="dh-step-img">
                  {s.img ? <img src={s.img} alt={s.t} /> : <div className="dh-ph-mini"><Camera size={20} /><span>{s.shot}</span></div>}
                </div>
                <div className="dh-step-body">
                  <div className="dh-step-ic"><s.Icon size={22} /></div>
                  <div className="dh-step-n">Step {i + 1}</div>
                  <h3>{s.t}</h3>
                  <p>{s.b}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WHY */}
      <section className="dh-section">
        <div className="dh-wrap">
          <div className="dh-why-grid">
            <div>
              <div className="dh-eyebrow" data-reveal>Why clients choose us</div>
              <h2 className="dh-h2s" data-reveal style={{ "--d": 1, margin: ".9rem 0 1.4rem" }}>Work you do not have to recheck, from a team that stays.</h2>
              <div className="dh-callout" data-reveal style={{ "--d": 2 }}>
                <div className="dh-eyebrow center">The honest version</div>
                <p>We are not the cheapest option, and we never pretend to be.</p>
              </div>
              <div className="dh-ph dh-ph-why" data-reveal style={{ "--d": 3 }}>
                <img src={DHITI_IMAGES.why} alt="Quality work at Dhiti" />
              </div>
            </div>
            <div className="dh-why-list">
              {REASONS.map((r, i) => (
                <div className="dh-why-item" key={r.t} data-reveal style={{ "--d": i }}>
                  <span className="dh-why-ic"><r.Icon size={20} /></span>
                  <div><h3>{r.t}</h3><p>{r.b}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TEAM BAND (full-width photo slot) */}
      <section className="dh-band">
        <div className="dh-band-media" data-reveal>
          <div className="dh-ph"><img src={DHITI_IMAGES.band} alt="The Dhiti team" /></div>
          <div className="dh-band-ov">
            <div className="dh-eyebrow center" style={{ justifyContent: "center" }}>Built in the village</div>
            <h2>No one should have to leave home to do work that matters.</h2>
          </div>
        </div>
      </section>

      {/* IMPACT */}
      <section className="dh-section dh-impact" id="impact">
        <div className="dh-wrap">
          <div className="dh-head">
            <div className="dh-eyebrow" data-reveal>The impact</div>
            <h2 className="dh-h2s" data-reveal style={{ "--d": 1 }}>What this changes, beyond the day to day work.</h2>
          </div>
          <div className="dh-impact-grid">
            {IMPACT.map((m, i) => (
              <div className="dh-imp" key={m.t} data-reveal style={{ "--d": i }}>
                <div className="dh-imp-img">
                  {m.img ? <img src={m.img} alt={m.t} /> : <div className="dh-ph-mini"><Camera size={20} /><span>{m.shot}</span></div>}
                </div>
                <div className="dh-imp-body">
                  <span className="dh-imp-ic"><m.Icon size={22} /></span>
                  <h3>{m.t}</h3>
                  <p>{m.b}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LEADERSHIP */}
      <section className="dh-section">
        <div className="dh-wrap">
          <div className="dh-head">
            <div className="dh-eyebrow" data-reveal>Leadership</div>
            <h2 className="dh-h2" data-reveal style={{ "--d": 1 }}>The people behind the work.</h2>
            <p className="dh-lead dh-kicker" data-reveal style={{ "--d": 2 }}>A passionate team of leaders who train, and operate the processes that run on modern systems.</p>
          </div>
          <div className="dh-lead-grid">
            {LEADERS.map((p, i) => (
              <div className="dh-person" key={p.name} data-reveal style={{ "--d": i }}>
                <div className="dh-person-ph">
                  {p.img ? (
                    <img src={p.img} alt={p.name} />
                  ) : (
                    <>
                      <span className="dh-person-ini">{p.name.split(" ").map((x) => x[0]).join("")}</span>
                      <span className="dh-person-cam"><Camera size={13} /></span>
                    </>
                  )}
                </div>
                <h3>{p.name}</h3>
                <span>{p.role}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TWO DOORS */}
      <section className="dh-section" id="business">
        <div className="dh-wrap">
          <div className="dh-head center" style={{ marginBottom: "3rem" }}>
            <div className="dh-eyebrow center" data-reveal style={{ justifyContent: "center" }}>Work with us</div>
            <h2 className="dh-h2s" data-reveal style={{ "--d": 1 }}>Good work and good jobs, in the same place.</h2>
          </div>
          <div className="dh-doors">
            <div className="dh-door biz" data-reveal>
              <div className="dh-ph dh-door-ph">
                <img src={DHITI_IMAGES.doorBiz} alt="A trained Dhiti team at work" />
              </div>
              <span className="tag">For businesses</span>
              <h3>Hand your work to a team that is trained for it.</h3>
              <p>Reliable back office and support capacity without the overhead of building an in house team. No recruiting, no churn, no managing a function that is not your core business.</p>
              <ul className="dh-clist">
                <li><CheckCircle2 size={19} /> Share the process, tell us the work and volume, and we map how it would run.</li>
                <li><CheckCircle2 size={19} /> We run a small pilot batch first, so you can judge quality before committing.</li>
                <li><CheckCircle2 size={19} /> We scale the team once quality holds steady, at a pace that matches your needs.</li>
                <li><CheckCircle2 size={19} /> You get a named owner accountable for delivery, not a ticket queue.</li>
              </ul>
              <a href="#contact" className="dh-btn dh-btn-primary" onClick={go("contact")}>Talk to us about your process <ArrowUpRight size={17} /></a>
            </div>
            <div className="dh-door ppl" id="careers">
              <div className="dh-ph dh-door-ph">
                <img src={DHITI_IMAGES.doorPpl} alt="Someone starting their career at Dhiti" />
              </div>
              <span className="tag">For people starting out</span>
              <h3>We train you. You do not need experience.</h3>
              <p>If you can read and write comfortably and you are willing to learn, that is the starting point. We teach the rest, step by step, and we pay you once you are doing live work. This is the start of a real career.</p>
              <ul className="dh-clist">
                <li><CheckCircle2 size={19} /> Open to all education levels. We assess and place you in the right role.</li>
                <li><CheckCircle2 size={19} /> Based nearby, or able to commute comfortably.</li>
                <li><CheckCircle2 size={19} /> Training comes first. You are paid once you are on live work.</li>
                <li><CheckCircle2 size={19} /> Clear paths to grow, from trainee to team member to leader.</li>
              </ul>
              <a href="#contact" className="dh-btn" style={{ background: "#fff", color: "#ee0800" }} onClick={go("contact")}>Apply for the next batch <MoveRight size={17} /></a>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="dh-section dh-impact" id="faq">
        <div className="dh-wrap">
          <div className="dh-faq-grid">
            <div>
              <div className="dh-eyebrow" data-reveal>FAQ</div>
              <h2 className="dh-h2s" data-reveal style={{ "--d": 1, margin: ".9rem 0 1rem" }}>Questions, answered honestly.</h2>
              <p className="dh-lead" data-reveal style={{ "--d": 2 }}>Not sure whether your process fits? Send it over and we will tell you straight.</p>
            </div>
            <div className="dh-acc" data-reveal>
              {FAQS.map((f, i) => (
                <div className={"dh-acc-item" + (open === i ? " open" : "")} key={i}>
                  <button className="dh-acc-q" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                    {f.q}
                    <span className="dh-acc-ic">{open === i ? <Minus size={16} /> : <Plus size={16} />}</span>
                  </button>
                  <div className="dh-acc-a"><p>{f.a}</p></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CLOSING CTA */}
      <section className="dh-section dh-cta">
        <div className="dh-cta-glow" />
        <div className="dh-wrap">
          <div className="dh-eyebrow center" data-reveal style={{ justifyContent: "center", color: "#ff6a59" }}>Dhiti Services</div>
          <h2 data-reveal style={{ "--d": 1 }}>Whether you have work, or you are looking for the career that finally fits, there is a place for you here.</h2>
          <div className="dh-cta-btns" data-reveal style={{ "--d": 2 }}>
            <a href="#business" className="dh-btn dh-btn-primary" onClick={go("business")}>Bring your work to us <ArrowUpRight size={18} /></a>
            <a href="#careers" className="dh-btn dh-btn-ghost" style={{ background: "transparent", color: "#fff", WebkitTextFillColor: "#fff", borderColor: "rgba(255,255,255,.25)" }} onClick={go("careers")}>Apply for training <ArrowRight size={17} /></a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="dh-foot" id="contact">
        <div className="dh-wrap">
          <div className="dh-foot-grid">
            <div>
              <div className="dh-logo">
                <img src={logoDhiti} alt="Dhiti" className="dh-logo-img" />
                
              </div>
              <p className="dh-foot-tag">Building operational work and skilled jobs, from the village outward.</p>
            </div>
            <div>
              <h4>Explore</h4>
              <ul>
                {NAV.map(([t, id]) => <li key={id}><a href={"#" + id} onClick={go(id)}>{t}</a></li>)}
              </ul>
            </div>
            <div>
              <h4>Get in touch</h4>
              <ul>
                <li><MapPin size={16} /> Dawadi, Pune District, Maharashtra, India</li>
                <li><a href="mailto:info@dhitiservices.in"><Mail size={16} /> info@dhitiservices.in</a></li>
              </ul>
            </div>
          </div>
          <div className="dh-foot-bot">
            <span>© {new Date().getFullYear()} Dhiti Services. Steadfastness and resolve.</span>
            <span>Operations & Talent · built in the village</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
