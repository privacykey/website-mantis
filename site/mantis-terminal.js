import { createDemo } from "/assets/demo-state.js";
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
 *  2. Local simulation (.hero-terminal DOM)
 *     - a complete transcript is visible before JavaScript loads;
 *     - Replay is opt-in; supported commands update one in-memory model;
 *     - simulated fetches update the selected key's hit count.
 *
 *  Accessibility / perf:
 *   - Reduced motion disables the globe and makes Replay immediate.
 *     The transcript, input, and all demo controls remain usable.
 *   - Container is aria-hidden + pointer-events:none for the canvas.
 *   - DPR capped at 2, render paused when tab is hidden or hero is
 *     scrolled off-viewport.
 */
(function () {
  'use strict';

  // ─── 0. Early bailouts ───────────────────────────────────────────────────
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
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
  if (globeRoot && THREE && !motion.matches) setupGlobe(globeRoot);

  // The transcript is ordinary HTML until someone asks to interact or replay.
  var terminal = document.querySelector('.hero-terminal');
  if (!terminal) return;
  var body = terminal.querySelector('.term-body');
  var form = terminal.querySelector('form');
  var input = terminal.querySelector('.term-input');
  var status = terminal.querySelector('[data-demo-status]');
  var replayButton = terminal.querySelector('[data-demo-replay]');
  var skipButton = terminal.querySelector('[data-demo-skip]');
  var demo = createDemo();
  var replayId = 0;
  var playing = false;
  function write(line) {
    var div = document.createElement('div');
    div.className = 'term-line';
    div.textContent = line;
    body.appendChild(div);
    while (body.children.length > 100) body.firstElementChild.remove();
    body.scrollTop = body.scrollHeight;
  }
  function announce(text) { status.textContent = text; }
  function seed() {
    demo.reset(); demo.create('Q4 forecast',true);
    demo.execute('mantis download last --docx Q4_forecast.docx');
    demo.execute('mantis watch'); demo.trigger();
  }
  seed();
  function controls(locked) {
    var hadSkipFocus = document.activeElement === skipButton;
    playing = locked;
    terminal.querySelectorAll('input,button').forEach(function(el) { el.disabled = locked; });
    skipButton.disabled = false;
    skipButton.hidden = !locked;
    if (locked) skipButton.focus();
    else if (hadSkipFocus) replayButton.focus();
  }
  function run(command, userAction) {
    if (command.trim() === 'clear') { body.replaceChildren(); if (userAction) announce('Transcript cleared. Demo keys are preserved.'); return; }
    write('$ ' + command);
    var lines;
    try { lines = demo.execute(command); } catch(e) { lines=[e.message]; }
    lines.forEach(write);
    if (userAction) announce(lines.join(' '));
  }
  function trigger(userAction) {
    var lines = demo.trigger(); lines.forEach(write);
    if (!motion.matches) globe.ping({alarmed:true});
    if (userAction) announce(lines.join(' '));
  }
  var sequence = [
    function(){run('mantis new "Q4 forecast" -w https://hook.example.com/q4',false);},
    function(){run('mantis download last --docx Q4_forecast.docx',false);},
    function(){run('mantis watch',false);},
    function(){write('[simulation] A compatible reader fetched the embedded URL.');trigger(false);}
  ];
  function showCompleted() {
    replayId++; demo.reset(); body.replaceChildren();
    sequence.forEach(function(step){step();});
    controls(false);
  }
  async function replay() {
    var id = ++replayId;
    demo.reset(); body.replaceChildren(); controls(true);
    for (var i=0; i<sequence.length; i++) {
      if (id !== replayId) return;
      sequence[i]();
      if (!motion.matches && i<sequence.length-1) await new Promise(function(resolve){setTimeout(resolve,1100);});
    }
    if (id !== replayId) return;
    controls(false); announce('Demo complete. One key, one generated document, and one simulated hit.');
  }
  replayButton.addEventListener('click',replay);
  skipButton.addEventListener('click',function(){showCompleted();replayButton.focus();announce('Animation skipped. The completed transcript is ready.');});
  terminal.querySelectorAll('[data-demo-command]').forEach(function(button){button.addEventListener('click',function(){run(button.dataset.demoCommand,true);});});
  terminal.querySelector('[data-demo-trigger]').addEventListener('click',function(){trigger(true);});
  form.addEventListener('submit',function(e){e.preventDefault();if(playing)return;var command=input.value.trim().slice(0,500);input.value='';if(command)run(command,true);});
  motion.addEventListener('change',function(e){if(e.matches){globe.destroy();if(playing){showCompleted();announce('Animation stopped for reduced motion.');}}});
})();
