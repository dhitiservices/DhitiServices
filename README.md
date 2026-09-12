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

## IMPORTANT: connect the contact forms (one-time, 10 minutes)

The two forms ("Bring your work to us" and "Apply for training") need one
webhook URL before they will work. We use **n8n**, because Zeal Connect already
owns that account, and n8n can *send* mail to info@dhitiservices.com without
anyone needing to log into that inbox.

### In n8n

1. Create a new workflow, name it `Dhiti website forms`.
2. Add a **Webhook** node.
   - HTTP Method: **POST**
   - Path: `dhiti-contact`
   - Respond: **Immediately**
   - Open **Options -> Allowed Origins (CORS)** and set it to `*`
     (without this the browser blocks the form; this is the step people miss)
3. Add a **Send Email** node (or Gmail / Microsoft Outlook node) after it.
   - To: `info@dhitiservices.com`
   - Subject: `{{ $json.body.subject }}`
   - Body: use the fields listed below.
4. **Save**, then switch the workflow to **Active**.
5. Copy the **Production URL** from the Webhook node.

### In this project

Open `src/DhitiServices.jsx`, find this line near the top:

```js
const FORM_ENDPOINT = "PASTE_YOUR_N8N_WEBHOOK_URL_HERE";
```

Paste the production URL in place of the placeholder, then `npm run build` and
redeploy.

### Fields the form sends

| Field | Meaning |
| --- | --- |
| `enquiry_type` | "Bring your work to us" or "Apply for training" |
| `subject` | Ready-made email subject line |
| `name` | Visitor name |
| `email` | Visitor email |
| `phone` | Visitor phone |
| `company` | Company (work enquiry only) |
| `village_or_location` | Village or town (training application only) |
| `what_work` | What work they need help with (work enquiry only) |
| `why_join` | Why they want to join (training application only) |

In n8n these arrive under `{{ $json.body.<field> }}`.

Because everything lands in n8n first, you can later add a Google Sheet row, a
CRM record, or a WhatsApp alert without touching the website again.

### Alternative: Web3Forms

If you would rather not use n8n, Web3Forms works too, but the access key is
emailed to whichever address you register, so someone with access to
info@dhitiservices.com has to do it. In that case set:

```js
const FORM_ENDPOINT = "https://api.web3forms.com/submit";
const FORM_ACCESS_KEY = "the key they email you";
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
