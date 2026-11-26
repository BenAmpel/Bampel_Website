# Concept: reorganize the study admin console

## Problem
The lab hosts survey and experiment studies for any researcher (faculty, PhD students, collaborators from other schools), not only lab staff. A researcher who opens a study's admin page cannot tell how to edit the study. The chat study shows 12 top tabs in one row; the editor is the 7th, named "Study content"; the page opens on Participants. Inside the editor there are 8 to 11 sub-tabs not in the order a participant meets them. Rarely used owner tools (backups, self-test, delete test participants, versions, design file, reproducibility bundle) sit at the bottom of busy tabs. See current-map.md for the full inventory.

## Working hypothesis (approved by the product owner for critique)
- Landing tab: a study still in draft (no real sign-ups) opens on "Edit study"; a study with real sign-ups opens on Participants. The last tab you used per study is still remembered when you come back in the same browser session.
- Top bar shrinks to: Edit study · Participants · Results (Pilot report, Figures, Analyze as views inside it) · study-type tabs (e.g. Conversations) · More ▾ (Students, Integrity, Team, Encryption, Activity, and a new "Maintenance" page with backups, self-test, delete test participants, versions, design file, reproducibility bundle).
- Inside Edit study: a side list ordered as the participant meets things: Sign-up & consent → Start-of-session survey → the type's task sections → End-of-session survey → Screen text; then a separate "Settings" group (Devices & timing, Block order).
- Nothing is removed. Role gates (viewer/editor/manager/owner) stay exactly as they are.

## Hard constraints
- Plain JS, no build step, CSP `script-src 'self'` (no eval, no inline scripts).
- `aria-current="true"` on the active tab button is relied on by admin.css and types/vignettes-admin.js.
- Type plugins (static/lab/engine/types/*-admin.js) add top tabs via `plugin.tabs` and editor sections via `plugin.subtabs` (array or function of the draft). They must keep working without each being rewritten.
- `#import` deep-links to the import sub-tab; last tab per study is in sessionStorage `lab_admin_tab_<studyId>`.
- Docs (static/lab/guide/index.html, static/lab/README.md), server messages and tests name "Study content" today.

## Code
Repository root: /private/tmp/bw-console-ia. Main file: static/lab/engine/admin.js (TABS at line 185, start() around 230, showTab, subs() at line 612, sub-tab render around line 826). Styles: static/lab/engine/admin.css. Plugins: static/lab/engine/types/. Tests: tests/lab/admin-tabs-a11y.test.mjs, tests/lab/builder-ui.test.mjs.
