/**
 * mantis — theme switcher.
 *
 * The pre-paint inline script in each page's <head> has already set
 * data-theme on <html> from localStorage before CSS parsed, so by the
 * time this file runs the page is already painted in the right palette.
 * What's left for us:
 *
 *  1. Sync each theme-select dropdown's `value` to the active theme so
 *     visitors can see which one is selected.
 *  2. On change, write the new theme back to localStorage + flip the
 *     data-theme attribute (which lets CSS retint the page instantly).
 *  3. Dispatch a `mantis:theme-change` CustomEvent on window so other
 *     scripts (the globe in mantis-terminal.js) can recolour their
 *     own state — Three.js materials don't read CSS variables, so the
 *     globe has to be told.
 *
 *  No external dependencies, no third-party storage, no analytics.
 */
(function () {
  'use strict';

  var KEY = 'mantis-theme';
  // Order here mirrors the <option> order in the markup. The first
  // entry is also the page default (no data-theme attribute on <html>
  // means "use the bare :root block, which is mono").
  var THEMES = ['mono', 'amber', 'green', 'cyan'];
  var DEFAULT_THEME = 'mono';

  function currentTheme () {
    var t = document.documentElement.getAttribute('data-theme');
    if (t && THEMES.indexOf(t) >= 0) return t;
    return DEFAULT_THEME; // unset attribute = default
  }

  function applyTheme (next) {
    if (THEMES.indexOf(next) < 0) return;
    if (next === DEFAULT_THEME) {
      // Default theme uses the bare :root block — no attribute needed.
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', next);
    }
    try { localStorage.setItem(KEY, next); } catch (e) {}
    // Tell anyone who cares (the globe). The detail carries the new theme
    // name; listeners can re-read CSS variables via getComputedStyle.
    try {
      window.dispatchEvent(new CustomEvent('mantis:theme-change', {
        detail: { theme: next }
      }));
    } catch (e) {
      // Older browsers without CustomEvent constructor — fall back to
      // the createEvent path. Unlikely on anything that runs the globe
      // (WebGL2 + ES6 territory), but cheap to keep working.
      var ev = document.createEvent('CustomEvent');
      ev.initCustomEvent('mantis:theme-change', false, false, { theme: next });
      window.dispatchEvent(ev);
    }
  }

  function wire (select) {
    select.value = currentTheme();
    select.addEventListener('change', function () {
      applyTheme(select.value);
    });
  }

  // There might be more than one switcher rendered (e.g. a future mobile
  // menu). Wire all of them and keep them in sync across changes.
  function init () {
    var selects = document.querySelectorAll('select[data-theme-select]');
    for (var i = 0; i < selects.length; i++) wire(selects[i]);

    // Keep multiple switchers in lockstep — if one changes, update the
    // others' visible value without re-firing the theme-change event.
    window.addEventListener('mantis:theme-change', function (e) {
      var t = (e && e.detail && e.detail.theme) || currentTheme();
      for (var i = 0; i < selects.length; i++) {
        if (selects[i].value !== t) selects[i].value = t;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
