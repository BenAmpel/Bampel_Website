/* Altmetric badges (shortcode altmetric). Each .altmetric-badge-section starts hidden: the donut is a "?" placeholder until
   the API answers, and stays "?" when it has no record for the DOI. A box is shown once its donut carries a score.
   embed.js loads only on pages with a badge. Moved out of the shortcode so the CSP can drop script-src 'unsafe-inline'. */
(function () {
  document.querySelectorAll('.altmetric-badge-section').forEach(function (box) {
    var watch = new MutationObserver(function () {
      if (/score=\d/.test(box.innerHTML)) { box.hidden = false; watch.disconnect(); }
    });
    watch.observe(box, { childList: true, subtree: true, attributes: true });
  });
  function initBadge() {
    if (typeof _altmetric_embed_init === 'function') {
      _altmetric_embed_init();
    } else if (!document.getElementById('altmetric-embed-loader')) {
      var s = document.createElement('script');
      s.id = 'altmetric-embed-loader';
      s.src = 'https://d1bxh8uas1mnw7.cloudfront.net/assets/embed.js';
      s.onload = function () {
        if (typeof _altmetric_embed_init === 'function') _altmetric_embed_init();
      };
      document.head.appendChild(s);
    }
  }
  if (document.readyState === 'complete') initBadge();
  else window.addEventListener('load', initBadge);
})();
