# Adaptive Next Step Evaluation Protocol

Status: Evaluation A frozen by `ACTION_QUALITY_PROTOCOL_V1.md`; Evaluation B remains draft

Frozen action-quality suite: `evaluation-policy-suite-v2`

The authoritative freeze for Evaluation A is `ACTION_QUALITY_PROTOCOL_V1.md` plus `ACTION_QUALITY_PROTOCOL_FREEZE_V1.json`. If this overview conflicts with the frozen document, the frozen document controls.

Previous rule-only freeze: local Git tag `evaluation-policy-suite-v1`

The development split is for debugging only. Its results are not evidence of effectiveness and will not be reported as held-out performance. The LLM selector prompt, model, parameters, validation checks, and fallback rules must be frozen before the new held-out evaluation is run.

## Ethics boundary

The current IRP does not have ethics approval for participant research. It must
therefore not recruit students, friends, or other people to produce study data,
and it must not use informal human ratings as evidence of system effectiveness.
Pilot rating forms already produced are development material only: they may
reveal ambiguities in the annotation guide, but they are not formal evaluation
results.

The formal evaluation for this IRP will use constructed learner states,
automated policy comparisons, controlled LLM-based simulations, and executable
Python tests. A real-user study may be proposed as future work only after the
required ethics approval has been obtained.

## Evaluation A: Action quality

Research question: does the constrained LLM selector produce more appropriate next actions than fixed and rule-based baselines?

Conditions:

- `FixedPolicy` (`fixed-v2`): reliable failure produces `RETRY_WITH_SCAFFOLD`; reliable pass produces `SIMILAR`.
- `FullAdaptivePolicy` (`full-adaptive-v1`): rule-based baseline using learner mastery and attempt history.
- `LlmDecisionEngine` (`llm-next-step-v5`): the production selector, constrained to the same six actions and checked against the evidence and learner-progression gates. A reliable pass can only progress through `SIMILAR`, `HARDER`, or `NEXT_CONCEPT`; remedial actions are rejected. For failed work, the selector distinguishes a small first-error `HINT`, a structured `RETRY_WITH_SCAFFOLD`, and an `EASIER` prerequisite task.
- `NoHistoryPolicy` (`no-history-v1`) may be reported as a secondary mechanism ablation, but it is not the main research comparison.

All conditions share the same deterministic evidence gate. Not-run, unavailable, or low-confidence evidence must produce `needs_evidence` rather than an LLM or rule teaching action.

The student-facing intervention content is versioned separately: failed-work diagnosis uses `adaptive-feedback-v3`, while action-specific hint/scaffold content uses `next-step-support-v1`. A hint must not contain solution code; a scaffold must contain a visible incomplete placeholder.

Metrics:

- Independent LLM-judge action score under a frozen rubric.
- Hard-constraint violation rate: invalid action, evidence contradiction, missing course target, or teaching action when evidence is insufficient.
- Needs-Evidence Accuracy: proportion of evidence-insufficient states correctly returning `needs_evidence`.
- Stability under meaning-preserving rewordings of the same state.
- Critical-error rate, reported separately from average judge scores.

The evaluated selector and the LLM judge must use different model configurations where possible. Judge prompts and outputs are versioned, and executable hard checks are reported separately from subjective judge scores. Existing friend-labelled pilot material is development-only and is not part of the formal held-out result.

## Evaluation B: Learning consequence

Research question: does adding an adaptive next-step recommendation improve subsequent performance compared with feedback alone?

Conditions:

- `feedback_only`: shared feedback with no next-step recommendation.
- `fixed_next_step`: the same feedback plus a decision from `FixedPolicy`.
- `llm_adaptive_next_step`: the same feedback plus a decision from the constrained LLM selector.
- `rule_adaptive_next_step`: optional secondary ablation using `FullAdaptivePolicy`.

The three conditions must receive identical initial code, task, evidence, hidden learner state, base feedback, model parameters, random seed, and maximum attempt count. The only manipulated variable is the presence and selection method of the next step.

Primary metric:

- Transfer-test pass rate on an unseen but concept-equivalent task without hints or exposed reference tests.

Secondary metrics:

- Next-attempt pass rate.
- Repeated-error resolution rate.
- Attempts to success, capped at five attempts per trajectory.

Evaluation B may use matched simulated trajectories. Executable tests, not an LLM judge, determine Python correctness and transfer success. Simulation results must be described as evidence within the simulated environment, not conclusive real-student learning gains. A real-user pilot is outside the current IRP evaluation unless ethics approval is obtained.

## Versioning and reporting

- Create and record a new `evaluation-policy-suite-v2` freeze tag only after the LLM selector is stable on development cases.
- Preserve all policy names and individual policy versions in decision traces.
- If held-out results motivate a rule change, create a new suite version and a new evaluation split; do not tune this suite against the original held-out set.
- Report development, held-out action-quality, and simulated learning-consequence results separately.
