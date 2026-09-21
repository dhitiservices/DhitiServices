# Dhiti Blog

The blog is generated as complete static HTML, not an empty JavaScript shell. The existing React homepage remains intact, with Blog links added to desktop navigation, mobile navigation and the footer.

## Local preview

Run `npm ci`, `npm run check:blog`, then `npm run build:preview`. Serve `dist` using a static server and open `/blog/`.

After building, `npm run test:blog` validates article lengths, local links, images, metadata, structured data, RSS and sitemap structure.

The launch was approved on 21 September 2026. Standard `npm run build` builds are now public and indexable. Use `npm run build:preview` (or `BLOG_PUBLISH=0 npm run build`) for editorial previews with noindex and a robots.txt that disallows indexing. Never deploy an editorial preview build to the live domain.

## Publishing after approval

On the existing Render static site, use `npm run build` as the build command and `dist` as the publish directory. `BLOG_PUBLISH=1 npm run build` also explicitly selects public mode. The confirmed working canonical domain is `https://www.dhitiservices.com`. Set `SITE_URL` only if intentionally changing that domain. Do not create a second Render service or replace existing settings without checking them first.

No Render API key is required by this website. Do not add a Render key to GitHub, environment files, frontend code or build output.

The blog provides physical `/blog/<slug>/index.html` files. Remove any blanket rewrite that serves the homepage instead of these files; preserve any other necessary existing routing rules. Verify direct article URLs and their 404 behavior on the actual host after deployment.

## Add or edit an article

Edit a Markdown file in `content/blog/`. Its filename becomes the permanent article URL. Keep existing filenames stable to avoid broken links.

Required YAML fields: title, description, category, image, imageAlt, order, date. Use a quoted date such as `"2026-09-21"`. The description must be no more than 160 characters. Use one of the existing category names unless intentionally adding a category.

Images are selected from `src/assets/photos/`. Use descriptive alt text. Add `##` section headings to populate the automatic table of contents. Raw HTML is prohibited in article content.

The ten launch articles are at least 1,000 words each. `npm run check:blog` checks count, metadata, section structure, external references and punctuation. Reading time is calculated at 220 words per minute.

The launch collection uses its preparation date, 2026-09-21. Before publication, set each article's date to its actual publication date. Displayed dates, structured data and RSS dates are generated from that field.

This is a Git-managed blog, not a login-based CMS. A content editor or CMS can be added separately once the preferred publishing workflow is confirmed.

## QA inventory

- Ten distinct articles, every body at least 1,000 words.
- Homepage links to blog on desktop, mobile and footer.
- Featured article, all ten cards, category filters, search, combined filter/search, empty results and reset.
- Each article loads directly, contains server-rendered text, correct title, canonical, Open Graph and structured data.
- All article contents links target real headings; related articles and business/career links resolve.
- Theme switch in both directions, copy-link success or selectable fallback, reading progress.
- Desktop and 375-pixel mobile checks for index and all articles, image loading, overflow and text clipping.
- Sitemap, RSS and correct preview noindex status.
- Unknown URLs and search punctuation as off-happy-path checks.
- No form submissions or production deployment during preview QA.
