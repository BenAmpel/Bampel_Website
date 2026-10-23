/* CCAIR Components — shared UI primitives. Styling lives in assets/ccair.css. */
const { useState, useEffect, useRef } = React;

const REDUCE_MOTION = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const NAV_PAGES = [
  { id: 'research', label: 'Research' },
  { id: 'publications', label: 'Publications' },
  { id: 'people', label: 'People' },
  { id: 'resources', label: 'Resources' },
  { id: 'materials', label: 'Materials' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
];

const hrefFor = (page) => (page === 'home' ? '#/' : '#/' + page);

function Icon({ name }) {
  const paths = {
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="M6 6l12 12M18 6L6 18" />,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    external: <path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5" />,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function Arrow() {
  return <span className="arrow" aria-hidden="true">→</span>;
}

/* ---------- Motion ----------
   Content is visible by default. The hidden pre-state of a reveal applies only under html.motion-ok, set here once
   JavaScript has confirmed IntersectionObserver exists, so the page reads fully without JavaScript, in print, and for
   crawlers that never scroll. Under reduced motion the reveals are short opacity fades and nothing moves (see CSS). */
const CAN_OBSERVE = typeof window !== 'undefined' && 'IntersectionObserver' in window;
if (CAN_OBSERVE) document.documentElement.classList.add('motion-ok');
// Scroll-driven CSS animations (progress bar, hero parallax) run on the compositor; older browsers get a rAF fallback.
const SCROLL_TIMELINE = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timeline: scroll()');

// One shared observer for every reveal. Elements that enter together are staggered top-to-bottom, left-to-right,
// 70 ms apart (capped), so a grid sweeps in as a group while a lone card scrolled into view never waits.
const STAGGER_MS = 70, STAGGER_MAX = 6;
const revealWatcher = CAN_OBSERVE ? (() => {
  const pending = new Map();
  let heard = false, failsafe = null;
  const release = (el, delay) => {
    const cb = pending.get(el); if (!cb) return;
    pending.delete(el); io.unobserve(el); cb(delay);
  };
  // The root reaches far above the viewport, so an element counts once its top has passed 94% of the viewport height,
  // including one skipped over in a single frame (End key, scrollbar drag, restored position). An observer only reports
  // changes, so with a plain viewport root those would never be reported and would stay hidden.
  const io = new IntersectionObserver((entries) => {
    heard = true;
    const entering = [];
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      // Already above the viewport: show it at once, nothing to animate, and it takes no stagger slot.
      if (e.boundingClientRect.bottom <= 0) release(e.target, 0); else entering.push(e);
    });
    entering.sort((a, b) => (a.boundingClientRect.top - b.boundingClientRect.top) || (a.boundingClientRect.left - b.boundingClientRect.left))
      .forEach((e, k) => release(e.target, Math.min(k, STAGGER_MAX) * STAGGER_MS));
  }, { rootMargin: '100000px 0px -6% 0px', threshold: 0 });
  return {
    watch(el, cb) {
      pending.set(el, cb); io.observe(el);
      // An observer reports every target once as soon as it is observed. If nothing has arrived after 1.5 s it never
      // will (a broken or suspended implementation), so show everything rather than leave content hidden.
      if (!heard && !failsafe) failsafe = setTimeout(() => { failsafe = null; if (!heard) [...pending.keys()].forEach((t) => release(t, 0)); }, 1500);
      return () => { pending.delete(el); io.unobserve(el); };
    },
  };
})() : null;

function useInView() {
  const ref = useRef(null);
  const [state, setState] = useState({ visible: !CAN_OBSERVE, delay: 0 });
  useEffect(() => {
    const el = ref.current; if (!el || !revealWatcher) return;
    return revealWatcher.watch(el, (delay) => setState({ visible: true, delay }));
  }, []);
  return [ref, state.visible, state.delay];
}

// Sweeps its content up once it scrolls into view (an opacity fade only under reduced motion, see CSS).
function Reveal({ children, as = 'div', className = '', style, ...rest }) {
  const [ref, visible, delay] = useInView();
  const Tag = as;
  const s = delay ? { ...style, '--rd': delay + 'ms' } : style;
  return <Tag ref={ref} className={'reveal' + (visible ? ' is-in' : '') + (className ? ' ' + className : '')} style={s} {...rest}>{children}</Tag>;
}

// Counts a statistic up from zero the first time it is seen. Screen readers and crawlers get the real number from the
// hidden copy; the visible digits are padded with figure spaces to the final width so the count shifts no layout.
function CountUp({ value }) {
  const ref = useRef(null);
  const n = Number(value) || 0;
  const animate = !!revealWatcher && !REDUCE_MOTION && n > 1;
  const [shown, setShown] = useState(animate ? 0 : n);
  useEffect(() => {
    if (!animate) { setShown(n); return; }
    let raf = 0;
    const stop = revealWatcher.watch(ref.current, (delay) => {
      const t0 = performance.now() + delay + 200, dur = 1100;
      const tick = (now) => {
        const p = Math.min(1, Math.max(0, (now - t0) / dur));
        setShown(Math.round(n * (1 - Math.pow(1 - p, 4))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    return () => { stop(); cancelAnimationFrame(raf); };
  }, [n]);
  return (
    <>
      <span ref={ref} aria-hidden="true">{String(shown).padStart(String(n).length, ' ')}</span>
      <span className="sr-only">{n}</span>
    </>
  );
}

// rAF-throttled, passive scroll listener; fn receives scrollY. Runs once on mount so state matches a restored position.
function useScrollFrame(fn, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const run = () => { raf = 0; fnRef.current(window.scrollY); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(run); };
    run();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, [enabled]);
}

function CCAIRNav({ currentPage }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const sheetRef = useRef(null);
  const barRef = useRef(null);

  // The nav material fades in and the bar condenses once the page moves. The reading-progress bar is a scroll-driven
  // CSS animation where supported; elsewhere it is set here, one write per frame, after the reads.
  useScrollFrame((y) => {
    setScrolled(y > 4);
    if (SCROLL_TIMELINE || !barRef.current) return;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    barRef.current.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, y / max) : 0).toFixed(4) + ')';
  });

  useEffect(() => { setOpen(false); }, [currentPage]);

  // While the sheet is open: Escape closes it, Tab stays inside it (the toggle and the sheet's links),
  // focus moves into it, and the page behind does not scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { setOpen(false); btnRef.current && btnRef.current.focus(); return; }
      if (e.key !== 'Tab' || !sheetRef.current) return;
      const items = [btnRef.current, ...sheetRef.current.querySelectorAll('a[href], button')].filter(Boolean);
      const first = items[0], last = items[items.length - 1];
      const inside = items.includes(document.activeElement);
      if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    const first = sheetRef.current && sheetRef.current.querySelector('a');
    first && first.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <header className={'nav' + (scrolled ? ' is-scrolled' : '')}>
      <nav className="wrap nav-inner" aria-label="Main">
        <a className="brand" href="#/" aria-label="CCAIR home">
          <img src="uploads/brand/logo-mark-64.png" alt="" width="32" height="32" />
          <span>CCAIR<small>Center for CyberAI Research</small></span>
        </a>
        <ul className="nav-links">
          {NAV_PAGES.map((p) => (
            <li key={p.id}><a href={hrefFor(p.id)} aria-current={currentPage === p.id ? 'page' : undefined}>{p.label}</a></li>
          ))}
        </ul>
        <a className="btn btn-primary btn-sm nav-cta" href="/ccair/pathways/">Career Finder</a>
        <button ref={btnRef} type="button" className="menu-btn" onClick={() => setOpen(!open)}
          aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="ccair-menu">
          <Icon name={open ? 'close' : 'menu'} />
        </button>
      </nav>
      <div className="scroll-progress" ref={barRef} aria-hidden="true"></div>
      {open && <div className="sheet-scrim" onClick={() => setOpen(false)} aria-hidden="true"></div>}
      {open && (
        <div id="ccair-menu" className="sheet" ref={sheetRef} onClick={(e) => { if (e.target.closest('a')) setOpen(false); }}>
          <ul>
            <li><a href="#/" aria-current={currentPage === 'home' ? 'page' : undefined}>Home</a></li>
            {NAV_PAGES.map((p) => (
              <li key={p.id}><a href={hrefFor(p.id)} aria-current={currentPage === p.id ? 'page' : undefined}>{p.label}</a></li>
            ))}
            <li><a href="/ccair/students/">Student guide</a></li>
          </ul>
          <a className="btn btn-primary" href="/ccair/pathways/">Cyber Career Finder <Arrow /></a>
        </div>
      )}
    </header>
  );
}

function PageHead({ eyebrow, title, lede, children }) {
  return (
    <header className="page-head wrap">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {children}
    </header>
  );
}

function Section({ id, eyebrow, title, intro, alt, children, labelledBy }) {
  const headId = id ? id + '-title' : undefined;
  return (
    <section id={id} className={alt ? 'section-alt' : 'section'} aria-labelledby={title ? headId : labelledBy}>
      <div className="wrap">
        {title && (
          <Reveal className="section-head">
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id={headId}>{title}</h2>
            {intro && <p>{intro}</p>}
          </Reveal>
        )}
        {children}
      </div>
    </section>
  );
}

function Card({ children, className = '', ...rest }) {
  return <div className={'card' + (className ? ' ' + className : '')} {...rest}>{children}</div>;
}

// The reveal sits on a wrapper so the link's own hover lift and press keep their transitions.
function LinkCard({ href, title, children, more = 'Learn more' }) {
  return (
    <Reveal className="card-slot">
      <a className="card card-link" href={href}>
        <h3>{title}</h3>
        {children}
        {more && <span className="more">{more} <span aria-hidden="true">→</span></span>}
      </a>
    </Reveal>
  );
}

const TYPE_LABEL = { journal: 'Journal', conference: 'Conference', workshop: 'Workshop' };

function Tag({ type, children }) {
  return <span className={'tag' + (type ? ' tag-' + type : '')}>{children || TYPE_LABEL[type] || type}</span>;
}

const STATUS_COLOR = { 'Released': 'var(--green)', 'Active': 'var(--green)', 'Available': 'var(--green)', 'In Development': 'var(--warm)', 'Coming 2026': 'var(--accent)', 'Planning': 'var(--muted)' };

function Status({ status }) {
  return <span className="status" style={{ '--status': STATUS_COLOR[status] || 'var(--muted)' }}>{status}</span>;
}

// Bold the center director's name in an author list ("Ampel, B.M." or "B. Ampel").
function Authors({ text }) {
  const parts = String(text).split(/(Ampel, B\.\s?M\.|B\.\s?M?\.? ?Ampel)/);
  return <p className="authors">{parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p))}</p>;
}

// Must match normTitle in scripts/build-ccair.js, which writes data/paper-pages.json.
const normTitle = (s) => String(s).replace(/\bML\b/g, 'Machine Learning').replace(/\bAI\b/g, 'Artificial Intelligence').toLowerCase().replace(/[^a-z0-9]/g, '');

// A "PDF" link must open a PDF. Publisher landing pages (misq.umn.edu, tandfonline, dl.acm.org/doi/..., ieeexplore,
// AIS eLibrary article pages, hdl.handle.net, arxiv.org/abs, workshop sites) are labelled "Paper" instead.
const isPdfUrl = (u) => /\.pdf(?:$|[?#])/i.test(u) || /arxiv\.org\/pdf\//i.test(u) || /par\.nsf\.gov\/servlets\/purl\//i.test(u)
  || /aisel\.aisnet\.org\/cgi\/viewcontent\.cgi/i.test(u) || /dl\.acm\.org\/doi\/pdf\//i.test(u);

function PublicationItem({ title, authors, venue, year, type, doi, pdf }) {
  const { paperPages = {} } = useData();
  const site = paperPages[normTitle(title)] || {};
  const fullText = pdf || site.pdf;
  const award = / — (Best Paper Award)$/.exec(venue || '');
  const venueText = award ? venue.replace(award[0], '') : venue;
  const links = [
    fullText && (isPdfUrl(fullText)
      ? { label: 'PDF', href: fullText, aria: `PDF of ${title}` }
      : { label: 'Paper', href: fullText, aria: `Paper (publisher page) for ${title}` }),
    site.code && { label: 'Code', href: site.code, aria: `Code for ${title}` },
    site.data && { label: 'Data', href: site.data, aria: `Data for ${title}` },
    doi && { label: 'DOI', href: 'https://doi.org/' + doi, aria: `DOI for ${title}` },
  ].filter(Boolean);
  return (
    <Reveal as="li" className="pub">
      <h3>{site.page ? <a className="pub-title-link" href={site.page}>{title}</a> : title}</h3>
      <Authors text={authors} />
      <p className="venue">{venueText}{year ? `, ${year}` : ''}{award && <> · <span className="award">{award[1]}</span></>}</p>
      <div className="side">
        <Tag type={type} />
        {links.length > 0 && (
          <span className="links">
            {links.map((l) => <a key={l.label} href={l.href} aria-label={l.aria}>{l.label}</a>)}
          </span>
        )}
      </div>
    </Reveal>
  );
}

function initialsOf(name) {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).filter((c) => /[A-Z]/.test(c)).join('').slice(0, 2);
}

function PersonCard({ name, role, meta, note, warm }) {
  return (
    <Card className="person">
      <div className={'avatar avatar-md' + (warm ? ' avatar-warm' : '')} aria-hidden="true">{initialsOf(name)}</div>
      <div>
        <h3>{name}</h3>
        {role && <div className="role">{role}</div>}
        {meta && <div className="meta">{meta}</div>}
        {note && <p>{note}</p>}
      </div>
    </Card>
  );
}

function SegmentedControl({ label, options, value, onChange }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

function FinderFeature({ headingLevel = 2, titleId }) {
  const H = 'h' + headingLevel;
  return (
    <Reveal className="feature">
      <div>
        <div className="feature-meta"><span className="tag tag-workshop">Free</span><span className="tag">5 minutes</span><span className="tag">Nothing stored</span></div>
        <H id={titleId}>Not sure where you fit in cybersecurity?</H>
        <p>The Cyber Career Pathway Finder is a plain-language quiz built on the NIST NICE Workforce Framework. It ranks
          14 cybersecurity roles by your interests and shows the realistic first job, starter certifications, free practice
          and US pay for each.</p>
      </div>
      <div className="actions">
        <a className="btn btn-primary" href="/ccair/pathways/">Take the finder <Arrow /></a>
        <a className="btn btn-secondary" href="/ccair/pathways/#roles">Browse the 14 roles</a>
        <a className="btn btn-secondary" href="/ccair/students/">Read the student guide</a>
      </div>
    </Reveal>
  );
}

function CCAIRFooter() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-inner">
          <div>
            <a className="brand" href="#/" aria-label="CCAIR home">
              <img src="uploads/brand/logo-mark-64.png" alt="" width="32" height="32" />
              <span>CCAIR<small>Center for CyberAI Research</small></span>
            </a>
            <address className="contact-lines">
              J. Mack Robinson College of Business, Georgia State University<br />
              55 Park Place NW, Atlanta, GA 30303<br />
              <a href="mailto:bampel@gsu.edu">bampel@gsu.edu</a>
            </address>
          </div>
          <div>
            <h2>Center</h2>
            <ul>
              {NAV_PAGES.map((p) => <li key={p.id}><a href={hrefFor(p.id)}>{p.label}</a></li>)}
            </ul>
          </div>
          <div>
            <h2>Elsewhere</h2>
            <ul>
              <li><a href="/ccair/pathways/">Cyber Career Finder</a></li>
              <li><a href="/ccair/students/">Student guide</a></li>
              <li><a href="https://bampel.com/">bampel.com</a></li>
              <li><a href="https://bampel.com/publications/">Full publication list</a></li>
              <li><a href="https://robinson.gsu.edu/research-centers/crisp/">CRISP at Robinson</a></li>
            </ul>
          </div>
        </div>
        <p className="footer-note">© {new Date().getFullYear()} Center for CyberAI Research, Georgia State University.</p>
      </div>
    </footer>
  );
}

window.CCAIR = window.CCAIR || {};
const CCAIR_COMPONENTS = {
  REDUCE_MOTION, CAN_OBSERVE, SCROLL_TIMELINE, NAV_PAGES, hrefFor, Icon, Arrow, useInView, Reveal, CountUp, useScrollFrame, CCAIRNav, PageHead, Section, Card, LinkCard,
  Tag, Status, Authors, PublicationItem, PersonCard, SegmentedControl, FinderFeature, CCAIRFooter, initialsOf,
};
Object.assign(window.CCAIR, CCAIR_COMPONENTS);
Object.assign(window, CCAIR_COMPONENTS);
