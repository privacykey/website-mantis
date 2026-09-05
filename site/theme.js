(function () {
  'use strict';
  var themes = THEME_IDS;
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
    menu.querySelectorAll('a').forEach(function(a) { a.addEventListener('click', function() { menu.open = false; }); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && menu.open) { menu.open = false; menu.querySelector('summary').focus(); } });
    document.addEventListener('click', function(e) { if (!menu.contains(e.target)) menu.open = false; });
  }
})();
