/* CCAIR Data — context provider for JSON data loading */
const { createContext, useContext, useState: useDataState, useEffect: useDataEffect } = React;

const DataCtx = createContext(null);
// Load status for DataGate. The shell (nav, footer) renders at once; only the page area waits for the data.
const DataStatusCtx = createContext({ loading: true, error: null, partial: false });

const DATA_FILES = {
  publications: '/ccair/data/publications.json',
  people: '/ccair/data/people.json',
  resources: '/ccair/data/resources.json',
  funding: '/ccair/data/funding.json',
  courses: '/ccair/data/courses.json',
  news: '/ccair/data/news.json',
  materials: '/ccair/data/materials.json',
  paperPages: '/ccair/data/paper-pages.json',
  photos: '/ccair/data/photos.json',
  friends: '/ccair/data/friends.json',
};
// What a page gets when its file fails to load, so one failed fetch empties one section instead of the whole site.
// paper-pages.json is generated at build time (scripts/build-ccair.js); the site still works if it is missing.
const FALLBACKS = {
  publications: [], people: { students: [], mentees: [], affiliates: [] }, resources: [],
  funding: { grants: [], awarded: [], collaborations: [] }, courses: [], news: [], materials: [], paperPages: {}, photos: { photos: [] }, friends: { friends: [] },
};

function DataProvider({ children }) {
  const [state, setState] = useDataState({ data: null, loading: true, error: null, partial: false });

  useDataEffect(() => {
    const entries = Object.entries(DATA_FILES);
    Promise.allSettled(entries.map(([, url]) => fetch(url).then(r => {
      if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
      return r.json();
    })))
      .then(results => {
        const data = {};
        const failed = [];
        entries.forEach(([key], i) => {
          const r = results[i];
          if (r.status === 'fulfilled') { data[key] = r.value; return; }
          failed.push(r.reason && r.reason.message ? r.reason.message : key);
          data[key] = FALLBACKS[key];
        });
        if (failed.length) console.warn('CCAIR data:', failed.join('; '));
        // Only show the error screen when nothing loaded at all.
        if (failed.length === entries.length) setState({ data: null, loading: false, error: failed[0] });
        else setState({ data, loading: false, error: null, partial: failed.length > 0 });
      });
  }, []);

  const status = React.useMemo(() => ({ loading: state.loading, error: state.error, partial: state.partial }), [state.loading, state.error, state.partial]);
  return (
    <DataStatusCtx.Provider value={status}>
      <DataCtx.Provider value={state.data}>{children}</DataCtx.Provider>
    </DataStatusCtx.Provider>
  );
}

// Wrap the page area in this. Anything outside it (nav, footer) renders before the data arrives.
function DataGate({ children }) {
  const { loading, error, partial } = useContext(DataStatusCtx);
  if (loading) {
    return (
      <div className="state" role="status">
        <div>
          <span className="state-dot" aria-hidden="true"></span>
          <p>Loading the center…</p>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="state" role="alert">
        <div>
          <h2 style={{ marginBottom: 8 }}>We couldn't load this page</h2>
          <p style={{ marginBottom: 16 }}>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }
  // Some files failed: the page still renders from the fallbacks, but says so instead of showing empty sections silently.
  if (partial) {
    return (
      <>
        <div className="data-notice wrap" role="status">
          <p>Some content did not load.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>Reload the page</button>
        </div>
        {children}
      </>
    );
  }
  return children;
}

function useData() {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

window.CCAIR = window.CCAIR || {};
Object.assign(window.CCAIR, { DataProvider, DataGate, useData, DataCtx });
Object.assign(window, { DataProvider, DataGate, useData, DataCtx });
