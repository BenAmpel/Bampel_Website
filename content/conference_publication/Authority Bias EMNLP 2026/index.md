---
title: 'Authority Bias in Conversational Search Engines for Academic Paper Recommendation'

authors:
  - Uthman Jinadu
  - Parsa Ghazvinian
  - Anjila Budathoki
  - admin
  - Rajshekhar Sunderraman
  - Yi Ding

date: '2026-10-24T00:00:00Z'

publishDate: '2026-10-24T00:00:00Z'
url: "/conference_publication/authority-bias-emnlp-2026/"

publication_types: ['1']

publication: In *Proceedings of the 2026 Conference on Empirical Methods in Natural Language Processing (EMNLP)*
publication_short: In *EMNLP*

abstract: "Large Language Models (LLMs) are increasingly used as conversational search engines for academic literature, yet whether they judge papers on content or on authority signals has not been tested causally. We investigate authority bias: systematic preference for papers based on author prestige, venue, and citations rather than content. Holding title and abstract constant, we vary authority metadata across three counterfactual conditions (original, flipped, boosted) over eight LLMs (five open-weight and three frontier closed-weight). Our experiments show that authority bias is substantial and directional, varies markedly across models, and is only partially addressable through prompt-level debiasing. We further document a say-do gap: debiasing instructions suppress authority mentions far faster than authority-driven flips, so surface auditing systematically underestimates behavioral bias."

tags:
- Large Language Models
- Search Engine
- Bias Detection
- Natural Language Processing
- Conversational Search Engine

featured: false

url_pdf: 'uploads/papers/Jinadu_etal_Ampel_2026_EMNLP_Authority-Bias-Conversational-Search.pdf'
plain_summary: "When you ask an AI chatbot to recommend academic papers, does it judge the paper itself or does it just favor famous authors and top journals? This paper tests that directly by giving eight different LLMs the exact same paper content but changing only the author names, venue, and citation counts. Every model showed a strong, systematic bias toward high-prestige signals, and asking the models to ignore prestige only partially worked: they got better at hiding the bias in their explanations while still acting on it."
---
{{< publication_extras >}}
