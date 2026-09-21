# Dhiti Blog: preview verification

Prepared 21 September 2026. Not deployed to the live Dhiti website.

## Content

Ten original practical guides, each above 1,000 words. Total: 11,953 words.

| Article | Words |
|---|---:|
| Hand over the process. Not the problems. | 1,259 |
| Data entry quality starts before the first keystroke | 1,204 |
| A customer support playbook that leaves room to listen | 1,202 |
| What to test in the first 30 days of an operations pilot | 1,215 |
| Write an SOP someone can actually work from | 1,203 |
| Your first operations job: what to practise before day one | 1,184 |
| Evaluate a rural operations team on the work, not the postcode | 1,186 |
| Measure the work, not just the activity | 1,163 |
| When records disagree, build a better exception queue | 1,160 |
| Let AI assist the work. Keep a person accountable. | 1,177 |

Counts exclude YAML metadata and link destinations, but include headings and list text. Each guide contains inline external references and links to related guides. Examples are labelled as illustrative, not client results.

## Automated checks

- Production asset build succeeds.
- All ten article URLs return HTTP 200 and contain full article HTML.
- Eleven blog pages, 411 local resource/link references, ten RSS entries and twelve sitemap URLs pass static validation.
- Canonical links, descriptions, Open Graph tags and JSON-LD are present.
- Each article contains eight linked content sections and three related article cards.
- No client-side errors recorded during tested flows.
- Runtime dependency audit reports zero vulnerabilities. Six pre-existing development-tool dependency advisories remain; this blog change does not attempt an unrelated build-tool major-version upgrade.

## Browser checks

- All article headers visually inspected at desktop and 375px mobile widths.
- No horizontal overflow or broken images found in the tested blog views.
- Index, article reading area, search empty state and dark theme visually reviewed.
- All category filters, search, combined search/filter and reset tested.
- Punctuation-only search returns a recoverable empty state.
- Table-of-contents navigation, theme switching and article link-copy fallback tested.
- Homepage Blog links tested through desktop, tablet and mobile navigation.
- Clipboard access is denied in some sandboxed previews; a selectable copy field is provided instead of a silent failure.

## Publication checks still required

- Approval of editorial content and public launch.
- Inspect the existing Render service, build command, custom domain and routing configuration.
- Enable publication mode and set actual publication dates.
- Verify the production `/blog/` and direct article URLs after deployment.
- Verify host-specific unknown-URL behavior with the supplied `404.html`.

The Render credential was not used. No changes were pushed to GitHub or applied to the live website during preview preparation.
