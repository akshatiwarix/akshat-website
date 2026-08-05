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
