---
title: 'Semantic Conformance Scoring for Electric Vehicle Charging Station Cybersecurity Review Prioritization Using NIST IR 8473'

authors:
  - Jizell Quijada
  - admin
  - Steven Ullman
  - Hsinchun Chen

date: '2026-12-12T00:00:00Z'
doi: ''

publishDate: '2026-12-12T00:00:00Z'
url: "/workshop_publication/evcs-conformance-wisp-2026/"

publication_types: ['1']

publication: In *21st Annual Pre-ICIS Workshop on Information Security and Privacy (WISP)*
publication_short: In *WISP*

abstract: "Electric Vehicle Charging Stations (EVCS) are increasingly networked components of transportation and energy infrastructure. However, practical methods for translating observed EVCS data into cybersecurity framework-aligned review priorities remain limited. Existing work often emphasizes attack detection and vulnerability discovery but provides less support for standards-based assessment. This paper proposes a semantic conformance-scoring method that maps EVCS asset profiles to task-level guidance extracted from the Identify function of the EVCS-specific NIST IR 8473 framework. In the absence of gold-standard EVCS-to-NIST labels, the study evaluates candidate models using intrinsic diagnostics, including score behavior, rank stability, cross-model convergence, and ablation analysis. A MiniLM + CTI-BERT consensus model was selected based on these criteria. The final scoring converts 17,325 successfully scored EVCS records into ranked NIST IR 8473 Identify-task review profiles. Results suggest that the workflow can support prioritization of EVCS assets for vendor review and identify relevant task areas for follow-up, while the scores should be interpreted as review-prioritization signals rather than verified compliance findings. This work contributes a scalable, framework-grounded workflow for EVCS cybersecurity assessment."

tags:
- Electric Vehicle Charging
- Critical Infrastructure
- NIST IR 8473
- Cybersecurity Assessment
- Semantic Similarity

featured: false

plain_summary: "Electric vehicle charging stations are networked infrastructure, but few tools turn what we can observe about them into security review priorities. This paper scores 17,325 charging station records against the Identify tasks of NIST IR 8473 (the federal cybersecurity profile for charging infrastructure). The scores rank which stations and task areas to review first. They are review priorities, not compliance findings."
---
{{< publication_extras >}}
