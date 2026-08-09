/**
 * reveal.js — site-wide scroll-reveal + micro-interaction engine.
 * Progressive enhancement: no-JS or reduced-motion visitors see static content.
 */
(function () {
  'use strict';

  var prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Selectors that get the reveal treatment, grouped so siblings stagger.
  var GROUPS = [
    '.home-section .wg-box, .home-section .col-12 > section',
    '.pub-item',
    '.article-widget .media, .people-widget .col',
    '.impact-card',
    '.talk-card, .award-card, .media-card, .course-card',
    '.journal-pub, .conference-pub',
    '.article-container > *:not(script):not(style)'
  ];

  function markReveals(root) {
    if (prefersReduced) return;
    GROUPS.forEach(function (sel) {
      var els;
      try { els = (root || document).querySelectorAll(sel); } catch (e) { return; }
      var groupIndex = 0;
      Array.prototype.forEach.call(els, function (el) {
        if (el.hasAttribute('data-reveal')) return;
        var rect = el.getBoundingClientRect();
        // Anything already at or above the viewport must show instantly —
        // it can never re-intersect, and animating it would leave holes.
        if (rect.top < window.innerHeight * 0.92) {
          el.setAttribute('data-reveal', '');
          el.classList.add('is-revealed');
          return;
        }
        el.setAttribute('data-reveal', '');
        var delay = Math.min(groupIndex * 70, 420);
        el.style.setProperty('--reveal-delay', delay + 'ms');
        groupIndex += 1;
        if (observer) observer.observe(el);
      });
    });
  }

  // Safety net: anything still hidden 2.5s after it should have shown
  // (bfcache restores, missed intersections) gets revealed outright.
  function sweepStragglers() {
    var els = document.querySelectorAll('[data-reveal]:not(.is-revealed)');
    Array.prototype.forEach.call(els, function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) {
        el.classList.add('is-revealed');
      }
    });
  }

  var observer = null;
  if (!prefersReduced && 'IntersectionObserver' in window) {
    observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  }

  function init() {
    if (prefersReduced || !observer) {
      // Reveal everything instantly; CSS default (no data-reveal) is visible.
      document.documentElement.classList.add('reveals-off');
      return;
    }
    markReveals(document);

    // Publications list renders asynchronously — watch for injected cards.
    var pubList = document.getElementById('pub-filter-list') ||
                  document.querySelector('[data-pub-list]');
    if (pubList && 'MutationObserver' in window) {
      var mo = new MutationObserver(function () { markReveals(pubList); });
      mo.observe(pubList, { childList: true, subtree: true });
    }
    // Reveal anything already in view after fonts/layout settle, then run
    // straggler sweeps so nothing can be left permanently hidden.
    window.setTimeout(function () { markReveals(document); }, 600);
    [1500, 3000, 6000].forEach(function (ms) {
      window.setTimeout(sweepStragglers, ms);
    });
    window.addEventListener('pageshow', sweepStragglers);
    window.addEventListener('scroll', function () {
      window.requestAnimationFrame(sweepStragglers);
    }, { passive: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
