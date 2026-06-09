---
title: "HackerSignal: A Large-Scale Multi-Source Dataset Linking Hacker Community Discourse to the CVE Vulnerability Lifecycle"

authors:
  - admin
  - Sagar Samtani
date: 2026-01-01
doi: "10.48550/arXiv.2605.03158"

publishDate: '2026-01-01T00:00:00Z'

publication_types: ['1']

publication: In *arXiv preprint arXiv:2605.03158*
publication_short: ''

abstract: "We introduce HackerSignal, a benchmark for temporal out-of-distribution cyber threat intelligence (CTI) and cross-source CVE linkage. HackerSignal aggregates 7.45 million exact-deduplicated documents from 64 public forum/source identifiers spanning eight source layers and a 36-year window (1990-2026). In contrast to other publicly accessible cybersecurity datasets, HackerSignal is among the first public benchmark datasets that maps the full potential exploit to vulnerability trajectory from hacker community discourse, exploit databases with working and proof of concept exploits, vulnerability advisories, and software fix commits. HackerSignal creates these linkages through a shared CVE identifier space while preserving source-specific release modes to support a range of unique Artificial Intelligence (AI)-enabled cybersecurity analytics tasks. In this paper, we summarize HackerSignal and illustrate three selected benchmark tasks it uniquely supports: (1) CVE linkage retrieval (cross-source temporal out-of-distribution entity grounding); (2) exploit type classification (8-class vulnerability type prediction with temporal OOD evaluation); and (3) temporal generalization (prospective CVE-disjoint evaluation where C_train and C_test are disjoint). All tasks use temporal splits to evaluate prospective generalization. We release source-shortcut and leakage diagnostics, manual-audit packets, a datasheet, and a release-governance addendum to support the dissemination of the dataset. HackerSignal's code, data, and Croissant metadata are available at hf.co/datasets/BenAmpel/HackerSignal (data) and github.com/BenAmpel/hackersignal (code)."

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
url: "/conference_publication/hackersignal-a-large-scale-multi-source-dataset-linking-hacker-communi/"
plain_summary: "This paper introduces HackerSignal, a very large public dataset that stitches together 7.45 million documents from hacker forums, exploit databases, vulnerability advisories, and software fix commits collected over 36 years. Everything is connected through shared CVE vulnerability identifiers, letting researchers trace a security flaw from early hacker chatter all the way to its official patch. The authors demonstrate three AI benchmark tasks the dataset enables and release diagnostics and documentation to support responsible reuse."
---
{{< publication_extras >}}
