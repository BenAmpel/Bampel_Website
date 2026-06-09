---
title: "Vendor-Conditioned Contrastive Learning for Predicting Organizational Cyber Threat Targets"

authors:
  - admin

date: 2026-01-01
doi: "10.48550/arXiv.2012.14425"

publishDate: '2026-01-01T00:00:00Z'

publication_types: ['1']

publication: In *arXiv preprint arXiv:2012.14425v2*
publication_short: ''

abstract: "Cyberattacks cause billions of dollars in damage annually, with malicious hackers often sharing exploit code and techniques on underground forums. Identifying which organizations are targeted by these exploits is critical for proactive Cyber Threat Intelligence (CTI). To address that gap, we propose Temporal Representation and Classification of Exploits (TRACE), a vendor-conditioned contrastive learning framework built on CySecBERT that jointly optimizes organizational target classification and vendor-coherent representations while evaluating robustness under temporal distribution shift. Unlike prior work limited to small, single-source datasets, we leverage a large-scale, multi-source corpus spanning 9 exploit databases and hacker forums, comprising 352,866 posts collected over three decades, yielding a 129,126-sample dataset across seven organizational categories. In the temporal out-of-distribution evaluation, TRACE achieves macro F1=97.00%, substantially outperforming 17 benchmark classical ML methods, deep learning with GloVe/FastText embeddings, and pretrained transformer models."

tags: []

featured: false

url_pdf: ''
url_code: ''
url_dataset: ''
url_project: ''
url_slides: ''
url_video: ''

links:
  - name: Scholar
url: "/conference_publication/vendor-conditioned-contrastive-learning-for-predicting-organizational-/"
plain_summary: "This paper presents TRACE, a model that reads exploit posts from hacker forums and exploit databases to predict which kind of organization an attack targets. By tailoring its learning to the software vendor involved and testing on data from later time periods than it trained on, TRACE stays accurate as threats evolve, reaching a 97% macro F1-score and beating a wide range of traditional and deep learning baselines. It is the substantially expanded successor to the earlier HackER \"Predicting Organizational Cybersecurity Risk\" preprint."
---
{{< publication_extras >}}
