/* Collapse without Bootstrap's jQuery plugin (stage 2 of docs/superpowers/plans/2026-10-25-theme-migration.md).
   A button with data-site-toggle="collapse" and data-target="#id" opens and closes that element: the same classes as
   Bootstrap 4 (.collapse, .show, .collapsing, and .collapsed on the button), so Bootstrap's CSS still animates the
   height (0.35 s, none under prefers-reduced-motion), and aria-expanded stays in step. Used by the phone menu.
   window.siteCollapse.hide(el) closes one from elsewhere (wowchemy-navigation.js closes the menu after a link tap). */
(function () {
  'use strict';
  var busy = new WeakSet();

  function togglersFor(el) {
    return Array.prototype.filter.call(document.querySelectorAll('[data-site-toggle="collapse"]'), function (b) {
      return el.id && b.getAttribute('data-target') === '#' + el.id;
    });
  }
  function mark(el, open) {
    togglersFor(el).forEach(function (b) { b.setAttribute('aria-expanded', open ? 'true' : 'false'); b.classList.toggle('collapsed', !open); });
  }
  // Run fn after the height transition, or at once when there is none (reduced motion, or CSS not loaded).
  function afterTransition(el, fn) {
    var s = getComputedStyle(el), ms = (parseFloat(s.transitionDuration) || 0) * 1000 + (parseFloat(s.transitionDelay) || 0) * 1000;
    if (!ms) return fn();
    var done = false, end = function () { if (done) return; done = true; el.removeEventListener('transitionend', end); fn(); };
    el.addEventListener('transitionend', end);
    setTimeout(end, ms + 50);   // transitionend can be skipped (for example when the tab is hidden)
  }

  function show(el) {
    if (busy.has(el) || el.classList.contains('show')) return;
    busy.add(el); mark(el, true);
    el.classList.remove('collapse'); el.classList.add('collapsing'); el.style.height = '0px';
    void el.offsetHeight;   // start the transition from 0
    el.style.height = el.scrollHeight + 'px';
    afterTransition(el, function () { el.classList.remove('collapsing'); el.classList.add('collapse', 'show'); el.style.height = ''; busy.delete(el); });
  }
  function hide(el) {
    if (busy.has(el) || !el.classList.contains('show')) return;
    busy.add(el); mark(el, false);
    el.style.height = el.getBoundingClientRect().height + 'px';
    void el.offsetHeight;
    el.classList.add('collapsing'); el.classList.remove('collapse', 'show');
    el.style.height = '0px';
    afterTransition(el, function () { el.classList.remove('collapsing'); el.classList.add('collapse'); el.style.height = ''; busy.delete(el); });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-site-toggle="collapse"]');
    if (!b) return;
    var el = document.querySelector(b.getAttribute('data-target'));
    if (!el) return;
    e.preventDefault();
    if (el.classList.contains('show')) hide(el); else show(el);
  });

  window.siteCollapse = { show: show, hide: hide };
})();
