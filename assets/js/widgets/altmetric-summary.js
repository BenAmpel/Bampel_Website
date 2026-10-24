/* Moved out of layouts/shortcodes/altmetric_summary.html so the site CSP can drop script-src 'unsafe-inline'. */
(function() {
    fetch('/data/altmetric.json')
    .then(response => {
        if (!response.ok) throw new Error("JSON not found");
        return response.json();
    })
    .then(stats => {
        // Only surface the aggregate box once the numbers are strong enough
        // to be a positive signal; low/zero scores stay hidden.
        const meaningful = (stats.score || 0) >= 25 ||
                           (stats.news || 0) >= 3 ||
                           (stats.mendeley || 0) >= 150;
        if (!meaningful) return;

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
        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            obj.innerHTML = Math.floor(progress * (end - start) + start);
            if (progress < 1) window.requestAnimationFrame(step);
        };
        window.requestAnimationFrame(step);
    }
})();
