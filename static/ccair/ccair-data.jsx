/* CCAIR Data — context provider for JSON data loading */
const { createContext, useContext, useState: useDataState, useEffect: useDataEffect } = React;

const DataCtx = createContext(null);
// Load status for DataGate. The shell (nav, footer) renders at once; only the page area waits for the data.
const DataStatusCtx = createContext({ loading: true, error: null });

const DATA_FILES = {
  publications: 'data/publications.json',
  people: 'data/people.json',
  resources: 'data/resources.json',
  funding: 'data/funding.json',
  courses: 'data/courses.json',
  news: 'data/news.json',
  materials: 'data/materials.json',
  paperPages: 'data/paper-pages.json',
  photos: 'data/photos.json',
  friends: 'data/friends.json',
};
// What a page gets when its file fails to load, so one failed fetch empties one section instead of the whole site.
// paper-pages.json is generated at build time (scripts/build-ccair.js); the site still works if it is missing.
const FALLBACKS = {
  publications: [], people: { students: [], mentees: [], affiliates: [] }, resources: [],
  funding: { grants: [], awarded: [], collaborations: [] }, courses: [], news: [], materials: [], paperPages: {}, photos: { photos: [] }, friends: { friends: [] },
};

function DataProvider({ children }) {
  const [state, setState] = useDataState({ data: null, loading: true, error: null });

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
        else setState({ data, loading: false, error: null });
      });
  }, []);

  const status = React.useMemo(() => ({ loading: state.loading, error: state.error }), [state.loading, state.error]);
  return (
    <DataStatusCtx.Provider value={status}>
      <DataCtx.Provider value={state.data}>{children}</DataCtx.Provider>
    </DataStatusCtx.Provider>
  );
}

// Wrap the page area in this. Anything outside it (nav, footer) renders before the data arrives.
function DataGate({ children }) {
  const { loading, error } = useContext(DataStatusCtx);
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
