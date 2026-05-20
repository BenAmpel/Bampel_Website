/* CCAIR App — shell with routing, tweaks integration, page transitions */
const { useState, useEffect, useCallback, useRef } = React;

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return React.createElement('div', { style: { padding: 80, textAlign: 'center', color: '#8b9ab8' } },
      React.createElement('h2', { style: { color: '#e8edf5', marginBottom: 12 } }, 'Something went wrong'),
      React.createElement('p', null, 'Please refresh the page.'),
      React.createElement('button', { onClick: () => window.location.reload(), style: { marginTop: 16, padding: '8px 20px', background: '#00ddb3', border: 'none', borderRadius: 8, color: '#050a15', fontWeight: 600, cursor: 'pointer' } }, 'Refresh')
    );
    return this.props.children;
  }
}

function CCAIRApp() {
  const [tweaks, setTweak] = useTweaks(window.__TWEAK_DEFAULTS);
  const [currentPage, setCurrentPage] = useState('home');
  const [transitioning, setTransitioning] = useState(false);
  const [displayPage, setDisplayPage] = useState('home');
  const timerRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-color', tweaks.colorScheme);
  }, [tweaks.colorScheme]);

  useEffect(() => {
    if (!tweaks.showGrid) document.documentElement.classList.add('no-grid');
    else document.documentElement.classList.remove('no-grid');
  }, [tweaks.showGrid]);

  useEffect(() => {
    const titles = { home: 'CCAIR — Center for CyberAI Research', research: 'Research — CCAIR', people: 'People — CCAIR', resources: 'Resources — CCAIR', about: 'About — CCAIR' };
    document.title = titles[displayPage] || 'CCAIR — Center for CyberAI Research';
  }, [displayPage]);

  const navigate = useCallback((page) => {
    if (page === currentPage) return;
    clearTimeout(timerRef.current);
    setTransitioning(true);
    timerRef.current = setTimeout(() => {
      setCurrentPage(page);
      setDisplayPage(page);
      setTransitioning(false);
      window.scrollTo({ top: 0, behavior: 'instant' });
    }, 250);
  }, [currentPage]);

  const renderPage = () => {
    switch (displayPage) {
      case 'home': return <HomePage onNavigate={navigate} tweaks={tweaks} />;
      case 'research': return <ResearchPage />;
      case 'people': return <PeoplePage />;
      case 'resources': return <ResourcesPage />;
      case 'about': return <AboutPage onNavigate={navigate} />;
      default: return <HomePage onNavigate={navigate} tweaks={tweaks} />;
    }
  };

  return (
    <TweakCtx.Provider value={{ cardStyle: tweaks.cardStyle, colorScheme: tweaks.colorScheme }}>
      <CCAIRNav currentPage={currentPage} onNavigate={navigate} />

      <main id="main-content" style={{
        opacity: transitioning ? 0 : 1,
        transform: transitioning ? 'translateY(12px)' : 'translateY(0)',
        transition: 'opacity 0.25s ease, transform 0.25s ease',
        minHeight: '100vh',
      }}>
        <ErrorBoundary>{renderPage()}</ErrorBoundary>
      </main>

      <CCAIRFooter />

      <TweaksPanel title="CCAIR Tweaks" tweaks={tweaks} setTweak={setTweak}>
        <TweakSection label="Visual Direction">
          <TweakRadio
            label="Color Scheme"
            tweakKey="colorScheme"
            value={tweaks.colorScheme}
            options={['teal', 'blue', 'purple', 'amber']}
            setTweak={setTweak}
          />
          <TweakRadio
            label="Card Style"
            tweakKey="cardStyle"
            value={tweaks.cardStyle}
            options={['glass', 'solid', 'outlined']}
            setTweak={setTweak}
          />
        </TweakSection>
        <TweakSection label="Layout">
          <TweakRadio
            label="Hero"
            tweakKey="heroStyle"
            value={tweaks.heroStyle}
            options={['full', 'compact']}
            setTweak={setTweak}
          />
          <TweakToggle
            label="Grid Pattern"
            tweakKey="showGrid"
            value={tweaks.showGrid}
            setTweak={setTweak}
          />
        </TweakSection>
      </TweaksPanel>
    </TweakCtx.Provider>
  );
}

Object.assign(window, { CCAIRApp });
