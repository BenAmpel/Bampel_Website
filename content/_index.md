---
title: "Benjamin M. Ampel"
date: 2022-10-24
type: landing

sections:
  # ---------- ABOUT / BIOGRAPHY ----------
  - block: about.biography
    id: about
    content:
      title: Biography
      username: admin

  # ---------- RESEARCH INTERESTS ----------
  - block: markdown
    id: research
    content:
      title: Research Interests
      text: |
        My research focuses on **AI-enabled Cybersecurity** with emphasis on:
        
        - **Cyber Threat Intelligence (CTI)**: Mining hacker communities, paste sites, and dark web forums
        - **Large Language Models**: Applying LLMs for security text analytics and threat detection
        - **Phishing Detection**: Developing robust defenses against adversarial phishing attacks
        - **Deep Learning**: Transfer learning and transformer-based approaches for security applications
        - **Computational Design Science**: Building actionable security systems and frameworks
        
        *Google Scholar Metrics: 350+ Citations | h-index: 9 | i10-index: 9*
    design:
      columns: '1'

  # ---------- SKILLS & EXPERTISE ----------
  - block: markdown
    id: skills
    content:
      title: Skills & Expertise
      text: |
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 30px;">
        
        <div>
        <div class="skill-label"><strong>🤖 Large Language Models</strong><span class="skill-percentage">95%</span></div>
        <div class="skill-bar"><div class="skill-progress" style="width: 95%"></div></div>
        
        <div class="skill-label"><strong>🔐 Cybersecurity & CTI</strong><span class="skill-percentage">95%</span></div>
        <div class="skill-bar"><div class="skill-progress" style="width: 95%"></div></div>
        
        <div class="skill-label"><strong>🧠 Deep Learning / NLP</strong><span class="skill-percentage">90%</span></div>
        <div class="skill-bar"><div class="skill-progress" style="width: 90%"></div></div>
        
        <div class="skill-label"><strong>📊 Data Science & Analytics</strong><span class="skill-percentage">90%</span></div>
        <div class="skill-bar"><div class="skill-progress" style="width: 90%"></div></div>
        </div>
        
        <div>
        <div class="skill-label"><strong>🐍 Python / PyTorch / TensorFlow</strong><span class="skill-percentage">90%</span></div>
        <div class="skill-bar"><div class="skill-progress" style="width: 90%"></div></div>
        
        <div class="skill-label"><strong>📝 Academic Writing</strong><span class="skill-percentage">95%</span></div>
        <div class="skill-bar"><div class="skill-progress" style="width: 95%"></div></div>
        
        <div class="skill-label"><strong>🎤 Presentations & Teaching</strong><span class="skill-percentage">90%</span></div>
        <div class="skill-bar"><div class="skill-progress" style="width: 90%"></div></div>
        
        <div class="skill-label"><strong>🔬 Design Science Research</strong><span class="skill-percentage">85%</span></div>
        <div class="skill-bar"><div class="skill-progress" style="width: 85%"></div></div>
        </div>
        
        </div>
    design:
      columns: '1'

  # ---------- PUBLICATION STATS ----------
  - block: markdown
    id: stats
    content:
      title: Research Impact
      text: |
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 20px; margin: 20px 0;">
        
        <div class="stat-card">
          <span class="stat-number">8</span>
          <span>Journal Articles</span>
        </div>
        
        <div class="stat-card">
          <span class="stat-number">16</span>
          <span>Conference Papers</span>
        </div>
        
        <div class="stat-card">
          <span class="stat-number">6</span>
          <span>Workshop Papers</span>
        </div>
        
        <div class="stat-card">
          <span class="stat-number">350+</span>
          <span>Citations</span>
        </div>
        
        <div class="stat-card">
          <span class="stat-number">2</span>
          <span>Best Papers</span>
        </div>
        
        </div>
        
        **Top Venues:** MISQ • JMIS • ACM TMIS • ISF • IEEE ISI • HICSS • AMCIS • ICIS • ACM KDD
    design:
      columns: '1'

  # ---------- CAREER TIMELINE ----------
  - block: markdown
    id: timeline
    content:
      title: Career Journey
      text: |
        <div style="max-width: 600px; margin: 20px auto;">
        
        <div class="timeline-item">
          <span class="timeline-date">2024 – Present</span>
          <div class="timeline-title">Assistant Professor of Computer Information Systems</div>
          <div class="timeline-org">Georgia State University, J. Mack Robinson School of Business</div>
        </div>
        
        <div class="timeline-item">
          <span class="timeline-date">2021 – 2024</span>
          <div class="timeline-title">Adjunct Lecturer</div>
          <div class="timeline-org">University of Arizona</div>
        </div>
        
        <div class="timeline-item">
          <span class="timeline-date">2018 – 2024</span>
          <div class="timeline-title">Research Associate, AI Lab</div>
          <div class="timeline-org">University of Arizona</div>
        </div>
        
        <div class="timeline-item">
          <span class="timeline-date">2018 – 2021</span>
          <div class="timeline-title">NSF CyberCorps Scholarship-for-Service Fellow</div>
          <div class="timeline-org">University of Arizona</div>
        </div>
        
        <div class="timeline-item">
          <span class="timeline-date">2019 – 2024</span>
          <div class="timeline-title">Ph.D. in Management Information Systems</div>
          <div class="timeline-org">University of Arizona • ACM SIGMIS Doctoral Dissertation Award</div>
        </div>
        
        <div class="timeline-item">
          <span class="timeline-date">2017 – 2019</span>
          <div class="timeline-title">M.S. in Management Information Systems</div>
          <div class="timeline-org">University of Arizona</div>
        </div>
        
        <div class="timeline-item">
          <span class="timeline-date">2013 – 2017</span>
          <div class="timeline-title">B.S.B.A. in Management Information Systems</div>
          <div class="timeline-org">University of Arizona • Outstanding Senior Award</div>
        </div>
        
        </div>
    design:
      columns: '1'

  # ---------- PUBLICATIONS ----------
  - block: collection
    id: publications
    content:
      title: Journal Publications
      text: ""
      filters:
        folders:
          - journal_publication
        exclude_featured: false
      count: 10
    design:
      view: citation
      columns: '1'

  - block: collection
    content:
      title: Conference Publications
      text: ""
      filters:
        folders:
          - conference_publication
        exclude_featured: false
      count: 20
    design:
      view: citation
      columns: '1'

  - block: collection
    content:
      title: Workshop Papers
      text: ""
      filters:
        folders:
          - workshop_publication
        exclude_featured: false
      count: 10
    design:
      view: citation
      columns: '1'

  # ---------- BOOK CHAPTERS ----------
  - block: markdown
    id: books
    content:
      title: Book Chapters
      text: |
        1. B. Ampel, Y. Gao, and S. Samtani, "**LLM-Enabled Phishing Generation and Defense**," *Artificial Intelligence in Cybersecurity: Unlocking the Power of Large Language Models*, CRC Press, 2026.
    design:
      columns: '1'

  # ---------- TEACHING ----------
  - block: markdown
    id: teaching
    content:
      title: Teaching
      text: |
        ### Georgia State University
        
        | Course | Title | Semester | Evaluation |
        |--------|-------|----------|------------|
        | CIS 8684 | Cyber Threat Intelligence | Spring 2026 | - |
        | CIS 4730 | Deep Learning for Business | Spring 2026 | - |
        | CIS 8080 | IS Security and Privacy | Fall 2025 | 4.9/5 |
        | CIS 3620 | Career Pathways | Summer 2025 | 5.0/5 |
        | CIS 8684 | Cyber Threat Intelligence | Spring 2025 | 4.9/5 |
        | CIS 4680 | Intro to Security | Spring 2025 | 4.7/5 |
        | CIS 8080 | IS Security and Privacy | Fall 2024 | 4.9/5 |
        
        **Notable:** Co-developed CIS 4730: Deep Learning for Business (2025); Proposed and developed CIS 8684: Cyber Threat Intelligence (2024)
        
        ### University of Arizona (Adjunct/GTA)
        
        | Course | Title | Semester | Evaluation |
        |--------|-------|----------|------------|
        | MIS 562 | Cyber Threat Intelligence | Fall 2023 | 4.6/5 |
        | MIS 611D | Topics in Data Mining (GTA) | Spring 2023 | - |
        | MIS 464 | Data Analytics (GTA) | Spring 2023 | - |
        | MIS 562 | Cyber Threat Intelligence | Fall 2022 | 4.7/5 |
        | MIS 561 | Data Visualization (GTA) | Summer 2022 | - |
        | MIS 562 | Cyber Threat Intelligence | Fall 2021 | 4.5/5 |
        | MIS 562 | Cyber Threat Intelligence | Summer 2021 | 4.0/5 |
    design:
      columns: '1'

  # ---------- INVITED TALKS ----------
  - block: markdown
    id: talks
    content:
      title: Invited Talks & Presentations
      text: |
        1. **Foundation Models for Cybersecurity Applications**  
           AI-Enabled Cybersecurity Workshop at HICSS-58, Hawaii (January 2025)
        
        2. **How Has Generative AI Affected Education, Research, And Practice?**  
           MIS 50th Academic Conference, University of Arizona (March 2024)
        
        3. **Large Language Models for Advanced Text Analytics**  
           AI in Cybersecurity Workshop at HICSS-57, Hawaii (January 2024)
        
        4. **LLM Overview & Advanced Text Analytics**  
           Fall 2023 AI Bootcamp (October 2023)
        
        5. **Deep Learning for The Detection of Vishing Calls**  
           International Conference on Secure Knowledge Management (September 2023)
        
        6. **Analytics and Visualizations/UI in AI for Cybersecurity**  
           AI in Cybersecurity Workshop at HICSS-56, Hawaii (January 2023)
    design:
      columns: '1'

  # ---------- AWARDS ----------
  - block: markdown
    id: awards
    content:
      title: Honors & Awards
      text: |
        - **Robinson College of Business IS Cybersecurity Graduate Program Top Professor** (2025)
        - **ACM SIGMIS Doctoral Dissertation Award** (2024)
        - **Best Paper Award**, IEEE Intelligence and Security Informatics (2023)
        - **Doctoral Consortium**, International Conference on Information Systems (2023)
        - **Doctoral Consortium**, Americas Conference on Information Systems (2023)
        - **Paul S. and Shirley Goodman Scholarship** (2023)
        - **Samtani-Garcia MIS PhD Commitment Scholarship** (2022)
        - **James F. LaSalle Teaching Excellence Award** (2022)
        - **Best Paper Award**, IEEE Intelligence and Security Informatics (2020)
        - **Nunamaker-Chen MIS Doctoral Scholarship** (2020)
        - **NSF CyberCorps: Scholarship for Service Fellow** (2018-2021)
        - **UArizona MIS Undergraduate Outstanding Senior** (2017)
    design:
      columns: '1'

  # ---------- SERVICE ----------
  - block: markdown
    id: service
    content:
      title: Professional Service
      text: |
        ### Editorial Roles
        - **Associate Editor**, ACM Digital Threats: Research and Practice (DTRAP), 2025-Present
        - **Editorial Board**, Journal of Information Systems Education (JISE), 2025-Present
        - **Associate Editor**, ICIS Track on Digital Innovation and Entrepreneurship, 2025
        
        ### Conference Leadership
        - **Co-Chair**, ECIS Ancillary Meetings (2025)
        - **Co-Chair**, HICSS Junior Faculty Consortium (2025-2027)
        - **Co-Chair**, AI4Cyber Workshop at KDD (2024)
        
        ### Program Committees
        INFORMS WDS, SWAIB, IEEE ISI, WITS, ACM CCS AISec Workshop, ICDM Data Mining for Cybersecurity, AI4Cyber-KDD
        
        ### Journal Reviewing
        EJIS, ISJ, MISQ, IJIM, JMIS, IPM, Computers & Security, DTRAP, TRR, TDSC, TMIS
        
        ### Research Affiliations
        - **Academic Mentor**, Collaborative Human-AI Center (CHAI), Georgia State University, 2025-Present
        - **Academic Mentor**, Assistive Intelligence Lab, Georgia State University, 2025-Present
        - **Academic Mentor**, Data Science & AI Lab (DSAIL), Indiana University, 2024-Present
        - **Academic Mentor**, Artificial Intelligence Lab, University of Arizona, 2020-Present
    design:
      columns: '1'
  
  # ---------- MEDIA ----------
  - block: markdown
    id: media
    content:
      title: Public Engagement & Media Coverage
      text: |
        - **"Benjamin Ampel Receives ACM SIGMIS Doctoral Dissertation Award"** — Georgia State University (January 28, 2025)
        - **"More Older Americans Being Scammed; Is Technology a Factor?"** — The National Desk (November 19, 2024)
    design:
      columns: '1'

  # ---------- CONTACT ----------
  - block: contact
    id: contact
    content:
      title: Contact
      email: bampel@gsu.edu
      address:
        street: 55 Park Place NW
        city: Atlanta
        region: GA
        postcode: '30303'
        country: United States
        country_code: US
      coordinates:
        latitude: '33.7537'
        longitude: '-84.3886'
      directions: J. Mack Robinson School of Business, Department of Computer Information Systems
      autolink: true
    design:
      columns: '1'
---
