# Stage 8: Intermediate Zoom Out (egm-zoom-out, Sonnet)

Major
1. F1 bundles three behaviours (refuse writes, block key removal, audited confirmation); cut to refusing writes plus a pre-launch error; list the rest as optional.
2. The weekly canary is an operational process, not 0.25 day of build; make it A1-only and a launch-checklist item.
3. A1 envelope signature heuristics guard a threat with no consequence beyond the participant's own records; drop or justify.
4. Decision 2 should say A1's extra surface (recordingTag, canary, heuristics) buys protection only for between-turn audio.

Nit
5. K2 adds crypto-adjacent code; state its test needs.
6. The implementation plan still has code-level detail.
7. The 24-hour key grace window should be a decision, not a default.
8. recordings.mjs pull is still a separate script although the open question admits the zip may be enough.
