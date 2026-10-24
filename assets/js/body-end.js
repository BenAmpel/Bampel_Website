  // Global-reach readout: surfaces where the work is being read without
  // publishing raw traffic counts.
  fetch('/data/visitor_stats.json')
    .then(response => response.json())
    .then(data => {
      data = data || {};
      data.top_locations = data.top_locations || [];
      data.top_pages = data.top_pages || [];

      const cities = data.top_locations.length > 0
        ? data.top_locations.slice(0, 3).map(l => l.city).filter(c => c && c !== '(not set)').join(", ")
        : "";

      let topPage = data.top_pages.length > 0 ? data.top_pages[0].path : "";
      if (topPage === "/") topPage = "Home Page";

      let detailsHtml = "";
      if (cities) {
        detailsHtml += `Recently read in: <strong>${cities}</strong>&hellip;<br>`;
      }
      if (topPage) {
        detailsHtml += `Most-read this month: <code>${topPage}</code>`;
      }

      const target = document.getElementById('visitor-details');
      if (target) target.innerHTML = detailsHtml;
    })
    .catch(() => { /* silently omit when stats are unavailable */ });

  (function () {
    const noteId = 'bmc-hover-note';
    const noteHtml = '<strong>Support development</strong><br>If you like my applications or extensions, you can help cover their development costs here.';

    function ensureNote() {
      let note = document.getElementById(noteId);
      if (!note) {
        note = document.createElement('div');
        note.id = noteId;
        note.className = 'bmc-hover-note';
        note.innerHTML = noteHtml;
        note.setAttribute('aria-hidden', 'true');
        document.body.appendChild(note);
      }
      return note;
    }

    function bindHover(target) {
      if (!target || target.dataset.bmcHoverBound === 'true') return;
      target.dataset.bmcHoverBound = 'true';
      const note = ensureNote();

      const show = () => note.classList.add('is-visible');
      const hide = () => note.classList.remove('is-visible');

      target.addEventListener('mouseenter', show);
      target.addEventListener('mouseleave', hide);
      target.addEventListener('focus', show, true);
      target.addEventListener('blur', hide, true);
      target.addEventListener('touchstart', () => {
        note.classList.add('is-visible');
        window.clearTimeout(window.__bmcHoverHideTimer);
        window.__bmcHoverHideTimer = window.setTimeout(() => note.classList.remove('is-visible'), 2200);
      }, { passive: true });
    }

    function wireWidgetHover() {
      const img = document.querySelector('img[src*="coffee%20cup.svg"], img[src*="coffee cup.svg"]');
      const iframe = document.getElementById('bmc-iframe');
      if (img) bindHover(img);
      if (iframe) bindHover(iframe);
    }

    const observer = new MutationObserver(wireWidgetHover);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', wireWidgetHover, { once: true });
    } else {
      wireWidgetHover();
    }

    window.addEventListener('load', wireWidgetHover);
  })();
