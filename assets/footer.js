/* Clipboard and main-branch CI enhancements. All page content works without them. */
(function () {
  'use strict';
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  var worker = document.querySelector('[data-worker-url]');
  if (worker) {
    worker.addEventListener('input', function () {
      var valid = false, url;
      try {
        url = new URL(worker.value.trim());
        valid = url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/';
      } catch (e) {}
      var code = document.querySelector('[data-worker-template]');
      var button = document.querySelector('[data-needs-worker]');
      code.textContent = valid ? "mantis edge set-key '" + url.origin.replace(/'/g, "'\\''") + "'" : 'mantis edge set-key "$MANTIS_WORKER_URL"';
      button.disabled = !valid;
      worker.dataset.valid = String(valid);
      worker.setAttribute('aria-invalid', worker.value && !valid ? 'true' : 'false');
      document.getElementById('worker-hint').textContent = valid ? 'Ready to copy. This URL stays in your browser.' : 'Enter an HTTPS Worker base URL without a path, credentials, query, or fragment.';
    });
  }

  async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(text); return; } catch (e) { /* try selection fallback */ }
    }
    var active = document.activeElement;
    var area = document.createElement('textarea');
    area.value = text; area.readOnly = true;
    area.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(area); area.select();
    try { if (!document.execCommand('copy')) throw new Error('Clipboard is unavailable'); }
    finally { area.remove(); if (active) active.focus(); }
  }
  document.querySelectorAll('[data-copy]').forEach(function (button) {
    var label = button.textContent;
    button.addEventListener('click', async function () {
      var code = button.closest('.code-wrap').querySelector('pre.code-block code');
      if (!code) return;
      button.disabled = true;
      try { await copyText(code.textContent.trim()); button.textContent = 'Copied'; }
      catch (e) { button.textContent = 'Select and copy the command'; }
      finally {
        setTimeout(function () {
          button.textContent = label;
          button.disabled = button.hasAttribute('data-needs-worker') && document.querySelector('[data-worker-url]').dataset.valid !== 'true';
        }, 1800);
      }
    });
  });

  var badge = document.querySelector('[data-build-status]');
  var checked = document.querySelector('[data-build-checked]');
  if (!badge) return;
  var cacheKey = 'mantis-main-ci-v1', ttl = 5 * 60 * 1000;
  function paint(run, time) {
    if (!run || run.head_branch !== 'main' || run.event !== 'push' || !/^https:\/\/github\.com\/privacykey\/mantis\/actions\/runs\/\d+$/.test(run.html_url)) throw new Error('No main CI push run');
    var label = 'unknown', cls = 'na';
    if (run.status !== 'completed') { label = 'running'; cls = 'run'; }
    else if (run.conclusion === 'success') { label = 'passing'; cls = 'ok'; }
    else if (['failure','timed_out','startup_failure','action_required'].includes(run.conclusion)) { label = 'failing'; cls = 'fail'; }
    else if (['cancelled','skipped','neutral'].includes(run.conclusion)) label = run.conclusion;
    badge.className = 'build ' + cls;
    badge.textContent = 'main CI · ' + label;
    badge.href = run.html_url;
    badge.setAttribute('aria-label', 'Mantis main CI: ' + label + '. Open the checked run.');
    var stamp = new Date(time);
    checked.textContent = 'checked ' + stamp.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
    checked.title = 'Checked ' + stamp.toISOString();
  }
  try {
    var cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && Number.isFinite(cached.time) && Date.now() >= cached.time && Date.now() - cached.time < ttl) { paint(cached.run, cached.time); return; }
  } catch (e) {}
  var controller = new AbortController();
  var timeout = setTimeout(function () { controller.abort(); }, 8000);
  fetch('https://api.github.com/repos/privacykey/mantis/actions/workflows/ci.yml/runs?branch=main&event=push&per_page=1', {
    headers:{Accept:'application/vnd.github+json'}, credentials:'omit', referrerPolicy:'no-referrer', signal:controller.signal
  }).then(function (r) { if (!r.ok) throw new Error('CI request failed'); return r.json(); })
    .then(function (data) {
      var run = data.workflow_runs && data.workflow_runs[0], time = Date.now();
      paint(run,time);
      try { localStorage.setItem(cacheKey,JSON.stringify({run:{head_branch:run.head_branch,event:run.event,status:run.status,conclusion:run.conclusion,html_url:run.html_url},time:time})); } catch (e) {}
    }).catch(function () { badge.textContent = 'main CI · unavailable'; checked.textContent = ''; })
    .finally(function () { clearTimeout(timeout); });
})();
