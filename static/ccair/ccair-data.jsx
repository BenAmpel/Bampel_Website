/* CCAIR Data — context provider for JSON data loading */
const { createContext, useContext, useState: useDataState, useEffect: useDataEffect } = React;

const DataCtx = createContext(null);

const DATA_FILES = {
  publications: 'data/publications.json',
  people: 'data/people.json',
  resources: 'data/resources.json',
  funding: 'data/funding.json',
  courses: 'data/courses.json',
  news: 'data/news.json',
  materials: 'data/materials.json',
  paperPages: 'data/paper-pages.json',
};
// Generated at build time (scripts/build-ccair.js); the site still works if it is missing.
const OPTIONAL_FILES = { paperPages: {} };

function DataProvider({ children }) {
  const [state, setState] = useDataState({ data: null, loading: true, error: null });

  useDataEffect(() => {
    const entries = Object.entries(DATA_FILES);
    Promise.all(entries.map(([key, url]) => fetch(url).then(r => {
      if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
      return r.json();
    }).catch(err => {
      if (key in OPTIONAL_FILES) return OPTIONAL_FILES[key];
      throw err;
    })))
      .then(results => {
        const data = {};
        entries.forEach(([key], i) => { data[key] = results[i]; });
        setState({ data, loading: false, error: null });
      })
      .catch(err => setState({ data: null, loading: false, error: err.message }));
  }, []);

  if (state.loading) {
    return (
      <div className="state" role="status">
        <div>
          <img src="uploads/ccair-mark.png" alt="" />
          <p>Loading the center…</p>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="state" role="alert">
        <div>
          <h2 style={{ marginBottom: 8 }}>We couldn't load this page</h2>
          <p style={{ marginBottom: 16 }}>{state.error}</p>
          <button type="button" className="btn btn-primary" onClick={() => { setState({ data: null, loading: true, error: null }); window.location.reload(); }}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return <DataCtx.Provider value={state.data}>{children}</DataCtx.Provider>;
}

function useData() {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

window.CCAIR = window.CCAIR || {};
Object.assign(window.CCAIR, { DataProvider, useData, DataCtx });
Object.assign(window, { DataProvider, useData, DataCtx });
