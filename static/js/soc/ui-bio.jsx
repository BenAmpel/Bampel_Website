/* global React, UI */
const { useState, useMemo } = React;
const { Icon, ICONS } = UI;

// ---------- Hero / Identity ----------
function HeroIdentity({ id, threads, alerts }) {
  return (
    <section id="overview" className="section">
      <div className="section-head">
        <div className="section-title">
          <span className="section-id">// 01 · OVERVIEW</span>
          <span className="section-name cursor-blink">Operator Profile</span>
        </div>
        <div className="section-meta">
          <span className="chip cyan">CLEARED · ACADEMIC</span>
          <span>last sync · 12 min ago</span>
        </div>
      </div>

      <div className="hero-grid">
        {/* Identity card */}
        <div className="panel id-card">
          <div className="panel-head">
            <div className="left">
              <span className="ico"><Icon d={ICONS.user} size={13} /></span>
              <span className="title">identity.card</span>
            </div>
            <span className="chip green">ONLINE</span>
          </div>
          <div className="panel-body">
            <div className="id-header">
              <div className="id-photo" style={{ backgroundImage: `url(${id.photo})` }}>
                <div className="scan-tag">
                  <span>S-001</span>
                </div>
              </div>
              <div>
                <div className="id-name">{id.name}</div>
                <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--fg-4)", letterSpacing: "0.08em" }}>{id.handle} · SUBJECT-001</div>
              </div>
            </div>
            <div className="id-role" style={{ marginTop: 12 }}>{id.role}</div>
            <div className="id-role" style={{ color: "var(--fg-3)" }}>{id.role2}</div>
            <div className="id-affil">▸ {id.affil}</div>
            <ul className="id-meta-list">
              <li><span>LOC</span><span>{id.location}</span></li>
              <li><span>EMAIL</span><span>{id.email}</span></li>
              <li><span>OFFICE</span><span>{id.address}</span></li>
              <li><span>PGP</span><span>0x4F · 9A3C · 7BE2 · 18D1</span></li>
            </ul>
            <div className="id-actions">
              {id.links.map((l, i) => (
                <a key={i} className={`btn ${i === 0 ? "primary" : ""}`} href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
              ))}
            </div>
          </div>
        </div>

        {/* Mission brief */}
        <div className="panel">
          <div className="panel-head">
            <div className="left">
              <span className="ico"><Icon d={ICONS.flask} size={13} /></span>
              <span className="title">mission.brief</span>
            </div>
            <div className="right">
              <span className="chip amber">EYES ONLY</span>
              <button className="tool-btn">EXPORT</button>
            </div>
          </div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{
              fontFamily: "var(--mono)", fontSize: 13.5, color: "var(--accent)",
              padding: "12px 14px", margin: 0,
              background: "oklch(0.82 0.13 195 / 0.06)",
              border: "1px solid oklch(0.82 0.13 195 / 0.25)",
              borderLeft: "3px solid var(--accent)",
              borderRadius: 6, lineHeight: 1.55,
            }}>
              ▸ {id.tagline}
            </p>

            <div className="prose">
              <p>
                <strong>Dr. Benjamin M. Ampel</strong> is an Assistant Professor in Computer Information
                Systems at Georgia State University's J. Mack Robinson College of Business and Director
                of the <strong>CyberAI Research and Education Center (CARE)</strong>. He earned his Ph.D. from the
                University of Arizona under Dr. Hsinchun Chen; his dissertation, <em>"Securing Cyberspace:
                AI-Enabled Cyber-Adversary Defense,"</em> received the <em className="tag">ACM SIGMIS
                Doctoral Dissertation Award</em> at ICIS 2024.
              </p>
              <p>
                His research builds AI-enabled cyber threat intelligence that turns adversary chatter into
                actionable defense — mining hacker communities, analyzing phishing content, and developing
                LLM applications for cybersecurity. Work appears in <strong>MIS Quarterly</strong>,{" "}
                <strong>JMIS</strong>, <strong>ACM TMIS</strong>, <strong>ISF</strong>, and <strong>IEEE
                ISI</strong>, with Best Paper Awards at IEEE ISI <em className="tag">2020</em> and{" "}
                <em className="tag">2023</em>.
              </p>
              <p style={{ marginBottom: 0 }}>
                Creator of the <a href="https://chromewebstore.google.com/detail/scholar-utility-belt/omcogfcgldfmihfogbffflbocdbjockn" target="_blank" rel="noreferrer">Scholar Utility Belt</a>{" "}
                — a Chrome extension used by 1,000+ researchers daily to make Google Scholar workflows faster.
              </p>
            </div>

            <div>
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-4)", letterSpacing: "0.16em", textTransform: "uppercase", marginBottom: 8 }}>
                Signature threads
              </div>
              <ul className="thread-list">
                {threads.map((t, i) => (
                  <li key={i}>
                    <span className="num">T{String(i + 1).padStart(2, "0")}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Alert feed */}
        <div className="panel">
          <div className="panel-head">
            <div className="left">
              <span className="ico"><Icon d={ICONS.radio} size={13} /></span>
              <span className="title">alert.feed</span>
            </div>
            <span className="chip cyan">LIVE</span>
          </div>
          <div className="panel-body" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 12 }}>
            {alerts.map((a, i) => {
              const cls = a.sev === "ok" ? "green" : a.sev === "warn" ? "amber" : "cyan";
              return (
                <div key={i} style={{
                  display: "grid", gridTemplateColumns: "auto 1fr", gap: 10,
                  padding: "10px 12px",
                  background: "var(--bg-1)",
                  border: "1px solid var(--line-soft)",
                  borderLeft: `3px solid var(--${a.sev === "ok" ? "accent-4" : a.sev === "warn" ? "accent-2" : "accent"})`,
                  borderRadius: 6,
                }}>
                  <span className={`chip ${cls}`} style={{ alignSelf: "start" }}>{a.sev.toUpperCase()}</span>
                  <div>
                    <div style={{ fontSize: 12.5, color: "var(--fg)", lineHeight: 1.4 }}>{a.t}</div>
                    <div style={{ fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--fg-4)", marginTop: 4 }}>{a.time}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Career timeline + skills ----------
function CareerSection({ career, skills }) {
  return (
    <section id="career" className="section">
      <div className="section-head">
        <div className="section-title">
          <span className="section-id">// 02 · CAREER</span>
          <span className="section-name">Trajectory & Toolkit</span>
        </div>
        <div className="section-meta"><span>tail -f /var/log/career.log</span></div>
      </div>

      <div className="grid-2">
        <div className="panel">
          <div className="panel-head">
            <div className="left">
              <span className="ico"><Icon d={ICONS.layers} size={13} /></span>
              <span className="title">timeline.career</span>
            </div>
            <span className="chip cyan">{career.length} EVENTS</span>
          </div>
          <div className="panel-body">
            <div className="timeline">
              {career.map((c, i) => (
                <div key={i} className={`timeline-item ${c.current ? "" : "past"}`}>
                  <div className="timeline-date">{c.date} {c.current ? "· active" : ""}</div>
                  <div className="timeline-title">{c.title}</div>
                  <div className="timeline-sub">{c.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="panel">
            <div className="panel-head">
              <div className="left">
                <span className="ico"><Icon d={ICONS.cpu} size={13} /></span>
                <span className="title">research.toolkit</span>
              </div>
              <span className="chip cyan">CALIBRATED</span>
            </div>
            <div className="panel-body">
              <div className="skills">
                {skills.map((s, i) => (
                  <div key={i}>
                    <div className="skill-row">
                      <span className="name">{s.name}</span>
                      <span style={{ color: "var(--accent)" }}>{s.v}%</span>
                    </div>
                    <div className="bar-track" style={{ marginTop: 4 }}>
                      <div className="bar-fill" style={{ width: `${s.v}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div className="left">
                <span className="ico"><Icon d={ICONS.shield} size={13} /></span>
                <span className="title">venues.matrix</span>
              </div>
              <span className="chip amber">PREMIER</span>
            </div>
            <div className="panel-body" style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {["MISQ", "JMIS", "ACM TMIS", "ISF", "IEEE ISI", "IEEE SPW", "ACM DTRAP", "ACM KDD", "HICSS", "AMCIS", "ICIS", "WISP", "WDS", "JISE"].map((v, i) => (
                <span key={i} className={`chip ${["MISQ", "JMIS", "ACM TMIS", "ISF"].includes(v) ? "amber" : v.startsWith("IEEE") || v === "ACM KDD" || v === "HICSS" || v === "ICIS" || v === "AMCIS" || v === "ACM DTRAP" ? "cyan" : "magenta"}`}>{v}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

window.UI_BIO = { HeroIdentity, CareerSection };
