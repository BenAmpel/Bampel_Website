/* CARE Pages — all page content */
const { useState: usePageState } = React;

const RESEARCH_PORTFOLIO = [
  { tier: 'Core', risk: 'Low risk, high coherence', color: '#22c55e', areas: [
    { name: 'Proactive Cyber Threat Intelligence', desc: 'Mining pre-attack signals from hacker forums, paste sites, and adversarial ecosystems' },
    { name: 'Dark Web Analytics', desc: 'Longitudinal analysis of underground communities, jargon evolution, and knowledge diffusion' },
    { name: 'Human–AI Collaboration', desc: 'How analysts and AI systems co-produce actionable intelligence in security workflows' },
  ]},
  { tier: 'Strategic', risk: 'Medium risk, high upside', color: '#3b82f6', areas: [
    { name: 'Agentic Defense Systems', desc: 'Autonomous AI agents that detect, adapt to, and mitigate adversarial behavior in real time' },
    { name: 'LLM Security & Robustness', desc: 'Adversarial attacks, jailbreaking, alignment evaluation, and defense for large language models' },
    { name: 'Multimodal Threat Modeling', desc: 'Integrating text, code, audio, and infrastructure signals for cross-modal threat inference' },
  ]},
  { tier: 'Exploratory', risk: 'High risk, high variance', color: '#a78bfa', areas: [
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
  { level: "K–12", description: "Early exposure to CyberAI concepts through local school partnerships and outreach programs.", programs: ["NSF STEM K-12", "NSF CAMEL", "Community Partnerships"] },
  { level: "Undergraduate", description: "Course-embedded research experiences and summer cohorts with sanitized center data.", programs: ["NSF REU Site", "CyberAI Fundamentals", "Ethical Awareness"] },
  { level: "Master's", description: "Bridge between instruction and research — students contribute to data curation and benchmarking.", programs: ["CIS 8684: CTI", "CIS 8080: Security", "NSF SFS Pipeline"] },
  { level: "Doctoral", description: "PhD students lead CARE research with dissertations contributing durable center artifacts.", programs: ["Dissertation Research", "Center Publications", "Conference Leadership"] },
];

function HomePage({ onNavigate, tweaks }) {
  const { publications, people, news, courses } = useData();

  return (
    <div>
      <div className={tweaks.showGrid ? 'grid-bg' : ''} style={{
        position: 'relative', minHeight: tweaks.heroStyle === 'full' ? '92vh' : '50vh',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        textAlign: 'center', padding: '100px clamp(20px,5vw,80px) 60px', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: '15%', left: '20%', width: 400, height: 400, borderRadius: '50%', background: `radial-gradient(circle, rgba(var(--accent-rgb),0.08), transparent 70%)`, animation: 'float1 22s ease-in-out infinite', pointerEvents: 'none' }}></div>
        <div style={{ position: 'absolute', bottom: '10%', right: '15%', width: 350, height: 350, borderRadius: '50%', background: `radial-gradient(circle, rgba(var(--accent2-rgb),0.06), transparent 70%)`, animation: 'float2 18s ease-in-out infinite', pointerEvents: 'none' }}></div>

        <NetworkCanvas scheme={tweaks.colorScheme} />

        <div style={{ position: 'relative', zIndex: 1, maxWidth: 860, animation: 'fadeInUp 0.8s ease' }}>
          <img src="uploads/CCAIR.png" alt="CARE" style={{ height: tweaks.heroStyle === 'full' ? 100 : 64, marginBottom: 24, filter: 'drop-shadow(0 0 30px rgba(var(--accent-rgb),0.2))' }} />
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.8rem)', marginBottom: 16, lineHeight: 1.1 }}>
            Center for <span style={{ color: 'var(--accent)' }}>CyberAI</span> Research
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: 'clamp(15px, 2vw, 18px)', maxWidth: 600, margin: '0 auto 36px', lineHeight: 1.7 }}>
            Advancing the theory and practice of proactive cyber threat intelligence under adversarial uncertainty.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <CButton primary onClick={() => onNavigate('research')}>Explore Research →</CButton>
            <CButton onClick={() => onNavigate('people')}>Join CARE</CButton>
          </div>
        </div>

        {tweaks.heroStyle === 'full' && (
          <div style={{ position: 'relative', zIndex: 1, marginTop: 60, display: 'flex', gap: 'clamp(30px,5vw,60px)', animation: 'fadeInUp 1s ease 0.2s both' }}>
            <StatCard value={publications.length} label="Publications" />
            <StatCard value={3} label="Research Pillars" />
            <StatCard value={courses.length} suffix="+" label="Courses Taught" />
            <StatCard value={people.affiliates.length + 1} suffix="+" label="Collaborators" />
          </div>
        )}
      </div>

      <PageSection title="Research Thesis" accent="// mission" subtitle="CARE investigates how intelligent systems can anticipate, interpret, and adapt to malicious behavior before exploitation — shifting the focus from reactive defense to proactive intelligence.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
          {[
            { n: '01', title: 'Adversarial Signal Emergence', desc: 'How malicious intent, capabilities, and tactics emerge across heterogeneous data sources prior to exploitation.' },
            { n: '02', title: 'Ambiguity-Aware Intelligence', desc: 'AI systems that operate under adversarial uncertainty — reasoning about ambiguity, deception, and partial information.' },
            { n: '03', title: 'Human–AI Collaboration', desc: 'How humans and AI jointly interpret, validate, and act on adversarial signals in realistic security workflows.' },
          ].map((p, i) => (
            <GlassCard key={i} glow>
              <div className="mono" style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 700, marginBottom: 10, opacity: 0.6 }}>{p.n}</div>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 8 }}>{p.title}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.65 }}>{p.desc}</div>
            </GlassCard>
          ))}
        </div>
        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <CButton onClick={() => onNavigate('research')}>Explore all research →</CButton>
        </div>
      </PageSection>

      <PageSection title="Latest" accent="// updates">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {news.map((n, i) => (
            <GlassCard key={i} style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>{n.date}</span>
                <Badge small>{n.tag}</Badge>
              </div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{n.title}</div>
            </GlassCard>
          ))}
        </div>
      </PageSection>

      <PageSection>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
          {[
            { label: 'People', desc: 'Meet the team', page: 'people' },
            { label: 'Resources', desc: 'Datasets, tools & benchmarks', page: 'resources' },
            { label: 'About', desc: 'Education, funding & governance', page: 'about' },
          ].map(l => (
            <GlassCard key={l.page} onClick={() => onNavigate(l.page)} style={{ cursor: 'pointer', textAlign: 'center', padding: 32 }}>
              <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4, color: 'var(--accent)' }}>{l.label}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{l.desc}</div>
            </GlassCard>
          ))}
        </div>
      </PageSection>
    </div>
  );
}

function ResearchPage() {
  const { publications } = useData();
  const [filter, setFilter] = usePageState('All');
  const types = ['All', 'journal', 'conference', 'workshop'];
  const filtered = filter === 'All' ? publications : publications.filter(p => p.type === filter);

  return (
    <div style={{ paddingTop: 64 }}>
      <h1 className="sr-only">Research — CARE</h1>
      <PageSection title="Research Primitives" accent="// core agenda" subtitle="All center activities, proposals, and artifacts map to at least one of these foundational primitives.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
          {[
            { n: 'P1', title: 'Adversarial Signal Emergence', points: ['How attacker knowledge diffuses over time', 'Slang and jargon evolution to evade detection', 'Experimental exploits maturing into operational tools', 'Cross-modal signal integration for intent inference'] },
            { n: 'P2', title: 'Ambiguity-Aware Intelligence Models', points: ['Robust ML under adversarial label noise', 'Adversarially resilient architectures', 'Agentic systems with adaptive decision-making', 'Treating uncertainty as a first-class design constraint'] },
            { n: 'P3', title: 'Human–AI Collaboration (HAIC)', points: ['Joint interpretation of adversarial signals', 'Trust calibration between analysts and AI', 'Workflow integration for CTI production', 'Organizational context in security decisions'] },
          ].map((p, i) => (
            <GlassCard key={i} glow>
              <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 700, marginBottom: 12, letterSpacing: 1 }}>{p.n}</div>
              <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 14 }}>{p.title}</div>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {p.points.map((pt, j) => (
                  <li key={j} style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, padding: '4px 0', paddingLeft: 16, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, color: 'var(--accent)', opacity: 0.5 }}>▸</span>
                    {pt}
                  </li>
                ))}
              </ul>
            </GlassCard>
          ))}
        </div>
      </PageSection>

      <PageSection title="Research Portfolio" accent="// strategic positions" subtitle="CARE organizes research investments into three tiers based on risk and expected coherence with the center thesis.">
        <div style={{ display: 'grid', gap: 20 }}>
          {RESEARCH_PORTFOLIO.map((tier) => (
            <GlassCard key={tier.tier} style={{ borderLeft: `3px solid ${tier.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div className="mono" style={{ fontWeight: 700, fontSize: 14, color: tier.color }}>{tier.tier}</div>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{tier.risk}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                {tier.areas.map((a) => (
                  <div key={a.name} style={{ padding: '12px 14px', borderRadius: 8, background: `${tier.color}08`, border: `1px solid ${tier.color}18` }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{a.desc}</div>
                  </div>
                ))}
              </div>
            </GlassCard>
          ))}
        </div>
      </PageSection>

      <PageSection title="Theoretical Constructs" accent="// foundations" subtitle="Provisional constructs designed to be empirically observable, computationally operationalizable, and stable enough to accumulate evidence across projects.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {CONSTRUCTS.map((c) => (
            <GlassCard key={c.name} style={{ padding: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: 'var(--accent)' }}>{c.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.7 }}>{c.desc}</div>
            </GlassCard>
          ))}
        </div>
      </PageSection>

      <PageSection title="Center Outputs" accent="// artifacts" subtitle="Persistent, reusable artifacts that outlive individual grants.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {[
            { title: 'Adversarial Intelligence Corpora', desc: 'Longitudinal datasets capturing threat signals from adversarial ecosystems' },
            { title: 'CyberAI Evaluation Benchmarks', desc: 'Task-specific benchmarks for detection, robustness, and agentic defense' },
            { title: 'Proactive CTI Systems', desc: 'Data pipelines, models, and simulation environments for security workflows' },
            { title: 'Human-Centered Frameworks', desc: 'Theory-grounded frameworks for human–AI co-production of cyber defense' },
          ].map((o, i) => (
            <GlassCard key={i} style={{ padding: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: 'var(--accent)' }}>{o.title}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>{o.desc}</div>
            </GlassCard>
          ))}
        </div>
      </PageSection>

      <PageSection title="Publications" accent="// selected works">
        <FilterBar filters={types} active={filter} onFilter={setFilter} label="Filter:" />
        <div style={{ display: 'grid', gap: 12 }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-secondary)', fontSize: 14 }}>
              No publications match this filter.
            </div>
          )}
          {filtered.map((p) => <PublicationCard key={p.title} {...p} />)}
        </div>
        <div className="mono" style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 20, textAlign: 'center' }}>
          Showing {filtered.length} of {publications.length} publications
        </div>
      </PageSection>
    </div>
  );
}

function PeoplePage() {
  const { people } = useData();

  return (
    <div style={{ paddingTop: 64 }}>
      <h1 className="sr-only">People — CARE</h1>
      <PageSection title="Director" accent="// leadership">
        <PersonCard name={people.director.name} role={people.director.title} dept={people.director.dept} areas={people.director.areas} isDirector />
      </PageSection>

      <PageSection title="Faculty Affiliates" accent="// collaborators" subtitle="Internal and external faculty contributing to shared CARE artifacts across research primitives.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {people.affiliates.map((a) => (
            <GlassCard key={a.name} style={{ padding: 22 }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 10, flexShrink: 0,
                  background: 'linear-gradient(135deg, rgba(var(--accent2-rgb),0.2), rgba(var(--accent-rgb),0.1))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, fontWeight: 700, color: 'var(--accent2)',
                  border: '1px solid rgba(var(--accent2-rgb),0.15)',
                }}>{a.initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{a.name}</div>
                  <div style={{ color: 'var(--accent2)', fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>{a.role}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 8 }}>{a.dept}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: 12, lineHeight: 1.5, fontStyle: 'italic' }}>{a.synergy}</div>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      </PageSection>

      <PageSection title="Join CARE" accent="// open positions">
        <GlassCard style={{ padding: 36, background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.05), rgba(var(--accent2-rgb),0.03))' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.8, marginBottom: 24 }}>
            CARE is recruiting motivated <strong style={{ color: 'var(--accent)' }}>PhD students</strong> and <strong style={{ color: 'var(--accent)' }}>MS students</strong> to join our research group at Georgia State University. We value curiosity, persistence, and a willingness to work at the intersection of AI and cybersecurity.
          </p>

          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent2)', marginBottom: 12, fontFamily: "'Fira Code', monospace", letterSpacing: 1 }}>RESEARCH AREAS</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 28 }}>
            {[
              { area: 'LLM Security & Robustness', desc: 'Adversarial attacks, jailbreaking, alignment for security applications' },
              { area: 'Cyber Threat Intelligence', desc: 'Automated collection and analysis of threat data from dark web and hacker communities' },
              { area: 'Phishing & Social Engineering', desc: 'AI-driven detection and generation analysis of phishing campaigns' },
              { area: 'Proactive Threat Hunting', desc: 'Predictive models and early-warning systems for emerging cyber threats' },
              { area: 'Human–AI Collaboration', desc: 'Designing AI tools that augment analyst decision-making in SOC environments' },
              { area: 'Generative AI for Security', desc: 'Leveraging LLMs for vulnerability analysis, code auditing, and threat modeling' },
            ].map(({ area, desc }) => (
              <div key={area} style={{ padding: '14px 16px', borderRadius: 8, border: '1px solid rgba(var(--accent-rgb),0.12)', background: 'rgba(var(--accent-rgb),0.03)' }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)', marginBottom: 4, fontFamily: "'Fira Code', monospace" }}>{area}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>

          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent2)', marginBottom: 12, fontFamily: "'Fira Code', monospace", letterSpacing: 1 }}>IDEAL CANDIDATES</div>
          <ul style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 2, paddingLeft: 20, marginBottom: 28 }}>
            <li>Background in computer science, information systems, cybersecurity, or a related field</li>
            <li>Interest in applied machine learning / NLP for security problems</li>
            <li>Programming experience in Python; familiarity with PyTorch or HuggingFace a plus</li>
            <li>Strong writing skills and interest in publishing at top venues</li>
          </ul>

          <div style={{ textAlign: 'center', borderTop: '1px solid rgba(var(--accent-rgb),0.1)', paddingTop: 24 }}>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>
              Interested? Reach out with your CV and a brief description of your research interests.
            </p>
            <CButton primary href="mailto:bampel@gsu.edu">Contact Dr. Ampel →</CButton>
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-secondary)', fontFamily: "'Fira Code', monospace" }}>
              bampel@gsu.edu
            </div>
          </div>
        </GlassCard>
      </PageSection>
    </div>
  );
}

function ResourcesPage() {
  const { resources } = useData();
  const [tab, setTab] = usePageState('datasets');
  const byCategory = (cat) => resources.filter(r => r.category === cat.slice(0, -1));

  return (
    <div style={{ paddingTop: 64 }}>
      <h1 className="sr-only">Resources — CARE</h1>
      <PageSection title="Research Assets" accent="// resources" subtitle="Persistent artifacts designed to outlive individual grants and serve as shared infrastructure for the CyberAI community.">
        <FilterBar filters={['datasets', 'benchmarks', 'tools']} active={tab} onFilter={setTab} label="View:" />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
          {byCategory(tab).map((r) => <ResourceCard key={r.title} {...r} />)}
        </div>
      </PageSection>

      <PageSection title="Data Governance" accent="// ethics" subtitle="CARE adopts a conservative governance posture for all data activities.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {[
            { title: 'Ethical Oversight', desc: 'All collection reviewed under IRB consultation. Clear separation between observational research and any facilitating activity.' },
            { title: 'Data Lifecycle', desc: 'Full provenance tracking from acquisition through publication and archiving, aligned with NIST AI Risk Management.' },
            { title: 'Controlled Access', desc: 'Sensitive corpora restricted to trained personnel with audit logging. Derived datasets preferentially shared to balance openness.' },
            { title: 'Community Sharing', desc: 'Curated subsets, benchmarks, and task formulations released under appropriate usage agreements.' },
          ].map((g, i) => (
            <GlassCard key={i} style={{ padding: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{g.title}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.65 }}>{g.desc}</div>
            </GlassCard>
          ))}
        </div>
      </PageSection>
    </div>
  );
}

function AboutPage({ onNavigate }) {
  const { funding, courses } = useData();

  return (
    <div style={{ paddingTop: 64 }}>
      <h1 className="sr-only">About — CARE</h1>
      <PageSection title="Talent Pipeline" accent="// education" subtitle="A multi-stage pipeline spanning K–12 through doctoral research, building technically sophisticated and theoretically grounded CyberAI professionals.">
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {PIPELINE.map((p, i) => <PipelineStep key={i} {...p} index={i} total={PIPELINE.length} />)}
        </div>
      </PageSection>

      <PageSection title="Courses" accent="// curriculum">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {courses.map((c, i) => (
            <GlassCard key={i} style={{ padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span className="mono" style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 700 }}>{c.code}</span>
                  <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>{c.title}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Badge small>{c.level}</Badge>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{c.rating}</div>
                </div>
              </div>
            </GlassCard>
          ))}
        </div>
      </PageSection>

      <PageSection title="Funding Roadmap" accent="// 2026 strategy" subtitle="A strategic approach balancing immediate student support with long-term pursuit of center-scale awards.">
        <Timeline items={funding.timeline} />
      </PageSection>

      <PageSection title="Funding & Partners" accent="// ecosystem" subtitle="CARE pursues synergistic funding across federal agencies, defense, and industry partnerships.">
        <div style={{ marginBottom: 24 }}>
          <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>FEDERAL & DEFENSE</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {funding.partners.filter(p => p.type !== 'industry').map((p) => (
              <div key={p.name} style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid rgba(var(--accent-rgb),0.10)', background: 'rgba(var(--accent-rgb),0.03)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{p.name}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 4 }}>{p.program}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.focus}</div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mono" style={{ color: 'var(--accent2)', fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 14 }}>INDUSTRY</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {funding.partners.filter(p => p.type === 'industry').map((p) => (
              <div key={p.name} style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid rgba(var(--accent2-rgb),0.10)', background: 'rgba(var(--accent2-rgb),0.03)' }}>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{p.name}</div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--accent2)', marginBottom: 4 }}>{p.program}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{p.focus}</div>
              </div>
            ))}
          </div>
        </div>
      </PageSection>

      <PageSection title="Governance" accent="// structure">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {[
            { role: 'Center Director', desc: 'Sets research direction, primary liaison to funding agencies and university leadership.' },
            { role: 'Faculty Affiliates', desc: 'Contribute to shared center artifacts (data, benchmarks, systems) on specific projects.' },
            { role: 'External Advisory Council', desc: 'Annual review of research direction, relevance, and translational opportunities.' },
            { role: 'Graduate Researchers', desc: 'PhD and MS students driving research under faculty supervision.' },
          ].map((g, i) => (
            <GlassCard key={i} style={{ padding: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6, color: 'var(--accent)' }}>{g.role}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>{g.desc}</div>
            </GlassCard>
          ))}
        </div>
      </PageSection>

      <PageSection title="Strategic Environment" accent="// GSU ecosystem" subtitle="CARE operates within Georgia State University's interdisciplinary R1 environment.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {[
            { name: 'CHAI Center', desc: 'Collaborative Human-AI center with GSU and Duke University leadership.' },
            { name: 'TReNDS Center', desc: 'Large-scale data analytics and translational neuroscience research.' },
            { name: 'Center for Digital Innovation', desc: 'Theory-driven research on digital transformation and innovation.' },
            { name: 'CIS Department', desc: 'Recognized for leadership in digital innovation and security research.' },
          ].map((p, i) => (
            <GlassCard key={i} style={{ padding: 22 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{p.name}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>{p.desc}</div>
            </GlassCard>
          ))}
        </div>
      </PageSection>

      <PageSection>
        <GlassCard style={{ textAlign: 'center', padding: 'clamp(36px, 5vw, 60px)', background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.04), rgba(var(--accent2-rgb),0.02))' }}>
          <div className="mono" style={{ color: 'var(--accent)', fontSize: 12, fontWeight: 700, letterSpacing: 2, marginBottom: 12 }}>// CONTACT</div>
          <h2 style={{ fontSize: 'clamp(1.5rem, 3vw, 2rem)', marginBottom: 12 }}>Get in Touch</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 15, maxWidth: 500, margin: '0 auto 8px', lineHeight: 1.7 }}>
            Interested in collaboration, joining the lab, or learning more about CARE?
          </p>
          <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 24 }}>
            J. Mack Robinson School of Business · 55 Park Place NW · Atlanta, GA 30303
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <CButton primary href="mailto:bampel@gsu.edu">Email Dr. Ampel</CButton>
            <CButton href="https://robinson.gsu.edu/profile/benjamin-ampel/">GSU Profile</CButton>
          </div>
        </GlassCard>
      </PageSection>
    </div>
  );
}

window.CCAIR = window.CCAIR || {};
Object.assign(window.CCAIR, {
  HomePage, ResearchPage, PeoplePage, ResourcesPage, AboutPage,
});
Object.assign(window, {
  HomePage, ResearchPage, PeoplePage, ResourcesPage, AboutPage,
});
