---
title: 'Examining the Robustness of Machine Learning-based Phishing Website Detection: Action-Masked Reinforcement Learning for Automated Red Teaming'

authors:
  - Yang Gao
  - admin
  - Sagar Samtani

date: '2025-05-01T00:00:00Z'
doi: '10.1109/SPW67851.2025.00041'

publishDate: '2025-05-01T00:00:00Z'
url: "/conference_publication/phishing-spw-2025/"

publication_types: ['1']

publication: In *IEEE Security and Privacy Workshops (SPW) - Human-Machine Intelligence for Security Analytics (HMISA)*
publication_short: In *IEEE SPW*

abstract: "As machine learning (ML)-based detectors become increasingly prevalent in identifying phishing websites, attackers are also exploiting their vulnerabilities through evasion techniques. By subtly manipulating phishing websites, attackers can evade detection. The threats posed by evasion attacks necessitate proactive robustness testing of these detectors prior to deployment. Traditional red teaming efforts, where security experts manually emulate attacker behaviors, are labor-intensive and limited in scalability. To address this challenge, we propose an automated red teaming framework leveraging action-masked reinforcement learning (RL) to realistically emulate evasion attacks and evaluate the robustness of ML-based phishing website detectors. Our RL agent is equipped with HTML manipulation techniques commonly used by human attackers. Additionally, action masking ensures the RL agent selects only evasion actions that are feasible for a given website and prevents compromising website rendering. We evaluate our approach by testing the robustness of three ML-based detectors: Logistic Regression, Random Forest, and Convolutional Neural Networks. Experimental results demonstrate that our approach achieves high evasion capabilities and efficiency in converting detectable phishing websites into well-rendered evasion ones, thus effectively testing the robustness of the detectors."

tags:
- Phishing
- Machine Learning
- Reinforcement Learning
- Red Teaming
- Adversarial Machine Learning

featured: false

url_pdf: ''
plain_summary: "Attackers can dodge AI tools that detect phishing websites by subtly altering the site's code. This paper builds an automated \"red team\" that uses reinforcement learning to realistically mimic those evasion tricks, with safeguards so the altered sites still look normal, providing a scalable way to test how robust phishing detectors really are before they're deployed."
---
{{< altmetric doi="10.1109/SPW67851.2025.00041" >}}

{{< dimensions doi="10.1109/SPW67851.2025.00041" >}}

{{< publication_extras >}}
