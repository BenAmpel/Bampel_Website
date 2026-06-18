// Populated from Bampel Academic CV (April 2026). Dynamic fields (citations, h-index, pubsByYear,
// citesByYear) are overwritten at runtime by app.jsx from /data/scholar-metrics.json.
window.AMPEL_DATA = {
  identity: {
    name: "Benjamin M. Ampel",
    handle: "@bampel",
    role: "Assistant Professor, Computer Information Systems",
    role2: "Director, CyberAI Research and Education Center (CARE)",
    affil: "Georgia State University · J. Mack Robinson College of Business",
    location: "Atlanta, GA",
    email: "bampel@gsu.edu",
    address: "55 Park Place NW, Atlanta, GA 30303",
    tagline: "AI-enabled cybersecurity researcher building LLM and threat-intelligence systems that make defense proactive.",
    photo: "https://bampel.com/authors/admin/avatar_hu_8612e623253cf18f.png",
    links: [
      { label: "Email",         href: "mailto:bampel@gsu.edu" },
      { label: "Google Scholar", href: "https://scholar.google.com/citations?user=XDdwaZUAAAAJ&hl=en" },
      { label: "LinkedIn",      href: "https://www.linkedin.com/in/benjaminampel/" },
      { label: "CV (PDF)",      href: "/uploads/ampel-cv.pdf" },
    ],
  },

  // Overwritten at runtime from scholar-metrics.json — these are last-known fallbacks only
  kpis: [
    { label: "Citations (gscholar)",      value: "508",      delta: "+39 / mo" },
    { label: "h-index",                   value: "9",        delta: "+1 / 12mo" },
    { label: "Publications",              value: "30",       delta: "+4 / 12mo" },
    { label: "Best paper awards",         value: "2",        delta: "IEEE ISI '20, '23" },
    { label: "Grant funding (PI/Co-PI)",  value: "$3.96M",   delta: "active 2022–2028" },
    { label: "Top eval (Fa '25)",         value: "4.9 / 5",  delta: "CIS 8080 IS Sec & Privacy" },
  ],

  threads: [
    "Threat-intelligence pipelines that translate adversary text into operational alerts.",
    "LLM-driven phishing detection and social-engineering analysis.",
    "Measurement of hacker communities for early-warning signals.",
  ],

  skills: [
    { name: "Large Language Models",     v: 95 },
    { name: "Cybersecurity & CTI",       v: 95 },
    { name: "Deep Learning / NLP",       v: 90 },
    { name: "Data Science & Analytics",  v: 90 },
    { name: "Python / PyTorch / TF",     v: 90 },
    { name: "Academic Writing",          v: 95 },
    { name: "Design Science Research",   v: 85 },
  ],

  career: [
    { date: "2026 — Present", title: "Director, CyberAI Research and Education Center (CARE)",          sub: "Georgia State University", current: true },
    { date: "2024 — Present", title: "Assistant Professor, Computer Information Systems",        sub: "Georgia State University · Robinson College of Business", current: true },
    { date: "2021 — 2024",   title: "Adjunct Lecturer (Limited Term)",                          sub: "University of Arizona" },
    { date: "2018 — 2024",   title: "Research Associate, Artificial Intelligence Lab",          sub: "University of Arizona" },
    { date: "2018 — 2021",   title: "NSF CyberCorps Scholarship-for-Service Fellow",            sub: "University of Arizona" },
    { date: "Ph.D. 2024",    title: "Ph.D., Management Information Systems",                   sub: "University of Arizona · ACM SIGMIS Doctoral Dissertation Award" },
    { date: "M.S. 2019",     title: "M.S., Management Information Systems",                    sub: "University of Arizona" },
    { date: "B.S. 2017",     title: "B.S.B.A., Management Information Systems",                sub: "University of Arizona · Outstanding Senior Award" },
  ],

  // Used as chart fallback — overwritten at runtime from publications.json
  pubsByYear: [
    { y: 2019, n: 1 }, { y: 2020, n: 4 }, { y: 2021, n: 5 },
    { y: 2023, n: 7 }, { y: 2024, n: 3 }, { y: 2025, n: 6 }, { y: 2026, n: 5 },
  ],

  // Overwritten at runtime from scholar-metrics.json
  citesByYear: [
    { y: 2020, n: 16 }, { y: 2021, n: 38 }, { y: 2022, n: 55 }, { y: 2023, n: 78 },
    { y: 2024, n: 134 }, { y: 2025, n: 146 }, { y: 2026, n: 39 },
  ],

  storylines: [
    { id: "ti", label: "Threat Intel → Communities → LLMs", color: "var(--accent)", steps: [
      { y: 2020, t: "Labeling Hacker Exploits for Proactive CTI (Best Paper)",       v: "IEEE ISI" },
      { y: 2021, t: "Evolution of Exploit-Sharing Hackers (Graph Embedding)",        v: "IEEE ISI" },
      { y: 2024, t: "Creating Proactive CTI with Hacker Exploit Labels (DTL-EL)",    v: "MIS Quarterly" },
      { y: 2025, t: "LLMs for Advanced Text Analytics IS Research",                  v: "ACM TMIS" },
      { y: 2026, t: "Targeted Disruption of Hacker Communities",                    v: "ISF" },
      { y: 2026, t: "Multilingual PHI Extraction from Hacker Communities",          v: "HICSS" },
    ]},
    { id: "ph", label: "Phishing & Social-Engineering Defense", color: "var(--accent-3)", steps: [
      { y: 2023, t: "Benchmarking Phishing Email Detection Robustness",              v: "AMCIS" },
      { y: 2023, t: "Evading Anti-Phishing Models (MLSEC 2022 Field Note)",         v: "ACM DTRAP" },
      { y: 2023, t: "Adversarial Phishing Websites: A Reinforcement Learning Approach", v: "INFORMS WDS" },
      { y: 2025, t: "Action-Masked RL Red Teaming for Phishing Detectors",          v: "IEEE SPW" },
      { y: 2025, t: "Explainable Nudging for Email Phishing Prevention",            v: "WISP" },
      { y: 2026, t: "Automatically Detecting Voice Phishing: A Large Audio Model Approach", v: "MIS Quarterly (forthcoming)" },
    ]},
    { id: "vu", label: "Vulnerability & Infrastructure Security", color: "var(--accent-2)", steps: [
      { y: 2020, t: "Vulnerable GitHub Repos in Scientific Cyberinfrastructure",    v: "IEEE ISI" },
      { y: 2020, t: "Smart Vulnerability Assessment for Scientific CI",             v: "IEEE ISI" },
      { y: 2021, t: "Linking CVEs to MITRE ATT&CK: A Self-Distillation Approach",  v: "ACM KDD AI4Cyber" },
      { y: 2023, t: "Mapping Exploit Code → ATT&CK (Multi-label Transformer) (Best Paper)", v: "IEEE ISI" },
      { y: 2023, t: "Disrupting Ransomware Actors on Bitcoin (Graph Embedding)",   v: "IEEE ISI" },
      { y: 2025, t: "LLMs for Infrastructure as Code Vulnerability Remediation",   v: "WISP" },
    ]},
  ],

  teaching: {
    avgEval: 4.72,
    courses: 14,
    topEval: 5.0,
    rows: [
      { code: "CIS 8684", title: "Cyber Threat Intelligence",       term: "Spring 2026",  eval: null, inst: "GSU",     n: 37 },
      { code: "CIS 4730", title: "Deep Learning for Business",      term: "Spring 2026",  eval: null, inst: "GSU",     n: 28 },
      { code: "CIS 8080", title: "IS Security and Privacy",         term: "Fall 2025",    eval: 4.9,  inst: "GSU",     n: 44 },
      { code: "CIS 3620", title: "Career Pathways",                 term: "Summer 2025",  eval: 5.0,  inst: "GSU",     n: 1  },
      { code: "CIS 8684", title: "Cyber Threat Intelligence",       term: "Spring 2025",  eval: 4.9,  inst: "GSU",     n: 30 },
      { code: "CIS 4680", title: "Intro to Security",               term: "Spring 2025",  eval: 4.7,  inst: "GSU",     n: 40 },
      { code: "CIS 8080", title: "IS Security and Privacy",         term: "Fall 2024",    eval: 4.9,  inst: "GSU",     n: 35 },
      { code: "MIS 562",  title: "Cyber Threat Intelligence",       term: "Fall 2023",    eval: 4.6,  inst: "UArizona", n: 24 },
      { code: "MIS 611D", title: "Topics in Data Mining",           term: "Spring 2023",  eval: null, inst: "UArizona", n: 9,  role: "GTA" },
      { code: "MIS 464",  title: "Data Analytics",                  term: "Spring 2023",  eval: null, inst: "UArizona", n: 39, role: "GTA" },
      { code: "MIS 562",  title: "Cyber Threat Intelligence",       term: "Fall 2022",    eval: 4.7,  inst: "UArizona", n: 40 },
      { code: "MIS 561",  title: "Data Visualization",              term: "Summer 2022",  eval: null, inst: "UArizona", n: 33, role: "GTA" },
      { code: "MIS 562",  title: "Cyber Threat Intelligence",       term: "Fall 2021",    eval: 4.5,  inst: "UArizona", n: 13 },
      { code: "MIS 562",  title: "Cyber Threat Intelligence",       term: "Summer 2021",  eval: 4.0,  inst: "UArizona", n: 30 },
    ],
  },

  awards: [
    { y: 2025, t: "IS Cybersecurity Graduate Program Top Professor",                         o: "Robinson College of Business, Georgia State University" },
    { y: 2024, t: "ACM SIGMIS Doctoral Dissertation Award",                                  o: "ICIS 2024 — 'Securing Cyberspace: AI-Enabled Cyber-Adversary Defense'", star: true },
    { y: 2023, t: "Best Paper Award",                                                        o: "IEEE ISI 2023 — Mapping Exploit Code to MITRE ATT&CK", star: true },
    { y: 2023, t: "Doctoral Consortium",                                                     o: "International Conference on Information Systems (ICIS) 2023" },
    { y: 2023, t: "Doctoral Consortium",                                                     o: "Americas Conference on Information Systems (AMCIS) 2023" },
    { y: 2023, t: "Paul S. and Shirley Goodman Scholarship",                                 o: "University of Arizona" },
    { y: 2022, t: "James F. LaSalle Teaching Excellence Award",                              o: "University of Arizona" },
    { y: 2022, t: "Samtani-Garcia MIS PhD Commitment Scholarship",                           o: "University of Arizona" },
    { y: 2022, t: "MLSEC 2022 — 3rd Place",                                                 o: "Machine Learning Security Evasion Competition (Phishing track)" },
    { y: 2020, t: "Best Paper Award",                                                        o: "IEEE ISI 2020 — Hacker Exploit Labeling for Proactive CTI", star: true },
    { y: 2020, t: "Nunamaker-Chen MIS Doctoral Scholarship",                                 o: "University of Arizona" },
    { y: 2018, t: "NSF CyberCorps Scholarship-for-Service Fellow",                           o: "National Science Foundation (2018–2021)" },
    { y: 2017, t: "Outstanding Senior Award",                                                o: "University of Arizona — MIS" },
  ],

  talks: [
    { y: 2026, t: "Vulnerability Remediation Across International Open-Source AI: A Large Language Model-Graph Learning Approach", v: "AI in Cybersecurity @ HICSS-59, Hawaii" },
    { y: 2025, t: "Foundation Models for Cybersecurity Applications",                      v: "AI-Enabled Cybersecurity Workshop @ HICSS-58, Hawaii" },
    { y: 2024, t: "How Has Generative AI Affected Education, Research, And Practice?",     v: "MIS 50th Academic Conference, University of Arizona" },
    { y: 2024, t: "Large Language Models for Advanced Text Analytics",                     v: "AI in Cybersecurity @ HICSS-57, Hawaii" },
    { y: 2023, t: "LLM Overview & Advanced Text Analytics",                                v: "Fall 2023 AI Bootcamp (Virtual)" },
    { y: 2023, t: "Deep Learning for The Detection of Vishing Calls",                     v: "International Conference on Secure Knowledge Management (SKM), Virtual" },
    { y: 2023, t: "Analytics and Visualizations/UI in AI for Cybersecurity",              v: "AI in Cybersecurity @ HICSS-56, Hawaii" },
  ],

  service: [
    { role: "Associate Editor",  org: "ACM Digital Threats: Research and Practice (DTRAP)",                        active: true },
    { role: "Associate Editor",  org: "ICIS Track on Digital Innovation and Entrepreneurship (2025–2026)",         active: true },
    { role: "Editorial Board",   org: "Journal of Information Systems Education (JISE)",                            active: true },
    { role: "Publicity Chair",   org: "INFORMS Workshop on Data Science (WDS), 2026",                              active: true },
    { role: "Co-Chair",          org: "HICSS Junior Faculty Consortium (2025–2027)",                               active: true },
    { role: "Co-Chair",          org: "ECIS Ancillary Meetings, 2025",                                             active: false },
    { role: "Co-Chair",          org: "AI4Cyber Workshop @ ACM KDD, 2024",                                        active: false },
    { role: "Program Committee", org: "IEEE ISI 2020–2025",                                                        active: true },
    { role: "Reviewer",          org: "MISQ · JMIS · ISR · MS · ICIS · HICSS · AMCIS · ECIS",                    active: true },
  ],

  grants: [
    { y: 2026, src: "NSF (#2146497)",           title: "CyberCorps SFS: Cybersecurity Workforce Preparation in the Age of AI",       amt: "$3,921,999", role: "Co-PI", dur: "2022–2028" },
    { y: 2026, src: "Richard Welke Fund (GSU)",  title: "AI-Powered Prosody Training for Vishing Defense",                            amt: "$12,500",    role: "PI",    dur: "2026–2027" },
    { y: 2024, src: "TSMC",                      title: "AI4BI Academic Program",                                                      amt: "$27,000",    role: "Co-PI", dur: "2024–2025" },
  ],

  alerts: [
    { sev: "info", t: "Latest paper indexed: 'Computational Design Framework for Targeted Disruption of Hacker Communities' — ISF 2026", time: "12m ago" },
    { sev: "ok",   t: "h-index confirmed at 9 (Google Scholar sync)",                                                                    time: "2h ago" },
    { sev: "warn", t: "Spring '26 syllabi due for CIS 8684 / CIS 4730",                                                                  time: "1d ago" },
    { sev: "ok",   t: "Scholar Utility Belt — 1,000+ DAU sustained",                                                                     time: "Apr 18" },
  ],
};
