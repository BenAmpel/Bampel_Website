# Site Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the single dense one-page site into five focused, scannable pages (Home / Research / Publications / Teaching / CV) with real top-nav links, keeping the neon look and nearly all existing widgets.

**Architecture:** Each page is a Wowchemy `landing` page (`type: landing` with `sections:` of blocks) — the same mechanism the current `content/_index.md` already uses. We move existing blocks/shortcodes into new page files, trim Home to a calm hero + live-highlights block, and switch the nav from `#anchor` jumps to page URLs. No new component code; the only "logic" reused is the existing `research_impact_overview` block, which already renders live metrics from `/data/scholar-metrics.json`.

**Tech Stack:** Hugo 0.148.2 (Netlify-pinned; system Hugo 0.163 is incompatible — use the `/tmp/hugobin/hugo` 0.148.2 extended binary + Go on PATH). Builds are ~220s; the dev *server* hangs on file-watch over the OneDrive-synced dir, so verify via `hugo --gc` to-disk builds and inspect `public/`.

---

## File Structure

- **Create** `content/research/_index.md` — Research landing page: command center, grant experience, and the analytics widgets, each in its own spaced, headed section.
- **Create** `content/publications/_index.md` — Publications landing page: `publications_filter` + `paper_diff`.
- **Create** `content/teaching/_index.md` — Teaching landing page: `teaching_outcomes` + the two course tables.
- **Create** `content/cv/_index.md` — CV landing page: CV download button + `talks_showcase` + `awards_timeline` + `service_engagement` block + `media_engagement` block + `contact` block.
- **Modify** `content/_index.md` — trim Home to the `about.biography` hero + `research_impact_overview` (with its `intelligence` widgets removed and its `body` reduced to venue line + CTA links); delete the publications/teaching/talks/awards/service/media/contact blocks.
- **Modify** `config/_default/menus.yaml` — replace anchor nav with page links: Home / Research / Publications / Teaching / CV / CCAIR.

Verification is build-based (no unit tests for content/config). Because each full build is slow, per-task checks are content-presence greps on the source; **Task 7 runs the single authoritative build + rendered-output checks.**

---

## Task 1: Create the Research page

**Files:**
- Create: `content/research/_index.md`

- [ ] **Step 1: Create the file with this exact content**

```yaml
---
title: Research
summary: AI-enabled cybersecurity research — live intelligence feeds, funding, and analytics on Dr. Benjamin M. Ampel's work.
type: landing

sections:
  - block: markdown
    id: intelligence
    content:
      title: Live Research Intelligence
      text: |
        {{< research_command_center >}}
    design:
      columns: '1'

  - block: markdown
    id: grants
    content:
      title: Funding & Grants
      text: |
        {{< grant_experience >}}
    design:
      columns: '1'

  - block: markdown
    id: dashboard
    content:
      title: Research Dashboard
      text: |
        {{< research_dashboard >}}
    design:
      columns: '1'

  - block: markdown
    id: storylines
    content:
      title: Research Storylines
      text: |
        {{< research_storylines >}}
    design:
      columns: '1'

  - block: markdown
    id: trajectory
    content:
      title: Publication Trajectory
      text: |
        {{< pub_ladder >}}

        {{< topic_drift >}}
    design:
      columns: '1'

  - block: markdown
    id: collaboration
    content:
      title: Authorship & Collaboration
      text: |
        {{< coauthor_evolution >}}
    design:
      columns: '1'
---
```

- [ ] **Step 2: Verify the file has all six widgets**

Run:
```bash
grep -oE 'research_command_center|grant_experience|research_dashboard|research_storylines|pub_ladder|topic_drift|coauthor_evolution' content/research/_index.md | sort -u | wc -l
```
Expected: `7`

- [ ] **Step 3: Commit**

```bash
git add content/research/_index.md
git commit -m "feat(site): add Research page with relocated research widgets"
```

---

## Task 2: Create the Publications page

**Files:**
- Create: `content/publications/_index.md`

- [ ] **Step 1: Create the file with this exact content**

```yaml
---
title: Publications
summary: Peer-reviewed journal, conference, and workshop publications by Dr. Benjamin M. Ampel.
type: landing

sections:
  - block: markdown
    id: publications
    content:
      title: Publications
      text: |
        {{< publications_filter >}}

        {{< spoiler text="🧪 Paper Diff View" >}}
        {{< paper_diff >}}
        {{< /spoiler >}}
    design:
      columns: '1'
---
```

- [ ] **Step 2: Verify**

Run: `grep -cE 'publications_filter|paper_diff' content/publications/_index.md`
Expected: `2`

- [ ] **Step 3: Commit**

```bash
git add content/publications/_index.md
git commit -m "feat(site): add Publications page"
```

---

## Task 3: Create the Teaching page

**Files:**
- Create: `content/teaching/_index.md`

- [ ] **Step 1: Create the file with this exact content**

```yaml
---
title: Teaching
summary: Courses and teaching outcomes — Georgia State University and University of Arizona.
type: landing

sections:
  - block: markdown
    id: teaching
    content:
      title: Teaching
      text: |
        {{< teaching_outcomes >}}

        {{< spoiler text="🎓 Georgia State University (7 courses)" >}}

        | Course | Title | Semester | Evaluation |
        |--------|-------|----------|------------|
        | CIS 8684 | Cyber Threat Intelligence | Spring 2026 | - |
        | CIS 4730 | Deep Learning for Business | Spring 2026 | - |
        | CIS 8080 | IS Security and Privacy | Fall 2025 | 4.9/5 |
        | CIS 3620 | Career Pathways | Summer 2025 | 5.0/5 |
        | CIS 8684 | Cyber Threat Intelligence | Spring 2025 | 4.9/5 |
        | CIS 4680 | Intro to Security | Spring 2025 | 4.7/5 |
        | CIS 8080 | IS Security and Privacy | Fall 2024 | 4.9/5 |

        **Notable:** Co-developed CIS 4730: Deep Learning for Business (2025); Proposed and developed CIS 8684: Cyber Threat Intelligence (2024)

        {{< /spoiler >}}

        {{< spoiler text="📚 University of Arizona - Adjunct/GTA (7 courses)" >}}

        | Course | Title | Semester | Evaluation |
        |--------|-------|----------|------------|
        | MIS 562 | Cyber Threat Intelligence | Fall 2023 | 4.6/5 |
        | MIS 611D | Topics in Data Mining (GTA) | Spring 2023 | - |
        | MIS 464 | Data Analytics (GTA) | Spring 2023 | - |
        | MIS 562 | Cyber Threat Intelligence | Fall 2022 | 4.7/5 |
        | MIS 561 | Data Visualization (GTA) | Summer 2022 | - |
        | MIS 562 | Cyber Threat Intelligence | Fall 2021 | 4.5/5 |
        | MIS 562 | Cyber Threat Intelligence | Summer 2021 | 4.0/5 |

        {{< /spoiler >}}
    design:
      columns: '1'
---
```

- [ ] **Step 2: Verify**

Run: `grep -c 'teaching_outcomes' content/teaching/_index.md; grep -c 'CIS 8684' content/teaching/_index.md`
Expected: `1` then `2`

- [ ] **Step 3: Commit**

```bash
git add content/teaching/_index.md
git commit -m "feat(site): add Teaching page"
```

---

## Task 4: Create the CV page

**Files:**
- Create: `content/cv/_index.md`

- [ ] **Step 1: Create the file with this exact content**

```yaml
---
title: CV
summary: Curriculum vitae — invited talks, honors and awards, professional service, media, and contact.
type: landing

sections:
  - block: markdown
    id: cv-download
    content:
      title: Curriculum Vitae
      text: |
        [📄 Download full CV (PDF) →](/uploads/cv.pdf)
    design:
      columns: '1'

  - block: markdown
    id: talks
    content:
      title: Invited Talks & Presentations
      text: |
        {{< talks_showcase >}}
    design:
      columns: '1'

  - block: markdown
    id: awards
    content:
      title: Honors & Awards
      text: |
        {{< awards_timeline >}}
    design:
      columns: '1'

  - block: service_engagement
    id: service
    content:
      title: Professional Service
    design:
      columns: '1'

  - block: media_engagement
    id: media
    content:
      title: Public Engagement & Media Coverage
    design:
      columns: '1'

  - block: contact
    id: contact
    content:
      title: Contact
      email: bampel@gsu.edu
      address:
        street: 55 Park Place NW
        city: Atlanta
        region: GA
        postcode: '30303'
        country: United States
        country_code: US
      coordinates:
        latitude: '33.7537'
        longitude: '-84.3886'
      directions: J. Mack Robinson School of Business, Department of Computer Information Systems
      autolink: true
    design:
      columns: '1'
---
```

- [ ] **Step 2: Verify**

Run: `grep -oE 'talks_showcase|awards_timeline|service_engagement|media_engagement|block: contact|/uploads/cv.pdf' content/cv/_index.md | sort -u | wc -l`
Expected: `6`

- [ ] **Step 3: Commit**

```bash
git add content/cv/_index.md
git commit -m "feat(site): add CV page (talks, awards, service, media, contact)"
```

---

## Task 5: Trim the Home page

**Files:**
- Modify: `content/_index.md`

The current `content/_index.md` `sections:` list is: `about.biography` (keep), `research_impact_overview` (#stats, trim), then `publications`, `teaching`, `talks`, `awards`, `service`, `media`, `contact` (DELETE — now live on other pages).

- [ ] **Step 1: Replace the `research_impact_overview` block's `content` and delete the relocated blocks**

Read `content/_index.md` first. Then:

a) In the `research_impact_overview` block, REMOVE the entire `intelligence: |` key and its content (the `research_command_center` + grant experience spoiler), and REPLACE the `body: |` content so the block's `content` becomes exactly:

```yaml
    content:
      title: Research Impact
      body: |
        **Selected Venues:** MISQ • JMIS • ACM TMIS • ISF • IEEE ISI • HICSS • AMCIS • ICIS • ACM KDD

        [📄 Download CV (PDF) →](/uploads/cv.pdf) · [📖 Google Scholar →](https://scholar.google.com/citations?user=XDdwaZUAAAAJ&hl=en)

        [🔬 Explore Research →](/research/) · [🧪 CyberAI Research Center →](/ccair/)
```

This drops the 5 analytics widgets (research_dashboard, research_storylines, pub_ladder, topic_drift, coauthor_evolution) and the command center from Home — they now live on `/research/`. The block still renders the live Impact Snapshot, Trending Research, and Latest Paper partials (which read `/data/scholar-metrics.json`).

b) DELETE these entire blocks from the `sections:` list (everything from `# ---------- PUBLICATIONS ----------` through the end of the `contact` block, i.e. the `publications`, `teaching`, `talks`, `awards`, `service`, `media`, and `contact` blocks). The file must end with the `research_impact_overview` block's `design:`/`columns` followed by the closing `---`.

After the edit, the `sections:` list contains exactly two blocks: `about.biography` and `research_impact_overview`.

- [ ] **Step 2: Verify Home no longer references relocated widgets or blocks**

Run:
```bash
grep -cE 'research_command_center|research_dashboard|research_storylines|pub_ladder|topic_drift|coauthor_evolution|grant_experience|publications_filter|teaching_outcomes|talks_showcase|awards_timeline|block: service_engagement|block: media_engagement|block: contact' content/_index.md
```
Expected: `0`

Run:
```bash
grep -cE 'about.biography|research_impact_overview' content/_index.md
```
Expected: `2`

- [ ] **Step 3: Commit**

```bash
git add content/_index.md
git commit -m "feat(site): trim Home to hero + live highlights"
```

---

## Task 6: Update the navigation menu

**Files:**
- Modify: `config/_default/menus.yaml`

- [ ] **Step 1: Replace the `main:` menu with page links**

Replace the entire `main:` list in `config/_default/menus.yaml` so it reads exactly:

```yaml
main:
  - name: Home
    url: '/'
    weight: 10
  - name: Research
    url: '/research/'
    weight: 20
  - name: Publications
    url: '/publications/'
    weight: 30
  - name: Teaching
    url: '/teaching/'
    weight: 40
  - name: CV
    url: '/cv/'
    weight: 50
  - name: CCAIR
    url: '/ccair/'
    weight: 60
```

Keep any comment header lines above `main:` as-is.

- [ ] **Step 2: Verify no anchor links remain**

Run: `grep -cE "url: '#" config/_default/menus.yaml`
Expected: `0`

Run: `grep -cE "/research/|/publications/|/teaching/|/cv/|/ccair/" config/_default/menus.yaml`
Expected: `5`

- [ ] **Step 3: Commit**

```bash
git add config/_default/menus.yaml
git commit -m "feat(site): switch nav to page links"
```

---

## Task 7: Build and verify the whole site

**Files:** none (verification only). Requires `/tmp/hugobin/hugo` (0.148.2 extended) and Go on PATH. If `/tmp/hugobin/hugo` is missing, download it first:
```bash
cd /tmp && curl -sL -o h.tgz "https://github.com/gohugoio/hugo/releases/download/v0.148.2/hugo_extended_0.148.2_darwin-universal.tar.gz" && tar xzf h.tgz hugo && mkdir -p /tmp/hugobin && mv hugo /tmp/hugobin/hugo
```

- [ ] **Step 1: Build the site (to disk; the dev server hangs on this repo)**

Run: `export PATH="$PATH:$(dirname $(command -v go))" && /tmp/hugobin/hugo --gc 2>&1 | tail -5`
Expected: build completes with no `ERROR` lines; "Total in ..." printed. Note: ~220s is normal.

- [ ] **Step 2: Confirm every page rendered**

Run:
```bash
for p in index research/index publications/index teaching/index cv/index; do test -f "public/$p.html" && echo "OK $p" || echo "MISSING $p"; done
```
Expected: five `OK` lines.

- [ ] **Step 3: Confirm content landed on the right pages (no content lost)**

Run:
```bash
echo "Home (expect command center ABSENT=0, impact stats PRESENT>=1):"
grep -c "research-command-center" public/index.html
grep -c "impact-stats" public/index.html
echo "Research (expect command center + analytics PRESENT):"
grep -cE "research-command-center" public/research/index.html
echo "Publications (expect filter):"
grep -c "publications" public/publications/index.html
echo "CV (expect cv.pdf download + contact):"
grep -c "/uploads/cv.pdf" public/cv/index.html
```
Expected: Home `research-command-center` = 0 and `impact-stats` ≥ 1; Research `research-command-center` ≥ 1; Publications and CV ≥ 1.

- [ ] **Step 4: Confirm the nav shows the six page links**

Run: `grep -oE 'href="/(research|publications|teaching|cv|ccair)/"' public/index.html | sort -u`
Expected: five distinct hrefs (research, publications, teaching, cv, ccair).

- [ ] **Step 5: Confirm the custom layer still loads on a sub-page (not just Home)**

Run: `grep -c "command-center.js\|tsparticles\|citation_title" public/research/index.html; grep -c "tsparticles" public/cv/index.html`
Expected: Research ≥ 1 (the layer + command center load on sub-pages); CV ≥ 1 (tsParticles background present on sub-pages).

- [ ] **Step 6: Commit any fixes**

If steps 2–5 revealed missing content or a block that doesn't render on a sub-page, fix the offending page file and re-run Step 1. Then:
```bash
git add -A
git commit -m "fix(site): address build/verification findings"
```

---

## Notes for the implementer

- These are content (`.md` front matter) and config (`.yaml`) changes only — there is no application code and no unit-test suite to run; verification is the Hugo build + grepping `public/`.
- Preserve YAML indentation exactly (Wowchemy blocks are indentation-sensitive). Each new page is `type: landing`.
- Do NOT delete any shortcode or block partial files — widgets are being relocated, not removed. The individual feed shortcodes from the earlier Command Center work also stay.
- If a custom block (`service_engagement`, `media_engagement`, `contact`, `research_impact_overview`) fails to render on a sub-page during Step 1, that is the main risk; report it — the fallback is to render that section via its underlying partial/shortcode inside a `markdown` block instead of the block type.
- Do not change the theme, colors, animations, or the restored custom layer.
