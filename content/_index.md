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
    content:
      # Choose a user profile to display (a folder name within `content/authors/`)
      username: admin
      text: ""
      # Show a call-to-action button under your biography? (optional)
      button:
        text: Download CV
        url: uploads/cv.pdf
    design:
      css_class: dark
      background:
        color: black
        image:
          # Add your image background to `assets/media/`.
          filename: stacked-peaks.svg
          filters:
            brightness: 1.0
          size: cover
          position: center
          parallax: false
  
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
    id: papers
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
