---
title: 'Understanding the Role of Prompt Template in Knowledge Distillation for Safety Alignment'

authors:
  - Anjila Budathoki
  - Manish Dhakal
  - admin
  - Yi Ding

date: '2026-10-24T00:00:00Z'

publishDate: '2026-10-24T00:00:00Z'
url: "/conference_publication/prompt-template-emnlp-findings-2026/"

publication_types: ['1']

publication: In *Findings of the 2026 Conference on Empirical Methods in Natural Language Processing (EMNLP)*
publication_short: In *EMNLP Findings*

abstract: "Prior research has demonstrated that the choice of prompt template during Supervised Fine-Tuning (SFT) significantly impacts the robustness of safety alignment afterwards. However, the influence of template selection during Knowledge Distillation (KD) from teacher to student remains largely unexplored. Thus, we fill this gap by analyzing how different template configurations influence the pre-existing safety alignment of the student. We observe a significant degradation of safety alignment present in the aligned base instruct-tuned model. Specifically, we find that utilizing chat templates renders the model more compliant with harmful queries compared to a non-chat template. These findings are consistent across three models: LLaMA, Gemma and Qwen model families and are evaluated across multiple safety benchmarks. We further show that using a non-chat template during distillation better preserves the base student's internal representations, while chat template distillation induces a larger representational shift."

tags:
- Large Language Models
- Safety Alignment
- Knowledge Distillation
- Natural Language Processing
- Red Teaming

featured: false

url_pdf: 'uploads/papers/Budathoki_etal_Ampel_2026_EMNLP-Findings_Prompt-Template-Knowledge-Distillation.pdf'
plain_summary: "When a large AI model teaches a smaller one (a process called distillation), the formatting used during that training turns out to matter for safety. This paper shows that distilling with a chat-style template makes the smaller model noticeably more willing to comply with harmful requests than a plain-text template does, consistent across three different model families. Using the plain-text template also better preserves the smaller model's original internal behavior, giving practitioners a simple, low-cost lever for safer distillation."
---
{{< publication_extras >}}
