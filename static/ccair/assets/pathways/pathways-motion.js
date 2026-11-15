/* CCAIR motion layer, shared by the Pathway Finder and the Student Guide: marks the page as scripted (adds .js),
   scroll reveals, word-by-word headlines, count-up stats, the scroll progress bar, glow parallax, step timelines and
   the card pointer spotlight. Nothing is stored or sent. The role filters and the quiz are in pathways.js. */
(function () {
  'use strict';
  var doc = document.documentElement;
  doc.classList.add('js');
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Scroll reveal ---------- */
  function initReveal(root) {
    var els = (root || document).querySelectorAll('.reveal:not(.in)');
    if (reduce || !('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); return; }
    var heard = false;
    var io = new IntersectionObserver(function (entries) {
      heard = true;
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
      // The root reaches far above the viewport, so anything scrolled past in one jump (End key, a #fragment link,
      // a scrollbar drag) also counts; an observer reports only changes, so a viewport root would never report those.
    }, { rootMargin: '100000px 0px -6% 0px', threshold: 0 });
    els.forEach(function (e) { io.observe(e); });
    // Same failsafe as the CCAIR site: the observer reports every target as soon as it is observed, so if nothing has
    // arrived after 1.5 s it never will; show everything rather than leave content hidden.
    setTimeout(function () { if (!heard) els.forEach(function (e) { e.classList.add('in'); }); }, 1500);
  }
  initReveal();

  /* ---------- Motion layer (all skipped under reduced motion) ---------- */
  // Headlines rise word by word.
  function splitWords(el) {
    var i = 0;
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (ch) {
        if (ch.nodeType === 3) {
          var frag = document.createDocumentFragment();
          ch.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
            var o = document.createElement('span'); o.className = 'w';
            var inner = document.createElement('span'); inner.textContent = part; inner.style.setProperty('--i', i++);
            o.appendChild(inner); frag.appendChild(o);
          });
          ch.parentNode.replaceChild(frag, ch);
        } else if (ch.nodeType === 1) walk(ch);
      });
    })(el);
    el.classList.add('split');
  }
  if (!reduce) document.querySelectorAll('[data-split]').forEach(splitWords);

  // Stats count up when they come into view.
  function countUp(el) {
    var target = parseFloat(el.getAttribute('data-count')), pre = el.getAttribute('data-pre') || '', suf = el.getAttribute('data-suf') || '';
    if (reduce) { el.textContent = pre + target + suf; return; }
    var t0 = null, dur = 1200;
    (function tick(ts) {
      if (!t0) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + Math.round(target * e) + suf;
      if (p < 1) requestAnimationFrame(tick);
    })(performance.now());
  }
  var counters = document.querySelectorAll('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { countUp(en.target); cio.unobserve(en.target); } }); }, { threshold: 0.6 });
    counters.forEach(function (c) { cio.observe(c); });
  } else counters.forEach(countUp);

  // Scroll progress bar, background glow parallax and step-timeline drawing, on one rAF.
  var bar = document.createElement('div'); bar.className = 'scroll-progress'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
  var glows = document.querySelectorAll('.glow'), timelines = document.querySelectorAll('.guide ol.list');
  var ticking = false;
  function onScroll() {
    ticking = false;
    var y = window.scrollY, h = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = 'scaleX(' + (h > 0 ? y / h : 0).toFixed(4) + ')';
    if (reduce) return;
    glows.forEach(function (g, i) { g.style.translate = '0 ' + (y * (i ? -0.12 : 0.18)).toFixed(1) + 'px'; });
    timelines.forEach(function (ol) {
      var r = ol.getBoundingClientRect(), p = (innerHeight * 0.75 - r.top) / (r.height || 1);
      ol.style.setProperty('--p', Math.max(0, Math.min(1, p)).toFixed(3));
    });
  }
  window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

  // Cards follow the pointer with a soft spotlight.
  if (!reduce && window.matchMedia('(hover: hover)').matches) {
    document.addEventListener('pointermove', function (e) {
      var c = e.target.closest && e.target.closest('.role-card, .card, .res a, .match');
      if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
    }, { passive: true });
  }
})();
