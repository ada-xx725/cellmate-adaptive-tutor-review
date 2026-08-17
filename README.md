# CellMate Adaptive Next Step — IRP Project Dashboard

Last updated: 17 August 2026

This repository develops and evaluates a VS Code/Jupyter decision layer that recommends a constrained next learning action after feedback. The active development branch is `cellmate-adaptive-workflow`; the formal v2 evaluation and report snapshot documented here is `e68c027`.

## Current status

| Area | Status |
|---|---|
| Product | Adaptive Next Step supports course exercises, generated attempts, and explicit self-study tasks. A deterministic evidence gate returns `needs_evidence` when assessment evidence is insufficient. |
| Decision method | Production selector `llm-next-step-v6` chooses among `HINT`, `RETRY_WITH_SCAFFOLD`, `EASIER`, `SIMILAR`, `HARDER`, and `NEXT_CONCEPT`, with validation, one repair attempt, and the `full-adaptive-v1` fallback. |
| Formal evaluation | [`action-quality-protocol-v2`](cellmate-plugin/evaluation/ACTION_QUALITY_PROTOCOL_V2.md) / `evaluation-policy-suite-v3` is frozen. Runs `aq-v2-primary-001`, `aq-v2-judge-001`, and `aq-v2-summary-001` are hash-locked. The LLM mean (3.741) was not higher than fixed (3.729) or rule-adaptive (3.883) in the frozen paired analysis; every primary 95% bootstrap interval included zero. |
| Evidence and reporting | The selector produced 240/240 records; the judge completed 235/240 candidates after 22 repair attempts. The report now integrates the formal v2 results and limitations, but its broader writing sections still require completion and review. No final PDF has been published. |
| Repository status | Formal artifacts are committed locally on `cellmate-adaptive-workflow`. This evaluation task does not push, package a VSIX, or create presentation/recording deliverables. |

## Verification baseline

Run from the indicated directory before protecting a release or formal evaluation commit:

```powershell
cd <repository-root>\cellmate-plugin
npm test                 # baseline: 195/195 Node tests

cd <repository-root>
python -m pytest -q      # baseline: 10/10 Python tests
```

The evaluation-specific checks included in `npm test` validate the evidence fixtures, frozen 60-state pack, runner, blinded judge, statistics, and deterministic simulation pipeline.

## Next three tasks

1. Complete and academically review the remaining introduction, related-work, and implementation prose in `report/final/`; install a LaTeX toolchain before validating a PDF build.
2. Manually verify the OpenAI usage charge and confirm it remained below the approved USD 5 stop line; token usage was deliberately not stored in formal artifacts.
3. Complete the manual notebook checks and later demonstration/package work without modifying or rerunning the locked v2 evaluation.

## Manual gates

- **Repository gate:** do not delete or modify the pre-existing GitHub Actions workflows or required IRP directory structure. Keep the logbook and branch activity current; inactivity issues raised by the scheduled workflow must not be closed manually.
- **Formal-run gate:** v2 is complete and immutable. Any change motivated by its results requires a new protocol and a new uncontaminated state split; do not overwrite or rerun the v2 IDs.
- **Evidence gate:** manually exercise course pass/fail, `needs_evidence`, self-study initiation, generated-attempt reuse, provider fallback, and repeated-click idempotency before the final demonstration.
- **Ethics gate:** no participants were recruited and no real-user learning gains may be claimed. Friend-labelled pilots, demos, and simulations remain development material only.

## Sources of truth

- Product setup and use: [`cellmate-plugin/README.md`](cellmate-plugin/README.md)
- Frozen evaluation authority: [`cellmate-plugin/evaluation/ACTION_QUALITY_PROTOCOL_V2.md`](cellmate-plugin/evaluation/ACTION_QUALITY_PROTOCOL_V2.md)
- Evaluation commands and artifact rules: [`cellmate-plugin/evaluation/README.md`](cellmate-plugin/evaluation/README.md)
- Research timeline: [`logbook/logbook.md`](logbook/logbook.md)
- Chinese source walkthrough: [`cellmate-plugin/docs/ADAPTIVE_CODE_WALKTHROUGH_CN.md`](cellmate-plugin/docs/ADAPTIVE_CODE_WALKTHROUGH_CN.md)
