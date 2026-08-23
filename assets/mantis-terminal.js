/**
 * mantis — hero interaction layer.
 *
 * Two cooperating systems:
 *
 *  1. Three.js wireframe globe (.hero-globe canvas)
 *     - perspective camera, slow auto-rotation
 *     - latitude/longitude line cage rendered as LineSegments
 *     - on each "ping": a fake source IP is spawned at a random lat/lon,
 *       an arc grows from there toward the mantis core (the fixed marker
 *       on the globe), and a brief flash fires at the impact point.
 *
 *  2. Fake terminal (.hero-terminal DOM)
 *     - boot banner + scripted sequence of mantis commands runs on load,
 *       each command triggering a globe ping at the moment its hit lands.
 *     - after the scripted sequence, .term-input becomes active and the
 *       user can type real (or pretend-real) mantis commands. A small
 *       dispatcher prints canned output and triggers another globe ping
 *       for recognised commands.
 *
 *  Accessibility / perf:
 *   - Bails out entirely under prefers-reduced-motion (the no-JS
 *     fallback line takes over; .hero-globe is hidden by CSS).
 *   - Container is aria-hidden + pointer-events:none for the canvas.
 *   - DPR capped at 2, render paused when tab is hidden or hero is
 *     scrolled off-viewport.
 */
(function () {
  'use strict';

  // ─── 0. Early bailouts ───────────────────────────────────────────────────
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }
  var THREE = window.THREE;
  if (!THREE) {
    console.warn('[mantis] Three.js not loaded; hero will fall back to static layout.');
    // still wire up the terminal — even without the globe, the terminal is
    // a useful affordance — but skip everything that touches THREE.
  }

  // ─── 1. Globe ────────────────────────────────────────────────────────────
  // We let the terminal call `globe.ping(...)` whether or not the globe
  // actually initialised. If it didn't, the function is a no-op.
  var globe = {
    ping: function () {},
    setLive: function () {},
    destroy: function () {}
  };

  function setupGlobe(root) {
    var canvas = root.querySelector('canvas');
    if (!canvas || !THREE) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'low-power'
      });
    } catch (err) {
      console.warn('[mantis] WebGL unavailable', err);
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(dpr);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 0.4, 7.5);
    camera.lookAt(0, 0, 0);

    // Group everything so rotation is a single transform.
    var globeGroup = new THREE.Group();
    scene.add(globeGroup);

    var RADIUS = 2.2;

    // Pre-shared colour objects so we don't allocate per-frame. Values are
    // pulled from the live CSS palette (--accent, --accent-bright, etc.) so
    // the globe matches whichever theme is active at boot. The same
    // .set(...) calls run again inside relight() whenever the theme switches.
    var ACCENT    = new THREE.Color();
    var ACCENT_HI = new THREE.Color();
    var ACCENT_LO = new THREE.Color();
    var ALARM     = new THREE.Color();

    // Read a CSS custom property off :root, falling back to the supplied
    // hex if the variable is missing or empty (some browsers haven't fully
    // parsed CSS by the time inline scripts run). Trimmed because
    // getPropertyValue returns the literal token, leading spaces and all.
    function readVar (name, fallback) {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      v = v && v.trim();
      return v || fallback;
    }

    function loadThemeColors () {
      ACCENT.set(readVar('--accent',        '#FFB000'));
      ACCENT_HI.set(readVar('--accent-bright', '#FFC840'));
      ACCENT_LO.set(readVar('--accent-line',   '#3d2a04'));
      ALARM.set(readVar('--alarm',          '#ff5a3c'));
    }
    loadThemeColors();

    // ── Wireframe cage ──
    // A traditional globe wireframe = parallels (constant latitude) + meridians
    // (constant longitude). We render both as a single LineSegments mesh by
    // building a vertex list of paired points. The cage uses the dim accent
    // line colour so the brighter pings + core marker pop against it. We
    // hold onto cageMat so relight() can swap its colour on theme change.
    var cageMat;
    (function buildCage () {
      var positions = [];
      var LATS = 9;      // parallels
      var LATS_SEG = 96; // segments per parallel
      for (var i = 1; i < LATS; i++) {
        var phi = (i / LATS) * Math.PI;        // 0..π
        var y = Math.cos(phi) * RADIUS;
        var rr = Math.sin(phi) * RADIUS;
        for (var j = 0; j < LATS_SEG; j++) {
          var a = (j / LATS_SEG) * Math.PI * 2;
          var b = ((j + 1) / LATS_SEG) * Math.PI * 2;
          positions.push(Math.cos(a) * rr, y, Math.sin(a) * rr);
          positions.push(Math.cos(b) * rr, y, Math.sin(b) * rr);
        }
      }
      var LONS = 18;     // meridians
      var LONS_SEG = 64; // segments per meridian
      for (var k = 0; k < LONS; k++) {
        var theta = (k / LONS) * Math.PI * 2;
        for (var m = 0; m < LONS_SEG; m++) {
          var p1 = (m / LONS_SEG) * Math.PI;
          var p2 = ((m + 1) / LONS_SEG) * Math.PI;
          positions.push(
            Math.cos(theta) * Math.sin(p1) * RADIUS,
            Math.cos(p1) * RADIUS,
            Math.sin(theta) * Math.sin(p1) * RADIUS
          );
          positions.push(
            Math.cos(theta) * Math.sin(p2) * RADIUS,
            Math.cos(p2) * RADIUS,
            Math.sin(theta) * Math.sin(p2) * RADIUS
          );
        }
      }
      var geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      cageMat = new THREE.LineBasicMaterial({
        color: ACCENT_LO.clone(),  // clone so theme swaps target this material, not the shared ref
        transparent: true,
        opacity: 0.55
      });
      globeGroup.add(new THREE.LineSegments(geom, cageMat));
    })();

    // ── Core marker — the mantis server on the globe. Anchored at lat
    //    -33.86° lon 151.21° (Sydney) since the user's email is .com.au;
    //    that's a humble nod, nothing more. The viewer never sees the
    //    coords. The marker is a small glowing point + a permanent ring.
    var CORE_LAT = -33.86;
    var CORE_LON = 151.21;
    function latLonToVec3 (lat, lon, r) {
      var phi = (90 - lat) * Math.PI / 180;
      var theta = (lon + 180) * Math.PI / 180;
      return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
         r * Math.cos(phi),
         r * Math.sin(phi) * Math.sin(theta)
      );
    }
    var coreVec = latLonToVec3(CORE_LAT, CORE_LON, RADIUS);

    // We hold onto the dot + ring materials so relight() can retint them.
    var coreDotMat, coreRingMat;
    (function buildCore () {
      coreDotMat = new THREE.MeshBasicMaterial({ color: ACCENT_HI.clone() });
      var dot = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 16), coreDotMat);
      dot.position.copy(coreVec);
      globeGroup.add(dot);

      // A flat ring around the marker so it reads as a hub rather than
      // just another ping point.
      coreRingMat = new THREE.MeshBasicMaterial({
        color: ACCENT.clone(), transparent: true, opacity: 0.7, side: THREE.DoubleSide
      });
      var ring = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.14, 32), coreRingMat);
      ring.position.copy(coreVec);
      ring.lookAt(coreVec.clone().multiplyScalar(2));
      globeGroup.add(ring);
    })();

    // ── relight ──
    // Called on every theme switch. Re-reads CSS variables (the pre-paint
    // bootstrap has already swapped data-theme by the time the change
    // event reaches us) and walks the persistent materials, swapping their
    // colours in place. In-flight pings keep the colour they were spawned
    // with — they're short-lived (~3s) and the next one will be themed.
    function relight () {
      loadThemeColors();
      if (cageMat)     cageMat.color.copy(ACCENT_LO);
      if (coreDotMat)  coreDotMat.color.copy(ACCENT_HI);
      if (coreRingMat) coreRingMat.color.copy(ACCENT);
    }
    window.addEventListener('mantis:theme-change', relight);

    // ── Pings ──
    // A ping = a small dot at a random surface point + an arc curving up to
    // CORE. Each ping is a self-contained object with its own meshes; it
    // ticks itself in update(), and removes its meshes from the scene when
    // it expires. Cap MAX so a wedged tab doesn't grow forever.
    var pings = [];
    var MAX_PINGS = 12;

    function spawnPing (lat, lon, alarmed) {
      if (pings.length >= MAX_PINGS) {
        // recycle the oldest
        var old = pings.shift();
        old.dispose();
      }
      var src = latLonToVec3(lat, lon, RADIUS);
      var color = alarmed ? ALARM : ACCENT_HI;

      // arc: control point at midpoint pushed outward
      var mid = src.clone().add(coreVec).multiplyScalar(0.5);
      mid.normalize().multiplyScalar(RADIUS * 1.55);
      var curve = new THREE.QuadraticBezierCurve3(src.clone(), mid, coreVec.clone());

      var ARC_SEGS = 40;
      var pts = curve.getPoints(ARC_SEGS);
      var arcGeom = new THREE.BufferGeometry().setFromPoints(pts);
      var arcMat = new THREE.LineBasicMaterial({
        color: color, transparent: true, opacity: 0.0
      });
      var arc = new THREE.Line(arcGeom, arcMat);
      // We animate the draw by clipping the draw range; start at 0.
      arc.geometry.setDrawRange(0, 0);
      globeGroup.add(arc);

      var dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 12, 12),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.95 })
      );
      dot.position.copy(src);
      globeGroup.add(dot);

      var ring = new THREE.Mesh(
        new THREE.RingGeometry(0.06, 0.09, 24),
        new THREE.MeshBasicMaterial({
          color: color, transparent: true, opacity: 0.9, side: THREE.DoubleSide
        })
      );
      ring.position.copy(src);
      ring.lookAt(src.clone().multiplyScalar(2));
      globeGroup.add(ring);

      var ping = {
        age: 0,
        life: alarmed ? 3.4 : 2.6,
        grow: 0.55,           // arc draw-in seconds
        hold: 0.7,            // arc hold seconds before fade-out
        arc: arc,
        arcMat: arcMat,
        dot: dot,
        dotMat: dot.material,
        ring: ring,
        ringMat: ring.material,
        // ringExpand: scale factor to ease the ring outward as it fades
        update: function (dt) {
          this.age += dt;
          var t = this.age;
          // arc draw-in
          var drawT = Math.min(1, t / this.grow);
          this.arc.geometry.setDrawRange(0, Math.floor(drawT * (ARC_SEGS + 1)));
          // arc opacity: pop in, hold, fade out
          var opa;
          if (t < this.grow) opa = drawT;
          else if (t < this.grow + this.hold) opa = 1;
          else {
            var fadeT = (t - this.grow - this.hold) / (this.life - this.grow - this.hold);
            opa = Math.max(0, 1 - fadeT);
          }
          this.arcMat.opacity = opa * 0.95;

          // ring expands + fades
          var ringT = Math.min(1, t / (this.life * 0.7));
          var s = 1 + ringT * 3.0;
          this.ring.scale.set(s, s, 1);
          this.ringMat.opacity = 0.9 * (1 - ringT);

          // dot fades after arc head reaches core
          this.dotMat.opacity = Math.max(0, 0.95 - Math.max(0, t - this.grow) * 0.6);

          return t < this.life;
        },
        dispose: function () {
          globeGroup.remove(this.arc);
          globeGroup.remove(this.dot);
          globeGroup.remove(this.ring);
          this.arc.geometry.dispose(); this.arcMat.dispose();
          this.dot.geometry.dispose(); this.dotMat.dispose();
          this.ring.geometry.dispose(); this.ringMat.dispose();
        }
      };
      pings.push(ping);
    }

    // Random points are drawn from a pool of plausible-sounding regions
    // rather than uniform-on-sphere — keeps pings on visible faces and
    // gives us a deterministic IP per region for the terminal log.
    var REGIONS = [
      { lat:  40.71, lon:  -74.01, ip: '203.0.113.42',  loc: 'New York · US'      },
      { lat:  51.51, lon:   -0.13, ip: '198.51.100.7',  loc: 'London · GB'        },
      { lat:  35.69, lon:  139.69, ip: '203.0.113.18',  loc: 'Tokyo · JP'         },
      { lat:  52.52, lon:   13.40, ip: '192.0.2.91',    loc: 'Berlin · DE'        },
      { lat:  37.77, lon: -122.42, ip: '198.51.100.66', loc: 'San Francisco · US' },
      { lat:  -1.29, lon:   36.82, ip: '203.0.113.205', loc: 'Nairobi · KE'       },
      { lat:  19.43, lon:  -99.13, ip: '192.0.2.143',   loc: 'Mexico City · MX'   },
      { lat:  55.75, lon:   37.62, ip: '203.0.113.88',  loc: 'Moscow · RU'        },
      { lat:  28.61, lon:   77.21, ip: '198.51.100.31', loc: 'Delhi · IN'         },
      { lat: -23.55, lon:  -46.63, ip: '192.0.2.4',     loc: 'São Paulo · BR'     },
      { lat:  31.23, lon:  121.47, ip: '203.0.113.144', loc: 'Shanghai · CN'      },
      { lat:  48.85, lon:    2.35, ip: '198.51.100.99', loc: 'Paris · FR'         }
    ];
    function randomRegion () { return REGIONS[Math.floor(Math.random() * REGIONS.length)]; }

    // ── Loop ──
    var startMs = performance.now();
    var lastFrame = startMs;
    var rafId = 0;
    var tabActive = !document.hidden;
    var inViewport = true;

    // Where the globe sits horizontally inside the hero. On wide
    // viewports the terminal panel takes ~720px on the left side, so we
    // shift the globe right (in 3D space, not via CSS) so it lives in the
    // column to the right of the terminal rather than behind it. On
    // narrow viewports the terminal goes full-width and the globe is
    // better off centred — otherwise the right edge of the globe lands
    // off-canvas. The threshold matches the .hero-globe @media rule in
    // site.css so the mask and the geometry track each other.
    function updateOffset (w, h) {
      var aspect = w / h;
      // Mirror the CSS breakpoint at 820px: above that the hero has
      // room for a two-column read; below, single-column.
      var wide = w >= 820;
      // 1.6 units shifts the globe ~24% right of canvas centre at the
      // hero's typical aspect (~2.7) — far enough to clear the 720px
      // terminal, not so far that the globe's near limb leaves the mask.
      globeGroup.position.x = wide ? 1.6 : 0;
      // Slight downward nudge on wide layouts so the globe centre lines
      // up with the terminal's vertical centre, not the hero's.
      globeGroup.position.y = wide ? -0.15 : 0;
    }

    function resize () {
      var rect = root.getBoundingClientRect();
      var w = Math.max(1, Math.floor(rect.width));
      var h = Math.max(1, Math.floor(rect.height));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      updateOffset(w, h);
    }
    resize();
    window.addEventListener('resize', resize);
    if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(root);

    function tick (now) {
      if (!tabActive || !inViewport) { rafId = 0; return; }
      var dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      globeGroup.rotation.y += dt * 0.08;
      globeGroup.rotation.x = Math.sin((now - startMs) / 8000) * 0.08;

      for (var i = pings.length - 1; i >= 0; i--) {
        var alive = pings[i].update(dt);
        if (!alive) { pings[i].dispose(); pings.splice(i, 1); }
      }

      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    }
    function resume () {
      if (rafId) return;
      lastFrame = performance.now();
      rafId = requestAnimationFrame(tick);
    }
    function pause () {
      if (!rafId) return;
      cancelAnimationFrame(rafId); rafId = 0;
    }

    document.addEventListener('visibilitychange', function () {
      tabActive = !document.hidden;
      if (tabActive && inViewport) resume(); else pause();
    });
    if (typeof IntersectionObserver === 'function') {
      new IntersectionObserver(function (entries) {
        inViewport = entries[0].isIntersecting;
        if (tabActive && inViewport) resume(); else pause();
      }, { threshold: 0 }).observe(root);
    }
    resume();

    // ── Public API (closure) ──
    globe.ping = function (opts) {
      opts = opts || {};
      var r = opts.region || randomRegion();
      spawnPing(r.lat, r.lon, !!opts.alarmed);
      return r;
    };
    globe.regions = REGIONS;
    globe.destroy = function () {
      pause();
      window.removeEventListener('resize', resize);
    };
  }

  // Bootstrap globe (if container exists)
  var globeRoot = document.querySelector('.hero-globe');
  if (globeRoot && THREE) setupGlobe(globeRoot);

  // ─── 2. Terminal ─────────────────────────────────────────────────────────
  var termRoot = document.querySelector('.hero-terminal');
  if (!termRoot) return;
  var body = termRoot.querySelector('.term-body');
  var input = termRoot.querySelector('.term-input');
  if (!body) return;

  // Tiny line writer. `kind` maps to a span class so the CSS palette stays
  // the source of truth for colour. Returns the line element so callers can
  // animate (e.g. typewriter) into it.
  function writeLine (parts, opts) {
    opts = opts || {};
    var line = document.createElement('div');
    line.className = 'term-line';
    if (typeof parts === 'string') {
      line.textContent = parts;
    } else {
      parts.forEach(function (p) {
        if (typeof p === 'string') { line.appendChild(document.createTextNode(p)); return; }
        var span = document.createElement('span');
        if (p.cls) span.className = p.cls;
        span.textContent = p.text;
        line.appendChild(span);
      });
    }
    body.appendChild(line);
    body.scrollTop = body.scrollHeight;
    return line;
  }

  // Typewriter — type `text` into `target` over `dur` seconds. Resolves when
  // done. Used for the scripted command lines so the user sees the cmd
  // appear character by character rather than just popping in.
  function typeInto (target, text, dur) {
    return new Promise(function (resolve) {
      var i = 0;
      var per = Math.max(8, (dur * 1000) / text.length);
      function step () {
        if (i >= text.length) { resolve(); return; }
        target.textContent += text[i++];
        body.scrollTop = body.scrollHeight;
        setTimeout(step, per);
      }
      step();
    });
  }
  function wait (ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Boot banner. We print it once so the page reads as "the mantis CLI
  // just connected to a server" before any commands run — reinforcing
  // the three-pieces framing on the architecture section above (CLI is
  // the controller; full and edge are the two server flavours).
  function bootBanner () {
    writeLine([{ cls: 'dim', text: 'mantis CLI v0.2.0 — github.com/privacykey/mantis' }]);
    writeLine([{ cls: 'dim', text: '(c) privacykey · MIT · type ' }, { cls: 'ok', text: 'help' }, { cls: 'dim', text: ' for commands' }]);
    writeLine([{ cls: 'dim', text: '────────────────────────────────────────────────────' }]);
    writeLine([{ cls: 'info', text: '✓ connected to localhost:3000 ' }, { cls: 'dim', text: '(full · v0.1.1)' }]);
    writeLine('');
  }

  // ── Scripted intro sequence ──
  // Plays once on load. Mixes `mantis new`, `mantis watch`, and a couple of
  // simulated hits to demonstrate the product without the visitor having to
  // type anything. Each line that mentions a hit triggers a globe ping.
  function scriptedLine (cmd) {
    // Returns a promise that resolves after the line has been typed.
    var line = writeLine([{ cls: 'prompt', text: '$' }]);
    var span = document.createElement('span'); span.className = 'cmd'; line.appendChild(span);
    return typeInto(span, ' ' + cmd, 0.5 + cmd.length * 0.025).then(function () { return wait(180); });
  }

  function fakeHit (r, kind, payload) {
    var prefix = (kind === 'trip') ? 'TRIP' : ' hit';
    var prefixCls = (kind === 'trip') ? 'trip' : 'ok';
    writeLine([
      { cls: prefixCls, text: '[' + prefix + ']' },
      ' ',
      { cls: 'info', text: payload },
      { cls: 'dim', text: '  ← ' + r.ip + ' · ' + r.loc }
    ]);
    globe.ping({ region: r, alarmed: kind === 'trip' });
  }

  function runScript () {
    return Promise.resolve()
      .then(function () { return wait(400); })
      .then(function () { return scriptedLine('mantis new "Q4 forecast" -w https://hook.example.com/q4'); })
      .then(function () {
        writeLine([{ cls: 'dim', text: '  → key: ' }, { cls: 'ok', text: 'http://localhost:3000/c/aB9xY2' }]);
        writeLine([{ cls: 'dim', text: '  → notify: webhook' }]);
        writeLine('');
        return wait(500);
      })
      .then(function () { return scriptedLine('mantis install <id> --type shell-sudo --out ~/.mantis.sh'); })
      .then(function () {
        writeLine([{ cls: 'dim', text: '  → wrote ~/.mantis.sh (POSIX shell snippet, 1.2 KB)' }]);
        writeLine('');
        return wait(450);
      })
      .then(function () { return scriptedLine('mantis watch'); })
      .then(function () {
        writeLine([{ cls: 'dim', text: '  watching · streaming hits to stdout · ctrl-c to stop' }]);
        writeLine('');
        return wait(600);
      })
      // Now simulate a few hits with globe pings.
      .then(function () { fakeHit(globe.regions ? globe.regions[4] : { ip: '198.51.100.66', loc: 'San Francisco · US', lat: 37.77, lon: -122.42 }, 'hit', 'file:Q4_forecast.docx · ua:Word/16.0'); return wait(1400); })
      .then(function () { fakeHit(globe.regions ? globe.regions[1] : { ip: '198.51.100.7',  loc: 'London · GB',        lat: 51.51, lon: -0.13   }, 'hit', 'web-css · referer:none'); return wait(1900); })
      .then(function () { fakeHit(globe.regions ? globe.regions[7] : { ip: '203.0.113.88',  loc: 'Moscow · RU',        lat: 55.75, lon: 37.62   }, 'trip', 'shell-sudo · alice@prod-bastion · sudo cat /etc/shadow'); return wait(2200); })
      .then(function () { fakeHit(globe.regions ? globe.regions[2] : { ip: '203.0.113.18',  loc: 'Tokyo · JP',         lat: 35.69, lon: 139.69  }, 'hit', 'passwords.txt · ua:curl/8.4'); return wait(1700); })
      .then(function () { fakeHit(globe.regions ? globe.regions[3] : { ip: '192.0.2.91',    loc: 'Berlin · DE',        lat: 52.52, lon: 13.40   }, 'hit', 'homeassistant · front_door · unlocked · entity:lock.front'); return wait(1900); })
      .then(function () {
        writeLine('');
        writeLine([{ cls: 'dim', text: '── try it yourself: type ' }, { cls: 'ok', text: 'help' }, { cls: 'dim', text: ', ' }, { cls: 'ok', text: 'mantis new <memo>' }, { cls: 'dim', text: ', ' }, { cls: 'ok', text: 'mantis watch' }, { cls: 'dim', text: ' …' }]);
        if (input) input.disabled = false;
        if (input) input.placeholder = 'try: mantis new "secret docs" -w https://hook.example.com';
      });
  }

  // ── User commands ──
  // A tiny dispatcher. Recognises a handful of mantis subcommands and prints
  // a plausible response. Unknown input gets a tongue-in-cheek "not found".
  // Real, more nuanced output lives in the actual mantis CLI; this is just
  // enough flavour to feel real on the marketing page.
  function handle (cmdLine) {
    var trimmed = cmdLine.trim();
    if (!trimmed) return;
    // echo line
    writeLine([{ cls: 'prompt', text: '$' }, ' ', { cls: 'cmd', text: trimmed }]);
    var tokens = trimmed.split(/\s+/);
    if (tokens[0] !== 'mantis' && tokens[0] !== 'help' && tokens[0] !== 'clear' && tokens[0] !== 'whoami' && tokens[0] !== 'date') {
      writeLine([{ cls: 'trip', text: 'command not found:' }, ' ' + tokens[0] + '  ', { cls: 'dim', text: '— try `help`' }]);
      return;
    }
    if (tokens[0] === 'help') {
      writeLine([{ cls: 'ok', text: 'usage:' }, ' mantis <command> [args]']);
      writeLine([{ cls: 'dim', text: 'commands: new, list, hits, watch, install, monitor, reset, login' }]);
      writeLine([{ cls: 'dim', text: 'this terminal is a demo. full CLI: ' }, { cls: 'ok', text: 'github.com/privacykey/mantis' }]);
      return;
    }
    if (tokens[0] === 'clear') {
      body.innerHTML = '';
      return;
    }
    if (tokens[0] === 'whoami') {
      writeLine([{ cls: 'info', text: 'visitor@mantis-demo' }, { cls: 'dim', text: ' (read-only sandbox)' }]);
      return;
    }
    if (tokens[0] === 'date') {
      writeLine([{ cls: 'dim', text: new Date().toUTCString() }]);
      return;
    }
    // mantis <subcmd>
    var sub = tokens[1];
    switch (sub) {
      case 'new': {
        var memo = trimmed.match(/"([^"]+)"/);
        var memoText = memo ? memo[1] : (tokens[2] || 'untitled');
        var id = randomId(8);
        writeLine([{ cls: 'dim', text: '  → key: ' }, { cls: 'ok', text: 'http://localhost:3000/c/' + id }]);
        writeLine([{ cls: 'dim', text: '  → memo: ' }, memoText]);
        writeLine([{ cls: 'dim', text: '  → notify: ' + (trimmed.indexOf('-w') >= 0 ? 'webhook' : 'none (set with -w <url>)') }]);
        var r = globe.ping({ alarmed: false });
        if (r) writeLine([{ cls: 'dim', text: '  → test hit fired from ' + r.ip + ' · ' + r.loc }]);
        return;
      }
      case 'list': {
        writeLine([{ cls: 'dim', text: 'id        memo                          hits  notify' }]);
        writeLine('aB9xY2    Q4 forecast                     12   webhook');
        writeLine('jK4mP9    leadership-plans.zip             0   webhook+slack');
        writeLine('xV2nQ7    ~/.aws/credentials (canary)      3   email');
        writeLine([{ cls: 'dim', text: '3 keys, 15 hits total' }]);
        return;
      }
      case 'hits': {
        var src = (globe.regions || []).slice(0, 4);
        writeLine([{ cls: 'dim', text: 'when  source                                      kind' }]);
        src.forEach(function (r, i) {
          writeLine([{ cls: 'dim', text: (i + 1) + 's   ' }, { cls: 'info', text: r.ip + ' · ' + r.loc }, '  file:Q4_forecast.docx']);
        });
        return;
      }
      case 'watch': {
        writeLine([{ cls: 'dim', text: 'watching · streaming hits · type ' }, { cls: 'ok', text: 'stop' }, { cls: 'dim', text: ' to end' }]);
        startWatch();
        return;
      }
      case 'install': {
        var typeMatch = trimmed.match(/--type[= ](\S+)/);
        var t = typeMatch ? typeMatch[1] : 'shell';
        writeLine([{ cls: 'dim', text: '  → generated installer (type=' + t + ', ~' + (900 + Math.floor(Math.random() * 700)) + ' bytes)' }]);
        writeLine([{ cls: 'dim', text: '  → tip: ' }, { cls: 'info', text: 'mantis install <id> --type ' + t + ' --out ~/.mantis.' + t + '.sh' }]);
        return;
      }
      case 'monitor': {
        writeLine([{ cls: 'dim', text: '  → status URL: ' }, { cls: 'ok', text: 'http://localhost:3000/status/aB9xY2' }]);
        writeLine([{ cls: 'dim', text: '  → mode: latch  · current: ok' }]);
        return;
      }
      case 'reset': {
        writeLine([{ cls: 'ok', text: '✓ key reset · monitor state cleared' }]);
        return;
      }
      case 'login': {
        writeLine([{ cls: 'ok', text: '✓ stored credentials in keychain' }]);
        return;
      }
      default: {
        writeLine([{ cls: 'trip', text: 'unknown subcommand:' }, ' ' + (sub || '(none)') + '  ', { cls: 'dim', text: '— try `help`' }]);
      }
    }
  }

  // ── Watch loop ── started by `mantis watch`. Pumps one fake hit every
  //   ~2–3.5s until the user types `stop`. Each hit pings the globe.
  var watchTimer = null;
  function startWatch () {
    if (watchTimer) return;
    function tick () {
      var r = globe.regions ? globe.regions[Math.floor(Math.random() * globe.regions.length)] : null;
      if (!r) return;
      var alarmed = Math.random() < 0.18;
      fakeHit(r, alarmed ? 'trip' : 'hit',
        alarmed
          ? 'shell-sudo · ' + ['alice', 'bob', 'devops'][Math.floor(Math.random() * 3)] + '@prod-bastion · sudo apt update'
          : ['file:Q4_forecast.docx', 'web-css', 'passwords.txt', 'macos-login'][Math.floor(Math.random() * 4)] + ' · ua:' + ['Word/16.0', 'curl/8.4', 'Chrome/130', 'libwww'][Math.floor(Math.random() * 4)]
      );
      watchTimer = setTimeout(tick, 2000 + Math.random() * 1800);
    }
    tick();
  }
  function stopWatch () {
    if (watchTimer) { clearTimeout(watchTimer); watchTimer = null; }
    writeLine([{ cls: 'dim', text: '── watch stopped' }]);
  }

  function randomId (n) {
    var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var out = '';
    for (var i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
  }

  // ── Input handling ──
  if (input) {
    input.disabled = true; // re-enabled after the scripted intro
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var v = input.value;
        input.value = '';
        if (v.trim() === 'stop') { stopWatch(); return; }
        handle(v);
      }
    });
    // Click anywhere in the body refocuses the input — feels more terminal-y
    body.addEventListener('click', function () {
      if (!input.disabled) input.focus();
    });
    termRoot.addEventListener('click', function () {
      if (!input.disabled) input.focus();
    });
  }

  // Kick off
  bootBanner();
  runScript();

  // Expose for console pokers — not the public API of the page, just nice
  // for anyone who opens DevTools after a long scroll-by.
  window.__mantis = { writeLine: writeLine, globe: globe, handle: handle };

  // Console greeting — same shape as the family.
  if (window.console && console.log) {
    var t1 = 'color:#FFB000;font-weight:700;font-family:ui-monospace,monospace;font-size:14px;';
    var t2 = 'color:#855a05;font-family:ui-monospace,monospace;font-size:12px;';
    var t3 = 'color:#FFC840;font-family:ui-monospace,monospace;font-size:12px;';
    console.log('%cmantis', t1);
    console.log('%cself-hostable canary-token service — github.com/privacykey/mantis', t2);
    console.log('%ctry __mantis.handle("mantis new \\"secret\\"") in this console.', t3);
  }
})();
