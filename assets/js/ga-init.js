/* Google tag (gtag.js), loaded only on bampel.com itself: local test runs and Netlify preview builds also render this
   partial, and on 2026-10-17 one localhost test of the Pathway Finder sent 720 page views into the live property.
   The measurement id comes from the script tag's data-ga-id. Kept out of the page so the CSP needs no 'unsafe-inline'. */
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
  gtag('config', id, { allow_google_signals: false, allow_ad_personalization_signals: false });
})();
