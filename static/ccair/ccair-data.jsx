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
};

function DataProvider({ children }) {
  const [state, setState] = useDataState({ data: null, loading: true, error: null });

  useDataEffect(() => {
    const entries = Object.entries(DATA_FILES);
    Promise.all(entries.map(([, url]) => fetch(url).then(r => {
      if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
      return r.json();
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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 24 }}>
        <img src="uploads/CCAIR.png" alt="CCAIR" style={{ height: 64, opacity: 0.6, animation: 'pulse 2s ease-in-out infinite' }} />
        <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading data...</div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', gap: 16, padding: 40 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>Failed to load data</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 400, textAlign: 'center' }}>{state.error}</div>
        <button onClick={() => { setState({ data: null, loading: true, error: null }); window.location.reload(); }}
          style={{ marginTop: 8, padding: '8px 20px', background: 'var(--accent)', border: 'none', borderRadius: 8, color: 'var(--bg-base)', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
          Retry
        </button>
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
