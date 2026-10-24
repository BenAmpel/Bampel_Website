/* Dimensions badges (shortcode dimensions). Each .dimensions-badge-section stays hidden until its badge reports a citation
   count: for a DOI Dimensions does not know, it shows "?". Moved out of the shortcode so the CSP can drop
   script-src 'unsafe-inline'. */
(function () {
  document.querySelectorAll('.dimensions-badge-section').forEach(function (box) {
    var watch = new MutationObserver(function () {
      var link = box.querySelector('.__dimensions_Link');
      if (link && /^\d/.test(link.getAttribute('aria-label') || '')) { box.hidden = false; watch.disconnect(); }
    });
    watch.observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-label'] });
  });
  if (typeof __dimensions_embed === 'undefined') {
    var script = document.createElement('script');
    script.src = 'https://badge.dimensions.ai/badge.js';
    script.charset = 'utf-8';
    script.onload = function () {
      if (typeof __dimensions_embed !== 'undefined' && __dimensions_embed.addBadges) __dimensions_embed.addBadges();
    };
    document.head.appendChild(script);
  } else {
    __dimensions_embed.addBadges();
  }
})();
