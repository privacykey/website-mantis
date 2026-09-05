# mantis website

Marketing site for [mantis](https://github.com/privacykey/mantis), a tripwire URL service.
The live site is [mantis.privacykey.org](https://mantis.privacykey.org/); the separate
[documentation site](https://docs.mantis.privacykey.org/) is the product manual.

The site serves static HTML, CSS, and JavaScript. A small, dependency-free Node.js
build shares navigation, footers, metadata, themes, release data, and capability
cards across pages. Generated assets are committed, so a static host can serve the
repository root. Node.js 22 or newer is required for maintenance; no install step.
The optional browser accessibility audit uses a pinned development dependency.

## Edit and preview

```sh
node scripts/build.mjs
node scripts/serve.mjs
# Open http://127.0.0.1:8742/en/
```

Set `PORT` to change the preview port. The server implements the root redirect and
nested 404 fallback, serves fresh assets, and keeps source directories private.

| Edit this | Purpose |
| --- | --- |
| `site/pages/*.html` | Page-specific content |
| `site/layout.html`, `site/partials/` | Shared document, navigation, and footer |
| `site/config.json` | Page metadata and content review date |
| `site/capabilities.json` | Curated feature cards and backend scope |
| `site/summaries.json`, `site/glossary.json` | Plain-language summaries and terminology |
| `site/themes.json`, `site/theme.js` | Theme palettes and theme/menu behavior |
| `site/mantis-terminal.js`, `assets/demo-state.js` | Demo UI and in-memory simulation |
| `assets/site.css`, `assets/footer.js` | Layout, copy buttons, setup form, CI status |
| `assets/reading-preferences.js` | Text size, reading view, reversible local preferences |
| `scripts/render-social.py` | Social PNG renderer (optional Python + Pillow) |

Do not hand-edit generated `en/*.html`, `404.html`, `assets/themes.css`,
`assets/theme.js`, or `assets/mantis-terminal.js`. Run the build after changing a
source. Asset URLs include content hashes to invalidate browser caches.

Run `python3 scripts/render-social.py` to rebuild the social card. This optional
step uses Pillow and macOS Courier by default; set `FONT_REGULAR` and `FONT_BOLD`
to suitable font paths on another system. The PNG is committed and CI does not
need Python or fonts.

The terminal is explicitly a local simulation. It does not contact a Mantis
server, write files, or send notifications. Its static transcript works without
JavaScript. Animation is off until the visitor enables it; reduced-motion users
retain the demo commands with immediate replay. Copy feedback does not expire.
The maker avatar and Three.js are served locally. The optional main-CI badge
contacts GitHub; the [privacy page](https://mantis.privacykey.org/en/privacy.html)
documents that request and local storage.

## Validate

```sh
node scripts/check.mjs
node --test tests/*.test.mjs
node scripts/check.mjs --links
```

The first two commands run in CI. Checks cover generated-file drift, local links
and anchors, language/landmarks, labels, AAA theme text contrast (7:1), control
boundary contrast (3:1), reading preferences and error recovery, keyboard menu
behavior, demo state and motion preferences, release selection, lockfile parsing,
and the main-CI badge's filtering/cache behavior. `--links` also
checks live documentation links and requires network access. Browser checks should
cover narrow screens, keyboard navigation, copy feedback, and the edge URL form.

## Accessibility maintenance

WCAG 2.2 AAA is the target, not a completed conformance claim. Read the
[criterion-by-criterion audit and remaining validation](docs/accessibility-audit.md)
before describing the site as conformant. This scope is the marketing website;
the product and separate documentation site require their own audits.

```sh
npm ci
npm run audit:browser
# Open http://127.0.0.1:8742/en/ and activate Run accessibility audit at the bottom.
# Add ?nojs to inspect a preview with all scripts removed.
```

The audit server injects axe-core only into the local preview. The audit panel,
scripts, dependency, and audit records are excluded from hosted assets. `npm run
dev` provides the normal preview. A clean automated scan is only one part of the
review; inspect the reported manual checks too.

For each page and theme, also test Tab/Shift+Tab, Enter/Space, Escape, native
selection controls, disclosure sections, invalid forms, copy feedback, and demo
replay/skip. Test 200% text, 320 CSS-pixel reflow, text-spacing overrides, reading
view, and custom colors. Keep standalone controls at least 44×44 CSS pixels and
retain visible, unobscured focus. Verify tables, errors, and status announcements
with screen readers, plus real browser zoom and operating-system contrast modes.
New audio/video, authentication, time limits, dialogs, gestures, or submission
flows require a new review of criteria that are currently not applicable.

## Keep facts current

Release badges represent published, non-draft component tags in
`privacykey/mantis`: `cli-v…`, `full-v…`, or `edge-v…`. A component without a tag is
omitted. Package versions on `main` are not presented as published releases.

```sh
node scripts/sync-releases.mjs
```

This updates `version.json` and rebuilds every dependent page and metadata item.
`GITHUB_TOKEN` is optional locally. The scheduled release workflow is read-only:
it reports drift by failing the check, so updates can be reviewed and committed.
It never pushes changes to `main`.

The footer reports the newest **push run of the product's `ci.yml` on `main`**.
It links to the actual checked run, shows the check time, caches for five minutes,
and says unavailable if the request fails instead of retaining stale success.

Feature descriptions are manually checked against product source and linked
guides. The current inventory records the exact reviewed product commit. Refresh
the selected direct dependency disclosures from a local product checkout:

```sh
node scripts/sync-dependencies.mjs /path/to/mantis origin/main
node scripts/build.mjs
```

The script reads exact versions from `pnpm-lock.yaml`, fetches each version's npm
licence metadata, and never installs packages. `site/dependencies.json` identifies
scope and the reviewed commit; it is a selected inventory, not an exhaustive SBOM.
Review the text and update `site/config.json`'s review date when product claims
change. Preserve conditional trigger behavior, full/edge differences, and the
pre-1.0 status. Avoid unsupported timing or adoption claims.

## Hosting

Cloudflare Workers Builds is connected to this repository and deploys pushes to
`main` using `npx wrangler deploy`. [`wrangler.jsonc`](wrangler.jsonc) serves the
repository root; `.assetsignore` excludes source, tests, tooling, and Git metadata.
`_redirects` handles `/` → `/en/` as an HTTP 301. Root `index.html` provides a
fallback for hosts without Cloudflare redirect support. Root-relative assets and
links keep the custom 404 usable for nested missing URLs.

`just deploy` runs local checks before a manual deployment. Merging to `main` or
running that command publishes the site; preview and validation do not publish.

## Licences and conventions

- This website is Apache-2.0 (see `LICENSE`). The Mantis product is MIT; bundled
  and product dependencies have their own licences.
- Use lowercase **mantis** and **privacykey** in product copy.
- Keep the terminal visual language, clear setup links, and all seven themes.
- See `assets/vendor/README.md` for the local Three.js asset and licence.
