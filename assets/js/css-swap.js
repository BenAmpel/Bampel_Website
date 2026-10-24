/* Non-blocking stylesheets: links marked data-swap load with media="print" (so they do not block rendering) and are
   switched to media="all" once loaded. Replaces the inline onload="this.media='all'" handlers, which a CSP without
   'unsafe-inline' would block. Runs at the end of <head>, after every data-swap link. */
(function () {
  document.querySelectorAll('link[data-swap]').forEach(function (l) {
    if (l.sheet) l.media = 'all';
    else l.addEventListener('load', function () { l.media = 'all'; });
  });
})();
