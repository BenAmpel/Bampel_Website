# Programmatic attention and citation sources (checked 2026-11-02)

This note answers one question: can bampel.com get Altmetric scores, or similar data, by script within each
provider's terms? It adds option P4 to `design.md` (Change A). P4 has not been reviewed by the Goldfish reviewers.

## Altmetric: no permitted programmatic route for the website

* **Every API call needs a key.** A keyless test of
  `GET https://api.altmetric.com/v1/doi/10.1109/ISI.2019.8823238` returned 403: "As of 10 November 2025, all users
  need an API key".
* **Free keys do not cover Ben's site.** Free keys, Counts Only or Full Access, go only to university-affiliated
  scientometrics researchers working on a one-off project. They last at most six months and exclude self-assessment.
  The free-tools terms limit API data to "internal, academic research purposes". Older wording that allowed showing
  your own scores on a personal website no longer appears on any current page.
* **Badges are the permitted route.** Individual researchers may embed the badges on a personal homepage for their own
  outputs, and the site already does this (`layouts/partials/media/altmetric_badge.html`). Altmetric's free-badges
  page also asks badge users to tell them, and in return it unlocks the full details pages. That costs Ben one email.
* **Reading or summing badge data by script.** The badge pages do not mention it. The terms do exclude any
  non-internal use of data derived from the free tools, so summing badge data for public display falls outside them.
* **The paid route.** A licence through GSU, or a paid API contract, allows display "as and where you choose". This
  search found no evidence that GSU licenses Altmetric. The library can confirm.

**Verdict:** Change A stands. Delete the scraper, keep the badges, and show no Altmetric aggregate.

## Other sources tested

| Source | Gives | Key? | Terms for display on Ben's site | Live test 2026-11-02 |
| --- | --- | --- | --- | --- |
| **Dimensions Metrics API** (`metrics-api.dimensions.ai/doi/<doi>`) | Citations (`times_cited`, `recent_citations`, `field_citation_ratio`) | No | Allowed for "work you have authored", for personal, non-commercial use. Limits: at most 1 request per second; the page must credit and link dimensions.ai; only the latest metrics may be shown ([terms](https://dimensions.ai/policies/terms/metrics/), [badges](https://badge.dimensions.ai/)) | All 23 DOIs answered at 1 request/s. Sum of `times_cited` = 322; the Sawtooth ISI 2019 paper = 97. The site already loads Dimensions badges (`assets/js/widgets/dimensions-badge.js`). |
| **OpenAlex** | Citations by year | No | CC0 | Works (Sawtooth = 94). The repo already fetches it (`scripts/fetch_openalex.py`). |
| **Scopus Abstract Citations Count API** (Elsevier) | Scopus cited-by counts | Free Elsevier key | The policy "Showing Scopus cited-by counts on your website" allows a researcher homepage, with a link back to Scopus and a refresh at least weekly ([policy](https://dev.elsevier.com/policy.html)) | Not tested (no key) |
| **PlumX Metrics API** (Elsevier) | Mentions, captures, social, usage | Key plus an institutional Scopus subscription | No PlumX-specific display policy; Elsevier says to contact them | 401 without key. GSU's Scopus access is unknown. |
| **Overton** | Citations in policy documents | Free researcher account; API added on request (support@overton.io) | Free for non-commercial academic research. Website display is not addressed. | Not tested |
| **Mendeley catalog** (`view=stats`) | Reader counts | OAuth developer key | The terms page returned 403, so the terms are unverified | 401 without key |
| **Lens.org** | Patent citations | Institutional subscription only; individuals get a manually approved trial | Lens logo required | 401 without key |
| **Bluesky search** | Posts mentioning a DOI or name | Account app password; public search now returns 403 | Would mean storing an account credential as a repository secret | 403 without auth |
| **Hacker News (Algolia)** | Stories linking a paper | No | Public API | Works; 0 hits |
| **Wikipedia search** | Pages citing a DOI | No | Public API | 0 hits for 23 DOIs |

## Recommendation (Ben decides)

1. **Altmetric.** Keep the per-paper badges and delete the scraper (Change A). Optionally, email Altmetric so it
   unlocks the details pages for the badges.
2. **Add P4 to Change A: a weekly citations line from Dimensions.** This is the only source that is keyless,
   programmatic, and explicitly allowed to show metrics for Ben's own work on his site. Example line: "322
   citations across 23 papers with DOIs (Dimensions, updated 2 November 2026)", linked to dimensions.ai.
   * It is a citation count, not an attention score, so the site replaces a summed Altmetric number with a figure
     whose source and meaning are plain.
   * **arXiv DOIs.** Three DOIs are arXiv preprints (`10.48550/...`). A check on 2026-11-02 found that none has a
     published twin on the site, so all 23 count. The script drops an arXiv DOI only when a published entry has the
     same title.
   * **Refresh.** The "latest metrics only" term means a weekly refresh, which the existing Monday metrics job already
     provides.
   * **Failures.** A failed run keeps the last good file and never writes zeros.
3. **Scopus cited-by counts** are an equivalent alternative. They need a free Elsevier key and a weekly refresh.
4. **Overton** is worth one email to support@overton.io for a free researcher account. Policy citations are the
   high-value signal that Altmetric would have counted. Check the display terms first.
5. **Not worth pursuing now:**
   * Mendeley, Lens and PlumX are gated.
   * Bluesky needs a stored account credential.
   * Hacker News and Wikipedia are free but found nothing.

## Sources

[Altmetric free tools](https://www.altmetric.com/solutions/free-tools/) ·
[Altmetric free-tools terms](https://www.altmetric.com/solutions/free-tools/terms-of-use/) ·
[Details Page API licensing](https://docs.altmetric.com/details-page-api/licensing/) ·
[Altmetric API key announcement](https://updates.altmetric.com/announcements/upcoming-changes-to-the-altmetric-details-page-api) ·
[Altmetric researcher access](https://www.altmetric.com/our-audience/researchers/research-access/) ·
[Altmetric badges](https://docs.altmetric.com/badges/getting-started/) ·
[Dimensions Metrics API terms](https://dimensions.ai/policies/terms/metrics/) ·
[Dimensions badges](https://badge.dimensions.ai/) ·
[Elsevier API policies](https://dev.elsevier.com/policy.html) ·
[PlumX Metrics API](https://dev.elsevier.com/documentation/PlumXMetricsAPI.wadl) ·
[Lens API terms](https://about.lens.org/lens-scholarly-api-terms-of-use/) ·
[Overton FAQ](https://help.overton.io/?p=40) ·
[Bluesky 403 issue](https://github.com/bluesky-social/bsky-docs/issues/332)
