/* CCAIR app start-up, loaded deferred right after dist/ccair.js (deferred scripts run in order, before DOMContentLoaded).
   Kept out of index.html so the page needs no inline script. */
// The skip link must not change the hash: in this hash-routed app "#main-content" would route to Home.
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
