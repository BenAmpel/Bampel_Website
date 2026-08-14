---
title: 'Automated Cross-Repository Vulnerability Variant Retrieval Using Patch-Weighted Contrastive Learning'

authors:
  - Joseph Chen
  - admin
  - Steven Ullman
  - Raul Y. Reyes
  - Hsinchun Chen

date: '2026-10-26T00:00:00Z'

publishDate: '2026-10-26T00:00:00Z'
url: "/conference_publication/vuln-variant-cars-2026/"

publication_types: ['1']

publication: In *Proceedings of the 2026 IEEE Cyber Awareness and Research Symposium (CARS)*
publication_short: In *IEEE CARS*

abstract: "Vulnerabilities propagate across open-source software (OSS) ecosystems through code reuse. However, existing vulnerability management tools often analyze repositories in isolation. Variant analysis can identify semantically similar vulnerable code at scale, but current workflows remain largely manual and expert-driven. To address this, we propose Automated Variant Analysis (AVA), a retrieval model that leverages known vulnerable code snippets and their corresponding patches to identify unremediated variants across OSS repositories. AVA generates vulnerability-preserving variants, represents code with Tree-sitter-based Token Projected Graphs (TPG), and trains embeddings using a patch-weighted supervised contrastive loss. Our results show that supervised contrastive training improves discrimination between vulnerable and patched code, while graph augmentation can reduce separation by pulling structurally similar vulnerable and patched samples closer together. These findings demonstrate that real-world patches can provide scalable supervision for detecting reused or modified vulnerabilities across OSS ecosystems, supporting remediation beyond the repository where a flaw was originally discovered."

tags:
- Vulnerability Management
- Open-Source Software
- Contrastive Learning
- Code Representation
- Variant Analysis

featured: false

url_pdf: 'uploads/papers/Chen_Ampel_2026_CARS_Cross-Repository-Vulnerability-Variant-Retrieval.pdf'
plain_summary: "When a security flaw is found in one open-source project, copies and near-copies of that same flawed code often live on in other projects. This paper presents AVA, a system that learns from known vulnerabilities and their fixes to automatically hunt down those unfixed look-alikes across many repositories at once. It shows that real-world patches can teach a model to tell vulnerable code from fixed code, extending remediation beyond the project where a flaw was first reported."
---
{{< publication_extras >}}
