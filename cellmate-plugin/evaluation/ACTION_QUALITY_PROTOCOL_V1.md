# CellMate Formal Action-Quality Evaluation Protocol v1

Protocol version: `action-quality-protocol-v1`

Policy suite: `evaluation-policy-suite-v2`

Status: frozen before construction of the final state pack and before any formal selector or judge run

## Scope and claims

This protocol answers one question: whether the production constrained LLM selector chooses a more appropriate next action than deterministic baselines on constructed beginner-Python learner states.

The evaluation uses no recruited participants and makes no claim about real-student learning gains. Pilot ratings, development states, demo traces, and results observed while debugging are excluded from formal results. The formal model run, report, and logbook are produced only after all three implementation stages are complete.

## Frozen systems

| Component | Frozen identity |
|---|---|
| Fixed baseline | `fixed-v2` |
| Rule-adaptive baseline | `full-adaptive-v1` |
| Secondary no-history ablation | `no-history-v1` |
| Production LLM selector | `llm-next-step-v6` |
| Decision trace | schema v3 |
| State schema | `FORMAL_STATE_SCHEMA_V1.json` |
| State pack | `action-quality-states-v1`, 60 states |
| Judge prompt | `action-quality-judge-v1` |
| Statistics contract | `action-quality-statistics-v1` |

The freeze manifest pins the protocol, production selector, rule policies, trace constructor, transport, state schema, and state-authoring protocol by canonical SHA-256. A change to any pinned artifact requires a new protocol and suite version; results from different versions must not be pooled.

## State-pack design

The final pack contains 60 blinded states with these exact strata:

| Stratum | Count |
|---|---:|
| Insufficient or unreliable evidence | 8 |
| First reliable failure | 10 |
| Repeated reliable failure with recorded support | 12 |
| Reliable pass with developing mastery | 10 |
| Broad reliable pass with established mastery/history | 10 |
| Reliable but narrow positive coverage | 10 |

Source quotas are 40 `course_verified`, 10 `generated_attempt`, and 10 `generic_llm`. Course states cover all five lectures and all ten exercises in `resources/evaluation_set.json`.

The pack contains at least 12 complete counterfactual pairs. It also records at least 12 meaning-preserving invariance groups in the content-addressed pack manifest. Invariance members retain source, task identity, code, evidence outcome, learner state, and history while rewording only explanatory text.

The pack and its manifest must validate and be hashed before any formal policy request. State files contain no expected decision, acceptable action, forbidden action, policy output, learner-after value, or judge label.

## Evaluated conditions

The primary comparison evaluates every state under:

1. `fixed-v2`;
2. `full-adaptive-v1`;
3. `llm-next-step-v6` using the production prompt, validation, one repair attempt, rule fallback, transport parsing, timeout, and error categories.

`no-history-v1` is a secondary ablation and must be reported separately from the primary comparison.

All conditions receive the same converted `DecisionInput`. The deterministic evidence gate is applied before any policy or LLM selection. The runner records model identity, prompt version, transport outcome, fallback state, latency, source hashes, and a configuration fingerprint; it never records an API key.

## Executable hard constraints

A run record receives a hard-constraint violation when any of the following occurs:

- status or action is outside the fixed decision vocabulary;
- evidence is insufficient but the system returns a teaching action;
- evidence is sufficient but the system returns `needs_evidence`;
- failed evidence produces `HARDER` or `NEXT_CONCEPT`;
- passed evidence produces `HINT`, `RETRY_WITH_SCAFFOLD`, or `EASIER`;
- `NEXT_CONCEPT` is selected without a recorded next course concept;
- an LLM-selected action lacks valid provenance IDs required by prompt v6.

Executable violations are computed without the judge and remain a separate metric.

## Independent blinded judge

The judge receives the original blinded state plus one candidate status/action. It must not receive policy name, policy version, selector model, fallback state, latency, reason codes, or another candidate's decision. Candidate order is deterministic from the recorded run seed.

Where possible, the selector and judge use different providers or model families. If they are identical, the run manifest marks this limitation explicitly. Selector and judge configuration are read from separate environment-variable namespaces.

The judge returns validated JSON with:

- an action-quality score from 1 to 5;
- whether the candidate is a critical teaching error;
- confidence from 1 to 5;
- a concise state-grounded reason;
- one or more references to stable state evidence IDs.

Score anchors:

| Score | Meaning |
|---|---|
| 5 | Best or essentially best next action for the recorded state. |
| 4 | Clearly appropriate, with only a minor alternative preference. |
| 3 | Permissible but meaningfully suboptimal, repetitive, or early. |
| 2 | Major educational weakness, but not a direct critical contradiction. |
| 1 | Critical contradiction of evidence/progression or an unusable decision. |

Invalid, empty, ungrounded, or contradictory judge output is repaired once. A second failure is recorded as a judge failure and contributes no score; it is never replaced with a guessed score.

## Metrics and statistics

Primary metric:

- mean independent judge score per primary condition, with a 95% confidence interval and paired state-level differences.

Required secondary metrics:

- executable hard-constraint violation rate;
- Needs-Evidence Accuracy;
- judge critical-error rate;
- selector fallback rate;
- judge completion coverage;
- exact action/status stability across meaning-preserving invariance groups.

Rates include numerator, denominator, and a 95% Wilson interval. Score summaries include count, mean, sample standard deviation, and a normal 95% interval. Pairwise condition differences use a deterministic seeded paired bootstrap and report the seed and resample count. These summaries describe performance on the constructed state pack; they are not population estimates of real learners.

## Formal execution order

1. Validate and hash the state pack and invariance manifest.
2. Record source commit, dirty-tree status, protocol hash, seed, and redacted selector configuration fingerprint.
3. Run every condition for every state; do not tune from these outputs.
4. Lock and hash raw run records.
5. Blind and judge every candidate with the separately configured judge.
6. Lock and hash judge records.
7. Produce statistics from the locked artifacts.
8. After all three development stages, submit formal results, report, and logbook as separate commits.

Any failure, retry, exclusion, or provider outage is retained in the run log. A held-out result that motivates a system change invalidates this suite for confirmatory reporting and requires a new version and new state split.
