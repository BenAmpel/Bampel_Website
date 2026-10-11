---
title: What an AI manuscript check found in 23 retracted papers
subtitle: A developer's test of his own product, with the limits stated
summary: A test of whether an AI pre-submission review would have pointed at the documented problem in 23 open-access papers retracted for errors visible in the manuscript. It did in 14, partly in 4, and missed 5.
date: 2026-10-11T18:00:00-04:00
authors:
  - admin
tags:
  - Research methods
  - Retractions
  - Large language models
featured: false
---

I build Paper Review, an AI pre-submission check for manuscripts, so this is a developer's test of his own product and not an independent evaluation.

The question was narrow. Some papers are retracted for errors that were, in principle, visible in the manuscript (a wrong unit conversion, a table that contradicts the text). Would a pre-submission review have pointed at the documented problem?

**Method.** I selected 23 open-access papers (published 2015 to 2024, 11 from PLOS ONE and 3 from Cureus) whose retraction notices give a specific reason that could be checked in the text. I found the notices through Crossref's retraction records (which include the Retraction Watch data) and left out fabrication and misconduct. I took each full text from Europe PMC's XML service and typeset it, which dropped the figures and some tables and equations. Each paper went through the production review with no hint that it had been retracted. A separate model then read only the notice's reason and the review's findings and answered yes, partly or no. I read every verdict against the report.

**Results.** The review pointed at the documented problem in 14 papers, partly in 4, and missed 5. I count 11 or 12 of the 14 as clear matches. Where the notice itself said the error was visible in the manuscript, the review found it in 9 of 11 papers. Where that was uncertain, it found it in 5 of 12. Examples include too few events per variable for the number of predictors, a median below the minimum in a table, electron-volt values converted to kcal/mol with the wrong factor, and odds ratios that were the reciprocal of what the counts imply.

**The misses.** Two notices describe clerical mistakes (data from the wrong wave merged into a file) that the published text does not show. Two misses are partly my conversion, which dropped one paper's table and garbled another's equations. One is a plain miss: a paper excluded pauses and unvoiced segments from an acoustic analysis, and the review did not question it.

**Two controls.** A review that flags everything would also score well, so I checked. Six papers that were not retracted averaged 6.5 high-confidence concerns per report, against 6.4 for the retracted set, so the count carries no signal. I also gave the same judge each retraction reason together with a report written for an unrelated paper. It said yes in 2 of 46 cases, against 14 of 23 for the matching reports. Both of the two were real overlaps.

**Limits.** First, I chose retractions with a specific, checkable cause, so subtle flaws and misconduct are not represented. Second, one model scored the results and each paper ran once, so the percentages are not tight. Third, the converted papers have no figures. Fourth, after the test I found that a model output limit cut the end of every report. In 7 of the 23 retracted-paper reports the cut fell inside a section the judge read, and two of the five misses were among them. I have fixed the limit and have not rerun the test, so the counts could move. Fifth, the review reads only what the paper shows, so it cannot catch an error in data the paper does not include. Sixth, I did not check whether the concerns raised on the non-retracted papers are correct, and six papers cannot give a false-alarm rate.

This says nothing about matching a human reviewer. Model fees were about $3.90 per paper (up to $5.40 for papers of up to 58 pages), and the whole test cost about $113.

The method, the results by cause of retraction, and a sample report are at https://purplelink.llc/guides/retracted-papers-paper-review-test/ . I will send the list of papers, with DOIs, retraction reasons and verdicts, on request.
