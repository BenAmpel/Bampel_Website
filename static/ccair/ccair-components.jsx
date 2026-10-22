/* CCAIR Components — shared UI primitives. Styling lives in assets/ccair.css. */
const { useState, useEffect, useRef } = React;

const REDUCE_MOTION = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const NAV_PAGES = [
  { id: 'research', label: 'Research' },
  { id: 'publications', label: 'Publications' },
  { id: 'people', label: 'People' },
  { id: 'resources', label: 'Resources' },
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

function useInView(threshold = 0.12) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    if (!('IntersectionObserver' in window)) { setVisible(true); return; }
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold, rootMargin: '0px 0px -40px 0px' });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

// Fades its content up once it scrolls into view (fade only under reduced motion, see CSS).
function Reveal({ children, as = 'div', className = '', ...rest }) {
  const [ref, visible] = useInView();
  const Tag = as;
  return <Tag ref={ref} className={'reveal' + (visible ? ' is-in' : '') + (className ? ' ' + className : '')} {...rest}>{children}</Tag>;
}

function CCAIRNav({ currentPage }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const sheetRef = useRef(null);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 4);
    fn();
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => { setOpen(false); }, [currentPage]);

  // While the sheet is open: Escape closes it, focus moves into it, and the page behind does not scroll.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); btnRef.current && btnRef.current.focus(); } };
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
          <img src="uploads/ccair-mark.png" alt="" width="32" height="32" />
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
      {open && <div className="sheet-scrim" onClick={() => setOpen(false)} aria-hidden="true"></div>}
      {open && (
        <div id="ccair-menu" className="sheet" ref={sheetRef}>
          <ul>
            <li><a href="#/" aria-current={currentPage === 'home' ? 'page' : undefined}>Home</a></li>
            {NAV_PAGES.map((p) => (
              <li key={p.id}><a href={hrefFor(p.id)} aria-current={currentPage === p.id ? 'page' : undefined}>{p.label}</a></li>
            ))}
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

function LinkCard({ href, title, children, more = 'Learn more' }) {
  return (
    <a className="card card-link" href={href}>
      <h3>{title}</h3>
      {children}
      {more && <span className="more">{more} <span aria-hidden="true">→</span></span>}
    </a>
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

function PublicationItem({ title, authors, venue, year, type, doi, pdf }) {
  const award = / — (Best Paper Award)$/.exec(venue || '');
  const venueText = award ? venue.replace(award[0], '') : venue;
  return (
    <li className="pub">
      <h3>{title}</h3>
      <Authors text={authors} />
      <p className="venue">{venueText}{year ? `, ${year}` : ''}{award && <> · <span className="award">{award[1]}</span></>}</p>
      <div className="side">
        <Tag type={type} />
        {(doi || pdf) && (
          <span className="links">
            {doi && <a href={'https://doi.org/' + doi} aria-label={`DOI for ${title}`}>DOI</a>}
            {pdf && <a href={pdf} aria-label={`PDF of ${title}`}>PDF</a>}
          </span>
        )}
      </div>
    </li>
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

function FinderFeature({ headingLevel = 2 }) {
  const H = 'h' + headingLevel;
  return (
    <Reveal className="feature">
      <div>
        <div className="feature-meta"><span className="tag tag-workshop">Free</span><span className="tag">5 minutes</span><span className="tag">Nothing stored</span></div>
        <H>Not sure where you fit in cybersecurity?</H>
        <p>The Cyber Career Pathway Finder is a plain-language quiz built on the NIST NICE Workforce Framework. It ranks
          14 cybersecurity roles by your interests and shows the realistic first job, starter certifications, free practice
          and US pay for each.</p>
      </div>
      <div className="actions">
        <a className="btn btn-primary" href="/ccair/pathways/">Take the finder <Arrow /></a>
        <a className="btn btn-secondary" href="/ccair/pathways/#roles">Browse the 14 roles</a>
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
              <img src="uploads/ccair-mark.png" alt="" width="32" height="32" />
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
  REDUCE_MOTION, NAV_PAGES, hrefFor, Icon, Arrow, useInView, Reveal, CCAIRNav, PageHead, Section, Card, LinkCard,
  Tag, Status, Authors, PublicationItem, PersonCard, SegmentedControl, FinderFeature, CCAIRFooter, initialsOf,
};
Object.assign(window.CCAIR, CCAIR_COMPONENTS);
Object.assign(window, CCAIR_COMPONENTS);
