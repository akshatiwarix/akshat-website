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

// Cursor-response hero (D-019) — skeleton from a donor parallax component,
// reskinned to DESIGN.md: no image layers, whisper intensity, glide easing.
// Fine pointers only; off under reduced motion.
(function () {
  var hero = document.querySelector('.hero');
  if (!hero) return;
  var els = hero.querySelectorAll('[data-parallax]');
  if (!els.length) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(pointer: fine)').matches;
  if (reduced || !fine) return;
  window.addEventListener('mousemove', function (e) {
    var x = (e.clientX - window.innerWidth / 2) / (window.innerWidth / 2);
    var y = (e.clientY - window.innerHeight / 2) / (window.innerHeight / 2);
    els.forEach(function (el) {
      var s = parseFloat(el.getAttribute('data-parallax')) || 0;
      var r = parseFloat(el.getAttribute('data-parallax-rotate')) || 0;
      el.style.transform =
        'perspective(1200px) rotateY(' + (x * r).toFixed(2) + 'deg) translate(' +
        (-x * s * 16).toFixed(1) + 'px, ' + (y * s * 16).toFixed(1) + 'px)';
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
