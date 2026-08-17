# CellMate Adaptive Next Step — Tutor Review Snapshot

This is a private, history-free review snapshot prepared on 18 August 2026
from source commit `af6f15cf91fe6d3030e34bc2f549519b4e369e5b`.

## Suggested review order

1. Read `README.md` for the project status and current research claim.
2. Read `cellmate-plugin/docs/ADAPTIVE_CODE_WALKTHROUGH_CN.md` for a
   beginner-friendly implementation walkthrough.
3. Inspect `cellmate-plugin/src/` for the production decision layer.
4. Inspect `cellmate-plugin/evaluation/ACTION_QUALITY_PROTOCOL_V2.md` and
   `cellmate-plugin/evaluation/results/aq-v2-summary-001.statistics.md` for the
   locked formal evaluation.
5. Read `report/final/final-report.tex` for the current report draft.

## Questions for tutoring

- Are the research question, claimed contribution, system design, and outcome
  measures aligned?
- Which conclusions are supported by the action-quality evaluation, and which
  would require human raters or a learner study?
- Is a new confirmatory evaluation justified, and how should it control judge
  noise, duplicated candidates, history ablation, and multiple comparisons?
- Is the safest contribution framing an LLM advantage claim, or a constrained,
  auditable hybrid decision architecture?
- Which parts of the TypeScript implementation must the student be able to
  explain independently at the defence?

## Sanitisation boundary

This repository intentionally excludes Git history, local environment files,
API credentials, caches, generated build outputs, recordings, presentation
files, the course submodule, institutional CI/submission scaffolding, the
project logbook, and private working notes. Formal evaluation artefacts are
included because they are necessary to audit the reported results. No learner
participants or personal learner data are included.

This snapshot is for private academic tutoring and review. It is not the
submission repository and should not be redistributed.
