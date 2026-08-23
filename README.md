# mantis website

Marketing site for [mantis](https://github.com/privacykey/mantis) — self-hostable
tripwire keys. Mint a URL, get told when something fetches it.

Static HTML. No framework, no build step. Point any static host at the
repository root.

**Hostname:** `mantis.privacykey.org` *(DNS not configured yet)*

Product documentation lives separately, at
[docs-mantis](https://github.com/privacykey/docs-mantis) →
`docs.mantis.privacykey.org`. This site is the pitch; the docs are the manual.

## Layout

```
.
├── index.html              Language redirect
├── en/
│   ├── index.html          Hero, the three components, edge vs full, install
│   ├── about.html          What privacykey is
│   ├── docs.html           Signposts into the documentation site
│   ├── privacy.html        Data posture
│   └── legal.html          MIT plus bundled third-party libraries
├── 404.html
├── llms.txt                Preferred entry point for cooperating AI agents
├── robots.txt              Search engines welcome; training crawlers blocked
├── sitemap.xml
├── site.webmanifest
└── assets/
    ├── site.css
    ├── theme.js            Light/dark toggle, persisted
    ├── footer.js
    ├── mantis-terminal.js  The animated terminal on the hero
    └── vendor/three.min.js Three.js, self-hosted (see vendor/README.md)
```

## The versions are hard-coded

The hero and footer pin all three component versions:

```
CLI v0.2.0 · full v0.1.1 · edge v0.1.3
```

mantis versions its components independently, and nothing here fetches them at
runtime — so **these strings go stale silently**. When any component is
released, update them here in the same pass. They currently match
`cli/package.json`, `package.json` and `mantis-edge/package.json` on
mantis `main`.

## Local preview

```sh
python3 -m http.server 4000
# open http://localhost:4000/en/
```

## Conventions

- **mantis** and **privacykey** are one word, all lowercase, everywhere —
  including at the start of a sentence.
- Feature claims must match the shipped product. Check mantis's README rather
  than the previous version of this page.
- `llms.txt` is a factual summary for agents, not marketing copy. Keep its
  feature list and the docs URL in step.

## Related

- [mantis](https://github.com/privacykey/mantis) — the product
- [docs-mantis](https://github.com/privacykey/docs-mantis) — the documentation site
- [website-privacykey](https://github.com/privacykey/website-privacykey) — the organisation site
