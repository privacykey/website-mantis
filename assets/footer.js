/**
 * mantis — footer & code-block enhancements.
 *
 * Three small jobs, all gracefully no-op when their targets aren't on
 * the page (so this one file ships everywhere without conditionals
 * in the markup):
 *
 *  1. copy-to-clipboard buttons on shell code-blocks. The "$" prompt
 *     is already unselectable via CSS (.p { user-select: none }) for
 *     drag-select copy, but the button gives visitors a one-click
 *     path that's foolproof. Strips "$ " prefixes textually so the
 *     paste is ready to run; comments (lines starting with "#") are
 *     preserved because they're valid bash and may carry context.
 *
 *  2. live GitHub Actions build status in the footer. A single
 *     unauthenticated GET to api.github.com on first visit, cached in
 *     localStorage for 5 minutes so reloads and inter-page nav don't
 *     re-hit the API. Anonymous calls are rate-limited to 60/hour per
 *     IP; the cache keeps us well under that. If the repo doesn't
 *     exist, the network fails, or the API returns no runs, the
 *     badge hides itself and the footer still reads cleanly.
 *
 *  3. the maker credit — "made by adamxweb" appended inline to the
 *     © line of the footer bottom bar, linking to the maker's GitHub
 *     profile. Rendered here (rather than repeated in every page's
 *     markup) for the same ship-everywhere reason as the build badge.
 *     The 16px avatar is served by GitHub (github.com redirects to
 *     avatars.githubusercontent.com — both are allowed in img-src).
 *
 * Privacy note: by adding api.github.com to connect-src and fetching
 * on page load, the visitor's IP is exposed to GitHub. That's the
 * tradeoff for a live status — same as embedding a shields.io image
 * badge, just in our own typography. No cookies, no auth, no other
 * third parties involved.
 */
(function () {
  'use strict';

  // ─── 1. Copy-to-clipboard ────────────────────────────────────────
  function setupCopy () {
    var buttons = document.querySelectorAll('button[data-copy]');
    if (!buttons.length) return;

    function clean (raw) {
      // Strip "$ " or "$" from the start of each line so the paste is
      // runnable. Leave everything else alone — comments, blank lines,
      // continuation backslashes, multi-line strings all survive.
      // Trim only trailing whitespace at the very end of the block so
      // users don't paste a hanging newline that triggers an empty
      // command in their shell.
      return raw.split('\n').map(function (line) {
        return line.replace(/^\$\s?/, '');
      }).join('\n').replace(/\s+$/, '');
    }

    function flash (btn, label, cls, ms) {
      btn.textContent = label;
      btn.classList.add(cls);
      setTimeout(function () {
        btn.textContent = 'copy';
        btn.classList.remove(cls);
      }, ms || 1800);
    }

    for (var i = 0; i < buttons.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var wrap = btn.closest('.code-wrap');
          if (!wrap) return;
          var pre = wrap.querySelector('pre.code-block');
          if (!pre) return;
          var text = clean(pre.textContent || '');

          // Modern path: navigator.clipboard.writeText. Requires a
          // secure context (https:// or localhost) and user gesture
          // — which we have, since we're in a click handler.
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
              flash(btn, '✓ copied', 'copied');
            }).catch(function () {
              flash(btn, 'copy failed', 'failed');
            });
            return;
          }

          // Fallback for older browsers / non-secure contexts: a
          // throwaway textarea + execCommand('copy'). Deprecated but
          // still works on every browser that doesn't ship the modern
          // clipboard API.
          try {
            var ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.cssText = 'position:absolute;left:-9999px;top:0;';
            document.body.appendChild(ta);
            ta.select();
            var ok = document.execCommand('copy');
            document.body.removeChild(ta);
            flash(btn, ok ? '✓ copied' : 'copy failed', ok ? 'copied' : 'failed');
          } catch (e) {
            flash(btn, 'copy failed', 'failed');
          }
        });
      })(buttons[i]);
    }
  }

  // ─── 2. Build status badge ───────────────────────────────────────
  var REPO = 'privacykey/mantis';
  var CACHE_KEY = 'mantis-build-status';
  var CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // Map a GitHub Actions run status/conclusion into our three visible
  // states (ok / fail / run) plus a sentinel "na" for unknown. Anonymous
  // API responses keep us out of in-progress detail; we infer from the
  // top-level `status` and `conclusion` fields.
  function classify (run) {
    if (!run) return { cls: 'na',   label: 'build · unknown' };
    if (run.status !== 'completed') {
      // queued | in_progress | waiting
      return     { cls: 'run',  label: 'build · running' };
    }
    if (run.conclusion === 'success')          return { cls: 'ok',   label: 'build · passing' };
    if (run.conclusion === 'failure' ||
        run.conclusion === 'timed_out' ||
        run.conclusion === 'startup_failure')  return { cls: 'fail', label: 'build · failing' };
    if (run.conclusion === 'cancelled' ||
        run.conclusion === 'skipped' ||
        run.conclusion === 'neutral')          return { cls: 'na',   label: 'build · ' + run.conclusion };
    return                                            { cls: 'na',   label: 'build · ' + (run.conclusion || 'unknown') };
  }

  function setupBuildStatus () {
    var el = document.querySelector('[data-build-status]');
    if (!el) return;

    function paint (state) {
      el.classList.remove('ok', 'fail', 'run', 'na');
      el.classList.add(state.cls);
      // Rebuild content rather than fiddle with text nodes — keeps the
      // markup symmetric with the initial state in the HTML.
      el.innerHTML = '<span class="dot">●</span> ' + state.label;
    }

    // Cache hit? Skip the network entirely.
    try {
      var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached && Date.now() - cached.t < CACHE_TTL) {
        paint(cached.state);
        return;
      }
    } catch (e) { /* ignored — localStorage may be disabled */ }

    fetch('https://api.github.com/repos/' + REPO + '/actions/runs?per_page=1', {
      headers: { 'Accept': 'application/vnd.github.v3+json' }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('http ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var run = (data && data.workflow_runs && data.workflow_runs[0]) || null;
        var state = classify(run);
        paint(state);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ state: state, t: Date.now() })); } catch (e) {}
      })
      .catch(function (err) {
        // Most common reasons: the repo doesn't exist yet (404), GitHub
        // is down, the visitor is offline, or CORS preflight is blocked
        // by something upstream. Hide the badge so the footer doesn't
        // sit on "checking…" forever, and also hide the leading "·"
        // separator so we don't leave a dangling dot pointing at nothing.
        if (window.console) console.warn('[mantis] build status fetch failed:', err.message);
        el.style.display = 'none';
        var sep = el.previousElementSibling;
        if (sep && sep.classList.contains('sep')) sep.style.display = 'none';
      });
  }

  // ─── 3. Maker credit ─────────────────────────────────────────────
  var MAKER = 'adamxweb';
  var MAKER_URL = 'https://github.com/AdamXweb';
  var MAKER_AVATAR = 'https://github.com/AdamXweb.png?size=64';

  function setupMakerCredit () {
    var bar = document.querySelector('.footer-bottom');
    if (!bar || bar.querySelector('.maker')) return;

    // The © line is the first <span> of the bar; the credit joins it
    // inline so it wraps with the copyright rather than as its own
    // flex child.
    var line = bar.querySelector('span');
    if (!line) return;

    var link = document.createElement('a');
    link.className = 'maker';
    link.href = MAKER_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.setAttribute('aria-label', 'made by ' + MAKER + ' — GitHub profile (opens in new tab)');

    var img = document.createElement('img');
    img.src = MAKER_AVATAR;
    img.alt = '';
    img.width = 16;
    img.height = 16;
    img.loading = 'lazy';
    img.decoding = 'async';

    link.appendChild(img);
    link.appendChild(document.createTextNode(MAKER));

    line.appendChild(document.createTextNode(' · made by '));
    line.appendChild(link);
  }

  function init () {
    setupCopy();
    setupBuildStatus();
    setupMakerCredit();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
