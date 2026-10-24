/* CCAIR Components — shared UI primitives. Styling lives in assets/ccair.css. */
const { useState, useEffect, useRef } = React;

// Follows the OS setting live: the other files read the global (window.REDUCE_MOTION), which is kept in step here.
const REDUCE_MOTION_MQ = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
let REDUCE_MOTION = !!(REDUCE_MOTION_MQ && REDUCE_MOTION_MQ.matches);
if (REDUCE_MOTION_MQ && REDUCE_MOTION_MQ.addEventListener) {
  REDUCE_MOTION_MQ.addEventListener('change', (e) => { REDUCE_MOTION = e.matches; window.REDUCE_MOTION = e.matches; window.CCAIR.REDUCE_MOTION = e.matches; });
}

const NAV_PAGES = [
  { id: 'research', label: 'Research' },
  { id: 'publications', label: 'Publications' },
  { id: 'people', label: 'People' },
  { id: 'resources', label: 'Resources' },
  { id: 'materials', label: 'Materials' },
  { id: 'about', label: 'About' },
  { id: 'contact', label: 'Contact' },
];

const hrefFor = (page) => (page === 'home' ? '/ccair/' : '/ccair/' + page + '/');

/* Brand. GSU rules (commkit.gsu.edu): a center may not create its own logo; it uses the college sub-brand lockup with a
   unit wordmark, supplied by Public Relations & Marketing Communications. Until those files exist the site shows a
   plain-text wordmark. When assets/brand/official/lockup.json is switched on (see the README there), OfficialLockup
   shows the supplied files in its place, unaltered; with "enabled": false it renders nothing. */
const LOCKUP_DIR = '/ccair/assets/brand/official/';
let lockupConfig = null;
function useLockup() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    let live = true;
    // The config is a switch for files that do not exist yet ("enabled": false), so it is read when the browser is idle
    // instead of competing with the data files for the first paint.
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
    const handle = idle(() => {
      lockupConfig = lockupConfig || fetch(LOCKUP_DIR + 'lockup.json').then((r) => (r.ok ? r.json() : null)).catch(() => null);
      lockupConfig.then((c) => { if (live && c && c.enabled && c.files && c.files.light) setCfg(c); });
    });
    return () => { live = false; if (window.cancelIdleCallback && window.requestIdleCallback) window.cancelIdleCallback(handle); };
  }, []);
  return cfg;
}
// onDark: the slot sits on a dark band (the footer), so it uses the reversed file.
function OfficialLockup({ cfg, onDark }) {
  if (!cfg) return null;
  const f = cfg.files;
  return (
    <picture className="lockup">
      {!onDark && f.reversed && <source srcSet={LOCKUP_DIR + f.reversed} media="(prefers-color-scheme: dark)" />}
      <img src={LOCKUP_DIR + (onDark && f.reversed ? f.reversed : f.light)} alt={cfg.alt} width={cfg.width} height={cfg.height} />
    </picture>
  );
}
function Wordmark() {
  return (
    <span className="wordmark">Center for CyberAI Research
      <small><span className="wm-gsu">Georgia State University</span><span className="wm-college"> · J. Mack Robinson College of Business</span></small>
    </span>
  );
}
function Brand({ onDark }) {
  const cfg = useLockup();
  return (
    <a className="brand" href="/ccair/" aria-label={cfg ? cfg.alt + ', home' : undefined}>
      {cfg ? <OfficialLockup cfg={cfg} onDark={onDark} /> : <Wordmark />}
    </a>
  );
}

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

// Counts a statistic up from zero the first time it is seen. The real number is rendered first, so a snapshot taken
// before the count runs (a crawler, a background tab) shows it; it drops to zero only in the count's first frame. Screen
// readers get the number from the hidden copy; the visible digits are padded with figure spaces to the final width so
// the count shifts no layout.
function CountUp({ value }) {
  const ref = useRef(null);
  const n = Number(value) || 0;
  const [shown, setShown] = useState(n);
  useEffect(() => {
    if (!revealWatcher || REDUCE_MOTION || n <= 1) { setShown(n); return; }
    let raf = 0;
    const stop = revealWatcher.watch(ref.current, (delay) => {
      if (REDUCE_MOTION) { setShown(n); return; }
      // The first frame drops the number to zero; where frames never run (a background tab, a snapshot) it stays put.
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
        <Brand />
        <ul className="nav-links">
          {NAV_PAGES.map((p) => (
            <li key={p.id}><a href={hrefFor(p.id)} aria-current={currentPage === p.id ? 'page' : undefined}>{p.label}</a></li>
          ))}
        </ul>
        <a className="btn btn-primary btn-sm nav-cta" href="/ccair/pathways/">Career Finder</a>
        <button ref={btnRef} type="button" className="menu-btn" onClick={() => setOpen(!open)}
          aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls={open ? 'ccair-menu' : undefined}>
          <Icon name={open ? 'close' : 'menu'} />
        </button>
      </nav>
      <div className="scroll-progress" ref={barRef} aria-hidden="true"></div>
      {open && <div className="sheet-scrim" onClick={() => setOpen(false)} aria-hidden="true"></div>}
      {open && (
        <div id="ccair-menu" className="sheet" ref={sheetRef} onClick={(e) => { if (e.target.closest('a')) setOpen(false); }}>
          <ul>
            <li><a href="/ccair/" aria-current={currentPage === 'home' ? 'page' : undefined}>Home</a></li>
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

// photo: a slot in data/photos.json. When it holds a photo, the heading sits on it the way the home hero does (Georgia
// State Blue scrim, white text, credit in the corner); an empty slot gives the plain heading.
function PageHead({ eyebrow, title, lede, photo: slot, children }) {
  const photo = usePhoto(slot);
  const head = (
    <>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {lede && <p className="lede">{lede}</p>}
      {children}
    </>
  );
  if (!photo) return <header className="page-head wrap">{head}</header>;
  return (
    <header className="photo-hero page-hero">
      <div className="hero-stage">
        <div className="hero-photo"><Picture photo={photo} sizes="100vw" priority decorative /></div>
        <div className="page-head wrap">{head}</div>
        <p className="photo-credit hero-credit"><PhotoCredit photo={photo} /></p>
      </div>
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

const STATUS_COLOR = { 'Released': 'var(--accent-2)', 'Active': 'var(--accent-2)', 'Available': 'var(--accent-2)', 'In Development': 'var(--steel)', 'Coming 2026': 'var(--accent)', 'Planning': 'var(--muted)' };

function Status({ status }) {
  return <span className="status" style={{ '--status': STATUS_COLOR[status] || 'var(--muted)' }}>{status}</span>;
}

// Bold the center director's name in an author list ("Ampel, B.M." or "B. Ampel").
function Authors({ text }) {
  if (!text) return null;
  const parts = String(text).split(/(Ampel, B\.\s?M\.|B\.\s?M?\.? ?Ampel)/);
  return <p className="authors">{parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p))}</p>;
}

// Must match normTitle in scripts/build-ccair.js, which writes data/paper-pages.json.
const normTitle = (s) => String(s).replace(/\bML\b/g, 'Machine Learning').replace(/\bAI\b/g, 'Artificial Intelligence').toLowerCase().replace(/[^a-z0-9]/g, '');

// A "PDF" link must open a PDF. Publisher landing pages (misq.umn.edu, tandfonline, dl.acm.org/doi/..., ieeexplore,
// AIS eLibrary article pages, hdl.handle.net, arxiv.org/abs, workshop sites) are labelled "Paper" instead.
const isPdfUrl = (u) => /\.pdf(?:$|[?#])/i.test(u) || /arxiv\.org\/pdf\//i.test(u) || /par\.nsf\.gov\/servlets\/purl\//i.test(u)
  || /aisel\.aisnet\.org\/cgi\/viewcontent\.cgi/i.test(u) || /dl\.acm\.org\/doi\/pdf\//i.test(u);

// paperPages comes from the page, so a row does not subscribe to the whole data context and memo can skip unchanged rows.
const PublicationItem = React.memo(function PublicationItem({ title, authors, venue, year, type, doi, pdf, paperPages = {} }) {
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
});

function initialsOf(name) {
  return String(name || '').split(/\s+/).filter(Boolean).map((w) => w[0]).filter((c) => /[A-Z]/.test(c)).join('').slice(0, 2);
}

/* ---------- People ----------
   A headshot from data/people.json ("photo": {"slug", "source", "credit", "alt"}) is a circular <picture> of files in
   assets/people/ named <slug>-<160|320>.<avif|webp|jpg> (square, face-centered crops). Without a photo the avatar shows
   the person's initials, hidden from assistive technology because the name is the heading beside it. */
const PEOPLE_DIR = '/ccair/assets/people/';
const AVATAR_PX = { md: 64, lg: 144 };
const peopleSrcset = (slug, ext) => `${PEOPLE_DIR}${slug}-160.${ext} 160w, ${PEOPLE_DIR}${slug}-320.${ext} 320w`;
function Avatar({ name, photo, size = 'md', warm }) {
  const px = AVATAR_PX[size] || AVATAR_PX.md;
  if (photo && photo.slug) {
    const sizes = px + 'px';
    return (
      <picture className={'avatar avatar-' + size + ' avatar-photo'}>
        <source type="image/avif" srcSet={peopleSrcset(photo.slug, 'avif')} sizes={sizes} />
        <source type="image/webp" srcSet={peopleSrcset(photo.slug, 'webp')} sizes={sizes} />
        <img src={`${PEOPLE_DIR}${photo.slug}-160.jpg`} srcSet={peopleSrcset(photo.slug, 'jpg')} sizes={sizes}
          width={px} height={px} alt={photo.alt || name} loading="lazy" decoding="async" />
      </picture>
    );
  }
  return <div className={'avatar avatar-' + size + (warm ? ' avatar-warm' : '')} aria-hidden="true">{initialsOf(name)}</div>;
}

// "Headshots courtesy of ..." for the About page, naming each institution once and linking every profile photo's source.
function PeoplePhotoCredits() {
  const { people } = useData();
  const list = [...(people.affiliates || []), ...(people.students || []), ...(people.mentees || [])].filter((p) => p.photo && p.photo.source);
  if (!list.length) return null;
  const inst = [...new Set(list.map((p) => p.photo.credit).filter(Boolean))];
  const joined = inst.length < 3 ? inst.join(' and ') : inst.slice(0, -1).join(', ') + ', and ' + inst[inst.length - 1];
  return (
    <div className="people-credits">
      <p>Headshots courtesy of {joined}, used with permission. The director's headshot is his own.</p>
      <ul className="photo-credits">
        {list.map((p) => (
          <li key={p.name}><a href={p.photo.source}>{p.name}</a>, {p.photo.credit}.</li>
        ))}
      </ul>
    </div>
  );
}

function PersonCard({ name, role, meta, note, warm, photo, headingLevel = 3 }) {
  const H = 'h' + headingLevel;
  return (
    <Card className="person">
      <Avatar name={name} photo={photo} warm={warm} />
      <div>
        <H>{name}</H>
        {role && <div className="role">{role}</div>}
        {meta && <div className="meta">{meta}</div>}
        {note && <p>{note}</p>}
      </div>
    </Card>
  );
}

function SegmentedControl({ label, options, value, onChange, className }) {
  return (
    <div className={'segmented' + (className ? ' ' + className : '')} role="group" aria-label={label}>
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
          14 cybersecurity roles by your interests and shows the realistic first job, starter certifications, free practice,
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

/* ---------- Photos ----------
   data/photos.json lists every photo and the slot it fills ("home-hero", "research-band", ...). Files live in
   assets/photos/ as <base>-<width>.<avif|webp|jpg>. Swapping a slot for a GSU Digital Asset Library photo is an edit to
   that file (see assets/photos/README.md); nothing here names a picture. The same markup is written for the static
   pages by photoHtml in scripts/ccair-static.mjs. */
const PHOTO_DIR = '/ccair/assets/photos/';
const photoSrcset = (base, widths, ext) => widths.map((w) => `${PHOTO_DIR}${base}-${w}.${ext} ${w}w`).join(', ');
function usePhoto(slot) {
  const { photos } = useData();
  return ((photos && photos.photos) || []).find((p) => p.slot === slot) || null;
}
// priority: the hero image, fetched eagerly and first; everything else loads lazily.
// decorative: a background under a scrim, where the heading carries the meaning (alt=""); the visible credit and the
// About page credits keep the description.
function Picture({ photo, sizes, priority, decorative }) {
  const m = photo.mobile;
  const fb = photo.fallbackWidths || photo.widths;
  const style = { '--focal': photo.focal || '50% 50%' };
  if (m) style['--focal-m'] = m.focal || photo.focal || '50% 50%';
  return (
    <picture>
      {m && <source type="image/avif" media={m.media} srcSet={photoSrcset(m.base, m.widths, 'avif')} sizes="100vw" width={m.width} height={m.height} />}
      {m && <source type="image/webp" media={m.media} srcSet={photoSrcset(m.base, m.widths, 'webp')} sizes="100vw" width={m.width} height={m.height} />}
      {m && <source media={m.media} srcSet={photoSrcset(m.base, m.fallbackWidths || m.widths, 'jpg')} sizes="100vw" width={m.width} height={m.height} />}
      <source type="image/avif" srcSet={photoSrcset(photo.base, photo.widths, 'avif')} sizes={sizes} />
      <source type="image/webp" srcSet={photoSrcset(photo.base, photo.widths, 'webp')} sizes={sizes} />
      <img src={`${PHOTO_DIR}${photo.base}-${fb[fb.length - 1]}.jpg`} srcSet={photoSrcset(photo.base, fb, 'jpg')} sizes={sizes}
        width={photo.width} height={photo.height} alt={decorative ? '' : photo.alt} style={style} decoding="async"
        loading={priority ? 'eager' : 'lazy'} fetchpriority={priority ? 'high' : undefined} />
    </picture>
  );
}
// Short visible credit: "Photo: Author / License", the author linking to the source page and the license to its deed.
function PhotoCredit({ photo }) {
  const c = photo.credit || {};
  const who = c.sourceUrl ? <a href={c.sourceUrl}>{c.author}</a> : c.author;
  return <>Photo: {who}{c.license && <> / {c.licenseUrl ? <a href={c.licenseUrl} rel="license">{c.license}</a> : c.license}</>}</>;
}
// Full attribution for every photo (title, author, license, source, changes), for the About page.
function PhotoCredits() {
  const { photos } = useData();
  const list = (photos && photos.photos) || [];
  if (!list.length) return null;
  return (
    <ul className="photo-credits">
      {list.map((p) => {
        const c = p.credit || {};
        return (
          <li key={p.id}>
            {c.sourceUrl ? <a href={c.sourceUrl}>{c.title || p.id}</a> : (c.title || p.id)}
            {c.author && <> by {c.author}</>}
            {c.license && <>, {c.licenseUrl ? <a href={c.licenseUrl} rel="license">{c.license}</a> : c.license}</>}
            {c.source && <>, via {c.source}</>}.
            {c.changes && <> Changes: {c.changes}.</>}
          </li>
        );
      })}
    </ul>
  );
}

/* Friends of CCAIR (About page), from data/friends.json. Each logo sits on a white tile in both color schemes, so a
   dark-ink logo stays legible on the dark theme without altering the logo. Logos are shown exactly as the organization
   publishes them (scaled to a common height in CSS); an organization with no logo of its own gets a plain text wordmark. */
const FRIENDS_DIR = '/ccair/assets/friends/';

function FriendTile({ f }) {
  return (
    <li className="friend">
      <a className="friend-tile" href={f.url} target="_blank" rel="noopener">
        {f.logo ? (
          <img src={FRIENDS_DIR + f.logo.file} width={f.logo.width} height={f.logo.height} alt={f.logo.alt} loading="lazy" decoding="async" />
        ) : (
          <>
            <span className="friend-wordmark" aria-hidden="true">
              <span className="friend-wm-name">{f.wordmark.name}</span>
              <span className="friend-wm-sub">{f.wordmark.sub}</span>
            </span>
            <span className="sr-only">{f.name}</span>
          </>
        )}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
      {f.description && <p>{f.description}</p>}
    </li>
  );
}

function FriendsGrid() {
  const { friends } = useData();
  const list = (friends && friends.friends) || [];
  if (!list.length) return null;
  return <Reveal as="ul" className="friends">{list.map((f) => <FriendTile key={f.id} f={f} />)}</Reveal>;
}

function FriendsLogoCredits() {
  const { friends } = useData();
  const list = ((friends && friends.friends) || []).filter((f) => f.logo);
  return (
    <div className="people-credits">
      <p>Logos are trademarks of their respective organizations and are used to identify collaborators.</p>
      {list.length > 0 && (
        <ul className="photo-credits">
          {list.map((f) => <li key={f.id}>{f.logo.alt}, from <a href={f.source}>{f.source.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</a> (retrieved {f.retrieved}).</li>)}
        </ul>
      )}
    </div>
  );
}

function CCAIRFooter() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-inner">
          <div>
            <Brand onDark />
            <address className="contact-lines">
              J. Mack Robinson College of Business, Georgia State University<br />
              55 Park Place NE, Atlanta, GA 30303<br />
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
  REDUCE_MOTION, CAN_OBSERVE, SCROLL_TIMELINE, NAV_PAGES, hrefFor, Icon, Arrow, useInView, Reveal, CountUp, useScrollFrame, CCAIRNav, Brand, Wordmark, OfficialLockup, PageHead, Section, Card, LinkCard,
  Tag, Status, Authors, PublicationItem, PersonCard, SegmentedControl, FinderFeature, CCAIRFooter, initialsOf,
  usePhoto, Picture, PhotoCredit, PhotoCredits, Avatar, PeoplePhotoCredits, FriendsGrid, FriendsLogoCredits,
};
Object.assign(window.CCAIR, CCAIR_COMPONENTS);
Object.assign(window, CCAIR_COMPONENTS);
