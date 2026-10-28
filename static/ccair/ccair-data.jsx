/* CCAIR Data — context provider for JSON data loading */
const { createContext, useContext, useState: useDataState, useEffect: useDataEffect } = React;

const DataCtx = createContext(null);
// Load status per file ('loading', 'ready' or 'failed'). The page renders at once from FALLBACKS; each data section
// waits for its own files (DataSection), so the h1 and the text that needs no data never wait on a fetch.
const DataStatusCtx = createContext({});

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
// What a page reads while its file loads or after it fails, so one failed fetch affects one section, not the whole site.
// paper-pages.json is generated at build time (scripts/build-ccair.js); the site still works if it is missing.
const FALLBACKS = {
  publications: [], people: { students: [], mentees: [], affiliates: [] }, resources: [],
  funding: { grants: [], awarded: [], collaborations: [] }, courses: [], news: [], materials: [], paperPages: {}, photos: { photos: [] }, friends: { friends: [] },
};

function DataProvider({ children }) {
  const [state, setState] = useDataState(() => ({
    data: { ...FALLBACKS },
    status: Object.fromEntries(Object.keys(DATA_FILES).map((key) => [key, 'loading'])),
  }));

  // Each file updates its own sections as soon as it arrives; one failed fetch leaves its fallback in place.
  useDataEffect(() => {
    Object.entries(DATA_FILES).forEach(([key, url]) => {
      fetch(url).then(r => {
        if (!r.ok) throw new Error(`Failed to load ${url}: ${r.status}`);
        return r.json();
      }).then(
        (value) => setState((s) => ({ data: { ...s.data, [key]: value }, status: { ...s.status, [key]: 'ready' } })),
        (err) => {
          console.warn('CCAIR data:', err && err.message ? err.message : key);
          setState((s) => ({ data: s.data, status: { ...s.status, [key]: 'failed' } }));
        });
    });
  }, []);

  return (
    <DataStatusCtx.Provider value={state.status}>
      <DataCtx.Provider value={state.data}>{children}</DataCtx.Provider>
    </DataStatusCtx.Provider>
  );
}

// 'loading' while any of the files is on its way, 'failed' if any failed, otherwise 'ready'.
function useDataStatus(...keys) {
  const status = useContext(DataStatusCtx);
  if (keys.some((k) => status[k] === 'loading')) return 'loading';
  return keys.some((k) => status[k] === 'failed') ? 'failed' : 'ready';
}

// One data section: a short loading line until its files arrive, its content once they have, or a one-line message if
// one failed. The line sits in a polite live region that stays mounted, so the change is announced. `reserve` (a CSS
// height) holds that much room while loading, for a section tall enough that content below it would jump.
function DataSection({ needs, what, wrap, reserve, children }) {
  const status = useDataStatus(...needs);
  const line = status === 'loading' ? `Loading ${what}…` : status === 'failed' ? `Could not load ${what}. Reload the page to try again.` : '';
  return (
    <>
      <p className={'data-state' + (wrap ? ' wrap' : '')} aria-live="polite" style={status === 'loading' && reserve ? { minHeight: reserve } : undefined}>{line}</p>
      {status === 'ready' && children}
    </>
  );
}

function useData() {
  const ctx = useContext(DataCtx);
  if (!ctx) throw new Error('useData must be used within DataProvider');
  return ctx;
}

window.CCAIR = window.CCAIR || {};
Object.assign(window.CCAIR, { DataProvider, DataSection, useData, useDataStatus, DataCtx });
Object.assign(window, { DataProvider, DataSection, useData, useDataStatus, DataCtx });
