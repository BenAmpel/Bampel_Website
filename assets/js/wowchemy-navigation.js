/* ---------------------------------------------------------------------------
 * Responsive scrolling for URL hashes.
 * No jQuery (theme plan stage 2): DOM calls and requestAnimationFrame replace $().offset, $.escapeSelector and
 * $().animate, with the same "swing" easing for the animated case.
 * --------------------------------------------------------------------------- */

// Dynamically get responsive navigation bar height for offsetting Scrollspy.
function getNavBarHeight() {
  let navbar = document.getElementById('navbar-main');
  let navbarHeight = navbar ? navbar.getBoundingClientRect().height : 0;
  console.debug('Navbar height: ' + navbarHeight);
  return navbarHeight;
}

// The element a "#id" hash points to (looked up by id, so ids with colons, as in Markdown footnotes, need no escaping).
function hashTarget(hash) {
  if (typeof hash !== 'string' || hash.charAt(0) !== '#' || hash.length < 2) return null;
  return document.getElementById(hash.substring(1));
}

// Scroll the window to y over `duration` ms with jQuery's default "swing" easing, then call done. Instant when the
// duration is 0 or the reader asked for reduced motion.
function scrollWindowTo(y, duration, done) {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!duration || reduce) {
    window.scrollTo(0, y);
    if (done) done();
    return;
  }
  const start = window.scrollY, change = y - start, t0 = performance.now();
  const swing = (p) => 0.5 - Math.cos(p * Math.PI) / 2;
  function step(now) {
    const p = Math.min(1, (now - t0) / duration);
    window.scrollTo(0, start + change * swing(p));
    if (p < 1) requestAnimationFrame(step);
    else if (done) done();
  }
  requestAnimationFrame(step);
}

/**
 * Responsive hash scrolling.
 * Check for a URL hash as an anchor.
 * If page anchor matches hash, scroll to it responsively considering dynamic height elements.
 * If `target` argument omitted (e.g. after event), assume it's the window's hash.
 * Default to 0ms animation duration as don't want animation for fixing scrollspy Book page ToC highlighting.
 */
function scrollToAnchor(target, duration = 0) {
  // If `target` is undefined or HashChangeEvent object, set it to window's hash.
  // Decode the hash as browsers can encode non-ASCII characters (e.g. Chinese symbols).
  target =
    typeof target === 'undefined' || typeof target === 'object' ? decodeURIComponent(window.location.hash) : target;

  // If target element exists, scroll to it taking into account fixed navigation bar offset.
  const el = hashTarget(target);
  if (el) {
    let elementOffset = Math.ceil(el.getBoundingClientRect().top + window.scrollY - getNavBarHeight()); // Round up to highlight right ID!
    document.querySelector('body').classList.add('scrolling');
    scrollWindowTo(elementOffset, duration, function () {
      document.querySelector('body').classList.remove('scrolling');
    });
  } else {
    console.debug('Cannot scroll to target `#' + target + '`. ID not found!');
  }
}

/* ---------------------------------------------------------------------------
 * Add smooth scrolling to all links inside the main navbar.
 * --------------------------------------------------------------------------- */

document.querySelectorAll('#navbar-main li.nav-item a.nav-link, .js-scroll').forEach(function (link) {
  link.addEventListener('click', function (event) {
    // Store requested URL hash.
    let hash = this.hash;
    const el = hashTarget(hash);

    // If we are on a widget page and the navbar link is to a section on the same page.
    if (this.pathname === window.location.pathname && el && document.querySelector('.js-widget-page')) {
      // Prevent default click behavior.
      event.preventDefault();

      // Smooth page scrolling: the numerical parameter is the time (ms) taken to scroll to the section.
      let elementOffset = Math.ceil(el.getBoundingClientRect().top + window.scrollY - getNavBarHeight()); // Round up to highlight right ID!
      scrollWindowTo(elementOffset, 800);
    }
  });
});

/* ---------------------------------------------------------------------------
 * Hide mobile collapsable menu on clicking a link.
 * --------------------------------------------------------------------------- */

document.addEventListener('click', function (e) {
  const menu = e.target.closest && e.target.closest('.navbar-collapse.show');
  if (!menu) return;
  // Get the <a> element that was clicked, even if the <span> element that is inside the <a> element is e.target.
  const targetElement = e.target.tagName === 'A' ? e.target : e.target.parentElement;

  if (targetElement && targetElement.tagName === 'A' && targetElement.getAttribute('class') != 'dropdown-toggle') {
    if (window.siteCollapse) window.siteCollapse.hide(menu); // assets/js/site/collapse.js, not Bootstrap's plugin
  }
});

// Automatic main menu dropdowns on mouse over.
document.querySelectorAll('.dropdown').forEach(function (dropdown) {
  const menu = dropdown.querySelector('.dropdown-menu');
  function update() {
    dropdown.classList.add('show');
    if (menu) menu.classList.add('show');
    setTimeout(function () {
      const hover = dropdown.matches(':hover');
      dropdown.classList.toggle('show', hover);
      if (menu) menu.classList.toggle('show', hover);
    }, 300);
  }
  dropdown.addEventListener('mouseenter', update);
  dropdown.addEventListener('mouseleave', update);
});

// Check for hash change event and fix responsive offset for hash links (e.g. Markdown footnotes).
window.addEventListener('hashchange', scrollToAnchor);

export {scrollToAnchor};
