---
# Leave the homepage title empty to use the site title
title: ""
date: 2025-08-25T20:23:54-04:00
type: landing

design:
  # Default section spacing
  spacing: "6rem"

sections:
  - block: resume-biography-3
    id: home
    content:
      username: admin
      text: "I'm an Assistant Professor of Computer Information Systems at Georgia State University pioneering AI-driven cybersecurity research. My work focuses on large-scale text analytics for cyber threat intelligence, leveraging advanced machine learning and large language models to defend against evolving cyber threats. I have published in top-tier journals, including MIS Quarterly and JMIS. [Learn more about my research.](https://robinson.gsu.edu/profile/benjamin-ampel/)"
      button:
        text: Download CV
        url: /uploads/cv.pdf
    design:
      css_class: dark-overlay
      background:
        image:
          filename: atlanta.jpeg
          size: cover
          placement: center
          overlay_color: "#000000"
          overlay_opacity: 0.65

  - block: markdown
    id: stats
    content:
      title: '📊 Research Impact'
      text: |
        **400+ Citations** • **9 h-index** • **6 Journal Papers** • **2 Best Paper Awards**
    design:
      css_class: stats-grid

  - block: markdown
    id: research
    content:
      title: '🔬 Research Excellence'
      subtitle: 'AI-Powered Cybersecurity Innovation'
      text: |-
        My research sits at the intersection of artificial intelligence and cybersecurity, focusing on developing cutting-edge solutions for cyber threat intelligence and adversary modeling. I leverage advanced machine learning techniques, including large language models, to analyze and defend against evolving cyber threats.
        
        **Core Research Areas:**
        
        🎯 **Cyber Threat Intelligence**
        - Large-scale text analytics of hacker forums and dark web content
        - Automated threat detection and classification systems
        - Real-time cyber threat assessment and response
        - MITRE ATT&CK framework mapping and analysis
        
        🤖 **AI/ML for Security**
        - Deep learning applications in cybersecurity
        - Large language models for security text analysis
        - Adversarial machine learning and defense mechanisms
        - Phishing detection and generation systems
        
        📊 **Computational Design Science**
        - Novel methodologies for security research
        - Design and evaluation of security artifacts
        - Empirical validation of security solutions
        - Blockchain security and analysis
        
        **Research Impact:**
        - **400+ citations** with h-index of 9
        - **2 Best Paper Awards** at IEEE ISI (2020, 2023)
        - **6 Journal Publications** in MIS Quarterly, JMIS, and ACM TMIS
        - **16 Conference Proceedings**
        - Active collaboration with industry and government partners
    design:
      columns: '1'

  - block: markdown
    id: latest-research
    content:
      title: '🔥 Latest Research'
      subtitle: 'Recent Breakthroughs'
      text: |
        **Just Published:** Our latest work on voice phishing detection using large audio models has been accepted to MIS Quarterly.
        
        **[Read the Paper →](/publication/ampel-2025-voice-phishing/)**
    design:
      columns: "1"

  - block: collection
    id: publications
    content:
      title: '📖 Recent Publications'
      subtitle: 'Peer-Reviewed Research Contributions'
      text: "My research has been published in leading academic journals and conferences, contributing to the advancement of AI-powered cybersecurity solutions."
      filters:
        folders:
          - publication
        exclude_featured: false
    design:
      view: citation

  - block: markdown
    id: teaching
    content:
      title: '🎓 Teaching Excellence'
      subtitle: 'Educating the Next Generation of Cybersecurity Professionals'
      text: |-
        I'm passionate about preparing students for careers in cybersecurity and information systems. My teaching philosophy emphasizes hands-on learning, real-world applications, and cutting-edge research integration.
        
        **Current Courses:**
        - **CIS 8684 – Cyber Threat Intelligence** (Graduate)
          - Course evaluation: **4.91/5.0** (Spring 2025)
          - Covers threat modeling, intelligence analysis, and AI applications
        
        - **CIS 4680 – Introduction to Information Security** (Undergraduate)
          - Course evaluation: **4.75/5.0** (Spring 2025)
          - Foundational security concepts and practical applications
        
        - **CIS 8080 – IS Security and Privacy** (Graduate)
          - Course evaluation: **4.9/5.0** (Fall 2024)
          - Advanced topics in information security and privacy management
        
        **Teaching Recognition:**
        - **Robinson College of Business' Cybersecurity Graduate Program Top Professor** (2025)
        - **James F. LaSalle Teaching Excellence Award** (2022)
        - Consistently high teaching evaluations across all courses
        
        **Teaching Philosophy:**
        I believe in bridging theory and practice, incorporating real-world case studies and current research findings into the classroom experience.
    design:
      columns: "1"

  - block: markdown
    id: awards
    content:
      title: '🏆 Awards & Honors'
      subtitle: 'Recognition for Academic Excellence'
      text: |-
        **Major Awards:**
        - **Robinson College of Business' Cybersecurity Graduate Program Top Professor** (2025)
          - Recognized as the top professor in the cybersecurity graduate program
        
        - **ACM SIGMIS Doctoral Dissertation Award** (2024)
          - Recognized as the top Information Systems dissertation of the year
          - Awarded at the International Conference on Information Systems (ICIS)
        
        - **Best Paper Awards** (IEEE ISI 2020 & 2023)
          - IEEE International Conference on Intelligence and Security Informatics
          - Recognition for innovative research contributions
        
        - **James F. LaSalle Teaching Excellence Award** (2022)
          - Recognition for outstanding teaching performance
        
        - **NSF CyberCorps Scholarship-for-Service Fellowship** (2018-2021)
          - Full scholarship and stipend for cybersecurity education
          - Competitive national program supporting cybersecurity workforce development
        
        **Additional Recognition:**
        - Doctoral Consortium invitations at ICIS and AMCIS (2023)
        - Paul S. and Shirley Goodman Scholarship (2023)
        - Samtani-Garcia MIS PhD Commitment Scholarship (2022)
        - Nunamaker-Chen MIS Doctoral Scholarship (2020)
        - UArizona MIS Undergraduate Outstanding Senior (2017)
    design:
      columns: "1"

  - block: markdown
    id: research-areas
    content:
      title: '🎯 Research Areas'
      text: |
        **Cyber Threat Intelligence** - Large-scale text analytics (200+ citations)
        
        **AI/ML for Security** - Deep learning applications (150+ citations)
        
        **Computational Design Science** - Novel methodologies (50+ citations)
    design:
      css_class: research-grid

  - block: markdown
    id: contact
    content:
      title: '📧 Contact Information'
      subtitle: 'Get in Touch for Collaboration & Opportunities'
      text: |-
        I'm always excited to discuss research opportunities, potential collaborations, and academic partnerships. Whether you're a student interested in cybersecurity research, a fellow academic looking to collaborate, or an industry professional seeking expertise, I'd love to hear from you.
        
        **Contact Information:**
        - **Email**: [bampel@gsu.edu](mailto:bampel@gsu.edu)
        - **Website**: [bampel.com](https://bampel.com)
        - **LinkedIn**: [Connect on LinkedIn](https://www.linkedin.com/in/benampel/)
        - **Google Scholar**: [View Publications](https://scholar.google.com/citations?user=XDdwaZUAAAAJ)
        - **Office**: Georgia State University, Robinson College of Business
          - Department of Computer Information Systems
          - J. Mack Robinson School of Business
          - 55 Park Place NW, Atlanta, GA 30303
        
        **Research Collaboration:**
        I'm particularly interested in collaborations involving:
        - AI/ML applications in cybersecurity
        - Large-scale text analytics for security
        - Cyber threat intelligence and adversary modeling
        - Phishing detection and generation systems
        - Blockchain security and analysis
        - Large language models for security applications
    design:
      columns: "1"
---
