# Cyber Career Pathway Finder: draft roles, questions and scoring

Status: DRAFT for Ben's review (2026-10-16). Nothing is built yet. No responses are stored anywhere; scoring runs in the visitor's browser. This is a public resource, not a study.

Role names follow the NIST NICE Workforce Framework (Components v1.0.0, 2024). Exact work-role IDs and every certification detail get checked against the source before publishing.

Related: CIS 3620 "Career Pathways" (`static/care/data/courses.json`); the finder can link to it.

## 1. How the scoring works (plain version)

- There are 9 traits and 5 interest areas (the domain tags). Each answer adds points to some of them, and a few answers subtract.
- Each role has a profile on the same traits and domain tags.
- The student's profile is compared with every role. The top 3 are shown, each with the two or three answers that drove the match.
- One question, "how soon do you need a job", adjusts the ranking. It does not change the trait scores. It lifts roles you can be hired into straight out of school, and for the others it shows the usual first job that leads there.

**Traits**

| Code | Trait |
|---|---|
| OFF | Breaking things to prove risk |
| DEF | Watching and defending live systems |
| INV | Evidence, reconstruction, "what exactly happened" |
| INTEL | Adversaries, trends, research and writing |
| BLD | Building and engineering systems |
| CODE | Comfort with programming |
| GOV | Rules, risk, frameworks, business |
| PPL | Teaching, persuading and explaining |
| PACE | Thrives under urgency |

**Domain tags:** CLOUD, OT (industrial and physical systems), AI, LAW, PRIV.

## 2. Role list (14)

How hard each role is to get as a first job:

- **Entry:** commonly hired straight from school or a bootcamp.
- **Step-in:** usually reached after 1 to 3 years in a feeder role.
- **Emerging:** few true entry postings yet.

| # | Role | NICE work role(s) | Hiring | Trait profile | Typical first job (feeder) |
|---|---|---|---|---|---|
| 1 | SOC Analyst (Tier 1) | Defensive Cybersecurity | Entry | DEF 3, PACE 2, INV 1 | IT help desk |
| 2 | Incident Responder | Incident Response | Step-in | PACE 3, DEF 2, INV 2, PPL 1 | SOC Analyst |
| 3 | Digital Forensics and Cybercrime Investigator | Digital Forensics; Cybercrime Investigation; Digital Evidence Analysis | Entry (law enforcement, e-discovery) / Step-in | INV 3, LAW 2, DEF 1 | Forensic technician, SOC |
| 4 | Threat Intelligence Analyst | Threat Analysis; All-Source Analysis | Step-in | INTEL 3, INV 1, PPL 1 | SOC Analyst, intelligence analyst (government) |
| 5 | Penetration Tester / Vulnerability Analyst | Vulnerability Analysis | Step-in | OFF 3, CODE 1.5, INV 1 | Vulnerability management analyst, sysadmin, SOC |
| 6 | Application Security Engineer | Secure Software Development; Software Security Assessment | Step-in | CODE 3, BLD 2, OFF 1 | Software developer |
| 7 | Cloud Security Engineer | Cybersecurity Architecture; Systems Security Analysis | Step-in | BLD 3, CLOUD 3, CODE 1.5 | Cloud or systems administrator |
| 8 | GRC Analyst (governance, risk, compliance) | Security Control Assessment; Systems Authorization; Cybersecurity Policy and Planning | Entry | GOV 3, PPL 1.5, PACE -1 | None needed |
| 9 | IT Auditor | Technology Program Auditing | Entry (Big Four, internal audit) | GOV 3, PPL 1 | None needed |
| 10 | Privacy Analyst | Privacy Compliance | Entry / Step-in | PRIV 3, GOV 2, LAW 1 | GRC Analyst, paralegal |
| 11 | Security Awareness and Human Risk Specialist | Cybersecurity Instruction; Cybersecurity Curriculum Development | Entry | PPL 3, GOV 1 | Training, communications |
| 12 | Network and Systems Security Administrator | Systems Administration; Network Operations; Systems Security Analysis | Entry | BLD 2, DEF 1.5, PACE 1 | IT support |
| 13 | OT / ICS Security Specialist | Operational Technology (OT) Cybersecurity Engineering | Step-in | OT 3, BLD 1, DEF 1 | Controls or field engineer |
| 14 | AI Security Specialist | Emerging (no single NICE role yet) | Emerging | AI 3, CODE 2, OFF 1 | AppSec, ML engineer, SOC |

### Certifications and resources per role (draft)

Notes on the lists below:

- "Start" means a credential that is realistic as a student.
- "Later" means it needs experience (some cannot be awarded without it).
- All resources listed are free unless marked.
- No affiliate links.

| Role | Start | Later | Free practice and reading |
|---|---|---|---|
| SOC Analyst | ISC2 CC (paid; the free One Million program closed to new sign-ups in 2026), CompTIA Security+, Google Cybersecurity Certificate | CompTIA CySA+, GIAC GCIA | TryHackMe SOC Level 1 (free rooms), LetsDefend, Blue Team Labs Online, Splunk free courses |
| Incident Responder | Security+ | CySA+, GIAC GCIH | CyberDefenders, NIST SP 800-61 (incident handling) |
| Forensics / Cybercrime | Security+ | GIAC GCFE / GCFA | Autopsy (open source), CyberDefenders, NIST SP 800-86 |
| Threat Intelligence | Security+ | GIAC GCTI | MITRE ATT&CK, SANS CTI Summit talks (free video) |
| Pen Tester | INE eJPT, CompTIA PenTest+ | OffSec OSCP | picoCTF, PortSwigger Web Security Academy, Hack The Box (free tier), OverTheWire |
| AppSec | (portfolio matters more than certs) | ISC2 CSSLP | OWASP Top 10, OWASP Juice Shop, PortSwigger Academy |
| Cloud Security | AWS Cloud Practitioner, Microsoft SC-900 | AWS Security Specialty, Microsoft AZ-500, ISC2 CCSP | flaws.cloud, AWS Skill Builder (free tier), CIS Benchmarks |
| GRC Analyst | ISC2 CC, Security+ | ISACA CRISC, ISC2 CISSP | NIST CSF 2.0, NIST SP 800-53, CIS Controls |
| IT Auditor | ISACA student membership | ISACA CISA (exam allowed early; certification needs 5 years' experience, partly waivable) | COBIT overview, IIA resources |
| Privacy Analyst | IAPP CIPP/US | IAPP CIPT, CIPM | NIST Privacy Framework, IAPP free articles |
| Security Awareness | Security+ or ISC2 CC | SANS SSAP | NIST SP 800-50, SANS Security Awareness reports |
| Network / Systems Admin | CompTIA Network+, Linux+ or CCNA | Security+ then role-specific | Cisco Packet Tracer (free with Skills for All), OverTheWire Bandit |
| OT / ICS | Security+ | GIAC GICSP | CISA free ICS virtual training, MITRE ATT&CK for ICS |
| AI Security | (no credible entry cert yet) | n/a | OWASP Top 10 for LLM Applications, MITRE ATLAS, NIST AI RMF, Gandalf (Lakera) prompt-injection game |

Every role also gets the same three habits:

1. Build a home lab and write up what you did.
2. Do CTFs and keep a public portfolio.
3. Join a local ISSA, ISACA, OWASP or BSides chapter.

## 3. Questions, v2 (replaces the 18-question draft)

### Why v2

A simulation of the 18-question draft (scratchpad `sim18.py`) put the right role first for only about 61 to 66% of perfectly consistent simulated students. Three causes:

1. GRC and IT Auditor had near-identical profiles (cosine 0.95).
2. AI Security, OT and Privacy each had only 2 or 3 answers that could point to them.
3. The wording assumed technical vocabulary.

v2 follows the O*NET Interest Profiler format: short, plain activity statements answered with a quick tap. Simulated top-1 accuracy rose to about 74% and top-3 to about 98% at moderate noise. Those numbers check coverage only, because the simulated students come from the same assumed profiles. Real accuracy has to be checked by having practitioners in each role try it (informal feedback, not a study).

### Format

42 taps, about 4 minutes, written for beginners with no jargon.

- **Part A (28 taps):** "Would you enjoy...?" answered Not for me (0) / Maybe (1) / Yes! (2). There are two items per role, shown in a shuffled order. Each role's raw score is the sum of its two items.
- **Part B (9 taps):** this-or-that pairs. The chosen side's role gets +1.5; "Neither appeals" gives 0.
- **Part C (5 questions):** context. These adjust scores and drive the advice shown.
- **Ranking:** roles are ordered by total score. If roles 1 and 2 are within 1 point, the results show a "these two are close" note explaining the difference.
- **Why you matched:** the results quote the activities the student tapped "Yes!".

### Part A: Would you enjoy...

| Role | Item 1 | Item 2 |
|---|---|---|
| SOC Analyst | Watching for anything unusual on a team's screens and raising the alarm | Working on a team that keeps watch over an organization day and night |
| Incident Responder | Being the person called in when something goes badly wrong | Leading a calm cleanup after a cyberattack |
| Forensics / Cybercrime | Recovering deleted files to find out what really happened | Helping police or lawyers build a case from evidence on a phone or computer |
| Threat Intelligence | Researching a criminal hacking group and writing up how it operates | Following world news to predict who might attack next and why |
| Pen Tester | Being hired to break into a company, with permission, to show its weak spots | Solving puzzle-style hacking challenges for fun |
| AppSec | Writing code and making sure it can't be misused | Reviewing an app before launch to catch mistakes that could let attackers in |
| Cloud Security | Setting up online services on Amazon, Microsoft or Google cloud | Automating how computer systems are built and locked down |
| GRC Analyst | Writing the safety rules and plans a company follows | Deciding which risks matter most to a business and what to fix first |
| IT Auditor | Checking whether a company really does what its rules say | Visiting different organizations to review how they protect themselves and write a report card |
| Privacy Analyst | Making sure people's personal information is collected and used fairly | Reading privacy laws and explaining what a company has to change |
| Security Awareness | Teaching people how to spot scam emails, texts and calls | Making videos, games or posters that help people stay safe online |
| Network / Systems Admin | Setting up computers, networks and user accounts so everything runs smoothly | Fixing computer problems and keeping systems up to date |
| OT / ICS | Protecting power plants, water systems or factories | Working with real machines and equipment, not just office computers |
| AI Security | Testing whether an AI chatbot can be tricked into misbehaving | Learning how AI systems work and where they go wrong |

### Part B: This or that? (each also offers "Neither appeals")

| # | Option A (role) | Option B (role) |
|---|---|---|
| 1 | Steady shifts watching for trouble (SOC) | On call for emergencies, then the deep cleanup (Incident Responder) |
| 2 | Build a company's security plan (GRC) | Check someone else's plan and grade it (IT Auditor) |
| 3 | Break into many different companies' systems (Pen Tester) | Make one product safer from the inside (AppSec) |
| 4 | Classic computers and networks (Pen Tester) | AI systems and chatbots (AI Security) |
| 5 | Pin down exactly what happened on one device (Forensics) | See the big picture across many attacks (Threat Intelligence) |
| 6 | People's personal information and their rights (Privacy) | Protecting the whole business from every kind of risk (GRC) |
| 7 | Brand-new cloud services (Cloud Security) | Keeping an office's computers and network running (Network / Systems Admin) |
| 8 | Talking with and teaching people (Security Awareness) | Writing plans and policies (GRC) |
| 9 | Physical machines and equipment (OT) | Office computers and servers (Network / Systems Admin) |

### Part C: Context

1. **How do you feel about learning to code?**

   | Answer | Effect |
   |---|---|
   | Excited | AppSec +1, Cloud +0.75, AI Security +0.75, Pen Tester +0.5 |
   | Fine if needed | No change |
   | I'd rather not | The same roles take the negative of those values |

2. **What are you studying, or strongest in?** Options: Computer science; IT or networking; Business, IS or accounting; Criminal justice or law; Psychology, communications or education; Engineering; Undecided. It adds +0.5 to related roles and picks which "first steps" advice to show.
3. **Night, weekend or shift work for your first couple of years?**
   - Fine
   - Rather not: SOC -0.5
   - Dealbreaker: SOC -1.5 and Incident Responder -1
4. **Where would you most like to work?**
   - Government or police: Forensics, Threat Intelligence +0.5; shows a security-clearance note
   - Consulting: Pen Tester, IT Auditor +0.5
   - One company: SOC, GRC +0.5
   - Tech company: AppSec, Cloud +0.5
   - Not sure: no change
5. **How soon do you need a cyber job?**
   - Within a year: Entry roles ×1.1, and Step-in roles lead with their feeder route
   - In 2 to 3 years: no change

## 4. Decisions (Ben, 2026-10-16)

- **Name and URL:** CCAIR everywhere. The site moved from /care/ to /ccair/ (old /care/ links 301 to /ccair/). The finder lives at /ccair/pathways/.
- **Pages:** a hub at /ccair/pathways/ with the quiz and an overview, plus one plain-HTML guide per role (/ccair/pathways/<slug>/). All are generated by Hugo from one data file. Schema (Quiz, Occupation, FAQPage, BreadcrumbList), sitemap and llms.txt entries.
- **Look:** match the CCAIR app: dark navy, teal accent, Manrope plus Space Mono.
- **Animation:** browser features only, no library. Sections reveal as they scroll into view; the progress ring fills; result cards appear in sequence; the radar chart draws itself. All of it is off under prefers-reduced-motion.
- **Quiz:** all 14 roles; v2 design (42 taps: activity taps on a 3-point scale, this-or-that pairs, context); GRC and IT Auditor kept separate with a tie-break note; one question per card, with a progress ring and a back button.
- **Results:** top 3 with no percentages; for each, why it matched, first-job route, certs and free resources; a trait radar; "see all 14 ranked".
- **Salary:** BLS median for the nearest occupation group, cited and dated (e.g. Information Security Analysts $129,180, May 2025).
- **Sharing:** a copy-link with the answers in the URL hash (never sent to the server, nothing stored), plus a print / save-as-PDF summary.
- **Analytics:** only quiz_started, quiz_finished and top_role, sent to the site's existing GA4. No answers, no identity. Not research data, no IRB.
- **Entry points:** the CCAIR app home and nav; the bampel.com homepage; the teaching page next to CIS 3620.
- **Wording:** build with this draft; Ben edits on a local preview before anything is pushed.

## 5. v3, as released (2026-10-17)

The v2 check found a structural bias: a student answering at random got GRC Analyst as the top role 22% of the time (fair share 7.1%), because GRC appeared in 3 of 9 pairs. v3 fixes it.

**Simulation design (`sim_v3.py`).** It was tested against simulated students whose likes come from an expert role-similarity matrix. That matrix is separate from the scoring weights and is randomly perturbed on every replicate. The simulated students also vary in acquiescence ("yes to everything").

**Design:**
- 3 activity items per role (42).
- 14 this-or-that pairs; every role appears in exactly 2.
- 5 context questions:
  - Every role is boosted exactly once by "background" and once by "work setting".
  - The coding question uses equal ±0.5 weights.
- Activity totals are standardised within each person before the pairs and context are added.
- 61 taps, about 5 minutes.

**Simulation results (typical consistency):**

| Design | Correct role ranked #1 | In top 3 | Same #1 on retake |
|---|---|---|---|
| v2 | 67% | 94% | 55% |
| v3 | 81% | 98% | 69% |

**Fairness on the live page code.** 700 random answer sets gave each role a 5.7–9.7% share of top places. Chi-square was 15.8 on 13 degrees of freedom, below the 5% critical value of 22.4, so no detectable bias.

**Reachability.** For each of the 14 roles, a textbook student who likes only that role's activities gets that role first.

**Limits.** These checks show the instrument is internally consistent and fair. They do not show that it predicts job satisfaction. Real validation needs practitioners in each role and students to take it, with informal feedback (not a study).
