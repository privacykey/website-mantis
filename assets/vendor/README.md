# Vendored libraries

`three.min.js` is Three.js 0.160.0, used by the decorative wireframe globe in
`site/mantis-terminal.js`. `three.LICENSE` contains its MIT licence. Both are
served from the website's origin; no script CDN is required.

The site uses a system monospace font stack. It does not bundle web fonts or use
analytics scripts. The footer's GitHub CI-status request is described separately
on `/en/privacy.html`; self-hosting Three.js does not eliminate that request.

To update Three.js, inspect the exact npm package version, copy its compatible
browser build and licence here, update the website entry in
`site/dependencies.json` and `scripts/sync-dependencies.mjs`, rebuild, and verify
the globe and no-WebGL fallback. Newer releases may require adapting the script
loading approach. Preserve the licence alongside the redistributed build.
