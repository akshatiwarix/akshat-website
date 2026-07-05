// Live local clock (D-015) — content, not animation: updates twice a minute.
// Shows the visitor's own time + place; the note reflects Akshat's IST time.
(function () {
  var el = document.querySelector('[data-clock]');
  if (!el) return;

  // The visitor's own timezone, e.g. "Europe/Amsterdam".
  var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  var localFmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz
  });
  var istFmt = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
  });

  var abbrEl = document.querySelector('[data-tz-abbr]');
  var placeEl = document.querySelector('[data-place]');
  var utcEl = document.querySelector('[data-utc]');
  var istEl = document.querySelector('[data-ist-clock]');

  // City from the timezone id: "Europe/Amsterdam" -> "Amsterdam".
  if (placeEl) placeEl.textContent = tz.split('/').pop().replace(/_/g, ' ');

  function tzAbbr(d) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, timeZoneName: 'short'
    }).formatToParts(d);
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === 'timeZoneName') return parts[i].value;
    }
    return '';
  }

  function utcOffset(d) {
    var mins = -d.getTimezoneOffset(); // minutes east of UTC
    var sign = mins >= 0 ? '+' : '-';
    var abs = Math.abs(mins);
    var m = abs % 60;
    return 'UTC ' + sign + Math.floor(abs / 60) + ':' + (m < 10 ? '0' + m : m);
  }

  function tick() {
    var now = new Date();
    el.textContent = localFmt.format(now);
    if (abbrEl) abbrEl.textContent = tzAbbr(now);
    if (utcEl) utcEl.textContent = utcOffset(now);
    if (istEl) istEl.textContent = istFmt.format(now);
  }
  tick();
  setInterval(tick, 30000);
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
