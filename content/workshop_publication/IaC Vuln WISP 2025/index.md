---
title: 'Large Language Models for Infrastructure as Code Vulnerability Remediation'

authors:
  - Raul Reyes
  - admin
  - Hsinchun Chen

date: '2025-12-14T00:00:00Z'
doi: ''

publishDate: '2025-12-14T00:00:00Z'
url: "/workshop_publication/iac-vuln-wisp-2025/"

publication_types: ['1']

publication: In *20th Annual Pre-ICIS Workshop on Information Security and Privacy (WISP)*
publication_short: In *WISP*

abstract: "The growing reliance on Infrastructure as Code (IaC) has streamlined cloud provisioning but introduced new security challenges due to misconfigurations and insecure coding patterns. Existing vulnerability scanners (e.g., Trivy) can detect flaws but cannot perform automated remediation. This leaves developers responsible for manual fixes. To address this, we propose a computational framework for IaC remediation that adapts prevailing Large Language Models (LLMs) with vulnerability scanner outputs using parameter-efficient fine-tuning and in-context learning. We collected 6,149 Terraform scripts from 1,466 repositories, identified 27,557 misconfigurations using Trivy, and constructed 23,906 corrected code blocks for training and evaluation. Two open-source LLMs (CodeGen-350M-mono and Llama 3.2-1B) were fine-tuned with Low-Rank Adaptation (LoRA) and evaluated using BLEU and ROUGE metrics. Results suggested that fine-tuning LLMs improved vulnerability remediation. These findings demonstrate the value of domain adaptation for improving LLM-based IaC remediation and provide a foundation for future research on securing cloud infrastructure."

tags:
- Infrastructure as Code
- Large Language Models
- Vulnerability Remediation
- DevSecOps
- Cloud Security

featured: false

url_pdf: ''
plain_summary: "Infrastructure as Code lets teams set up cloud systems automatically, but the scripts often contain insecure settings that scanners can flag yet not fix. This paper fine-tunes large language models to automatically rewrite vulnerable Terraform code into secure versions, training on thousands of real scripts and their detected misconfigurations. The results show that adapting LLMs to this specific task improves their ability to remediate cloud security flaws."
---
{{< publication_extras >}}
