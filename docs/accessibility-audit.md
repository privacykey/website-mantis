# WCAG 2.2 AAA implementation audit

Reviewed 5 September 2026. Target: WCAG 2.2 Level AAA. **Formal conformance is not
claimed.** This record distinguishes implemented and tested behavior from the
assistive-technology and cross-browser validation that remains open.

## Scope and method

The marketing website: `/en/`, `/en/about.html`, `/en/docs.html`,
`/en/privacy.html`, `/en/legal.html`, `/en/accessibility.html`,
`/en/glossary.html`, and the custom 404 page, including their shared navigation,
footer, forms, demo, and all seven themes. The root redirect leads to `/en/`.
External documentation, GitHub, hosting providers, and the Mantis application
are outside this audit. Follow complete processes if that scope expands.

Reference: [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/). The matrix covers its
86 active success criteria. Removed criterion 4.1.1 is not counted. Criteria IDs
refer to the normative specification; the notes below describe this website's
implementation and test evidence, not substitute requirements.

Testing used the local static build in the Codex embedded browser on macOS.
Keyboard actions were executed in the browser, and rendered DOM geometry,
computed colors, and accessibility-tree output were inspected. A clean scan
does not establish accessibility support in every browser or screen reader.

## Hero presentation update — 5 September 2026

The homepage now leads with the simulation. The globe rotates and the opening
sequence plays once by default; neither takes keyboard focus or announces
automatic updates. A visible Pause animation button stops both and remembers
the choice. Reduced motion and reading view suppress autoplay. A paused globe
remains visible, and demo commands stay usable. Connection arcs fade gradually
and are limited to one per second. This uses the control approach described by
[W3C's pause/stop guidance](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html).

Reading links, summaries, and page indexes are grouped under the shared
Glossary & accessibility footer heading. Secondary pages retain breadcrumbs;
the homepage identifies itself through its title, brand link, and main heading.

Validation after these changes: 24 unit tests pass; 56 axe scans across all eight
pages and seven themes report zero violations, with the same contrast cases
left for manual review. All 128 layout checks pass at 320, 390, 768, and 1280 px
across standard text, 200% text, 200% reading view, and text-spacing overrides.
Footer summaries and page indexes were expanded. Keyboard traversal covered
644 focus stops across every page at 320 and 1280 px without obscured focus.
Pause/resume, saved pause after reload, skip focus return, and typing during
autoplay were exercised in the browser. System reduced motion is covered by
unit tests; the native OS/browser/AT checks below remain pending.

## Baseline results before the hero presentation update

- 56 final axe-core 4.13.0 scans: eight pages × seven themes; **zero reported
  violations**. Summaries and page indexes were expanded; homepage edge setup
  was expanded with an invalid Worker URL. Tags include A, AA, AAA, WCAG 2.1/2.2
  rules supported by axe, and best practices; enhanced contrast is enabled.
- Axe left manual contrast checks for decorative marks/arrows and the homepage
  heading. The marks are redundant decoration and hidden from assistive
  technology. The heading has an opaque background; measured contrast ranges
  from 7.80:1 (ultraviolet) to 16.11:1 (mono). Theme tests check every text role
  against every surface at ≥7:1, and control boundaries at ≥3:1.
- 128 final layout checks: eight pages × four widths (320, 390, 768, 1280 CSS px)
  × normal text, 200% text, 200% reading view, and text-spacing overrides. No
  horizontal page overflow or clipped inspected text/control content. Summaries
  and homepage setup were expanded. The page does not hide horizontal overflow
  to conceal layout failures.
- Full forward Tab traversal on all eight pages at 320 and 1280 px: 676 focus
  stops, all visibly outlined and reachable; no obscured focus or traps found.
  Separately tested Shift+Tab, skip-link activation, menu opening, Escape focus
  return, closing on focus leaving, and theme selection with Space/arrows/Enter.
- The homepage menu was traversed without JavaScript at 320 px. Native
  disclosure sections and static content remain usable; optional controls are
  hidden. With scripts disabled, close Menu by activating its summary again.
- Keyboard interactions checked: demo commands, create/list/fetch, replay/skip,
  animation on/off, Worker URL errors and correction, copy with persistent
  feedback, text size, reading view, custom colors, invalid colors, reset, and
  restoring previous settings. Focus remains usable through those changes.
- 18 unit tests pass, including no-animation default/reduced-motion behavior,
  preference recovery and blocked storage, reversible settings, copy feedback,
  menu focus behavior, and existing product-data checks. Generated-file,
  structure, local-link, and palette checks pass.

The 320 px checks exercise the reflow width associated with a 1280 px viewport
at 400% zoom. The 200% checks use the site's text-size control. Neither is a
claim that native browser zoom was tested in every browser. Arbitrary custom
colors are a visitor choice; the seven supplied themes meet the tested ratios.

## Criterion matrix

**Checked** means no issue found by the stated implementation/source/browser
checks in this environment. **Pending** identifies additional human or platform
validation needed for sign-off. **N/A** means the relevant content or interaction
does not exist in this scope; re-evaluate when adding it. All checked results
remain subject to the browser and assistive-technology support review below.

| Criterion | Level | Result | Site evidence or remaining work |
| --- | --- | --- | --- |
| 1.1.1 | A | Checked | Text controls; decorative canvas/marks hidden; maker link named. |
| 1.2.1 | A | N/A | No audio or video media; the demo is DOM text. |
| 1.2.2 | A | N/A | No prerecorded synchronized media. |
| 1.2.3 | A | N/A | No prerecorded synchronized media. |
| 1.2.4 | AA | N/A | No live synchronized media. |
| 1.2.5 | AA | N/A | No prerecorded synchronized media. |
| 1.2.6 | AAA | N/A | No prerecorded audio in synchronized media. |
| 1.2.7 | AAA | N/A | No prerecorded synchronized media. |
| 1.2.8 | AAA | N/A | No prerecorded video/audio media. |
| 1.2.9 | AAA | N/A | No live audio. |
| 1.3.1 | A | Pending | Landmarks, headings, lists, labels, and table roles checked; confirm table headers and groups in screen readers. |
| 1.3.2 | A | Pending | DOM and Tab order reviewed; confirm reading order in each supported screen reader, including stacked tables. |
| 1.3.3 | A | Checked | Instructions name controls and keys; no position/color-only instructions. |
| 1.3.4 | AA | Checked | No orientation lock; narrow and wide layouts tested. |
| 1.3.5 | AA | N/A | No fields collect personal information about the visitor. |
| 1.3.6 | AAA | Pending | Named landmarks, groups, controls, and redundant decorative icons; confirm personalization/AT interpretation. |
| 1.4.1 | A | Checked | Underlined prose links; textual CI status, errors, and notifications. |
| 1.4.2 | A | N/A | No audio playback. |
| 1.4.3 | AA | Checked | Theme palette assertions and rendered contrast scans. |
| 1.4.4 | AA | Pending | Built-in 200% text tested; complete native zoom/text-only zoom checks. |
| 1.4.5 | AA | Checked | Interface and content use real text; no explanatory image of text. |
| 1.4.6 | AAA | Checked | All supplied text roles ≥7:1 on every supplied surface. |
| 1.4.7 | AAA | N/A | No audio. |
| 1.4.8 | AAA | Pending | Reading view, adjustable colors/size, short line widths, and paragraph spacing implemented; confirm usability with low-vision readers. |
| 1.4.9 | AAA | Checked | Content and controls use real text; branding does not replace explanatory text. |
| 1.4.10 | AA | Pending | 320 px and enlarged-text reflow tested; native 400% browser zoom remains to verify. |
| 1.4.11 | AA | Pending | Palette control boundaries ≥3:1 and focus styling checked; verify native checkbox/select states across platforms. |
| 1.4.12 | AA | Checked | All eight pages tested with line, word, letter, and paragraph spacing overrides. |
| 1.4.13 | AA | N/A | No custom hover/focus popovers or tooltips; menu opens only on activation. |
| 2.1.1 | A | Checked | All page controls and complete demo/settings interactions exercised by keyboard. |
| 2.1.2 | A | Checked | Tab leaves controls/menu; reverse navigation and Escape tested. |
| 2.1.3 | AAA | Checked | No pointer-only functionality; decorative canvas has no action. |
| 2.1.4 | A | N/A | No global single-character shortcuts. Commands require focus in their input. |
| 2.2.1 | A | Checked | No input deadlines; copy/status feedback persists. |
| 2.2.2 | A | Checked | Globe and opening sequence autoplay; a persistent pause control stops both, and replay can be skipped. |
| 2.2.3 | AAA | Checked | Demo and settings impose no time limit on user actions. |
| 2.2.4 | AAA | Checked | No promotions, automatic context switches, or unsolicited demo announcements. |
| 2.2.5 | AAA | N/A | No sign-in or authenticated sessions. |
| 2.2.6 | AAA | N/A | No inactivity timeout. |
| 2.3.1 | A | Checked | Blink/scanline effects removed; connection arcs are gradual and rate limited. |
| 2.3.2 | AAA | Checked | Connection arcs fade gradually and are limited to one per second; no rapid flashes. |
| 2.3.3 | AAA | Checked | Pause disables motion; reduced motion and reading view suppress autoplay. |
| 2.4.1 | A | Checked | Working skip link, shared landmarks, and page indexes. |
| 2.4.2 | A | Checked | Distinct, descriptive generated page titles. |
| 2.4.3 | A | Checked | Natural focus order; fragment targets focused; replay returns focus correctly. |
| 2.4.4 | A | Checked | Descriptive links in context; anchors validated. |
| 2.4.5 | AA | Checked | Primary/footer navigation, linked HTML site index, and content links. |
| 2.4.6 | AA | Checked | Descriptive headings, visible labels, and native disclosure names. |
| 2.4.7 | AA | Checked | Focus outline visible throughout desktop/mobile traversal. |
| 2.4.8 | AAA | Checked | Secondary-page breadcrumbs and current-page labels; homepage title, brand, and main heading establish its location. |
| 2.4.9 | AAA | Checked | Ambiguous guide/licence names clarified; full accessible link names reviewed. |
| 2.4.10 | AAA | Checked | Content sections have headings; generated page indexes for longer pages. |
| 2.4.11 | AA | Checked | No sticky header; focus scrolls into view; menu closes when focus leaves. |
| 2.4.12 | AAA | Checked | No author-created overlay obscured focus in desktop/mobile traversal. |
| 2.4.13 | AAA | Pending | 3 px high-contrast outlines (2 px skip link); native controls and forced-colors rendering require platform review. |
| 2.5.1 | A | N/A | No multipoint or path-dependent gestures. |
| 2.5.2 | A | Checked | Actions use native click/activation, not pointer-down handlers. |
| 2.5.3 | A | Checked | Accessible names include visible labels; axe and accessibility-tree review. |
| 2.5.4 | A | N/A | No motion-sensor controls. |
| 2.5.5 | AAA | Checked | Standalone controls ≥44×44 px; checkbox label is its target; prose links use the inline-text exception. |
| 2.5.6 | AAA | Checked | No input-mode restrictions or input-mode detection. |
| 2.5.7 | AA | N/A | No dragging interactions. |
| 2.5.8 | AA | Checked | Larger standalone targets and native controls; inline prose exceptions. |
| 3.1.1 | A | Checked | Shared document declares English. |
| 3.1.2 | AA | N/A | English content with product names and code; no foreign-language passages. |
| 3.1.3 | AAA | Pending | Linked glossary explains product terminology; human completeness/readability review remains. |
| 3.1.4 | AAA | Pending | Glossary expands abbreviations; recheck coverage with new content and independent editorial review. |
| 3.1.5 | AAA | Pending | Plain-language summary on every page; review with intended readers before sign-off. |
| 3.1.6 | AAA | Checked | Mantis/sudo pronunciation supplied; no other pronunciation-dependent meaning identified. |
| 3.2.1 | A | Checked | Focusing controls does not submit or navigate. |
| 3.2.2 | A | Checked | Fields do not navigate; settings apply on Save; theme changes keep focus. |
| 3.2.3 | AA | Checked | Navigation generated from one shared partial. |
| 3.2.4 | AA | Checked | Shared labels, themes, copy controls, and reading help. |
| 3.2.5 | AAA | Checked | Links use same-tab navigation; changes follow activation; no delayed redirects. |
| 3.2.6 | A | Checked | Accessibility and reading help occupy consistent locations. |
| 3.3.1 | A | Pending | Persistent described errors and focus correction checked; confirm spoken error feedback. |
| 3.3.2 | A | Checked | Visible labels, examples, optional field instructions, and demo help. |
| 3.3.3 | AA | Checked | Worker URL and hex-color errors explain the accepted input and correction. |
| 3.3.4 | AA | Checked | No legal/financial submission; stored reading-setting changes are reversible. |
| 3.3.5 | AAA | Checked | Help beside fields and demo; shared reading/help page. |
| 3.3.6 | AAA | Checked | Invalid settings rejected; prior saved settings can be restored; Worker URL validated before copy; demo inputs checked. |
| 3.3.7 | A | Checked | Current settings prefilled; no repeated-entry process on the website. |
| 3.3.8 | AA | N/A | No authentication flow. |
| 3.3.9 | AAA | N/A | No authentication flow. |
| 4.1.2 | A | Pending | Native controls/roles and names pass axe; confirm details, tables, forms, and states in supported screen readers. |
| 4.1.3 | AA | Pending | Dedicated status/alert regions implemented; actual spoken announcements remain to verify. |

## Required before a formal conformance claim

1. Record supported browser/AT combinations and versions. Test VoiceOver with
   Safari and NVDA with Firefox or Chrome, including landmarks, table header
   associations, disclosures, error messages, copy results, and demo updates.
   Check that status messages are spoken once and focus is not lost.
2. Test native browser zoom to 200% and 400%, text-only enlargement where
   supported, OS reduced motion, Windows forced colors, and native control
   focus/selected/disabled states. Check both portrait and landscape.
3. Review summaries, terminology, abbreviations, and reading preferences with
   people who rely on cognitive and low-vision accessibility support. Resolve
   every Pending matrix item and any issues found, with dated evidence.
4. Audit the deployed revision and complete in-scope processes. State the exact
   scope, technology support, date, and level only after that review is complete.

## Reproduce and maintain

Run `node scripts/check.mjs` and `node --test tests/*.test.mjs`. For browser checks,
run `npm ci` then `npm run audit:browser`. Activate the development audit button
at the page bottom and inspect violations **and** manual-review results. The
text-spacing toggle applies the prescribed spacing overrides; `?nojs` removes
all scripts from the preview response. These tools are not deployed.

Repeat affected browser/keyboard checks after content, CSS, or interaction
changes. Do not replace this matrix with a Lighthouse or axe score. Adding
media, authentication, timers, gestures, dialogs, or data submission requires
reassessing the N/A entries and full user processes.
