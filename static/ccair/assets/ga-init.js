/* Google Analytics for the generated CCAIR pages (Pathway Finder, Student Guide). The measurement id comes from the script
   tag's data-ga-id. Loads only on bampel.com, so local test runs and Netlify previews send nothing (the Hugo pages do the
   same). page_location leaves out the URL fragment: a shared quiz results link carries the packed answers in #r=...,
   and GA's default page_location is the full location.href. */
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
(function () {
  var id = document.currentScript && document.currentScript.getAttribute('data-ga-id');
  if (!id || !/(^|\.)bampel\.com$/.test(location.hostname)) return;
  // Visitors whose browser asks not to be tracked (Global Privacy Control or Do Not Track) get no analytics at all.
  if (navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1') return;
  var gt = document.createElement('script');
  gt.async = true;
  gt.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(gt);
  gtag('js', new Date());
  // Page views only: no Google signals (cross-device and demographics) and no ad personalization.
  gtag('config', id, { page_location: location.origin + location.pathname + location.search,
    allow_google_signals: false, allow_ad_personalization_signals: false });
})();
