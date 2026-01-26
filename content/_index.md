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

  # ---------- TEACHING ----------
  - block: markdown
    id: teaching
    content:
      title: Teaching
      text: |
        ### Georgia State University
        
        | Course | Title | Semester | Evaluation |
        |--------|-------|----------|------------|
        | CIS 3620 | Career Pathways | Summer 2025 | - |
        | CIS 8684 | Cyber Threat Intelligence | Spring 2025 | 4.91/5 |
        | CIS 4680 | Intro to Security | Spring 2025 | 4.75/5 |
        | CIS 8080 | IS Security and Privacy | Fall 2024 | 4.9/5 |
        
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
        - **Associate Editor**, ICIS Track on Digital Innovation and Entrepreneurship, 2025
        
        ### Conference Leadership
        - **Co-Chair**, ECIS Ancillary Meetings (2025)
        - **Co-Chair**, HICSS-58 Junior Faculty Consortium (2025)
        - **Co-Chair**, AI4Cyber Workshop at KDD (2024)
        
        ### Program Committees
        INFORMS WDS, SWAIB, IEEE ISI, WITS, ACM CCS AISec Workshop, ICDM Data Mining for Cybersecurity, AI4Cyber-KDD
        
        ### Journal Reviewing
        MISQ, JMIS, ISJ, IJIM, IPM, Computers & Security, DTRAP, TRR, TDSC, TMIS
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
