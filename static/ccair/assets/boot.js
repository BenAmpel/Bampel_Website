/* CCAIR app start-up, loaded deferred right after dist/ccair.js (deferred scripts run in order, before DOMContentLoaded).
   Kept out of index.html so the page needs no inline script. */
// The skip link moves focus to the main region itself instead of following "#main-content", so the address keeps the
// page path without a stray hash and focus lands on main in every browser. (The app routes on real paths since
// 2026-10-24; before that, the hash would have routed to Home.)
document.querySelector('a.skip').addEventListener('click', function (e) {
  e.preventDefault();
  var main = document.getElementById('main-content');
  if (!main) return;
  main.setAttribute('tabindex', '-1');
  main.focus({ preventScroll: true });
  main.scrollIntoView();
});
window.addEventListener('DOMContentLoaded', function () {
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(CCAIRApp));
});
