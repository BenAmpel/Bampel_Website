/* Moved out of layouts/partials/media/altmetric_summary.html so the site CSP can drop script-src 'unsafe-inline'. */
(function() {
  fetch('/data/altmetric.json')
    .then(response => {
      if (!response.ok) throw new Error("JSON not found");
      return response.json();
    })
    .then(stats => {
      const box = document.getElementById('altmetric-summary-box');
      if (box) box.style.display = 'block';

      animateValue('am-total-score', 0, stats.score || 0, 1000);
      document.getElementById('am-news').innerText = stats.news || 0;
      document.getElementById('am-policy').innerText = stats.policy || 0;
      document.getElementById('am-patents').innerText = stats.patents || 0;
      document.getElementById('am-twitter').innerText = stats.twitter || 0;
      document.getElementById('am-mendeley').innerText = stats.mendeley || 0;
    })
    .catch(e => {
      console.warn('Altmetric JSON not loaded:', e);
    });

  function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    // No count-up for visitors who asked for reduced motion.
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) { obj.innerHTML = end; return; }
    let startTimestamp = null;
    const step = timestamp => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      obj.innerHTML = Math.floor(progress * (end - start) + start);
      if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }
})();
