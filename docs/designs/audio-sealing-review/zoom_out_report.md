# Stage 5: Initial Zoom Out (egm-zoom-out, Sonnet) on audio-sealing.md

Major
1. A1 vs A2: state the only reason to choose A1 (off-turn audio and spoken-answer items) in one sentence; quantify Study 2's non-turn audio.
2. The 24-hour previous-key grace window is speculative given "rotate only between batches"; accept only the current key and state the rule.
3. Four recordingError codes are more than needed; CUJ 5 and the file list disagree (seal_required missing from CUJ 5).
4. recordings.mjs pull duplicates the admin download; size the hand-audit set first; if a CLI stays, fold it into scripts/lab/seal.mjs.
5. O1/O2 doubles UI and test paths; implement one path, O2 as removal only.

Nit
6. Implementation plan drops to code-level detail (signatures, sessionStorage key format, concurrency).
7. Line-number references into code will drift; cite function names.
8. router.mjs entry is a no-op; delete.
9. T1 cost (LLM history, debrief, D2 plaintext copy in sessionStorage) should be stated in Decisions.
10. Resolve the mini log [VERIFY] before deciding T1.
