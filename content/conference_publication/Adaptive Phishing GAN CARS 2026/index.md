---
title: 'Adaptive Phishing URL Classification: A Generative Adversarial Approach'

authors:
  - Noah Abdellatif
  - Mason Wagner
  - admin
  - James Hu
  - Zara Ahmad-Post
  - Hsinchun Chen

date: '2026-10-26T00:00:00Z'

publishDate: '2026-10-26T00:00:00Z'
url: "/conference_publication/adaptive-phishing-gan-cars-2026/"

publication_types: ['1']

publication: In *Proceedings of the 2026 IEEE Cyber Awareness and Research Symposium (CARS)*
publication_short: In *IEEE CARS*

abstract: "Uniform Resource Locators (URLs) are foundational for navigating the internet. However, URLs remain a critical cybersecurity threat. Billions of URL-based phishing attempts are logged annually. Extant machine and deep learning phishing URL detectors often report accuracy exceeding 95%. However, these models are often trained on outdated datasets that fail to capture current phishing URL patterns. Generative Adversarial Networks (GANs) offer a pathway to improve classifier robustness on unseen data. These networks are predominantly implemented with traditional deep learning generators. We therefore propose a GAN framework that pairs a transformer-based generator with a ModernBERT discriminator and trains them using a reinforcement learning policy-gradient mechanism with a novel multi-signal reward function. The discriminator is pretrained on historical URLs and evaluated on a proprietary dataset of modern phishing URLs to simulate realistic deployment. GAN-based fine-tuning improved the classifier's recall on modern URLs by about 5% on average, indicating that adversarial generation can create generalizable URL classifiers that adapt to evolving attacks."

tags:
- Phishing Detection
- Generative Adversarial Networks
- Adversarial Machine Learning
- URL Classification
- Deep Learning

featured: false

url_pdf: ''
plain_summary: "Phishing detectors trained on old data quietly lose their edge as attackers change tactics. This paper trains a generator to invent realistic new phishing URLs and pits it against a detector, so the detector learns to handle attacks it has never seen. Tested against a private feed of current phishing links from 2024–2025, the adversarially trained detector caught about 5% more modern phishing URLs, showing this cat-and-mouse training helps classifiers keep up with evolving threats."
---
{{< publication_extras >}}
