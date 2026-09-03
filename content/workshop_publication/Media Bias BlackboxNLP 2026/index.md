---
title: 'A Multi-Dimensional Evaluation of Explainability in Media Bias Detection'

authors:
  - Ting Chen
  - Chengjun Zhang
  - admin
  - Sagar Samtani

date: '2026-10-29T00:00:00Z'
doi: ''

publishDate: '2026-10-29T00:00:00Z'
url: "/workshop_publication/media-bias-blackboxnlp-2026/"

publication_types: ['1']

publication: "In *Proceedings of BlackboxNLP 2026: The 9th Workshop on Analyzing and Interpreting Neural Networks for NLP*"
publication_short: In *BlackboxNLP*

abstract: "Detecting media bias automatically is difficult because biased framing is often subtle, yet in domains such as news analysis, accurate predictions alone are insufficient without explanations that reflect the model's underlying reasoning. We present a multi-dimensional evaluation of explainability in encoder-based media bias detection using the Bias Annotations By Experts (BABE) dataset. Specifically, we study BERT and RoBERTa as classifiers (base and large variants) along three complementary axes: predictive performance, explanation plausibility (token-level alignment with expert rationales), and mechanistic faithfulness (whether compact sets of attention heads recover predictive signal under counterfactual rationale masking). To induce variation in plausibility, we additionally investigate attention-supervised finetuning, which incorporates expert rationale annotations as an auxiliary training signal. Attention supervision serves as an intervention on attribution plausibility, while the effectiveness of attribution methods varies substantially across architectures. Circuit analysis further reveals substantial variation in mechanistic recoverability across architectures, suggesting that model scale alone does not determine circuit compressibility. Taken together, our findings suggest that predictive performance, attribution plausibility, and mechanistic faithfulness characterize different aspects of model behavior and should be evaluated separately when studying explainability in media bias detection."

tags:
- Explainable AI
- Bias Detection
- Media Bias
- Natural Language Processing
- Model Interpretability

featured: false

url_pdf: 'uploads/papers/Chen_etal_Ampel_2026_BlackboxNLP_Media-Bias-Explainability.pdf'
plain_summary: "Bias-detection models can flag a biased news sentence, but that alone doesn't tell you whether the model is reasoning the way a person would, or whether its stated reasons are what's actually driving its answer. This paper tests BERT and RoBERTa on media bias detection along three separate axes: how accurate they are, whether their highlighted words match what human experts flagged, and whether those words are truly what the model relies on internally (tested by surgically altering the model's attention circuits). The three measures often disagree with each other, and pushing a model to highlight the 'right' words doesn't reliably make it rely on them internally. The takeaway for anyone deploying these systems: being accurate, being explainable in a human-relatable way, and being faithful to your own internal reasoning are three different properties, and checking one doesn't tell you about the others."
---
{{< publication_extras >}}
