# Multi-page website review

## Claims to verify

- Eleven independently addressable marketing pages, the existing blog index and ten articles, privacy and 404.
- Shared navigation and footer, working internal links, retained article URLs.
- Responsive layouts at 1440px and 375px, including mobile menu and forms.
- One H1, distinct title and description, canonical URL and structured data per page.
- No analytics requests or external form submissions in review mode.
- Existing production analytics setup and form endpoint retained.

## Interactive coverage

- Header and footer links, homepage service cards and travel link, per-service enquiry preselection.
- Mobile navigation open, close, Escape, outside click and desktop/mobile resize.
- FAQ expand and collapse.
- Enquiry and career forms: empty/invalid values, preview-safe submission, provider success, provider error, network failure, timeout and reset.
- Blog search, category filters, empty results and reset.
- Blog theme toggle, article contents links, sharing fallback and related articles.
- Original homepage anchors redirect to new destination pages.
- 404 recovery, privacy link and analytics-settings anchor.

## Visual review

- Every route at desktop and mobile, with full-page evidence and opening view.
- Inspect shared footer, service detail layouts, contact form, blog index and article body at readable scale.
- Check horizontal overflow, broken images, clipped text and visible active/expanded states.
- Inspect mobile navigation and form feedback after interaction.
- Confirm headline, hero image and primary action remain coherent at a short desktop viewport and at 200% equivalent zoom.

## Delivery boundary

Tests use intercepted provider responses, not real messages. Inbox receipt and live Render routing require a post-approval deployment check.

## Completed checks

- Static audit: 24 HTML pages, 1,126 internal links/resources, 147 image alt attributes.
- Blog audit: ten unchanged articles, 11,953 words total; ten RSS entries and 22 sitemap URLs.
- Browser layout audit: all 23 normal page routes at 1440px and 375px, with no horizontal overflow, broken images or page-level JavaScript errors. The 404 recovery was tested separately.
- Mobile menu: open/close, Escape, outside click and desktop/mobile resize cycle passed.
- Service discovery: services hub to detail page to preselected enquiry passed.
- Business and career forms: validation, preview no-send behavior, intercepted provider success/error/network failure, reset and 20-second timeout recovery passed. No live submissions were made.
- Blog: search, category filters, no-results reset, theme toggle, article table of contents, clipboard fallback and related links passed.
- Legacy `#training` routing, footer privacy navigation and 404 home recovery passed.
- Representative homepage text and action contrast ratios ranged from 5.79:1 to 7.83:1.
- Additional layout checks at 768px and short desktop height passed.
- Production build verified the existing GTM ID and consent script on marketing, blog and privacy pages. Final review build disables tracking and form delivery.
