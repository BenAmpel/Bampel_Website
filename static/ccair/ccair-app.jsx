/* CCAIR App — shell with hash routing and page focus management */
const { useState, useEffect, useRef } = React;

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
  home: 'CCAIR — Center for CyberAI Research', research: 'Research — CCAIR', publications: 'Publications — CCAIR',
  people: 'People — CCAIR', resources: 'Resources — CCAIR', materials: 'Research materials — CCAIR',
  about: 'About — CCAIR', contact: 'Contact — CCAIR',
};

function pageFromHash() {
  const h = window.location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return VALID_PAGES.includes(h) ? h : 'home';
}

function CCAIRApp() {
  const [page, setPage] = useState(pageFromHash);
  const mainRef = useRef(null);
  const firstRender = useRef(true);

  // Pages are hash routes, so plain links work, the back button works, and nothing waits on a transition.
  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
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
        <ErrorBoundary key={page}><Page /></ErrorBoundary>
      </main>
      <CCAIRFooter />
    </DataProvider>
  );
}

window.CCAIR = window.CCAIR || {};
Object.assign(window.CCAIR, { CCAIRApp });
Object.assign(window, { CCAIRApp });
