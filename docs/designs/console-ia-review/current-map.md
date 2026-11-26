# Study admin console: what is there now

Mapped from `static/lab/engine/admin.js` and the type plugins on 2026-11-25. Starting point for the redesign; nothing is changed yet.

## Above the tabs
- Title, "My studies" links, who you are.
- **Preview bar** (editors): pick an arm, "Preview as a participant".

## Top tabs (in this order)
| Tab | Who sees it | What is in it |
|---|---|---|
| Participants | viewer | Counts, Refresh, Download menu (8 exports + codebook, already a dropdown), by-condition chips, filter + table, replay. Owners also get **Backups**, **Live self-test** and **Delete test participants** at the bottom. |
| Pilot report | viewer | Per-item report builder. |
| Figures | viewer | Figure tool. |
| Analyze | viewer | Analysis tool. |
| Integrity | manager | Data-quality tool. |
| Students | manager | Pilot access codes, roster, lookup, extra-credit list. |
| **Study content** | viewer | The editor (see below), save bar, **Versions**, **Study design file**, **Reproducibility bundle**. |
| Team | owner | Researchers on the study and their roles. |
| Encryption | viewer | Sealing keys. |
| Activity | owner | Audit log. |
| *plugin tabs, appended last* | | Chatbot: **Compare** (editor), **Conversations** (manager). Study Builder: **Recordings & calls**. Game: **Game operations**. |

The chat study shows 12 top tabs; the editor is the 7th, under a noun ("Study content") rather than a verb.

## Study content sub-tabs
Each type adds its own tabs first, then the shared ones are appended:

- **Chatbot:** Chatbot, Conditions, Questions
- **Study Builder:** Builder (when the design fits the canvas), Arms & blocks, Items, Decision & directory, Item questions
- **Vignettes:** Conditions & sessions, Items, Item questions, Import a survey
- **Quiz / reaction / game / alert triage:** 1 to 7 of their own
- **Shared, always:** Start-of-session survey, End-of-session survey, Sign-up & consent, Devices & timing, (Block order, Study Builder and vignettes only), Screen text

That gives 8 sub-tabs for the chat study and 11 for the vignette study. They are not in the order a participant meets them: sign-up and consent come first for the participant but sit after both surveys here.

## Things that name the tabs and would need updating if they are renamed
`static/lab/README.md`, `static/lab/guide/index.html`, server messages in `netlify/lib/lab/selftest.mjs`, `game/selftest.mjs`, `import/qsf.mjs`, the participant/envcheck pages, and two tests (`builder-ui`, `admin-tabs-a11y`). The last tab you opened is remembered per study, and `#import` deep-links to a sub-tab.
