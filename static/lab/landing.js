/* Lab landing page: lists the registry's live studies. Kept out of index.html so the page needs no inline script. */
  // Listed studies come from the lab registry (/api/lab/_lab/studies); the row in index.html is the fallback.
  fetch('/api/lab/_lab/studies').then(function (r) { return r.ok ? r.json() : null; }).then(function (list) {
    if (!list || !list.length) return;
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    document.getElementById('live').innerHTML = '<ul class="rows">' + list.map(function (s) {
      return '<li class="row"><p class="row-kind">Live</p><div class="row-body"><h3>' + esc(s.name) + '</h3><p>' + esc(s.description) + '</p></div>' +
        '<a class="btn secondary" href="' + esc(s.paths.participant) + '">Sign in</a></li>';
    }).join('') + '</ul>';
  }).catch(function () {});

// Pointer trace on the demo shot: drawn by default, animated once when it scrolls into view (skipped under reduced motion).
(function () {
  var t = document.querySelector('.trace');
  if (!t || !('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  t.classList.add('trace-armed');
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { t.classList.add('is-in'); io.disconnect(); } });
  }, { threshold: 0.45 });
  io.observe(t);
})();
