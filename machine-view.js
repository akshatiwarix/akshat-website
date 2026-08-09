// Machine view — strips the page to the text it actually says, and nothing else.
// No metadata, no section labels, no commentary: the words on the page, in
// reading order, generated from the live DOM so they can never drift from the
// real copy.
//
// A real agent never flips this switch; it reads the HTML it is served. The view
// is a demonstration of what that HTML amounts to, not the mechanism.
//
// Two parts with a hard seam between them: readContent() reads the document and
// knows nothing about presentation, render() builds the readout and knows
// nothing about the DOM it came from. The controller below owns the switch.
(function () {
  'use strict';

  // ---------- read ----------

  // Text as a machine would read it: nodes marked aria-hidden are decoration,
  // not content, and runs of whitespace collapse the way an extractor collapses
  // them.
  function readableText(el) {
    var clone = el.cloneNode(true);
    Array.prototype.forEach.call(clone.querySelectorAll('[aria-hidden="true"]'), function (node) {
      node.parentNode.removeChild(node);
    });
    // A <br> is whitespace to a reader but nothing at all to textContent, which
    // is what runs "Akshat<br>Tiwari" together into one word.
    Array.prototype.forEach.call(clone.querySelectorAll('br'), function (node) {
      node.parentNode.replaceChild(document.createTextNode(' '), node);
    });
    return clone.textContent.replace(/\s+/g, ' ').trim();
  }

  // querySelectorAll returns document order and never repeats an element, so
  // one pass over the union of these selectors gives every block of copy in
  // reading order with no double counting.
  //
  // The big link rows are read down to their parts rather than taken whole: the
  // row is one element holding a heading and a description, and reading the
  // element would run them into "Work The systems I build". Blog rows are the
  // same shape and are read the same way.
  //
  // A post adds h4s, code blocks and table cells to the vocabulary. A code
  // block is content here — it is text the page says — and its own whitespace
  // collapses like any other run.
  var CONTENT = 'h1, h2, h3, h4, p, li, pre, th, td, .channel, ' +
                '.link-row .title, .link-row .note, ' +
                '.post-row-date, .post-row-title, .post-row-excerpt';

  // The clocks are an instrument, not writing: a crawler fetching the HTML gets
  // a placeholder, and the zone labels around them only describe the widget.
  var NOT_CONTENT = '.telemetry';

  function readContent() {
    var main = document.querySelector('main');
    if (!main) return [];

    return Array.prototype.filter.call(main.querySelectorAll(CONTENT), function (el) {
      return !el.closest(NOT_CONTENT);
    }).map(readableText).filter(Boolean);
  }

  // ---------- render ----------

  function render(lines) {
    var root = document.createElement('div');
    root.className = 'mv-doc';
    lines.forEach(function (line) {
      var p = document.createElement('p');
      p.className = 'mv-line';
      p.textContent = line;
      root.appendChild(p);
    });
    return root;
  }

  // ---------- controller ----------

  var sw = document.querySelector('[data-machine-switch]');
  if (!sw) return;

  var root = document.documentElement;
  var knob = sw.querySelector('.mv-knob');
  var mount = null;

  function apply(view) {
    var on = view === 'machine';
    root.setAttribute('data-view', on ? 'machine' : 'default');
    sw.setAttribute('aria-checked', on ? 'true' : 'false');

    if (on && !mount) {
      mount = render(readContent());
      document.body.appendChild(mount);
    } else if (!on && mount) {
      mount.parentNode.removeChild(mount);
      mount = null;
    }
  }

  function isOn() { return root.getAttribute('data-view') === 'machine'; }

  function commit(view) {
    apply(view);
    try { localStorage.setItem('view', view); } catch (e) {}
    if (view === 'machine') window.scrollTo(0, 0);
  }

  apply(isOn() ? 'machine' : 'default');

  // How far the knob can travel, measured rather than hardcoded so the CSS stays
  // the single source of truth for the switch's size.
  function travel() {
    return sw.clientWidth - knob.offsetWidth -
           (parseFloat(getComputedStyle(sw).paddingLeft) * 2);
  }

  // Drag, with click as the degenerate case: a press that never moves past the
  // threshold commits to the other side anyway, so tapping works exactly like
  // flipping a switch. During the drag the knob follows the finger with its
  // transition suppressed, then animates from wherever it was released — the
  // gesture stays interruptible instead of snapping to a keyframe.
  var dragging = false;
  var startX = 0;
  var moved = 0;

  sw.addEventListener('pointerdown', function (e) {
    dragging = true;
    startX = e.clientX;
    moved = 0;
    sw.classList.add('is-dragging');
    // Capture keeps the move events coming when the finger leaves the switch
    // mid-drag. Not every pointer can be captured, and losing it only costs us
    // the off-target part of the gesture, so a failure is not worth throwing on.
    try { sw.setPointerCapture(e.pointerId); } catch (err) {}
  });

  sw.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    var max = travel();
    var base = isOn() ? max : 0;
    moved = e.clientX - startX;
    var x = Math.max(0, Math.min(max, base + moved));
    knob.style.transform = 'translateX(' + x + 'px)';
  });

  function endDrag(e) {
    if (!dragging) return;
    dragging = false;
    sw.classList.remove('is-dragging');
    knob.style.transform = '';

    var max = travel();
    var base = isOn() ? max : 0;
    var released = base + moved;

    // A real drag lands on whichever side it ended nearest. A tap (no travel)
    // just flips.
    var next = Math.abs(moved) < 4
      ? (isOn() ? 'default' : 'machine')
      : (released > max / 2 ? 'machine' : 'default');

    commit(next);
    if (e) e.preventDefault();
  }

  sw.addEventListener('pointerup', endDrag);
  sw.addEventListener('pointercancel', endDrag);

  // Space and Enter reach a role="switch" through the click event, but a
  // pointer-driven flip already fired above, so only handle keyboard here.
  sw.addEventListener('keydown', function (e) {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    commit(isOn() ? 'default' : 'machine');
  });
})();
