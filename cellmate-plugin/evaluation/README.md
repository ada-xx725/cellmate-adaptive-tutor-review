# Action-quality v2 evaluation runbook

The authority for reportable Evaluation A results is [`ACTION_QUALITY_PROTOCOL_V2.md`](ACTION_QUALITY_PROTOCOL_V2.md), frozen as `action-quality-protocol-v2` / `evaluation-policy-suite-v3` by [`ACTION_QUALITY_PROTOCOL_FREEZE_V2.json`](ACTION_QUALITY_PROTOCOL_FREEZE_V2.json). If this runbook or [`PROTOCOL.md`](PROTOCOL.md) conflicts with that frozen contract, the v2 protocol controls. The production selector identity remains `llm-next-step-v6`.

V1 was never formally executed. One v1 state was exposed during connectivity diagnosis, so v2 replaces its complete four-state cluster and assigns new identities. Do not use any v2 state for model selection or connectivity testing.

The committed pack contains 60 constructed learner states. Each state is evaluated under `fixed-v2`, `full-adaptive-v1`, `llm-next-step-v6`, and the separately reported `no-history-v1` ablation, producing 240 condition/state identities before judging.

## Preflight

Run from `<repository-root>\cellmate-plugin`:

```powershell
git status --short
npm test
npm run annotation:evidence:check
npm run eval:states:check
```

Use a clean worktree at the intended source commit for every reportable stage. The runners are write-once: if a requested output path already exists, keep it for audit and choose a new run ID. Do not use `--allow-dirty` for reportable evidence.

## Formal selector run

Confirm the provider, model, budget, and seed before making requests. Credentials are read only from the process environment and are never written to manifests.

```powershell
$env:HTTP_PROXY = "http://127.0.0.1:7897"
$env:HTTPS_PROXY = "http://127.0.0.1:7897"
$env:CELLMATE_EVAL_SELECTOR_API_URL = "https://api.openai.com/v1"
$env:CELLMATE_EVAL_SELECTOR_API_KEY = "selector-secret"
$env:CELLMATE_EVAL_SELECTOR_MODEL = "gpt-4o-mini-2024-07-18"

npm run eval:action-quality:run -- --run-id aq-v2-primary-001 --seed 20260816
```

This creates `evaluation/results/aq-v2-primary-001.records.jsonl` and its hash-locking manifest. Provider failures, timeouts, repairs, and fallbacks remain in the records; do not overwrite or silently remove them.

## Blinded judge run

Use the independent judge namespace and, where possible, a different provider or model family from the selector.

```powershell
$env:CELLMATE_EVAL_JUDGE_API_URL = "https://api.openai.com/v1"
$env:CELLMATE_EVAL_JUDGE_API_KEY = "judge-secret"
$env:CELLMATE_EVAL_JUDGE_MODEL = "gpt-4.1-2025-04-14"

npm run eval:action-quality:judge -- --source-run-id aq-v2-primary-001 --judge-run-id aq-v2-judge-001 --min-candidate-interval-ms 3000
```

The judge sees blinded candidates, verifies source hashes, repairs invalid output once, and records a second failure instead of inventing a score.

## Locked statistics

```powershell
npm run eval:action-quality:statistics -- --source-run-id aq-v2-primary-001 --judge-run-id aq-v2-judge-001 --summary-id aq-v2-summary-001 --resamples 10000
```

The statistics stage verifies the run/judge hash chain and writes JSON, CSV, Markdown, and a manifest. Report judge coverage and failures alongside score summaries, and keep executable hard-constraint metrics separate from judge scores.

## Development-only commands

```powershell
# Rule-policy development split; not held-out evidence
npm run eval:policy -- --split dev

# Deterministic zero-network pipeline rehearsal; not a real-model result
npm run eval:action-quality:simulate -- --simulation-id my-development-check --seed 20260816 --resamples 10000
```

Development states, friend-labelled pilot forms, demo traces, and simulated outputs must not be mixed with formal artifacts or described as effectiveness evidence.

## Ethics and claims boundary

This IRP has no ethics approval for participant research. Do not recruit students, friends, or other people to produce study data, and do not use informal human ratings as formal evidence. The constructed-state action-quality results estimate performance only on this frozen benchmark. Simulated trajectories may test pipeline behavior but cannot establish real-student learning gains; any real-user study is future work contingent on ethics approval and consent.
