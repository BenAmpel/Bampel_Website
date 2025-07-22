---
# Leave the homepage title empty to use the site title
title: ""
date: 2022-10-24
type: landing

design:
  # Default section spacing
  spacing: "6rem"

sections:
  - block: resume-biography-3
    id: home
    css_class: dark hero-stroke
    content:
      username: admin
      text: ""
      button:
        text: Download CV
        url: uploads/cv.pdf
    design:
      css_class: dark
      background:
        image:
          # Background image in `assets/media/`.
          filename: atlanta.jpeg
          size: cover
          placement: center
          overlay_color: "#000000"
          overlay_opacity: 0.7
  
  - block: markdown
    id: research
    content:
      title: '📚 My Research'
      subtitle: ''
      text: |-
        My research focuses on Artificial Intelligence for Cybersecurity, with particular interests in cyber threat intelligence, hacker community analytics, phishing detection, and text mining methods. I leverage advanced machine learning (including large language models) to address security challenges in information systems. I'm always open to chatting and collaborating! 
    design:
      columns: '1'
  
  - block: collection
    id: publications
    content:
      title: Recent Publications
      text: ""
      filters:
        folders:
          - publication
        exclude_featured: false
    design:
      view: citation

  - block: markdown
    id: teaching
    content:
      title: Teaching
      subtitle: "Courses I've taught"
      text: |-
        **CIS 8684 – Cyber Threat Intelligence** – Developed and taught a graduate course on cyber threat intelligence (TE eval: 4.91/5).  
        **CIS 4680 – Intro to Security** – Undergraduate course in information security.  
        **CIS 8080 – IS Security and Privacy** – Graduate course in information security.
    design:
      columns: "1"

  - block: markdown
    id: awards
    content:
      title: Awards & Honors
      text: |-
        - **ACM SIGMIS Doctoral Dissertation Award**, 2024 (for the top IS dissertation of the year).  
        - **Best Paper Award**, IEEE International Conference on Intelligence and Security Informatics (ISI) 2020 and 2023.  
        - NSF Scholarship-for-Service Fellowship, 2018–2021 (full scholarship and stipend for cybersecurity study).
    design: { columns: "1" }
---
