// Live clocks (D-015) — content, not animation: tick every second.
// Three zones side by side. PT and ET are the working hours; IST is where he sleeps.
(function () {
  var zones = [
    { key: 'pt', tz: 'America/Los_Angeles' },
    { key: 'et', tz: 'America/New_York' },
    { key: 'ist', tz: 'Asia/Kolkata' }
  ];

  var clocks = [];
  zones.forEach(function (zone) {
    var el = document.querySelector('[data-clock="' + zone.key + '"]');
    if (!el) return;
    clocks.push({
      el: el,
      fmt: new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false, timeZone: zone.tz
      })
    });
  });
  if (!clocks.length) return;

  function tick() {
    var now = new Date();
    clocks.forEach(function (clock) {
      clock.el.textContent = clock.fmt.format(now);
    });
  }
  tick();
  setInterval(tick, 1000);
})();

// Theme toggle — the head script has already resolved and stamped the theme
// before first paint; this only owns the flip, the label, and persistence.
(function () {
  var btn = document.querySelector('[data-theme-toggle]');
  if (!btn) return;

  var root = document.documentElement;
  var media = window.matchMedia('(prefers-color-scheme: dark)');
  var chosen = null;
  try { chosen = localStorage.getItem('theme'); } catch (e) {}

  function apply(theme) {
    var label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    root.setAttribute('data-theme', theme);
    btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }

  apply(root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');

  btn.addEventListener('click', function () {
    var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    apply(next);
    chosen = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
  });

  // Until the reader makes an explicit choice, keep following the OS.
  media.addEventListener('change', function (e) {
    if (chosen) return;
    apply(e.matches ? 'dark' : 'light');
  });
})();

// Floating chrome (Apple §12) — the header is a translucent layer the page
// scrolls under, and it only materialises once content is actually behind it.
// Hysteresis on the threshold so a one-pixel scroll can't flicker the material.
(function () {
  var header = document.querySelector('.site-header');
  if (!header) return;

  var floating = false;
  var queued = false;

  function apply() {
    queued = false;
    var y = window.scrollY || window.pageYOffset || 0;
    var next = floating ? y > 2 : y > 6;
    if (next === floating) return;
    floating = next;
    header.classList.toggle('is-floating', floating);
  }

  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(apply);
  }

  apply();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
})();

// Cursor-response hero (D-019) — skeleton from a donor parallax component,
// reskinned to DESIGN.md: no image layers, whisper intensity.
//
// Driven by springs on a requestAnimationFrame loop rather than a CSS
// transition (Apple §3/§4): a spring always animates from its current
// on-screen value and carries its own velocity, so a reversal mid-flight
// blends instead of hitting a brick wall. X, Y and rotation each get their own
// spring — one spring across two axes desyncs the moment their velocities
// differ. Critically damped (damping 1.0), so nothing overshoots: DESIGN.md's
// "nothing bouncy" is also Apple's default.
(function () {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  var els = Array.prototype.slice.call(hero.querySelectorAll('[data-parallax]'));
  if (!els.length) return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(pointer: fine)');
  if (reducedMotion.matches || !finePointer.matches) return;

  var DAMPING = 1.0;   // critically damped: reaches the target without overshoot
  var RESPONSE = 0.4;  // seconds to the target — not a duration, a stiffness
  var OMEGA = (2 * Math.PI) / RESPONSE;
  var STIFFNESS = OMEGA * OMEGA;
  var FRICTION = 2 * DAMPING * OMEGA;
  var REST_POSITION = 0.002;
  var REST_VELOCITY = 0.02;

  function spring() { return { value: 0, velocity: 0, target: 0 }; }

  // Semi-implicit Euler. The value it reports is the presentation value, which
  // is what any new target has to animate from.
  function step(s, dt) {
    var accel = -STIFFNESS * (s.value - s.target) - FRICTION * s.velocity;
    s.velocity += accel * dt;
    s.value += s.velocity * dt;
    return Math.abs(s.value - s.target) > REST_POSITION ||
           Math.abs(s.velocity) > REST_VELOCITY;
  }

  var tracked = els.map(function (el) {
    return {
      el: el,
      shift: parseFloat(el.getAttribute('data-parallax')) || 0,
      rotate: parseFloat(el.getAttribute('data-parallax-rotate')) || 0,
      x: spring(),
      y: spring(),
      r: spring()
    };
  });

  var running = false;
  var lastTime = 0;

  function frame(now) {
    // Clamp dt: a backgrounded tab shouldn't hand the spring a 2-second step.
    var dt = lastTime ? Math.min((now - lastTime) / 1000, 1 / 30) : 1 / 60;
    lastTime = now;

    var moving = false;
    tracked.forEach(function (t) {
      var a = step(t.x, dt);
      var b = step(t.y, dt);
      var c = step(t.r, dt);
      if (a || b || c) moving = true;
      // transform only — compositor-friendly, one write per frame
      t.el.style.transform =
        'perspective(1200px) rotateY(' + t.r.value.toFixed(3) + 'deg) translate3d(' +
        t.x.value.toFixed(2) + 'px, ' + t.y.value.toFixed(2) + 'px, 0)';
    });

    if (moving) {
      requestAnimationFrame(frame);
    } else {
      running = false;
      lastTime = 0;
      els.forEach(function (el) { el.style.willChange = 'auto'; });
    }
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = 0;
    els.forEach(function (el) { el.style.willChange = 'transform'; });
    requestAnimationFrame(frame);
  }

  function retarget(nx, ny) {
    tracked.forEach(function (t) {
      t.x.target = -nx * t.shift * 16;
      t.y.target = ny * t.shift * 16;
      t.r.target = nx * t.rotate;
    });
    start();
  }

  window.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    var nx = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
    var ny = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
    retarget(nx, ny);
  }, { passive: true });

  // Pointer leaves the window: the springs settle home from wherever they are.
  document.addEventListener('pointerleave', function () { retarget(0, 0); });
  window.addEventListener('blur', function () { retarget(0, 0); });

  // Honour a mid-session preference change instead of only reading it at load.
  reducedMotion.addEventListener('change', function (e) {
    if (!e.matches) return;
    tracked.forEach(function (t) {
      t.x.value = t.x.velocity = t.x.target = 0;
      t.y.value = t.y.velocity = t.y.target = 0;
      t.r.value = t.r.velocity = t.r.target = 0;
      t.el.style.transform = '';
    });
  });
})();

// Dot-matrix hero name (D-024) — the display type is redrawn as a lattice of
// square dots, and the cursor shoves them out of it. Each dot is a mass on a
// critically damped spring anchored to its own lattice cell, with a radial
// repulsion from the cursor added on top: a void opens where the cursor is, the
// dots it evicted pile into a bright compressed rim around that void, and the
// lattice reforms behind the cursor as it moves on.
//
// The smear on a fast sweep is the dots' own inertia, not an eased pointer — the
// cursor is read raw and the lag is emergent, which is what the reference shows.
// Displaced dots grow and brighten in proportion to how far they have been
// pushed, so the rim reads as compression rather than as a spotlight.
//
// Skeleton observed in reference recordings; their starfield and their amber and
// blue dot tints were dropped per CLAUDE.md's donor rule and D-004, leaving the
// lattice monochrome on the sky.
//
// The <h1> keeps its text and only goes colour: transparent, so screen readers,
// machine view and the no-JS document all still get the name as words.
(function () {
  var h1 = document.querySelector('.hero h1.display');
  if (!h1) return;

  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(pointer: fine)');
  if (reducedMotion.matches || !finePointer.matches) return;

  // Ratios, not pixels: the hero name is clamp(3.5rem, 9vw, 7rem), so every
  // dimension of the lattice is derived from the resolved font size or the grain
  // changes character between a laptop and a wide display. The pitch and dot
  // ratios are the reference's own, measured off its cap height.
  var PITCH_RATIO = 0.036;   // lattice pitch ÷ font size — ~2 dots across a stroke
  var DOT_RATIO = 0.45;      // resting dot edge ÷ pitch
  var RADIUS_RATIO = 0.26;   // repulsion radius ÷ font size (~0.35 of cap height)
  var PUSH_RATIO = 0.55;     // furthest a dot is driven, ÷ radius
  var RESPONSE = 0.20;       // seconds for a released dot to retake its cell
  var PEAK_SCALE = 2.4;      // dot edge multiplier at full displacement

  // Raleway 300 gives ~6px strokes at this size, which is one dot wide — the
  // glyphs read as a dotted outline rather than the reference's 2-3 dot strokes.
  // The stencil is therefore rendered at 400, the other weight the brand kit
  // loads, purely to thicken coverage; the <h1> itself stays at 300 per D-009.
  var STENCIL_WEIGHT = 400;

  // The reference sat on near-black. The aurora behind this hero is neither dark
  // nor quiet, so the resting dot is the bright on-media token rather than the
  // reference's mid grey — at #808080 the name vanished into the painting.
  var REST_GREY = 230;       // --color-on-media-dim (#e6e6e6), peaking to #ffffff
  var REST_ALPHA = 0.85;
  // Resting size and brightness both vary per dot, as they do in the reference.
  var VARIANCE = [
    { alpha: 0.74, scale: 0.82 },
    { alpha: 0.84, scale: 0.94 },
    { alpha: 0.93, scale: 1.08 },
    { alpha: 1.00, scale: 1.22 }
  ];
  var LEVELS = VARIANCE.length;

  var STEP = 1 / 120;        // fixed physics step, so a slow frame can't detune it
  var MAX_STEPS = 4;
  var QUIET_STEP = 0.02;     // px of movement below which a frame counts as still
  var QUIET_FRAMES = 4;
  var PARKED = -99999;

  var canSpaceText = 'letterSpacing' in CanvasRenderingContext2D.prototype;

  var canvas = document.createElement('canvas');
  canvas.className = 'dotfield';
  canvas.setAttribute('aria-hidden', 'true');
  var ctx = canvas.getContext('2d');
  if (!ctx) return;

  var width = 0, height = 0;
  var pitch = 0, dotSize = 0, radius = 0, maxPush = 0;
  var stiffness = 0, friction = 0, pushAccel = 0;

  var count = 0;
  var homeX = null, homeY = null;   // lattice cell each dot belongs to
  var posX = null, posY = null;
  var velX = null, velY = null;
  var byVariance = [];
  var active = [];                  // dots off their cell this frame, with level

  // ---------- measuring the type ----------

  // Rather than reimplement the browser's line layout, ask it: a Range over each
  // text node reports the line box it actually occupies. A node reporting more
  // than one rect has wrapped, and this effect assumes one word per line, so that
  // case bails out and leaves the plain heading alone.
  function readLines(style) {
    var lines = [];
    var wrapped = false;
    Array.prototype.forEach.call(h1.childNodes, function (node) {
      if (node.nodeType !== 3) return;
      var text = node.nodeValue.replace(/\s+/g, ' ').trim();
      if (!text) return;
      var range = document.createRange();
      range.selectNodeContents(node);
      var rects = range.getClientRects();
      if (rects.length !== 1) { wrapped = true; return; }
      lines.push({
        text: style.textTransform === 'uppercase' ? text.toUpperCase() : text,
        rect: rects[0]
      });
    });
    return wrapped ? null : lines;
  }

  // Per-character advance, for browsers without ctx.letterSpacing. Loses kerning,
  // which at display size costs a pixel or two of width — invisible once the glyph
  // is dots, and the alternative is dropping the -0.02em tracking entirely.
  function fillSpaced(c, text, x, baseline, spacing) {
    var cursor = x;
    for (var i = 0; i < text.length; i++) {
      c.fillText(text[i], cursor, baseline);
      cursor += c.measureText(text[i]).width + spacing;
    }
  }

  // Deterministic scatter for resting size and brightness. Hashed off the dot's
  // own coordinates so the variance is noise rather than the diagonal banding a
  // plain modulo over an index produces.
  function hash(x, y) {
    var n = (x * 374761393 + y * 668265263) | 0;
    n = ((n ^ (n >> 13)) * 1274126177) | 0;
    return (n ^ (n >> 16)) >>> 0;
  }

  // ---------- building the lattice ----------

  function build() {
    var style = getComputedStyle(h1);
    var fontSize = parseFloat(style.fontSize);
    if (!fontSize) return false;

    var lines = readLines(style);
    if (!lines || !lines.length) return false;

    var box = canvas.getBoundingClientRect();
    width = box.width;
    height = box.height;
    if (width < 1 || height < 1) return false;

    pitch = Math.max(3, fontSize * PITCH_RATIO);
    dotSize = pitch * DOT_RATIO;
    radius = fontSize * RADIUS_RATIO;
    maxPush = radius * PUSH_RATIO;

    // Critically damped, so a released dot retakes its cell without ringing:
    // DESIGN.md's "nothing bouncy" is also the reference's behaviour.
    var omega = (2 * Math.PI) / RESPONSE;
    stiffness = omega * omega;
    friction = 2 * omega;
    // Sized so a dot parked at the very centre of the field balances the spring
    // at exactly maxPush, which is what caps the void's radius.
    pushAccel = stiffness * maxPush;

    // Glyph coverage is read back off an offscreen render of the same text at 1x
    // — the lattice pitch is several pixels, so sampling finer buys nothing.
    var stencil = document.createElement('canvas');
    stencil.width = Math.ceil(width);
    stencil.height = Math.ceil(height);
    var sc = stencil.getContext('2d');
    if (!sc) return false;

    sc.font = style.fontStyle + ' ' + STENCIL_WEIGHT + ' ' +
              style.fontSize + ' ' + style.fontFamily;
    sc.textBaseline = 'alphabetic';
    sc.fillStyle = '#ffffff';

    var spacing = style.letterSpacing === 'normal' ? 0 : parseFloat(style.letterSpacing) || 0;
    if (canSpaceText) sc.letterSpacing = spacing + 'px';

    var metrics = sc.measureText('H');
    var ascent = metrics.fontBoundingBoxAscent || metrics.actualBoundingBoxAscent;
    var descent = metrics.fontBoundingBoxDescent || metrics.actualBoundingBoxDescent;

    lines.forEach(function (line) {
      var x = line.rect.left - box.left;
      // Half-leading: the browser centres ascent + descent inside the line box,
      // so this puts the baseline exactly where the real glyphs sit.
      var baseline = line.rect.top - box.top +
                     (line.rect.height - (ascent + descent)) / 2 + ascent;
      if (canSpaceText) sc.fillText(line.text, x, baseline);
      else fillSpaced(sc, line.text, x, baseline, spacing);
    });

    var alpha = sc.getImageData(0, 0, stencil.width, stencil.height).data;
    var xs = [], ys = [], levels = [];

    for (var y = pitch / 2; y < height; y += pitch) {
      for (var x = pitch / 2; x < width; x += pitch) {
        var ix = Math.floor(x), iy = Math.floor(y);
        if (alpha[(iy * stencil.width + ix) * 4 + 3] < 128) continue;
        xs.push(x); ys.push(y);
        levels.push(hash(ix, iy) % LEVELS);
      }
    }
    if (!xs.length) return false;

    count = xs.length;
    homeX = new Float32Array(xs);
    homeY = new Float32Array(ys);
    // A rebuild is a resize: dots start on their new cells rather than trying to
    // carry momentum across a layout that no longer exists.
    posX = new Float32Array(homeX);
    posY = new Float32Array(homeY);
    velX = new Float32Array(count);
    velY = new Float32Array(count);

    byVariance = [];
    for (var v = 0; v < LEVELS; v++) byVariance.push([]);
    for (var i = 0; i < count; i++) byVariance[levels[i]].push(i);

    var dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  // ---------- physics ----------

  var cursorX = PARKED, cursorY = PARKED;   // canvas-local, read raw
  var maxStep = 0;

  function integrate(dt) {
    var r2 = radius * radius;
    var moved = 0;
    for (var i = 0; i < count; i++) {
      var x = posX[i], y = posY[i];
      var dx = x - cursorX, dy = y - cursorY;
      var d2 = dx * dx + dy * dy;

      // A dot on its cell, at rest, with no cursor over it has nothing to
      // compute. Most of the lattice is in this state most of the time, which is
      // what keeps a few thousand dots cheap.
      if (d2 >= r2) {
        var ox = x - homeX[i], oy = y - homeY[i];
        if (ox * ox + oy * oy < 1e-4 &&
            velX[i] * velX[i] + velY[i] * velY[i] < 1e-4) continue;
      }

      // Spring back to the dot's own cell, plus damping.
      var ax = -stiffness * (x - homeX[i]) - friction * velX[i];
      var ay = -stiffness * (y - homeY[i]) - friction * velY[i];

      // Radial repulsion. Squared falloff keeps the void's edge soft while the
      // core stays firm enough to actually clear a hole.
      if (d2 < r2) {
        var d = Math.sqrt(d2);
        // A dot sitting exactly under the cursor has no direction to flee; give
        // it one from its cell index so the void opens instead of locking up.
        if (d < 0.001) {
          dx = (i & 1) ? 1 : -1;
          dy = (i & 2) ? 1 : -1;
          d = Math.sqrt(dx * dx + dy * dy);
        }
        var falloff = 1 - d / radius;
        var push = pushAccel * falloff * falloff;
        ax += (dx / d) * push;
        ay += (dy / d) * push;
      }

      velX[i] += ax * dt;
      velY[i] += ay * dt;
      var sx = velX[i] * dt, sy = velY[i] * dt;
      posX[i] = x + sx;
      posY[i] = y + sy;

      var step = Math.abs(sx) + Math.abs(sy);
      if (step > moved) moved = step;
    }
    if (moved > maxStep) maxStep = moved;
  }

  // ---------- drawing ----------

  function draw() {
    ctx.clearRect(0, 0, width, height);

    // Dots still on their cell are flat colours, so they cost one fillStyle per
    // variance level however many thousand there are. Only the displaced ones
    // need styling of their own, and they are deferred so the resting passes
    // stay uninterrupted.
    active.length = 0;
    for (var v = 0; v < LEVELS; v++) {
      var band = VARIANCE[v];
      var rest = REST_ALPHA * band.alpha;
      ctx.fillStyle = 'rgba(' + REST_GREY + ',' + REST_GREY + ',' + REST_GREY + ',' +
                      rest.toFixed(3) + ')';
      var size = dotSize * band.scale;
      var half = size / 2;
      var list = byVariance[v];
      for (var j = 0; j < list.length; j++) {
        var i = list[j];
        var dx = posX[i] - homeX[i], dy = posY[i] - homeY[i];
        if (dx * dx + dy * dy > 0.25) { active.push(i, v); continue; }
        ctx.fillRect(posX[i] - half, posY[i] - half, size, size);
      }
    }

    // Displacement, not proximity, drives size and brightness — so the rim of
    // compressed dots is what lights up, which is what the reference shows.
    for (var k = 0; k < active.length; k += 2) {
      var idx = active[k];
      var lvl = VARIANCE[active[k + 1]];
      var ox = posX[idx] - homeX[idx], oy = posY[idx] - homeY[idx];
      var t = Math.min(1, Math.sqrt(ox * ox + oy * oy) / maxPush);
      var base = REST_ALPHA * lvl.alpha;
      var a = base + (1 - base) * t;
      var grey = Math.round(REST_GREY + (255 - REST_GREY) * t);
      var sz = dotSize * lvl.scale * (1 + (PEAK_SCALE - 1) * t);
      ctx.fillStyle = 'rgba(' + grey + ',' + grey + ',' + grey + ',' + a.toFixed(3) + ')';
      ctx.fillRect(posX[idx] - sz / 2, posY[idx] - sz / 2, sz, sz);
    }
  }

  var running = false;
  var lastTime = 0;
  var carry = 0;
  var quiet = 0;

  function frame(now) {
    if (!live) { running = false; lastTime = 0; return; }

    var dt = lastTime ? Math.min((now - lastTime) / 1000, 1 / 15) : STEP;
    lastTime = now;

    // The canvas rides the hero's existing cursor parallax (D-019), so its box
    // moves under the cursor. Re-reading it here keeps the void on the real
    // pointer instead of drifting with the type.
    if (clientX === PARKED) {
      cursorX = cursorY = PARKED;
    } else {
      var box = canvas.getBoundingClientRect();
      cursorX = clientX - box.left;
      cursorY = clientY - box.top;
    }

    // Fixed steps: a 40ms frame gets four 1/120s steps rather than one huge one
    // that would make a stiff spring explode.
    maxStep = 0;
    carry += dt;
    var steps = 0;
    while (carry >= STEP && steps < MAX_STEPS) { integrate(STEP); carry -= STEP; steps++; }
    if (steps === MAX_STEPS) carry = 0;

    draw();

    // Stop when nothing is moving. This covers both "everything is home" and
    // "the cursor is parked and the void has settled" — a settled displaced
    // lattice is as static as a resting one, so neither needs more frames.
    quiet = maxStep < QUIET_STEP ? quiet + 1 : 0;
    if (quiet > QUIET_FRAMES) {
      running = false;
      lastTime = 0;
      carry = 0;
      return;
    }
    requestAnimationFrame(frame);
  }

  function start() {
    quiet = 0;
    if (running) return;
    running = true;
    lastTime = 0;
    carry = 0;
    requestAnimationFrame(frame);
  }

  // ---------- lifecycle ----------

  var clientX = PARKED, clientY = PARKED;   // last real cursor, viewport coords
  var live = false;

  function activate() {
    if (!build()) return;
    draw();
    if (!live) {
      h1.classList.add('dotfield-on');   // only now does the text go transparent
      live = true;
    }
  }

  function teardown() {
    running = false;
    lastTime = 0;
    if (!live) return;
    h1.classList.remove('dotfield-on');
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    live = false;
  }

  // The canvas has to be in the DOM to have a box to measure, but the heading
  // must not go transparent until there is a lattice to replace it — so it is
  // inserted, measured against, and only then does activate() commit the swap.
  h1.appendChild(canvas);

  // Metrics measured against a fallback face would put the dots in the wrong
  // places, so nothing is built until Raleway has loaded. The plain heading is
  // what a reader looks at until then.
  var ready = document.fonts && document.fonts.ready
    ? document.fonts.ready
    : Promise.resolve();

  ready.then(function () {
    activate();
    if (!live) { if (canvas.parentNode) canvas.parentNode.removeChild(canvas); return; }

    window.addEventListener('pointermove', function (e) {
      if (e.pointerType && e.pointerType !== 'mouse') return;
      clientX = e.clientX;
      clientY = e.clientY;
      start();
    }, { passive: true });

    // Cursor leaves the window: the repulsion goes with it and the springs carry
    // every dot home.
    function park() { clientX = clientY = PARKED; start(); }
    document.addEventListener('pointerleave', park);
    window.addEventListener('blur', park);

    // The name is vw-clamped, so a resize changes the font size and every ratio
    // derived from it. Rebuild rather than rescale.
    var queued = false;
    function relayout() {
      if (queued || !live) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        if (live) activate();
      });
    }
    if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(h1);
    else window.addEventListener('resize', relayout, { passive: true });

    // Honour a mid-session preference change instead of only reading it at load.
    reducedMotion.addEventListener('change', function (e) {
      if (e.matches) teardown();
    });
  });
})();
// Subtle scroll reveals (D-010) — fade-up once, honour reduced motion.
(function () {
  var els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !('IntersectionObserver' in window)) {
    els.forEach(function (el) { el.classList.add('in'); });
    return;
  }
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  els.forEach(function (el) { io.observe(el); });
})();
