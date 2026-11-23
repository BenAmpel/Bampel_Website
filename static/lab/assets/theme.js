/* Light or dark for the participant pages. Without a choice the page follows the device (study.css). The choice is
   kept in this browser only and set before the page draws, so there is no flash. A "lab-theme" event lets canvases
   (the chatbot's orb) pick up the new colours. */
(function () {
  'use strict';
  // A toggle button: the name stays "Dark mode" and aria-pressed says whether it is on.
  var KEY = 'lab_theme', root = document.documentElement;
  function saved() { try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : ''; } catch (e) { return ''; } }
  function system() { return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'; }
  function current() { return root.getAttribute('data-theme') || system(); }
  var first = saved(); if (first) root.setAttribute('data-theme', first);

  var SUN = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';
  function paint(btn) {
    var dark = current() === 'dark';
    btn.innerHTML = (dark ? SUN : MOON) + '<span class="theme-toggle-label">Dark mode</span>';
    btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
  }
  function mount() {
    var head = document.querySelector('.lab-head'); if (!head || head.querySelector('.theme-toggle')) return;
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'theme-toggle secondary';
    paint(btn); head.appendChild(btn);
    btn.addEventListener('click', function () {
      var next = current() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next); try { localStorage.setItem(KEY, next); } catch (e) {}
      paint(btn); document.dispatchEvent(new CustomEvent('lab-theme', { detail: next }));
    });
    if (window.matchMedia) { var mq = window.matchMedia('(prefers-color-scheme: dark)'); if (mq.addEventListener) mq.addEventListener('change', function () { paint(btn); }); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
