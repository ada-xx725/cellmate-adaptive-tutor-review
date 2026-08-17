# CellMate Formal Action-Quality Evaluation Protocol v2

Protocol version: `action-quality-protocol-v2`

Policy suite: `evaluation-policy-suite-v3`

Status: frozen after operational connectivity checks and before any v2 selector or judge request

## Supersession and contamination boundary

Protocol v2 supersedes the unexecuted v1 formal suite. During connectivity diagnosis, `heldout-006` from the v1 pack was sent to candidate selector and judge models. No v1 formal artifacts were produced, but that exposure prevents the v1 pack from remaining fully unseen. V2 therefore uses new state identities and replaces the complete four-state accumulator cluster that contained the exposed state. V1 source files remain unchanged for audit and no v1 debugging output is included in formal results.

No v2 state may be used for provider selection, prompt tuning, product changes, or another preflight model request. Operational preflight for v2 is limited to credential validation and the provider model-list endpoint.

## Scope and claims

This protocol asks whether the production constrained LLM selector chooses a more appropriate next action than deterministic baselines on constructed beginner-Python learner states.

The evaluation recruits no participants and makes no claim about real-student learning gains, attainment, usability, confidence, or behaviour. Development states, demos, simulations, v1 diagnostics, and other debugging outputs are excluded from formal results.

## Frozen systems

| Component | Frozen identity |
|---|---|
| Fixed baseline | `fixed-v2` |
| Rule-adaptive baseline | `full-adaptive-v1` |
| Secondary no-history ablation | `no-history-v1` |
| Production LLM selector | `llm-next-step-v6` |
| Decision trace | schema v3 |
| State schema | `FORMAL_STATE_SCHEMA_V1.json` |
| State pack | `action-quality-states-v2`, 60 states |
| Judge prompt | `action-quality-judge-v1` |
| Statistics contract | `action-quality-statistics-v1` |

The v2 freeze manifest pins this protocol, production decision boundaries, state-authoring contract, v2 generator, v2 pack, and v2 pack manifest by canonical SHA-256. Results from different protocol or suite versions must not be pooled.

## State-pack design

The pack contains 60 blinded constructed states with exact strata of 8 insufficient/unreliable evidence, 10 first reliable failure, 12 repeated reliable failure, 10 developing-mastery pass, 10 established-mastery/history pass, and 10 narrow positive-coverage pass states.

Source quotas are 40 `course_verified`, 10 `generated_attempt`, and 10 `generic_llm`. Course states cover all five lectures and all ten exercises in `resources/evaluation_set.json`. The pack contains 30 counterfactual pairs and at least 12 meaning-preserving invariance groups. State files contain no expected decision, acceptable action, policy output, learner-after value, or judge label.

The v1 `accumulator_overwritten` cluster is absent. Its v2 replacement uses a distinct implementation that counts input elements instead of summing their values while retaining the frozen `exercise-1_15` coverage requirement.

## Evaluated conditions

Every state is evaluated under `fixed-v2`, `full-adaptive-v1`, `llm-next-step-v6`, and the separately reported `no-history-v1` ablation. All conditions receive the same converted `DecisionInput`; the deterministic evidence gate runs before policy or model selection.

The selector uses `gpt-4o-mini-2024-07-18`. The blinded judge uses `gpt-4.1-2025-04-14`. They are different model families but share the OpenAI provider, which must be reported as a limitation. Configuration is read from separate environment namespaces, and API keys and proxy credentials are never stored in artifacts.

## Executable hard constraints

A record receives a hard-constraint violation when status/action is invalid, evidence sufficiency is contradicted, failed evidence progresses, passed evidence remediates, `NEXT_CONCEPT` lacks a course target, or an LLM-selected action lacks the stable evidence provenance required by prompt v6. These executable checks remain separate from judge scores.

## Independent blinded judge

The judge receives one original blinded state and one candidate status/action. It must not receive policy identity/version, selector model, fallback status, latency, reason codes, or another candidate. Candidate order is deterministic from seed `20260816`.

The judge returns validated JSON containing a score from 1 to 5, critical-error flag, confidence from 1 to 5, concise grounded reason, and one to five stable state evidence IDs. Score 5 is best or essentially best; 4 is clearly appropriate; 3 is permissible but meaningfully suboptimal; 2 has a major educational weakness; 1 is a critical contradiction or unusable decision. Invalid, empty, ungrounded, or contradictory output is repaired once; a second failure remains missing.

The formal judge starts candidates at least 3000 milliseconds apart. This pacing is recorded in the judge manifest and changes throughput only, not prompts, candidate order, validation, repair, or scoring.

## Metrics and statistics

The primary metric is mean judge score per primary condition with a 95% confidence interval and paired state-level differences. Required secondary metrics are hard-constraint violation rate, Needs-Evidence Accuracy, judge critical-error rate, selector fallback rate, judge completion coverage, and exact action/status stability across meaning-preserving invariance groups.

Rates include numerator, denominator, and Wilson 95% intervals. Scores include count, mean, sample standard deviation, and normal 95% intervals. Pairwise differences use a deterministic paired bootstrap with seed `20260816` and 10,000 resamples. These are descriptions of the constructed state pack, not population estimates.

## Formal execution order

1. Validate and hash the v2 pack, generator, invariance manifest, and protocol freeze.
2. From a clean worktree, record the source commit, seed, and redacted selector configuration fingerprint.
3. Run every condition for all 60 states and lock `aq-v2-primary-001` without tuning.
4. Commit the write-once selector records and manifest before judging.
5. Blind and judge completed candidates with 3000 ms minimum start spacing; lock `aq-v2-judge-001`.
6. Commit judge records and manifest before statistics.
7. Generate `aq-v2-summary-001` solely from the locked hash chain using 10,000 resamples.
8. Submit formal results, report, and logbook as separate commits.

Any provider failure, repair, fallback, exclusion, or outage remains recorded. A process failure before artifact creation may be retried after verifying the write-once targets are absent. Once an artifact exists, it is never overwritten or silently rerun. Any formal v2 result that motivates a system change invalidates v2 for confirmatory reporting and requires a new protocol and state split.
