---
title: 'Mapping Exploit Code on Paste Sites to the MITRE ATT&CK Framework: A Multi-label Transformer Approach'

authors:
  - admin
  - Tala Vahedi
  - Sagar Samtani
  - Hsinchun Chen

date: '2023-10-01T00:00:00Z'
doi: '10.1109/ISI58743.2023.10297272'

publishDate: '2023-10-01T00:00:00Z'
url: "/conference_publication/mitre-attandck-isi-2023/"

publication_types: ['1']

publication: In *2023 IEEE International Conference on Intelligence and Security Informatics (ISI)*
publication_short: In *IEEE ISI*

abstract: "Cyber-criminals often use information-sharing platforms such as paste sites (e.g., Pastebin) to share vast amounts of malicious text content, such as exploit source code. Careful analysis of malicious paste site content can provide Cyber Threat Intelligence (CTI) about potential threats. In this research, we propose a Convolutional BiLSTM Transformer multi-label classification method that automatically maps paste site exploit source code to the MITRE ATT&CK framework to identify adversarial techniques in support of proactive CTI. The Convolutional BiLSTM Transformer combines a convolutional neural network layer placed before a Transformer block, a concatenated pooling from a global max pooling and global average, and a BiLSTM pair-wise function within the Transformer to capture word and sequence orders. We conducted an multi-label classification experiment where our proposed Convolutional BiLSTM Transformer model achieved state-of-the-art results in terms of accuracy, recall, F1-score, and hamming loss. The results of a case study showed the tactics and tools that are used by malicious actors on paste sites."

tags:
- Cyber Threat Intelligence
- MITRE ATT&CK
- Deep Learning
- Paste Sites
- Exploit Analysis

featured: true

awards:
- Best Paper Award


url_pdf: 'https://ieeexplore.ieee.org/document/10297272'
plain_summary: "This study automatically analyzes malicious code posted on public paste sites like Pastebin and maps it to MITRE ATT&CK, a standard catalog of attacker techniques, to produce early cyber threat intelligence. It introduces a hybrid deep-learning model (combining convolutional, Transformer, and BiLSTM components) that can assign multiple technique labels to each code snippet. The model set new best-in-class performance, and a case study revealed the tactics and tools attackers share on these sites."
---
{{< altmetric doi="10.1109/ISI58743.2023.10297272" >}}

{{< dimensions doi="10.1109/ISI58743.2023.10297272" >}}

{{< publication_extras >}}
