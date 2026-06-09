---
title: 'Linking Common Vulnerabilities and Exposures to the MITRE ATT&CK Framework: A Self-Distillation Approach'

authors:
  - admin
  - Sagar Samtani
  - Steven Ullman
  - Hsinchun Chen

date: '2021-08-01T00:00:00Z'
doi: '10.48550/arXiv.2108.01696'

publishDate: '2021-08-01T00:00:00Z'
url: "/workshop_publication/cve-attandck-kdd-2021/"

publication_types: ['1']

publication: In *ACM KDD Workshop on AI-enabled Cybersecurity Analytics*
publication_short: In *AI4Cyber-KDD*

abstract: "Due to the ever-increasing threat of cyber-attacks to critical cyber infrastructure, organizations are focusing on building their cybersecurity knowledge base. A salient list of cybersecurity knowledge is the Common Vulnerabilities and Exposures (CVE) list, which details vulnerabilities found in a wide range of software and hardware. However, these vulnerabilities often do not have a mitigation strategy to prevent an attacker from exploiting them. A well-known cybersecurity risk management framework, MITRE ATT&CK, offers mitigation techniques for many malicious tactics. Despite the tremendous benefits that both CVEs and the ATT&CK framework can provide for key cybersecurity stakeholders (e.g., analysts, educators, and managers), the two entities are currently separate. We propose a model, named the CVE Transformer (CVET), to label CVEs with one of ten MITRE ATT&CK tactics. The CVET model contains a fine-tuning and self-knowledge distillation design applied to the state-of-the-art pre-trained language model RoBERTa. Empirical results on a gold-standard dataset suggest that our proposed novelties can increase model performance in F1-score. The results of this research can allow cybersecurity stakeholders to add preliminary MITRE ATT&CK information to their collected CVEs."

tags:
- CVE
- MITRE ATT&CK
- Deep Learning
- Self-Distillation
- Vulnerability Assessment

featured: false


url_pdf: 'https://arxiv.org/abs/2108.01696'
plain_summary: "This paper bridges two separate cybersecurity resources: the CVE list of known software vulnerabilities and the MITRE ATT&CK framework of attacker tactics and defenses. The authors build a language model called CVET that automatically tags each vulnerability with one of ten ATT&CK tactics, using a self-distillation technique on top of RoBERTa. This lets security teams quickly attach likely mitigation context to the vulnerabilities they track."
---
{{< altmetric doi="10.48550/arXiv.2108.01696" >}}

{{< dimensions doi="10.48550/arXiv.2108.01696" >}}

{{< publication_extras >}}
