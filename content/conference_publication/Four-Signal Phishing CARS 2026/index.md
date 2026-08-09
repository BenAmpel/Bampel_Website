---
title: 'A Four-Signal Learned Fusion for Near-Real-Time Phishing URL Detection'

authors:
  - Abena M. Darko
  - admin

date: '2026-10-26T00:00:00Z'

publishDate: '2026-10-26T00:00:00Z'
url: "/conference_publication/four-signal-phishing-cars-2026/"

publication_types: ['1']

publication: In *Proceedings of the 2026 IEEE Cyber Awareness and Research Symposium (CARS)*
publication_short: In *IEEE CARS*

abstract: "Phishing URLs remain the primary vector for attackers to steal confidential user information. Cyber analysts triaging URLs during a live incident cannot wait for a page to render or for repeated reputation lookups. URL-only classifiers are fast, but they judge each link in isolation and ignore the surrounding context of the URL. Reputation-assisted systems add that context yet are rarely implemented in URL classifiers for real-time use. In this study, we treat detection as a multi-signal decision and score each URL with (1) a character-level BERT model, (2) a CatBoost lexical model, (3) a VirusTotal reputation lookup, and (4) a Tranco popularity lookup. A learned meta-model combines the four scores into a classification decision. Across seven meta-model configurations, the fusion achieves a mean F1 of 99.2%, compared with 96.5% for the best single detector and 63.5% for plain score averaging. Ablation suggests that additional signals do not necessarily help further. Our proposed pipeline labels a URL in about 0.1 s, or 0.01 s once the deep model is removed, with an F1 score of 99% on a held-out test set. Of the four signals, domain popularity carries by far the most weight and has important implications for cybersecurity."

tags:
- Phishing Detection
- URL Classification
- Model Fusion
- Cyber Threat Intelligence
- Machine Learning

featured: false

url_pdf: ''
plain_summary: "Security analysts need to decide in a fraction of a second whether a link is a phishing attempt. This paper combines four fast signals — a deep language model reading the URL's characters, a lexical model, a threat-intelligence lookup, and a measure of how popular the domain is — and lets a small learned model weigh them together. The combination catches phishing links far more reliably than any single method, labels a URL in about a tenth of a second, and reveals that domain popularity is the single most informative signal."
---
{{< publication_extras >}}
