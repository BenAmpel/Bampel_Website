/* CCAIR App — shell with path routing (/ccair/<page>/) and page focus management */
const { useState, useEffect, useLayoutEffect, useRef } = React;

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return (
      <div className="state">
        <div>
          <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
          <p style={{ marginBottom: 16 }}>Please refresh the page.</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Refresh</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

const VALID_PAGES = ['home', 'research', 'publications', 'people', 'resources', 'materials', 'about', 'contact'];
const TITLES = {
  home: 'Center for CyberAI Research (CCAIR) — Georgia State University', research: 'Research — CCAIR', publications: 'Publications — CCAIR',
  people: 'People — CCAIR', resources: 'Resources — CCAIR', materials: 'Research materials — CCAIR',
  about: 'About — CCAIR', contact: 'Contact — CCAIR',
};

// Each page has a real address, /ccair/<page>/, with its own prerendered HTML file (scripts/build-ccair.js) so it can be
// found by search engines and shared. Old #/<page> links (the app used hash routes until 2026-10-24) are rewritten to
// the path on load, keeping a #/publications?type=... query.
function pageFromPath(pathname) {
  const seg = (pathname || window.location.pathname).replace(/^\/ccair\/?/, '').split('/')[0];
  return VALID_PAGES.includes(seg) ? seg : 'home';
}
const pathFor = (page) => (page === 'home' ? '/ccair/' : `/ccair/${page}/`);
(function upgradeHashRoute() {
  const m = /^#\/([a-z]*)(\?[^#]*)?/.exec(window.location.hash);
  if (!m) return;
  const page = VALID_PAGES.includes(m[1]) ? m[1] : 'home';
  try { window.history.replaceState(null, '', pathFor(page) + (m[2] || '')); } catch (e) { /* stays on the hash address */ }
})();
// A same-site link to another CCAIR page is handled here (pushState) so the page changes without a reload, with the
// route transition and focus move below. Modified clicks, new-tab links, downloads and links off the app pass through.
function appLinkTarget(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const a = event.target.closest && event.target.closest('a[href]');
  if (!a || a.target && a.target !== '_self' || a.hasAttribute('download')) return null;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin || !/^\/ccair\/([a-z]+\/)?$/.test(url.pathname)) return null;
  const page = pageFromPath(url.pathname);
  if (url.pathname !== pathFor(page)) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return null; // in-page anchor
  return { page, url };
}

// Route transitions. The new page slides in from the side its nav link sits on (later pages from the right, earlier
// from the left) while the old one fades the other way, so moving through the nav feels spatially consistent. Uses
// same-document View Transitions where available (the nav keeps its own layer and stays put); elsewhere the new page
// simply sweeps in (CSS .page). Never under reduced motion. Any click or key press during a transition finishes it at
// once, and a new route mid-transition replaces it, so nothing waits on an animation. REDUCE_MOTION is read per route
// change (it follows the OS setting live); has-vt is set only while view transitions are in use.
const CAN_VIEW_TRANSITION = typeof document !== 'undefined' && typeof document.startViewTransition === 'function';
const viewTransitionsOn = () => CAN_VIEW_TRANSITION && !window.REDUCE_MOTION;
const syncVtClass = () => document.documentElement.classList.toggle('has-vt', viewTransitionsOn());
if (CAN_VIEW_TRANSITION) syncVtClass();
let activeTransition = null;
const skipActive = () => { if (activeTransition) activeTransition.skipTransition(); };
if (CAN_VIEW_TRANSITION) { window.addEventListener('pointerdown', skipActive, true); window.addEventListener('keydown', skipActive, true); }

function routeTo(next, apply) {
  const from = VALID_PAGES.indexOf(document.documentElement.dataset.page || 'home'), to = VALID_PAGES.indexOf(next);
  document.documentElement.dataset.navDir = to < from ? 'back' : 'forward';
  document.documentElement.dataset.page = next;
  if (CAN_VIEW_TRANSITION) syncVtClass();
  if (!viewTransitionsOn() || document.visibilityState !== 'visible') { apply(); return; }
  document.documentElement.dataset.vt = '';
  const vt = document.startViewTransition(() => ReactDOM.flushSync(apply));
  activeTransition = vt;
  vt.finished.finally(() => { if (activeTransition === vt) { activeTransition = null; delete document.documentElement.dataset.vt; } });
}

function CCAIRApp() {
  const [page, setPage] = useState(() => pageFromPath());
  const mainRef = useRef(null);
  const firstRender = useRef(true);

  // Links to other CCAIR pages change the page in place (pushState); the back and forward buttons work (popstate); a
  // link that is not a CCAIR page, or a modified click, behaves as a normal link.
  useEffect(() => {
    document.documentElement.dataset.page = pageFromPath();
    const onClick = (event) => {
      const t = appLinkTarget(event);
      if (!t) return;
      event.preventDefault();
      if (t.url.href !== window.location.href) window.history.pushState(null, '', t.url.pathname + t.url.search + t.url.hash);
      routeTo(t.page, () => setPage(t.page));
    };
    const onPop = () => { const next = pageFromPath(); routeTo(next, () => setPage(next)); };
    document.addEventListener('click', onClick);
    window.addEventListener('popstate', onPop);
    return () => { document.removeEventListener('click', onClick); window.removeEventListener('popstate', onPop); };
  }, []);

  // Layout effect: the scroll reset and focus happen in the same commit as the new page, inside the view transition.
  useLayoutEffect(() => {
    document.title = TITLES[page] || TITLES.home;
    if (firstRender.current) { firstRender.current = false; return; }
    window.scrollTo(0, 0);
    // Move focus to the new page so screen readers announce it.
    const h1 = mainRef.current && mainRef.current.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  }, [page]);

  const pages = { home: HomePage, research: ResearchPage, publications: PublicationsPage, people: PeoplePage, resources: ResourcesPage, materials: MaterialsPage, about: AboutPage, contact: ContactPage };
  const Page = pages[page] || HomePage;

  // The nav and footer sit outside DataProvider: they use no data, so they paint at once and never wait on a fetch.
  return (
    <>
      <CCAIRNav currentPage={page} />
      <DataProvider>
        <main id="main-content" ref={mainRef}>
          <DataGate><ErrorBoundary key={page}><Page /></ErrorBoundary></DataGate>
        </main>
      </DataProvider>
      <CCAIRFooter />
    </>
  );
}

window.CCAIR = window.CCAIR || {};
Object.assign(window.CCAIR, { CCAIRApp });
Object.assign(window, { CCAIRApp });
