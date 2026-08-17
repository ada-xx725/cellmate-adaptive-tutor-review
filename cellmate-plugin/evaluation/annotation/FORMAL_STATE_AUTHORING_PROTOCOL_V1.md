# Formal held-out state authoring protocol v1

Protocol version: `formal-state-authoring-v1`

Annotation guide: `annotation-guide-v1`

Status: frozen before held-out state construction

## Separation from development and pilots

- Development states remain debugging material only.
- Pilot A, B, and C states, code, histories, and labels must not be copied or paraphrased into the formal set.
- Formal states must be written without running `FixedPolicy`, `NoHistoryPolicy`, or `FullAdaptivePolicy`.
- Authoring files must not contain expected status, primary actions, acceptable actions, forbidden actions, policy outputs, or learner-after values.
- Policy outputs are generated only after both human forms and the adjudicated reference labels are frozen.

## Target dataset

Create 60 held-out action-quality states in six strata:

| Stratum | Target |
|---|---:|
| Insufficient or unreliable evidence | 8 |
| First reliable failure with no recorded support | 10 |
| Repeated reliable failure with explicit support history | 12 |
| Reliable pass with developing mastery | 10 |
| Broad reliable pass with established mastery or success history | 10 |
| Reliable but narrow positive coverage | 10 |

The 60 states should include 40 `course_verified`, 10 `generated_attempt`, and 10 `generic_llm` states. Course states must cover all five required lectures and the ten representative evaluation exercises.

Include at least 12 counterfactual pairs. Members of a pair share task, code, and current evidence while changing only learner mastery, attempt history, or recorded prior support.

## Human-reference subset

After all 60 states are complete and content-addressed, select 24 states using a recorded stratified procedure:

- four states from each of the six strata;
- 16 course states, four generated-attempt states, and four generic states where feasible;
- at least four complete counterfactual pairs;
- representation from all five course lectures.

Record the selection script or random seed, the source-pack hash, and the resulting 24-state hash. Do not replace difficult states after seeing labels or policy results.

## State quality checks

Every state must:

- conform to `FORMAL_STATE_SCHEMA_V1.json`;
- use a unique `heldout-XXX` ID;
- describe expected task behaviour without including a reference solution;
- report evidence reliability and a test-coverage summary;
- explain the mastery scale and provide score/band pairs;
- explicitly record prior support and its outcome when history exists;
- omit all reference and policy labels;
- be reviewable without executing arbitrary learner code.

The state pack, human subset, completed forms, and adjudication record are stored as separate immutable artifacts with canonical SHA-256 hashes.
