/* Generated from site/themes.json by scripts/build.mjs. */
(function () {
  'use strict';
  var themes = ["mono","amber","green","cyan","ultraviolet","rust","paper"];
  var selects = document.querySelectorAll('[data-theme-select]');
  function current() { var t = document.documentElement.dataset.theme; return themes.includes(t) ? t : 'mono'; }
  function refresh() {
    selects.forEach(function(s) { s.value = current(); });
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  }
  selects.forEach(function(s) {
    s.addEventListener('change', function() {
      if (!themes.includes(s.value)) return;
      document.documentElement.dataset.theme = s.value;
      try { localStorage.setItem('mantis-theme', s.value); } catch(e) {}
      refresh();
      window.dispatchEvent(new CustomEvent('mantis:theme-change', { detail:{ theme:s.value } }));
    });
  });
  refresh();
  var menu = document.querySelector('.nav-menu');
  if (menu) {
    document.addEventListener('focusin', function(e) { if (!menu.contains(e.target)) menu.open = false; });
    menu.querySelectorAll('a').forEach(function(a) { a.addEventListener('click', function() { menu.open = false; }); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });
    document.addEventListener('click', function(e) { if (!menu.contains(e.target)) menu.open = false; });
  }
  // Native fragment navigation scrolls, but not every browser moves keyboard focus.
  document.querySelectorAll('a[href]').forEach(function(link) {
    link.addEventListener('click',function(e) {
      if(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button) return;
      var url=new URL(link.href,location.href);
      if(url.origin!==location.origin || url.pathname!==location.pathname || !url.hash) return;
      var target=document.getElementById(decodeURIComponent(url.hash.slice(1)));
      if(!target) return;
      target.setAttribute('tabindex','-1');
      target.focus({preventScroll:true});
    });
  });
})();
