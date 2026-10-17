# Dhiti multi-page website

## Status

Prepared as a private review preview. No production push is part of this change.

The build starts from the latest main branch, including its analytics and privacy settings. The original React homepage remains in source for rollback, but the production build replaces its generated HTML with statically rendered marketing pages.

## Editing

- `scripts/site-content.mjs`: service names, service descriptions, scope, onboarding stages and common FAQs.
- `scripts/build-site.mjs`: shared navigation and footer, page layouts, page copy, metadata and sitemap.
- `public/site.css`: brand tokens, shared layouts and responsive styles.
- `public/site.js`: mobile navigation, legacy homepage anchor handling, enquiry forms.
- `content/blog/*.md`: the ten existing articles, retained without content changes.
- `scripts/build-blog.mjs`: the existing blog build and reading features. The site build applies the shared site navigation and footer afterward.
- `public/privacy/index.html`: the existing privacy notice, retained as the policy source.

## Commands

`npm run build:preview` builds noindex pages without analytics and without form delivery. Forms validate but clearly state that nothing is sent.

`npm run build` builds production pages, using the existing GTM configuration and Web3Forms public form identifier. No credentials have been added. Form conversion events fire only after the provider explicitly returns `success: true`.

Run `node scripts/check-blog.mjs` to verify all ten articles still meet their existing content requirements.

## Routes

- `/`
- `/services/`
- `/services/data-back-office/`
- `/services/customer-support/`
- `/services/quality-audit/`
- `/services/dedicated-operations/`
- `/travel-operations/`
- `/how-we-work/`
- `/about/`
- `/careers/`
- `/contact/`
- `/blog/` and all ten existing article URLs
- `/privacy/`

Internal navigation uses explicit `index.html` filenames for static-preview compatibility. Canonicals and the sitemap use clean directory URLs. Legacy homepage anchors for services, training, impact, story, business, careers and contact route to the relevant new page.

## Production review

Before merging:

- Approve the page structure, copy and reused imagery.
- Confirm the wording of any new service-scope details and the travel page.
- Review the existing analytics consent policy separately if required. This conversion preserves that policy rather than silently changing it.
- Verify one real business enquiry and one real training enquiry reach the intended inbox, with permission to send test submissions.
- Confirm directory routes and 404 handling on the existing Render service.

The preview intentionally does not send test messages, create CRM records or load tracking. Browser tests can intercept the form provider to verify success and failure states without generating external enquiries.
