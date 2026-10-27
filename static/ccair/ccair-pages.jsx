/* CCAIR Pages — all page content */
const { useState: usePageState, useMemo: usePageMemo, useEffect: usePageEffect, useDeferredValue: usePageDeferred } = React;

const RESEARCH_PORTFOLIO = [
  { tier: 'Core', risk: 'Established program', color: 'var(--accent-2)', areas: [
    { name: 'Proactive Cyber Threat Intelligence', desc: 'Mining pre-attack signals from hacker forums, paste sites, and adversarial ecosystems' },
    { name: 'Dark Web Analytics', desc: 'Longitudinal analysis of underground communities, jargon evolution, and knowledge diffusion' },
    { name: 'Human–AI Collaboration', desc: 'How analysts and AI systems co-produce actionable intelligence in security workflows' },
  ]},
  { tier: 'Strategic', risk: 'Active development', color: 'var(--accent)', areas: [
    { name: 'Agentic Defense Systems', desc: 'Autonomous AI agents that detect, adapt to, and mitigate adversarial behavior in real time' },
    { name: 'LLM Security & Robustness', desc: 'Adversarial attacks, jailbreaking, alignment evaluation, and defense for large language models' },
    { name: 'Multimodal Threat Modeling', desc: 'Integrating text, code, audio, and infrastructure signals for cross-modal threat inference' },
  ]},
  { tier: 'Exploratory', risk: 'Early-stage exploration', color: 'var(--steel)', areas: [
    { name: 'Attacker–AI Co-evolution', desc: 'Modeling how adversaries adapt when defenders deploy AI-enabled countermeasures' },
    { name: 'Emergent Misuse of Autonomous Systems', desc: 'Anticipating novel attack surfaces created by widespread AI agent deployment' },
  ]},
];

const CONSTRUCTS = [
  { name: 'Signal Legibility & Deception', desc: 'How pre-attack signals become (or remain) interpretable under adversarial signaling and intentional obfuscation.' },
  { name: 'Intent Opacity & Ambiguity Limits', desc: 'Boundary conditions under which adversarial intent remains irreducibly ambiguous, and when additional sensing yields diminishing returns.' },
  { name: 'Human–AI Sensemaking', desc: 'How analysts and AI systems co-produce (or fail to co-produce) actionable intelligence, including drift from deception and miscalibrated trust.' },
];

const PIPELINE = [
  { level: "K–12", description: "Early exposure to CyberAI concepts through local school partnerships and outreach programs.", programs: ["School Outreach", "CyberAI Literacy", "Community Partnerships"] },
  { level: "Undergraduate", description: "Course-embedded research experiences and summer cohorts with sanitized center data.", programs: ["Course-Embedded Research", "CyberAI Fundamentals", "Summer Research Cohorts"] },
  { level: "Master's", description: "Bridge between instruction and research: students contribute to data curation and benchmarking.", programs: ["CIS 8684: CTI", "CIS 8080: Security", "CyberCorps SFS (via CRISP)"] },
  { level: "Doctoral", description: "Ph.D. students lead CCAIR research with dissertations contributing durable center artifacts.", programs: ["Dissertation Research", "Center Publications", "Conference Leadership"] },
];

// The three research pillars, each with the published systems that put it into practice.
const PILLARS = [
  { n: '01', title: 'Adversarial Signal Emergence', desc: 'How malicious intent, capabilities, and tactics emerge across heterogeneous data sources prior to exploitation.',
    points: ['How attacker knowledge diffuses over time', 'Slang and jargon evolution to evade detection', 'Experimental exploits maturing into operational tools', 'Cross-modal signal integration for intent inference'],
    systems: [
      { name: 'TRACE', href: 'https://bampel.com/conference_publication/vendor-conditioned-contrastive-learning-for-predicting-organizational-/' },
      { name: 'PHI-NEXT', href: 'https://bampel.com/journal_publication/phi-hacker-jmis/' },
      { name: 'HackerSignal', href: 'https://bampel.com/conference_publication/hackersignal-a-large-scale-multi-source-dataset-linking-hacker-communi/' },
    ] },
  { n: '02', title: 'Ambiguity-Aware Intelligence', desc: 'AI systems that operate under adversarial uncertainty: reasoning about ambiguity, deception, and partial information.',
    points: ['Robust ML under adversarial label noise', 'Adversarially resilient architectures', 'Agentic systems with adaptive decision-making', 'Treating uncertainty as a first-class design constraint'],
    systems: [
      { name: 'Adaptive Phishing GAN', href: 'https://bampel.com/conference_publication/adaptive-phishing-gan-cars-2026/' },
      { name: 'Four-Signal Fusion', href: 'https://bampel.com/conference_publication/four-signal-phishing-cars-2026/' },
      { name: 'AVA', href: 'https://bampel.com/conference_publication/vuln-variant-cars-2026/' },
    ] },
  { n: '03', title: 'Human–AI Collaboration', desc: 'How humans and AI jointly interpret, validate, and act on adversarial signals in realistic security workflows.',
    points: ['Joint interpretation of adversarial signals', 'Trust calibration between analysts and AI', 'Workflow integration for CTI production', 'Organizational context in security decisions'],
    systems: [
      { name: 'AI-Assisted Training', href: 'https://bampel.com/conference_publication/performance-transfer-cars-2026/' },
      { name: 'Prosody Training', href: 'https://bampel.com/conference_publication/prosody-vishing-icis-2026/' },
      { name: 'HackerVote', href: 'https://bampel.com/journal_publication/hacker-communities-isf/' },
    ] },
];

const JOIN_AREAS = [
  { area: 'LLM Security & Robustness', desc: 'Adversarial attacks, jailbreaking, alignment for security applications' },
  { area: 'Cyber Threat Intelligence', desc: 'Automated collection and analysis of threat data from dark web and hacker communities' },
  { area: 'Phishing & Social Engineering', desc: 'AI-driven detection and generation analysis of phishing campaigns' },
  { area: 'Proactive Threat Hunting', desc: 'Predictive models and early-warning systems for emerging cyber threats' },
  { area: 'Human–AI Collaboration', desc: 'Designing AI tools that augment analyst decision-making in SOC environments' },
  { area: 'Generative AI for Security', desc: 'LLMs for vulnerability analysis, code auditing, and threat modeling' },
];

const byYearDesc = (a, b) => (b.year || 0) - (a.year || 0);

// News dates are display text ("Aug 2026", "Spring 2026", "2026"); <time> gets the machine-readable month or year.
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function newsDatetime(text) {
  const m = /(?:([A-Za-z]{3})[A-Za-z]*\.?\s+)?(\d{4})/.exec(text || '');
  if (!m) return undefined;
  const mi = m[1] ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
  return mi >= 0 ? `${m[2]}-${String(mi + 1).padStart(2, '0')}` : m[2];
}

// Hero depth: two soft color fields drift at different rates as the hero scrolls away and the headline block lags
// slightly behind the page, so the hero reads as layered. Where scroll-driven CSS animations exist the stylesheet does
// this on the compositor; otherwise one rAF write per frame, only while the hero is on screen. Off under reduced motion.
function HeroGlow({ heroRef, innerRef }) {
  const aRef = React.useRef(null), bRef = React.useRef(null);
  const box = React.useRef({ top: 0, h: 1 });
  React.useEffect(() => {
    const measure = () => { const h = heroRef.current; if (h) box.current = { top: h.offsetTop, h: h.offsetHeight || 1 }; };
    measure();
    window.addEventListener('resize', measure, { passive: true });
    return () => window.removeEventListener('resize', measure);
  }, []);
  useScrollFrame((y) => {
    const { top, h } = box.current;
    const p = Math.max(0, Math.min(1, (y - top + 60) / h));
    if (p >= 1 && box.current.done) return;
    box.current.done = p >= 1;
    if (aRef.current) aRef.current.style.transform = `translate3d(0, ${(p * 26).toFixed(2)}vh, 0) scale(${(1 + p * 0.08).toFixed(4)})`;
    if (bRef.current) bRef.current.style.transform = `translate3d(${(p * -10).toFixed(2)}vw, ${(p * 12).toFixed(2)}vh, 0)`;
    if (innerRef.current) innerRef.current.style.transform = `translate3d(0, ${(p * 90).toFixed(1)}px, 0)`;
  }, !REDUCE_MOTION && !SCROLL_TIMELINE);
  return <div className="hero-glow" aria-hidden="true"><i ref={aRef}></i><i ref={bRef}></i></div>;
}
const STAT_STYLE = { display: 'flex', flexDirection: 'column-reverse', justifyContent: 'flex-end' };

function HomePage() {
  const { publications, people, news, courses, paperPages } = useData();
  const phdCount = (people.students || []).length + (people.mentees || []).length;
  const bestPapers = publications.filter((p) => / — Best Paper Award$/.test(p.venue || '')).length;
  const recent = publications.filter((p) => p.type === 'journal').slice().sort(byYearDesc).slice(0, 3);
  const heroRef = React.useRef(null), innerRef = React.useRef(null);
  const photo = usePhoto('home-hero');
  const photoPending = useDataStatus('photos') === 'loading';

  const heroText = (
    <div className="hero-inner" ref={innerRef}>
      <p className="hero-affil">Georgia State University · J. Mack Robinson College of Business</p>
      <h1 id="hero-title">Center for <em>CyberAI</em> Research</h1>
      <p className="lede">We study how intelligent systems can spot malicious behavior before it turns into an attack,
        and we help people and organizations act on what those systems find.</p>
      <div className="hero-cta">
        <a className="btn btn-primary" href="/ccair/research/">Explore our research <Arrow /></a>
        <a className="btn btn-secondary" href="/ccair/pathways/">Find your cyber career path</a>
      </div>
    </div>
  );
  const stats = (
    <DataSection needs={['publications', 'people', 'courses']} what="the center's numbers"><dl className="stats">
      {[[publications.length, 'Publications'], [phdCount, 'Ph.D. students mentored'], [bestPapers, 'Best paper awards'], [courses.length, 'Courses taught']].map(([n, label]) => (
        // dt before dd for assistive tech; column-reverse keeps the number on top.
        <div key={label} className="stat" style={STAT_STYLE}><dt><span>{label}</span></dt><dd><b><CountUp value={n} /></b></dd></div>
      ))}
    </dl></DataSection>
  );

  return (
    <div className="page">
      {photo || photoPending ? (
        // Photo hero: the headline sits on the photo under a Georgia State Blue scrim (white text, AA over the darkest
        // and lightest parts of the image); the stats follow on the page background.
        <section className="hero photo-hero" aria-labelledby="hero-title" ref={heroRef}>
          <div className="hero-stage">
            <div className="hero-photo">{photo && <Picture photo={photo} sizes="100vw" priority decorative />}</div>
            <div className="wrap">{heroText}</div>
            {photo && <p className="photo-credit hero-credit"><PhotoCredit photo={photo} /></p>}
          </div>
          <div className="wrap">{stats}</div>
        </section>
      ) : (
        <section className="hero" aria-labelledby="hero-title" ref={heroRef}>
          <HeroGlow heroRef={heroRef} innerRef={innerRef} />
          <div className="wrap">{heroText}{stats}</div>
        </section>
      )}

      <Section id="pillars" eyebrow="What we study" title="Three questions guide our work"
        intro="CCAIR shifts security from reacting to attacks toward anticipating them. Each project maps to one of these research pillars.">
        <div className="grid grid-3">
          {PILLARS.map((p) => (
            <Reveal key={p.n} className="card">
              <span className="card-num">{p.n}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
              <div className="chips" role="group" aria-label={`Systems built under ${p.title}`}>
                {p.systems.map((s) => <a key={s.name} className="chip" href={s.href}>{s.name}</a>)}
              </div>
            </Reveal>
          ))}
        </div>
        <div className="section-foot"><a className="btn btn-plain" href="/ccair/research/">How the research agenda fits together <Arrow /></a></div>
      </Section>

      <Section id="recent" alt eyebrow="Recent work" title="Selected journal articles">
        <DataSection needs={['publications']} what="recent articles">
          <Reveal as="ul" className="pub-list card" style={{ paddingBlock: 4 }}>
            {recent.map((p) => <PublicationItem key={p.title} {...p} paperPages={paperPages} />)}
          </Reveal>
          <div className="section-foot"><a className="btn btn-secondary" href="/ccair/publications/">All {publications.length} publications <Arrow /></a></div>
        </DataSection>
      </Section>

      <Section id="news" eyebrow="News" title="What's new at the center">
        <DataSection needs={['news']} what="news"><ul className="news">
          {news.map((n) => (
            <Reveal as="li" key={n.date + n.title}>
              <time dateTime={newsDatetime(n.date)}>{n.date}</time>
              <span className="title">{n.title}</span>
              <span className="tag">{n.tag}</span>
            </Reveal>
          ))}
        </ul></DataSection>
      </Section>

      <Section id="students" labelledBy="students-title">
        <FinderFeature titleId="students-title" />
      </Section>

      <Section id="explore" eyebrow="Get to know us" title="Find your way around">
        <div className="grid grid-3">
          <LinkCard href="/ccair/people/" title="People" more="Meet the team"><p>The director, graduate researchers, and faculty affiliates behind the center.</p></LinkCard>
          <LinkCard href="/ccair/resources/" title="Resources" more="See resources"><p>Datasets, benchmarks, tools, and free career guides for students.</p></LinkCard>
          <LinkCard href="/ccair/contact/" title="Work with us" more="Get in touch"><p>Prospective students, collaborators, and partners: here is how to reach us.</p></LinkCard>
        </div>
      </Section>
    </div>
  );
}

// How the three primitives connect, drawn as one flow: signals emerge, AI reasons over them under ambiguity, analysts and
// AI decide together. The motion is decoration only (CSS, off under prefers-reduced-motion); the caption says the same.
const PFLOW_DOTS = [[14, 20], [36, 10], [58, 26], [22, 44], [46, 50], [72, 14], [82, 40], [30, 68], [62, 70], [10, 60], [86, 68], [52, 36]];
function PillarFlow() {
  return (
    <figure className="pflow">
      <div className="pflow-steps">
        <div className="pflow-step">
          <svg className="pflow-art" viewBox="0 0 96 84" aria-hidden="true">
            {PFLOW_DOTS.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.2" className="pflow-dot" style={{ animationDelay: `${((i * 0.37) % 2.4).toFixed(2)}s` }} />)}
          </svg>
          <span className="pflow-num">P1</span>
          <b>{PILLARS[0].title}</b>
          <span className="pflow-text">Intent and capability surface across forums, exploits, and code before an attack.</span>
        </div>
        <div className="pflow-link" aria-hidden="true"><svg viewBox="0 0 64 16"><path d="M2 8 H54" /><path className="pflow-head" d="M50 3 L58 8 L50 13" /></svg></div>
        <div className="pflow-step">
          <svg className="pflow-art" viewBox="0 0 96 84" aria-hidden="true">
            <path className="pflow-edge" d="M16 16 L48 28 M16 16 L48 52 M16 40 L48 28 M16 40 L48 52 M16 64 L48 28 M16 64 L48 52 M48 28 L80 40 M48 52 L80 40" />
            {[[16, 16], [16, 40], [16, 64], [48, 28], [48, 52]].map(([x, y], i) => <circle key={i} className="pflow-node" cx={x} cy={y} r="5" style={{ animationDelay: `${(i * 0.18).toFixed(2)}s` }} />)}
            <circle className="pflow-core" cx="80" cy="40" r="6.5" />
            <rect className="pflow-track" x="20" y="78" width="56" height="5" rx="2.5" />
            <rect className="pflow-band" x="20" y="78" width="56" height="5" rx="2.5" />
          </svg>
          <span className="pflow-num">P2</span>
          <b>{PILLARS[1].title}</b>
          <span className="pflow-text">Models weigh deception and partial information, and say how sure they are.</span>
        </div>
        <div className="pflow-link" aria-hidden="true"><svg viewBox="0 0 64 16"><path d="M2 8 H54" /><path className="pflow-head" d="M50 3 L58 8 L50 13" /></svg></div>
        <div className="pflow-step">
          <svg className="pflow-art" viewBox="0 0 96 84" aria-hidden="true">
            <circle className="pflow-person" cx="30" cy="30" r="10" />
            <path className="pflow-person" d="M12 70 C 12 54, 48 54, 48 70" />
            <rect className="pflow-box" x="56" y="22" width="30" height="30" rx="7" />
            <path className="pflow-chip" d="M71 28 C 72 34, 74 36, 80 37 C 74 38, 72 40, 71 46 C 70 40, 68 38, 62 37 C 68 36, 70 34, 71 28 Z" />
            <path className="pflow-check" d="M58 66 L66 73 L84 56" />
          </svg>
          <span className="pflow-num">P3</span>
          <b>{PILLARS[2].title}</b>
          <span className="pflow-text">Analysts and AI interpret the result together and act on it in real workflows.</span>
        </div>
      </div>
      <figcaption>Each CCAIR project advances at least one step: finding threats early, reasoning about them under uncertainty, and turning them into decisions people trust.</figcaption>
    </figure>
  );
}

function ResearchPage() {
  const { publications } = useData();
  const pubsReady = useDataStatus('publications') === 'ready';
  return (
    <div className="page">
      <PageHead eyebrow="Research" title="Anticipating attacks, not just reacting to them"
        lede="CCAIR investigates how intelligent systems can anticipate, interpret, and adapt to malicious behavior before exploitation. All center activities, proposals, and artifacts map to at least one of three research primitives."
        photo="research-band" />

      <Section id="primitives" title="Research primitives" intro="The foundational questions every project contributes to.">
        <PillarFlow />
        <div className="grid grid-3">
          {PILLARS.map((p, i) => (
            <Reveal key={p.n} className="card">
              <span className="card-num">P{i + 1}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
              <ul className="list-check">{p.points.map((pt) => <li key={pt}>{pt}</li>)}</ul>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section id="portfolio" alt title="Research portfolio" intro="CCAIR organizes research investments into three tiers based on risk and expected coherence with the center thesis.">
        <div className="grid">
          {RESEARCH_PORTFOLIO.map((tier) => (
            <Reveal key={tier.tier} className="card tier" style={{ '--tier': tier.color }}>
              <div className="tier-head"><h3>{tier.tier}</h3><span>{tier.risk}</span></div>
              <div className="tier-items">
                {tier.areas.map((a) => (
                  <div key={a.name} className="tier-item"><b>{a.name}</b><span>{a.desc}</span></div>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section id="constructs" title="Theoretical constructs" intro="Provisional constructs designed to be empirically observable, computationally operationalizable, and stable enough to accumulate evidence across projects.">
        <div className="grid grid-3">
          {CONSTRUCTS.map((c) => (
            <Reveal key={c.name} className="card"><h3>{c.name}</h3><p>{c.desc}</p></Reveal>
          ))}
        </div>
      </Section>

      <Section id="outputs" title="Center outputs" intro="Persistent, reusable artifacts that outlive individual grants.">
        <div className="grid grid-4">
          {[
            { title: 'Adversarial Intelligence Corpora', desc: 'Longitudinal datasets capturing threat signals from adversarial ecosystems' },
            { title: 'CyberAI Evaluation Benchmarks', desc: 'Task-specific benchmarks for detection, robustness, and agentic defense' },
            { title: 'Proactive CTI Systems', desc: 'Data pipelines, models, and simulation environments for security workflows' },
            { title: 'Human-Centered Frameworks', desc: 'Theory-grounded frameworks for human–AI co-production of cyber defense' },
          ].map((o) => (
            <Reveal key={o.title} className="card"><h3>{o.title}</h3><p>{o.desc}</p></Reveal>
          ))}
        </div>
        <div className="section-foot"><a className="btn btn-secondary" href="/ccair/publications/">{pubsReady ? `Read the ${publications.length} publications` : 'Read the publications'} <Arrow /></a></div>
      </Section>

      <Section id="lab" alt title="Behavioral Lab"
        intro="Browser-based studies of security decisions such as spotting phishing, judging links, and responding to suspicious calls. Each study records the answer and how the person arrived at it (timing, hesitation, where attention went), so the center can study the decision process rather than only its outcome.">
        <div className="actions">
          <a className="btn btn-primary" href="/lab/">Visit the lab <Arrow /></a>
          <a className="btn btn-secondary" href="/lab/guide/">Researcher guide</a>
        </div>
      </Section>
    </div>
  );
}

const PUB_TYPES = ['all', 'journal', 'conference', 'workshop'];
function readPubFilter() {
  const p = new URLSearchParams(window.location.search);
  const type = p.get('type');
  return { type: PUB_TYPES.includes(type) ? type : 'all', q: (p.get('q') || '').slice(0, 200) };
}

function PublicationsPage() {
  const { publications, paperPages } = useData();
  // The filter lives in the address (/ccair/publications/?type=journal&q=phishing), so a filtered list can be shared and survives a reload.
  const initial = usePageMemo(readPubFilter, []);
  const [type, setType] = usePageState(initial.type);
  const [query, setQuery] = usePageState(initial.q);
  const deferredQuery = usePageDeferred(query);
  usePageEffect(() => {
    const qs = new URLSearchParams();
    if (type !== 'all') qs.set('type', type);
    if (query.trim()) qs.set('q', query.trim());
    const s = qs.toString();
    // replaceState does not fire popstate, so this never re-routes or adds history entries.
    try { window.history.replaceState(null, '', '/ccair/publications/' + (s ? '?' + s : '')); } catch (e) { /* the filter still works without the address */ }
  }, [type, query]);

  const counts = usePageMemo(() => publications.reduce((acc, p) => { acc[p.type] = (acc[p.type] || 0) + 1; return acc; }, {}), [publications]);
  const filtered = usePageMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    return publications.filter((p) => (type === 'all' || p.type === type) &&
      (!q || [p.title, p.authors, p.venue, String(p.year)].join(' ').toLowerCase().includes(q)));
  }, [publications, type, deferredQuery]);
  const years = usePageMemo(() => {
    const groups = new Map();
    filtered.slice().sort(byYearDesc).forEach((p) => {
      const y = p.year || 'Undated';
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y).push(p);
    });
    return [...groups.entries()];
  }, [filtered]);

  // The counts drop out on phones (CSS) so the four buttons fit on one row.
  const seg = (text, n) => <>{text}<span className="seg-count"> {n}</span></>;
  const options = [
    { value: 'all', label: seg('All', publications.length) },
    { value: 'journal', label: seg('Journals', counts.journal || 0) },
    { value: 'conference', label: seg('Conferences', counts.conference || 0) },
    { value: 'workshop', label: seg('Workshops', counts.workshop || 0) },
  ];

  return (
    <div className="page">
      <PageHead eyebrow="Publications" title="Center publications"
        lede="Peer-reviewed cybersecurity research from CCAIR faculty, students, and collaborators. The complete list, including work outside security, is on bampel.com." />
      <section className="section" aria-label="Publication list">
        <div className="wrap"><DataSection needs={['publications']} what="publications">
          <div className="toolbar">
            <label className="search">
              <span className="sr-only">Search publications</span>
              <Icon name="search" />
              <input type="search" name="q" autoComplete="off" spellCheck={false} placeholder="Search titles, authors, venues…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            <SegmentedControl label="Publication type" className="pub-types" options={options} value={type} onChange={setType} />
          </div>
          <p className="sr-only" aria-live="polite">{filtered.length} publications shown</p>
          {years.length === 0 && <p className="empty">No publications match that search. Try a different word or type.</p>}
          {years.map(([year, items]) => (
            <div key={year}>
              <h2 className="pub-year">{year}</h2>
              <ul className="pub-list">{items.map((p) => <PublicationItem key={p.title} {...p} paperPages={paperPages} />)}</ul>
            </div>
          ))}
          <p className="pub-count">Showing {filtered.length} of {publications.length}. <a href="https://bampel.com/publications/">Full list on bampel.com</a></p>
        </DataSection></div>
      </section>
    </div>
  );
}

function PeoplePage() {
  const { people } = useData();
  const d = people.director;
  // A mentee with "now" (where they landed) has finished; "mentoredAt" says where Dr. Ampel mentored them.
  const current = (people.mentees || []).filter((s) => !s.now);
  const former = (people.mentees || []).filter((s) => s.now);
  return (
    <div className="page">
      <PageHead eyebrow="People" title="The people behind CCAIR"
        lede="A small, collaborative group of faculty and Ph.D. researchers working across Georgia State and partner universities."
        photo="people-band" />

      <DataSection needs={['people']} what="the people list" wrap>
      {d && <Section id="director" title="Director">
        <Reveal className="card director">
          <Avatar name={d.name} photo={d.photo} size="lg" />
          <div>
            <h3 style={{ fontSize: 'clamp(22px, 2.6vw, 28px)', lineHeight: 1.2, letterSpacing: '-0.02em', marginBottom: 0 }}>Dr. {d.name}</h3>
            <p className="role">{d.title}, {d.dept}</p>
            <p>Ph.D. in Management Information Systems, University of Arizona (2024). The dissertation, “Securing Cyberspace:
              AI-Enabled Cyber-Adversary Defense,” won the ACM SIGMIS Doctoral Dissertation Award at ICIS 2024.</p>
            <div className="chips">{(d.areas || []).map((a) => <span key={a} className="chip">{a}</span>)}</div>
            <div className="actions">
              <a className="btn btn-primary btn-sm" href={'mailto:' + d.email}>Email</a>
              <a className="btn btn-secondary btn-sm" href="https://bampel.com/">bampel.com</a>
              <a className="btn btn-secondary btn-sm" href="https://robinson.gsu.edu/profile/benjamin-ampel/">GSU profile</a>
            </div>
          </div>
        </Reveal>
      </Section>}

      <Section id="students" alt title="Graduate researchers" intro="Ph.D. students advised and mentored by CCAIR faculty at Georgia State and partner institutions.">
        <h3 className="group-label">Georgia State University</h3>
        <div className="grid grid-3">
          {(people.students || []).map((s) => <Reveal key={s.name}><PersonCard name={s.name} role={s.role} meta={[s.org, s.years].filter(Boolean).join(' · ')} photo={s.photo} headingLevel={4} /></Reveal>)}
        </div>
        <h3 className="group-label">Mentees at partner universities</h3>
        <div className="grid grid-3">
          {current.map((s) => <Reveal key={s.name}><PersonCard name={s.name} role={s.role} meta={[s.org, s.years].filter(Boolean).join(' · ')} photo={s.photo} warm headingLevel={4} /></Reveal>)}
        </div>
        {former.length > 0 && <>
          <h3 className="group-label">Former mentees</h3>
          <div className="grid grid-3">
            {former.map((s) => <Reveal key={s.name}><PersonCard name={s.name} role={s.role} photo={s.photo} warm headingLevel={4}
              meta={[s.mentoredAt && `Mentored at ${s.mentoredAt}`, s.years].filter(Boolean).join(' · ')} note={`Now at ${s.now}`} /></Reveal>)}
          </div>
        </>}
      </Section>

      <Section id="affiliates" title="Faculty affiliates" intro="Internal and external faculty contributing to shared CCAIR artifacts across research primitives.">
        <div className="grid grid-3">
          {(people.affiliates || []).map((a) => (
            <Reveal key={a.name}><PersonCard name={a.name} role={a.role} meta={a.dept} note={a.synergy} photo={a.photo} /></Reveal>
          ))}
        </div>
      </Section>
      </DataSection>

      <Section id="join" labelledBy="join-title">
        <Reveal className="feature">
          <div>
            <h2 id="join-title">Want to do research with us?</h2>
            <p>CCAIR is recruiting motivated Ph.D. and M.S. students who are curious about the intersection of AI and cybersecurity.</p>
          </div>
          <div className="actions"><a className="btn btn-primary" href="/ccair/contact/">How to join <Arrow /></a></div>
        </Reveal>
      </Section>
    </div>
  );
}

function ResourcesPage() {
  const { resources } = useData();
  const [tab, setTab] = usePageState('datasets');
  const byCategory = (cat) => resources.filter((r) => r.category === cat.slice(0, -1));
  const tabs = ['datasets', 'benchmarks', 'tools'].filter((t) => byCategory(t).length > 0).map((t) => ({ value: t, label: t[0].toUpperCase() + t.slice(1) + ' ' + byCategory(t).length }));

  return (
    <div className="page">
      <PageHead eyebrow="Resources" title="Shared tools for students and researchers"
        lede="Free career guidance for students, and research assets designed to outlive individual grants and serve the CyberAI community."
        photo="resources-band" />

      <Section id="students" title="For students" intro="Free guides for students deciding where they fit in cybersecurity.">
        <FinderFeature headingLevel={3} />
      </Section>

      <Section id="materials" labelledBy="materials-title">
        <Reveal className="feature">
          <div>
            <h2 id="materials-title">Research materials hub</h2>
            <p>Datasets, tools, and other reusable materials from CCAIR studies, with a “how to cite” line and a DOI link where they exist.</p>
          </div>
          <div className="actions"><a className="btn btn-primary" href="/ccair/materials/">Browse materials <Arrow /></a></div>
        </Reveal>
      </Section>

      <Section id="assets" alt title="Research assets" intro="Datasets and tools from CCAIR studies, shared with the CyberAI community. More resources are planned.">
        <DataSection needs={['resources']} what="research assets">
        <div className="toolbar"><SegmentedControl label="Asset type" options={tabs} value={tab} onChange={setTab} /></div>
        <div className="grid grid-3">
          {byCategory(tab).map((r) => (
            <Reveal key={r.title} className="card">
              <div style={{ marginBottom: 12 }}><Status status={r.status} /></div>
              <h3>{r.title}</h3>
              <p>{r.description}</p>
              <div className="chips">{(r.tags || []).map((t) => <span key={t} className="chip">{t}</span>)}</div>
            </Reveal>
          ))}
        </div>
        </DataSection>
      </Section>

      <Section id="governance" title="Data governance" intro="CCAIR adopts a conservative governance posture for all data activities.">
        <div className="grid grid-4">
          {[
            { title: 'Ethical Oversight', desc: 'All collection reviewed under IRB consultation. Clear separation between observational research and any facilitating activity.' },
            { title: 'Data Lifecycle', desc: 'Full provenance tracking from acquisition through publication and archiving, aligned with NIST AI Risk Management.' },
            { title: 'Controlled Access', desc: 'Sensitive corpora restricted to trained personnel with audit logging. Derived datasets preferentially shared to balance openness.' },
            { title: 'Community Sharing', desc: 'Curated subsets, benchmarks, and task formulations released under appropriate usage agreements.' },
          ].map((g) => (
            <Reveal key={g.title} className="card"><h3>{g.title}</h3><p>{g.desc}</p></Reveal>
          ))}
        </div>
      </Section>
    </div>
  );
}

const MATERIAL_KINDS = [
  { value: 'all', label: 'All' },
  { value: 'dataset', label: 'Datasets' },
  { value: 'stimuli', label: 'Stimulus libraries' },
  { value: 'instrument', label: 'Instruments' },
  { value: 'tool', label: 'Tools' },
];
const KIND_LABEL = { dataset: 'Dataset', stimuli: 'Stimulus library', instrument: 'Instrument', tool: 'Tool' };

function CopyButton({ text, label }) {
  const [done, setDone] = usePageState(false);
  const [failed, setFailed] = usePageState(false);
  const timer = React.useRef(null);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  if (!navigator.clipboard) return null;
  const flash = (ok) => {
    setDone(ok); setFailed(!ok);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setDone(false); setFailed(false); }, 1800);
  };
  // A denied clipboard (a permissions block, an insecure frame) rejects; say so instead of failing silently.
  const copy = () => navigator.clipboard.writeText(text).then(() => flash(true), () => flash(false));
  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={copy} aria-label={label}>{done ? 'Copied' : failed ? 'Copy failed' : 'Copy citation'}</button>
      <span className="sr-only" role="status">{done ? 'Citation copied' : failed ? 'Copy failed. Select the citation text and copy it by hand.' : ''}</span>
    </>
  );
}

// Internal notes ("To be added by Ben.", "Placeholder: ...", "Ben to confirm ...") stay off the public page. Ben edits
// data/ccair/materials-source.json; scripts/build-ccair.js already strips them when writing data/materials.json, so this
// filter is the second guard.
const isPlaceholderText = (t) => !t || /^\s*(to be added|placeholder)/i.test(t) || /ben to confirm/i.test(t);
const isPublicMaterial = (m) => !m.placeholder && !isPlaceholderText(m.description);

function MaterialsPage() {
  const { materials: all = [] } = useData();
  const materials = all.filter(isPublicMaterial);
  const [kind, setKind] = usePageState('all');
  const shown = materials.filter((m) => kind === 'all' || m.kind === kind);
  const countOf = (k) => (k === 'all' ? materials.length : materials.filter((m) => m.kind === k).length);
  const options = MATERIAL_KINDS.filter((k) => k.value === 'all' || countOf(k.value) > 0).map((k) => ({ ...k, label: `${k.label} ${countOf(k.value)}` }));

  return (
    <div className="page">
      <PageHead eyebrow="Research materials" title="Data, stimuli, instruments, and tools"
        lede="Materials from CCAIR studies that other researchers and educators can reuse. Entries say how to cite them and link to the version of record where one exists." />
      <section className="section" aria-labelledby="materials-list-title">
        <div className="wrap">
          <h2 id="materials-list-title" className="sr-only">Materials list</h2>
          <DataSection needs={['materials']} what="research materials">
          <div className="toolbar"><SegmentedControl label="Material type" options={options} value={kind} onChange={setKind} /></div>
          {shown.length === 0 && <p className="empty">Nothing of this type is listed yet.</p>}
          <div className="grid grid-2">
            {shown.map((m) => (
              <Reveal key={m.title} className="card material">
                <div className="material-meta">
                  <span className="tag">{KIND_LABEL[m.kind] || m.kind}</span>
                  <Status status={m.status} />
                </div>
                <h3>{m.title}</h3>
                <p>{m.description}</p>
                {!isPlaceholderText(m.cite) && (
                  <div className="material-cite">
                    <span className="material-cite-label">How to cite</span>
                    <p>{m.cite}{m.doi ? <> <a href={'https://doi.org/' + m.doi}>https://doi.org/{m.doi}</a></> : null}</p>
                  </div>
                )}
                {((m.links || []).length > 0 || m.doi || !isPlaceholderText(m.cite)) && (
                  <div className="material-actions">
                    {m.doi && <a className="btn btn-primary btn-sm" href={'https://doi.org/' + m.doi}>DOI</a>}
                    {(m.links || []).map((l) => <a key={l.href} className="btn btn-secondary btn-sm" href={l.href}>{l.label}</a>)}
                    {!isPlaceholderText(m.cite) && <CopyButton text={m.cite + (m.doi ? ' https://doi.org/' + m.doi : '')} label={`Copy citation for ${m.title}`} />}
                  </div>
                )}
              </Reveal>
            ))}
          </div>
          </DataSection>
          <p className="pub-count">Using CCAIR materials in your work? We'd like to hear about it: <a href="mailto:bampel@gsu.edu">bampel@gsu.edu</a>.</p>
        </div>
      </section>
    </div>
  );
}

function AboutPage() {
  const { funding, courses } = useData();
  return (
    <div className="page">
      <PageHead eyebrow="About" title="A home for AI-enabled cybersecurity at Georgia State"
        lede="CCAIR advances AI-enabled cybersecurity through three pillars: adversarial signal emergence, ambiguity-aware intelligence, and human–AI collaboration. We study how malicious intent surfaces across data sources before exploitation, build AI that reasons under deception and partial information, and design how analysts and AI act on adversarial signals together." />

      <Section id="pipeline" title="Talent pipeline" intro="A multi-stage pipeline spanning K–12 through doctoral research, building technically sophisticated and theoretically grounded CyberAI professionals.">
        <ol className="steps">
          {PIPELINE.map((p) => (
            <li key={p.level}>
              <Reveal className="card" style={{ height: '100%' }}>
                <h3>{p.level}</h3>
                <p>{p.description}</p>
                <div className="chips">{p.programs.map((x) => <span key={x} className="chip">{x}</span>)}</div>
              </Reveal>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="courses" alt title="Courses" intro="Security and AI courses taught by the center director at Georgia State, with student evaluation scores.">
        <DataSection needs={['courses']} what="courses"><ul className="rows">
          {courses.map((c) => (
            <Reveal as="li" key={c.code}>
              <span><span className="code">{c.code}</span><span className="t">{c.title}</span></span>
              <span className="r">{c.level} · {c.rating}</span>
            </Reveal>
          ))}
        </ul></DataSection>
      </Section>

      <Section id="support" title="Research support" intro="Grants led by center faculty at Georgia State, plus earlier support for Dr. Ampel's research.">
        <DataSection needs={['funding']} what="research support">
        {(funding.grants || []).length > 0 && <>
          <h3 className="group-label">Grants led by center faculty</h3>
          <div className="grid grid-2" style={{ marginBottom: 8 }}>
            {funding.grants.map((g) => (
              <Reveal key={g.name} className="card">
                <h3>{g.name}</h3>
                <p>{g.sponsor}{g.id ? ` (${g.id})` : ''}</p>
                <div className="chips"><span className="chip">{g.role}</span><span className="chip">{g.years}</span></div>
              </Reveal>
            ))}
          </div>
        </>}
        <h3 className="group-label">Earlier support for Dr. Ampel's research</h3>
        <div className="grid grid-3">
          {(funding.awarded || []).map((p) => (
            <Reveal key={p.id} className="card"><h3>{p.name}</h3><p>{p.role}</p><div className="chips"><span className="chip">{p.id}</span></div></Reveal>
          ))}
        </div>
        <h3 className="group-label">Collaborating institutions</h3>
        <div className="grid grid-3">
          {(funding.collaborations || []).map((p) => (
            <Reveal key={p.name} className="card"><h3>{p.name}</h3><p>{p.focus}</p></Reveal>
          ))}
        </div>
        </DataSection>
      </Section>

      <Section id="friends" alt title="Friends of CCAIR" intro="Labs and centers we collaborate with.">
        <DataSection needs={['friends']} what="the list of friends"><FriendsGrid /></DataSection>
      </Section>

      <Section id="governance" title="Governance">
        <div className="grid grid-4">
          {[
            { role: 'Center Director', desc: 'Sets research direction, primary liaison to funding agencies and university leadership.' },
            { role: 'Faculty Affiliates', desc: 'Contribute to shared center artifacts (data, benchmarks, systems) on specific projects.' },
            { role: 'External Advisory Council', desc: 'Annual review of research direction, relevance, and translational opportunities.' },
            { role: 'Graduate Researchers', desc: 'Ph.D. and M.S. students driving research under faculty supervision.' },
          ].map((g) => (
            <Reveal key={g.role} className="card"><h3>{g.role}</h3><p>{g.desc}</p></Reveal>
          ))}
        </div>
      </Section>

      <Section id="environment" alt title="Strategic environment" intro="CCAIR operates within Georgia State University's interdisciplinary R1 environment.">
        <div className="grid grid-4">
          {[
            { name: 'CHAI Center', desc: 'Collaborative Human-AI center with GSU and Duke University leadership.' },
            { name: 'TReNDS Center', desc: 'Large-scale data analytics and translational neuroscience research.' },
            { name: 'Center for Digital Innovation', desc: 'Theory-driven research on digital transformation and innovation.' },
            { name: 'CIS Department', desc: 'Recognized for leadership in digital innovation and security research.' },
          ].map((p) => (
            <Reveal key={p.name} className="card"><h3>{p.name}</h3><p>{p.desc}</p></Reveal>
          ))}
        </div>
      </Section>

      <Section id="photo-credits" title="Photo credits"
        intro="The campus and skyline photos on this site show Georgia State's downtown campus and the Atlanta skyline. Each is used under the license shown. Photos under CC BY-SA stay under CC BY-SA after our cropping and resizing. The People page headshots are listed after them.">
        <DataSection needs={['photos', 'people', 'friends']} what="the credits">
          <Reveal><PhotoCredits /></Reveal>
          <Reveal><PeoplePhotoCredits /></Reveal>
          <Reveal><FriendsLogoCredits /></Reveal>
        </DataSection>
      </Section>
    </div>
  );
}

function ContactPage() {
  return (
    <div className="page">
      <PageHead eyebrow="Contact" title="Get in touch"
        lede="Interested in collaboration, joining the lab, or learning more about CCAIR? Email is the best way to reach us." >
        <div className="hero-cta" style={{ justifyContent: 'flex-start' }}>
          <a className="btn btn-primary" href="mailto:bampel@gsu.edu">Email Dr. Ampel <Arrow /></a>
          <a className="btn btn-secondary" href="https://robinson.gsu.edu/profile/benjamin-ampel/">GSU profile</a>
        </div>
      </PageHead>

      <Section id="details" title="Where to find us">
        <div className="grid grid-2">
          <Reveal className="card">
            <h3>Director</h3>
            <address className="contact-lines">
              Dr. Benjamin M. Ampel<br />
              <a href="mailto:bampel@gsu.edu">bampel@gsu.edu</a><br />
              Department of Computer Information Systems<br />
              J. Mack Robinson College of Business<br />
              55 Park Place NE, Atlanta, GA 30303
            </address>
          </Reveal>
          <Reveal className="card">
            <h3>Robinson cyber ecosystem</h3>
            <ul className="list-check">
              <li><a href="https://robinson.gsu.edu/research-centers/crisp/">CRISP (Center for Research in Information Security &amp; Privacy)</a></li>
              <li>NSF CyberCorps Scholarship for Service participant</li>
              <li>NSA/DHS CAE Cyber Defense designated program</li>
            </ul>
          </Reveal>
        </div>
      </Section>

      <Section id="join" alt eyebrow="Open positions" title="Join CCAIR"
        intro="CCAIR is recruiting motivated Ph.D. and M.S. students to join our research group at Georgia State University. We value curiosity, persistence, and a willingness to work at the intersection of AI and cybersecurity.">
        <h3 className="group-label">Research areas</h3>
        <div className="grid grid-3">
          {JOIN_AREAS.map(({ area, desc }) => (
            <Reveal key={area} className="card"><h3>{area}</h3><p>{desc}</p></Reveal>
          ))}
        </div>
        <h3 className="group-label">Ideal candidates</h3>
        <Reveal className="card">
          <ul className="list-check">
            <li>Background in computer science, information systems, cybersecurity, or a related field</li>
            <li>Interest in applied machine learning / NLP for security problems</li>
            <li>Programming experience in Python; familiarity with PyTorch or Hugging Face a plus</li>
            <li>Strong writing skills and interest in publishing at top venues</li>
          </ul>
          <p style={{ marginTop: 16 }}>Interested? Reach out with your CV and a brief description of your research interests.</p>
          <div className="section-foot" style={{ marginTop: 16 }}><a className="btn btn-primary" href="mailto:bampel@gsu.edu">Contact Dr. Ampel <Arrow /></a></div>
        </Reveal>
      </Section>
    </div>
  );
}

window.CCAIR = window.CCAIR || {};
const CCAIR_PAGES = { HomePage, ResearchPage, PublicationsPage, PeoplePage, ResourcesPage, MaterialsPage, AboutPage, ContactPage };
Object.assign(window.CCAIR, CCAIR_PAGES);
Object.assign(window, CCAIR_PAGES);
