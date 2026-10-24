/* CCAIR App — shell with hash routing and page focus management */
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

function pageFromHash() {
  const h = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return VALID_PAGES.includes(h) ? h : 'home';
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
  const [page, setPage] = useState(pageFromHash);
  const mainRef = useRef(null);
  const firstRender = useRef(true);

  // Pages are hash routes, so plain links work, the back button works, and nothing waits on a transition.
  useEffect(() => {
    document.documentElement.dataset.page = pageFromHash();
    const onHash = () => { const next = pageFromHash(); routeTo(next, () => setPage(next)); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
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

  return (
    <DataProvider>
      <CCAIRNav currentPage={page} />
      <main id="main-content" ref={mainRef}>
        <DataGate><ErrorBoundary key={page}><Page /></ErrorBoundary></DataGate>
      </main>
      <CCAIRFooter />
    </DataProvider>
  );
}

window.CCAIR = window.CCAIR || {};
Object.assign(window.CCAIR, { CCAIRApp });
Object.assign(window, { CCAIRApp });
