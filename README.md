# Dhiti Services — Website

Premium marketing website for **Dhiti Services**, a rural operations and talent
company based in Dawadi, Pune District, Maharashtra. Built with **React + Vite +
Tailwind CSS + Framer Motion**.

---

## Quick start

You need **Node.js 18 or newer** installed (https://nodejs.org).

```bash
# 1. install dependencies (run once)
npm install

# 2. start the local dev server (hot reload)
npm run dev
# open the URL it prints, usually http://localhost:5173

# 3. build the production site (output goes to the dist/ folder)
npm run build

# 4. preview the production build locally
npm run preview
```

## Deploying

`npm run build` creates a `dist/` folder containing the finished static site.
Upload that folder to any static host:

- **Netlify / Vercel / Cloudflare Pages:** build command `npm run build`,
  publish directory `dist`.
- **Any web server:** copy the contents of `dist/` to your web root.

## Project structure

```
dhiti-services-website/
├── index.html              # HTML shell
├── package.json            # dependencies + scripts
├── vite.config.js          # Vite config
├── tailwind.config.js      # Tailwind theme (brand colours + fonts)
├── postcss.config.js       # PostCSS (Tailwind + autoprefixer)
└── src/
    ├── main.jsx            # app entry (mounts the site, MotionConfig)
    ├── index.css           # fonts + Tailwind layers + all custom styles
    ├── DhitiServices.jsx   # the whole one-page site
    └── assets/
        ├── photos/         # all section photos (18 images)
        └── logos/          # partner / group company logos (6 images)
```

## Stack

- **React 18** + **Vite 5** for the build.
- **Tailwind CSS 3** is configured (brand colours and fonts live in
  `tailwind.config.js`); the bespoke component styling lives in `src/index.css`.
- **Framer Motion** powers the hero service-card entrance and the call-to-action
  micro-interactions, and respects the visitor's reduce-motion setting.
- **lucide-react** for the icons.
- Fonts: Fraunces, Plus Jakarta Sans, Space Grotesk (loaded from Google Fonts in
  `src/index.css`).

## Brand

- Primary red: `#EE0800` (deep `#C20600`, bright `#FF3322`).
- Ink / text: `#15161A`. Backgrounds: white and warm off-white panels.

## Replacing photos

Every photo is a real file in `src/assets/photos/`. To swap one, drop a new
image in with the **same filename** (keep the aspect ratio close):

| File | Where it appears |
| --- | --- |
| `problem.jpg` | "Talent is everywhere" section (tall 4:5) |
| `story.jpg` | Our story section (tall 4:5) |
| `service-data.jpg` `service-support.jpg` `service-quality.jpg` `service-group.jpg` | the four service cards (16:10) |
| `train-recruit.jpg` `train-train.jpg` `train-mentor.jpg` `train-deliver.jpg` | the four training steps (16:10) |
| `why-choose.jpg` | Why choose us (4:3) |
| `impact-income.jpg` `impact-skills.jpg` `impact-norelocation.jpg` `impact-dignity.jpg` | the four impact cards (16:10) |
| `band-team.jpg` | full-width team band (wide) |
| `door-business.jpg` `door-careers.jpg` | the two "work with us" cards (16:9) |

### Still to add

- **Leadership headshots** (Vidya Kolekar, Prajakta Hundare, Pratiksha Lonkar,
  Sanket Waykar, Somnath Gadage) are still shown as placeholders with initials.
  When you have square headshots, we will wire them into the Leadership section.
- The **Dhiti logo** in the nav and footer is the temporary wordmark.
- The **techspian** logo sits on a dark tile because the supplied logo is black;
  a transparent / light version can replace it.
