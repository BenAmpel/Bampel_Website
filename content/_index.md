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

  # ---------- RESEARCH IMPACT ----------
  - block: research_impact_overview
    id: stats
    content:
      title: Research Impact
      intelligence: |
        {{< spoiler text="🔭 arXiv Research Radar" >}}
        {{< arxiv_radar >}}
        {{< /spoiler >}}

        {{< spoiler text="💼 Grant Experience" >}}

        | Year | Funding Source | Grant Title | Amount | Role | Duration |
        |------|----------------|-------------|--------|------|----------|
        | 2026 | Robinson College of Business | AI-Powered Prosody Training for Vishing Defense | $12,500 | PI | 2026-2027 |
        | 2024 | TSMC | AI4BI Academic Program | $27,000 | Co-PI | 2024-2025 |

        {{< /spoiler >}}

        {{< spoiler text="💰 NSF Grant Opportunities" >}}
        {{< nsf_grants >}}
        {{< /spoiler >}}

        {{< spoiler text="🔗 Semantic Scholar: Citations & Recommendations" >}}
        {{< semantic_scholar >}}
        {{< /spoiler >}}

        {{< spoiler text="📚 OpenAlex: High-Impact Papers in Your Field" >}}
        {{< openalex >}}
        {{< /spoiler >}}

        {{< spoiler text="🗞️ Hacker News: Research Community Pulse" >}}
        {{< hacker_news >}}
        {{< /spoiler >}}

        {{< spoiler text="🏛️ Grants.gov: Open Funding Opportunities" >}}
        {{< grants_gov >}}
        {{< /spoiler >}}

        {{< spoiler text="🔍 OpenCitations: Who Is Citing Your Work" >}}
        {{< opencitations >}}
        {{< /spoiler >}}

        {{< spoiler text="💻 GitHub: Research Tools & Code" >}}
        {{< github_research >}}
        {{< /spoiler >}}

      body: |
        **Selected Venues:** MISQ • JMIS • ACM TMIS • ISF • IEEE ISI • HICSS • AMCIS • ICIS • ACM KDD
        
        [📄 Download Research Summary (PDF) →](/uploads/research-summary.pdf)
        
        [📖 View Google Scholar Profile →](https://scholar.google.com/citations?user=XDdwaZUAAAAJ&hl=en)
        
        ---
        
        {{< spoiler text="📊 Research Dashboard" >}}
        {{< research_dashboard >}}
        {{< /spoiler >}}   

        {{< spoiler text="🧭 Research Storylines" >}}
        {{< research_storylines >}}
        {{< /spoiler >}}

        {{< spoiler text="📈 Publication Quality Trajectory" >}}
        {{< pub_ladder >}}
        {{< /spoiler >}}

        {{< spoiler text="🔬 Research Topic Evolution" >}}
        {{< topic_drift >}}
        {{< /spoiler >}}

        {{< spoiler text="🤝 Authorship & Collaboration Evolution" >}}
        {{< coauthor_evolution >}}
        {{< /spoiler >}}

    design:
      columns: '1'

  # ---------- PUBLICATIONS ----------
  - block: markdown
    id: publications
    content:
      title: Publications
      text: |
        {{< publications_filter >}}

        {{< spoiler text="🧪 Paper Diff View" >}}
        {{< paper_diff >}}
        {{< /spoiler >}}
    design:
      columns: '1'

  # ---------- TEACHING ----------
  - block: markdown
    id: teaching
    content:
      title: Teaching
      text: |
        {{< teaching_outcomes >}}
        
        {{< spoiler text="🎓 Georgia State University (7 courses)" >}}

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
        
        {{< /spoiler >}}
        
        {{< spoiler text="📚 University of Arizona - Adjunct/GTA (7 courses)" >}}
        
        | Course | Title | Semester | Evaluation |
        |--------|-------|----------|------------|
        | MIS 562 | Cyber Threat Intelligence | Fall 2023 | 4.6/5 |
        | MIS 611D | Topics in Data Mining (GTA) | Spring 2023 | - |
        | MIS 464 | Data Analytics (GTA) | Spring 2023 | - |
        | MIS 562 | Cyber Threat Intelligence | Fall 2022 | 4.7/5 |
        | MIS 561 | Data Visualization (GTA) | Summer 2022 | - |
        | MIS 562 | Cyber Threat Intelligence | Fall 2021 | 4.5/5 |
        | MIS 562 | Cyber Threat Intelligence | Summer 2021 | 4.0/5 |
        
        {{< /spoiler >}}
    design:
      columns: '1'

  # ---------- INVITED TALKS ----------
  - block: markdown
    id: talks
    content:
      title: Invited Talks & Presentations
      text: |
        {{< spoiler text="🎤 Invited Talks (7)" >}}
        {{< talks_showcase >}}

        {{< /spoiler >}}
    design:
      columns: '1'

  # ---------- AWARDS ----------
  - block: markdown
    id: awards
    content:
      title: Honors & Awards
      text: |
        {{< spoiler text="🏆 Awards & Honors (12)" >}}
        
        {{< awards_timeline >}}
        
        {{< /spoiler >}}
    design:
      columns: '1'

  # ---------- SERVICE ----------
  - block: service_engagement
    id: service
    content:
      title: Professional Service
    design:
      columns: '1'
  
 # ---------- MEDIA ----------
  - block: media_engagement
    id: media
    content:
      title: Public Engagement & Media Coverage
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
