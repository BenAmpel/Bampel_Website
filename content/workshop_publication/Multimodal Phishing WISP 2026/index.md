---
title: 'Multimodal Phishing Detection on Social Media: Evaluating Text-Image Fusion'

authors:
  - Kayla Redwing
  - admin
  - Hsinchun Chen

date: '2026-12-12T00:00:00Z'
doi: ''

publishDate: '2026-12-12T00:00:00Z'
url: "/workshop_publication/multimodal-phishing-wisp-2026/"

publication_types: ['1']

publication: In *21st Annual Pre-ICIS Workshop on Information Security and Privacy (WISP)*
publication_short: In *WISP*

abstract: "Social media platforms are a primary vector for phishing attacks that combine text and images to increase credibility. Prior research suggests that multimodal fusion improves classification performance. However, its effectiveness in social media phishing, where images may add noise rather than discriminative signal, remains unclear. We propose PhishFusion, a multimodal detection framework that integrates a Large Language Model-based text encoder, a transformer-based vision model, and a learned fusion mechanism. Following Computational Design Science principles, we evaluate PhishFusion against unimodal baselines, existing multimodal architectures, and 93 fusion configurations. The text-only BERT baseline (F1 = 86.96%) outperforms every multimodal model, including the best PhishFusion configuration (F1 = 81.87%). A case study on 10,000 unseen posts illustrates the artifact's outputs and its false positives. We contribute a reusable detection artifact and a candidate design principle: multimodal fusion helps only when each modality provides discriminative value."

tags:
- Phishing
- Social Media
- Multimodal Learning
- Large Language Models
- Design Science

featured: false

plain_summary: "This paper tests whether combining the text and images of social media posts helps detect phishing. Across 93 fusion designs, a text-only model (F1 = 86.96%) beat every model that also used images (best F1 = 81.87%). Images in phishing posts often add noise, so adding a modality helps only when it carries a real signal."
---
{{< publication_extras >}}
