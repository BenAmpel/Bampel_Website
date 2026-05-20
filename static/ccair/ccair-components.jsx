/* CCAIR Components — shared UI primitives and theme context */
const { createContext, useContext, useState, useEffect, useRef, useCallback, memo } = React;

const TweakCtx = createContext({});
const useTweakCtx = () => useContext(TweakCtx);

const ACCENT_RGB = {
  teal: [0,221,179], blue: [59,130,246], purple: [167,139,250], amber: [245,158,11]
};

function useCounter(end, duration = 1800) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true;
        const t0 = performance.now();
        const tick = (now) => {
          const p = Math.min((now - t0) / duration, 1);
          const ease = 1 - Math.pow(1 - p, 3);
          setCount(Math.floor(ease * end));
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.3 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [end, duration]);
  return [count, ref];
}

function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } }, { threshold });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

const NetworkCanvas = memo(function NetworkCanvas({ scheme = 'teal' }) {
  const canvasRef = useRef(null);
  const nodesRef = useRef([]);
  const animRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const NUM = 55;
    let w, h;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.offsetWidth; h = canvas.offsetHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function init() {
      resize();
      nodesRef.current = Array.from({ length: NUM }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
        r: Math.random() * 1.8 + 0.8,
      }));
    }

    function draw() {
      const rgb = ACCENT_RGB[scheme] || ACCENT_RGB.teal;
      ctx.clearRect(0, 0, w, h);
      const nodes = nodesRef.current;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            ctx.beginPath(); ctx.moveTo(nodes[i].x, nodes[i].y); ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${0.12 * (1 - dist / 130)})`;
            ctx.lineWidth = 0.6; ctx.stroke();
          }
        }
      }
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0.45)`;
        ctx.fill();
      }
      animRef.current = requestAnimationFrame(draw);
    }

    init(); draw();
    window.addEventListener('resize', resize);
    return () => { cancelAnimationFrame(animRef.current); window.removeEventListener('resize', resize); };
  }, [scheme]);

  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
});

function CCAIRNav({ currentPage, onNavigate }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', fn, { passive: true }); return () => window.removeEventListener('scroll', fn);
  }, []);

  const pages = [
    { id: 'home', label: 'Home' }, { id: 'research', label: 'Research' },
    { id: 'people', label: 'People' }, { id: 'resources', label: 'Resources' },
    { id: 'about', label: 'About' },
  ];

  const navStyle = {
    position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
    background: scrolled ? 'rgba(5,10,21,0.92)' : 'rgba(5,10,21,0.5)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    borderBottom: `1px solid ${scrolled ? 'var(--border)' : 'transparent'}`,
    padding: '0 clamp(20px, 4vw, 48px)', height: 64,
    display: 'flex', alignItems: 'center', transition: 'all 0.3s ease',
  };

  return (
    <nav style={navStyle} aria-label="Main navigation">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }} onClick={() => onNavigate('home')}>
        <img src="uploads/CCAIR.png" alt="CCAIR" style={{ height: 34, borderRadius: 4 }} />
        <span className="mono" style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent)', letterSpacing: 1 }}>CCAIR</span>
      </div>
      <div style={{ flex: 1 }}></div>
      <div style={{ display: 'flex', gap: 6 }}>
        {pages.map(p => (
          <button key={p.id} onClick={() => onNavigate(p.id)} aria-current={currentPage === p.id ? 'page' : undefined} style={{
            background: currentPage === p.id ? 'var(--accent-dim)' : 'none',
            border: 'none', cursor: 'pointer', padding: '6px 14px', borderRadius: 6,
            fontFamily: "'Manrope', sans-serif", fontSize: 13.5, fontWeight: 600,
            color: currentPage === p.id ? 'var(--accent)' : 'var(--text-secondary)',
            transition: 'all 0.2s',
          }}>
            {p.label}
          </button>
        ))}
      </div>
    </nav>
  );
}

function PageSection({ title, subtitle, children, noPad, accent, id }) {
  const [ref, visible] = useInView();
  return (
    <section ref={ref} id={id} className="grid-bg" style={{
      padding: noPad ? 0 : 'clamp(60px,8vw,100px) clamp(20px,5vw,80px)',
      opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(24px)',
      transition: 'opacity 0.6s ease, transform 0.6s ease',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', width: '100%', position: 'relative', zIndex: 1 }}>
        {title && (
          <div style={{ marginBottom: 48 }}>
            {accent && <div className="mono" style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 700, letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>{accent}</div>}
            <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', marginBottom: subtitle ? 12 : 0 }}>{title}</h2>
            {subtitle && <p style={{ color: 'var(--text-secondary)', fontSize: 16, maxWidth: 640, lineHeight: 1.7 }}>{subtitle}</p>}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

function GlassCard({ children, style, onClick, hover = true, glow = false }) {
  const { cardStyle } = useTweakCtx();
  const [hovered, setHovered] = useState(false);
  const isGlass = cardStyle === 'glass';
  const isSolid = cardStyle === 'solid';

  const base = {
    background: isGlass ? 'rgba(15,31,58,0.45)' : isSolid ? 'var(--bg-card-solid)' : 'transparent',
    border: `1px solid ${hovered && hover ? 'rgba(var(--accent-rgb),0.25)' : 'var(--border-subtle)'}`,
    borderRadius: 14, padding: 28, position: 'relative', overflow: 'hidden',
    backdropFilter: isGlass ? 'blur(12px)' : 'none',
    transition: 'all 0.3s ease',
    transform: hovered && hover ? 'translateY(-2px)' : 'none',
    boxShadow: hovered && hover ? '0 8px 32px rgba(0,0,0,0.3), 0 0 30px rgba(var(--accent-rgb),0.1)' : '0 2px 12px rgba(0,0,0,0.2)',
    cursor: onClick ? 'pointer' : 'default',
    ...style,
  };

  if (glow && hovered) base.boxShadow = `0 0 40px rgba(var(--accent-rgb),0.12), 0 8px 32px rgba(0,0,0,0.3)`;

  return (
    <div style={base} onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {children}
    </div>
  );
}

function StatCard({ value, label, suffix = '' }) {
  const [count, ref] = useCounter(value);
  return (
    <div ref={ref} style={{ textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>
        {count}{suffix}
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</div>
    </div>
  );
}

function Badge({ children, color, small }) {
  return (
    <span className="mono" style={{
      display: 'inline-block', padding: small ? '2px 8px' : '4px 12px', borderRadius: 6,
      fontSize: small ? 10 : 11, fontWeight: 700, letterSpacing: 0.5,
      background: color ? `${color}18` : 'var(--accent-dim)',
      color: color || 'var(--accent)',
      border: `1px solid ${color ? `${color}30` : 'rgba(var(--accent-rgb),0.15)'}`,
    }}>{children}</span>
  );
}

function StatusDot({ status }) {
  const colors = { 'Released': '#22c55e', 'Active': '#22c55e', 'In Development': '#f59e0b', 'Coming 2026': '#3b82f6', 'Planning': '#8b5cf6', 'Available': '#22c55e' };
  const c = colors[status] || '#64748b';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: c }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, boxShadow: `0 0 8px ${c}60` }}></span>
      {status}
    </span>
  );
}

function PersonCard({ name, role, dept, areas = [], isDirector }) {
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2);
  return (
    <GlassCard glow={isDirector} style={isDirector ? { gridColumn: 'span 2' } : {}}>
      <div style={{ display: 'flex', gap: 20, alignItems: isDirector ? 'flex-start' : 'center' }}>
        <div style={{
          width: isDirector ? 80 : 56, height: isDirector ? 80 : 56, borderRadius: 12,
          background: `linear-gradient(135deg, rgba(var(--accent-rgb),0.2), rgba(var(--accent2-rgb),0.2))`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: isDirector ? 28 : 18, fontWeight: 700, color: 'var(--accent)',
          flexShrink: 0, border: '1px solid rgba(var(--accent-rgb),0.15)',
        }}>{initials}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: isDirector ? 20 : 16, marginBottom: 2 }}>{name}</div>
          <div style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{role}</div>
          {dept && <div style={{ color: 'var(--text-muted)', fontSize: 12.5, marginBottom: isDirector ? 12 : 4 }}>{dept}</div>}
          {areas.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
              {areas.map(a => <Badge key={a} small>{a}</Badge>)}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function PublicationCard({ title, authors, venue, year, type }) {
  const typeColors = { journal: '#22c55e', conference: '#3b82f6', workshop: '#a78bfa', dissertation: '#f59e0b' };
  return (
    <GlassCard style={{ padding: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.4, flex: 1 }}>{title}</div>
        <Badge color={typeColors[type]} small>{type}</Badge>
      </div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 4 }}>{authors}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{venue}</span>
        <span className="mono" style={{ color: 'var(--text-muted)', fontSize: 12 }}>{year}</span>
      </div>
    </GlassCard>
  );
}

function ResourceCard({ title, description, status, tags = [], icon }) {
  return (
    <GlassCard glow>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10,
          background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.15), rgba(var(--accent2-rgb),0.1))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, border: '1px solid rgba(var(--accent-rgb),0.12)',
        }}>{icon || '◇'}</div>
        <StatusDot status={status} />
      </div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{title}</div>
      <div style={{ color: 'var(--text-secondary)', fontSize: 13.5, lineHeight: 1.6, marginBottom: 14 }}>{description}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {tags.map(t => <Badge key={t} small>{t}</Badge>)}
      </div>
    </GlassCard>
  );
}

function Timeline({ items }) {
  const [active, setActive] = useState(null);
  return (
    <div style={{ position: 'relative', paddingLeft: 28 }}>
      <div style={{ position: 'absolute', left: 10, top: 0, bottom: 0, width: 2, background: 'var(--border-subtle)' }}></div>
      {items.map((item, i) => (
        <div key={item.date + '-' + item.title} style={{ position: 'relative', marginBottom: 20, cursor: 'pointer', paddingLeft: 24 }}
          onClick={() => setActive(active === i ? null : i)}
          tabIndex={0}
          role="button"
          aria-expanded={active === i}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setActive(active === i ? null : i); } }}>
          <div style={{
            position: 'absolute', left: -21, top: 6, width: 12, height: 12, borderRadius: '50%',
            background: active === i ? 'var(--accent)' : 'var(--bg-elevated)',
            border: `2px solid ${active === i ? 'var(--accent)' : 'rgba(var(--accent-rgb),0.3)'}`,
            boxShadow: active === i ? '0 0 12px var(--accent-glow)' : 'none',
            transition: 'all 0.2s',
          }}></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>{item.date}</span>
              <div style={{ fontWeight: 600, fontSize: 14, marginTop: 2 }}>{item.title}</div>
            </div>
            <Badge small color={
              item.priority === 'Maximum' ? '#ef4444' : item.priority === 'High' ? '#f59e0b' : '#3b82f6'
            }>{item.priority}</Badge>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{item.source}</div>
          {active === i && item.details && (
            <div style={{
              marginTop: 10, padding: 14, background: 'var(--accent-dim)', borderRadius: 8,
              fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6,
              border: '1px solid var(--border)',
              animation: 'fadeIn 0.2s ease',
            }}>{item.details}</div>
          )}
        </div>
      ))}
    </div>
  );
}

function FilterBar({ filters, active, onFilter, label }) {
  return (
    <div role="group" aria-label={label || 'Filter'} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 28 }}>
      {label && <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, marginRight: 8 }}>{label}</span>}
      {filters.map(f => (
        <button key={f} onClick={() => onFilter(f)} aria-pressed={active === f} style={{
          background: active === f ? 'var(--accent)' : 'var(--accent-dim)',
          color: active === f ? 'var(--bg-base)' : 'var(--text-secondary)',
          border: `1px solid ${active === f ? 'var(--accent)' : 'var(--border)'}`,
          padding: '5px 14px', borderRadius: 8, cursor: 'pointer',
          fontFamily: "'Manrope', sans-serif", fontSize: 12.5, fontWeight: 600,
          transition: 'all 0.2s',
        }}>{f}</button>
      ))}
    </div>
  );
}

function PipelineStep({ level, description, programs, index, total }) {
  return (
    <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
      <GlassCard style={{ height: '100%' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
        }}>
          <div className="mono" style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'linear-gradient(135deg, rgba(var(--accent-rgb),0.2), rgba(var(--accent2-rgb),0.15))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, color: 'var(--accent)',
          }}>{index + 1}</div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--accent)' }}>{level}</div>
        </div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6, marginBottom: 12 }}>{description}</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {programs.map(p => <Badge key={p} small>{p}</Badge>)}
        </div>
      </GlassCard>
      {index < total - 1 && (
        <div style={{
          position: 'absolute', right: -16, top: '50%', transform: 'translateY(-50%)',
          color: 'var(--accent)', fontSize: 18, fontWeight: 700, zIndex: 2,
        }}>→</div>
      )}
    </div>
  );
}

function CButton({ children, primary, onClick, href, small }) {
  const style = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: small ? '7px 16px' : '10px 24px',
    borderRadius: 8, cursor: 'pointer', fontWeight: 600,
    fontSize: small ? 13 : 14, fontFamily: "'Manrope', sans-serif",
    transition: 'all 0.25s ease', border: 'none', textDecoration: 'none',
    background: primary ? 'var(--accent)' : 'var(--accent-dim)',
    color: primary ? 'var(--bg-base)' : 'var(--accent)',
  };
  if (href) return <a href={href} style={style}>{children}</a>;
  return <button type="button" onClick={onClick} style={style}>{children}</button>;
}

function CCAIRFooter() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border-subtle)', padding: '40px clamp(20px,5vw,80px)',
      background: 'var(--bg-surface)',
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <img src="uploads/CCAIR.png" alt="" style={{ height: 28, borderRadius: 3 }} />
            <span className="mono" style={{ fontWeight: 700, color: 'var(--accent)', fontSize: 14 }}>CCAIR</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>Center for CyberAI Research</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>J. Mack Robinson School of Business, Georgia State University</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>55 Park Place NW, Atlanta, GA 30303</div>
          <a href="mailto:bampel@gsu.edu" style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 600 }}>bampel@gsu.edu</a>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, {
  TweakCtx, useTweakCtx, ACCENT_RGB, useCounter, useInView,
  NetworkCanvas, CCAIRNav, PageSection, GlassCard, StatCard, Badge, StatusDot,
  PersonCard, PublicationCard, ResourceCard, Timeline, FilterBar, PipelineStep,
  CButton, CCAIRFooter,
});
