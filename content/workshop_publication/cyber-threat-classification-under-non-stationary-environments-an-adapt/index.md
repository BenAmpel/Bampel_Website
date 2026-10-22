---
title: "Cyber Threat Classification Under Non-Stationary Environments: An Adapt In-Context Learning (Adapt-ICL) Approach"

authors:
  - Chengjun Zhang
  - Yang Gao
  - admin
  - Sagar Samtani
date: 2026-10-01
doi: ''

publishDate: '2026-10-01T00:00:00Z'

publication_types: ['1']

publication: In *INFORMS Workshop on Data Science (WDS)*
publication_short: In *INFORMS WDS*

abstract: 'Pretrained large language models (LLMs) have demonstrated significant potential for cybersecurity analytics; however, evolving threat behaviors and shifting data distributions can undermine their reliability following deployment. Most existing adaptation methods require continual parameter updates, whereas retrieval-based in-context learning typically assumes that historical demonstrations remain representative over time. To overcome these challenges, Adapt-ICL is introduced as an inference-time adaptation framework that integrates Temporal Global Memory Evolution with Memory-Conditioned Hybrid Retrieval, while maintaining a frozen pretrained LLM backbone. Adapt-ICL is evaluated on the EMBER2024 malware benchmark using six general-purpose and cybersecurity-specific LLMs. Experimental results indicate that Adapt-ICL surpasses existing ICL-based approaches on Accuracy across all six LLMs and on Macro-F1 for five of the six, reduces the performance gap with continual fine-tuning, and sustains stable performance across sequential temporal intervals. These results underscore the effectiveness of memory-guided inference-time adaptation for robust cyber threat classification in non-stationary operational environments.'

tags: []

featured: false

url_pdf: 'uploads/papers/Zhang_etal_Ampel_Samtani_2026_WDS_Adapt-ICL.pdf'
url_code: ''
url_dataset: ''
url_project: ''
url_slides: ''
url_video: ''
plain_summary: "Large language models (LLMs, e.g., the AI systems behind chatbots) can become unreliable at classifying cyber threats as attacker behavior and data shift after deployment. We developed Adapt-ICL, which lets a frozen LLM adapt at answer time by keeping an evolving memory of past examples and retrieving the most useful ones (no retraining required). On the EMBER2024 malware benchmark, Adapt-ICL outperformed existing in-context learning methods (i.e., learning from examples placed in the prompt) on accuracy across all six LLMs we tested and held steady over successive time periods."

url: "/workshop_publication/cyber-threat-classification-under-non-stationary-environments-an-adapt/"
---
{{< publication_extras >}}
