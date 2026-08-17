# Adaptive Next Step Formal Annotation Guide v1

Guide version: `annotation-guide-v1`

Status: frozen before formal held-out state construction

This guide defines the human-reference labels used in Evaluation A. It evaluates the educational quality of a next-step decision; it does not evaluate interface quality, prose style, or whether the system improves later learning outcomes.

## Independence and blinding

Raters judge the learner state, not a system output. They must not see policy names, policy decisions, learner-after values, generated reference labels, or the other rater's answers before both forms are submitted.

Each rater must verify the guide version, state-pack version, and canonical state-pack SHA-256 recorded on the form.

## Information provided

Each state contains the task and expected behaviour, student code, evidence and test coverage, learner mastery before the current attempt, recorded support history, and relevant course context.

## Mastery interpretation

Mastery is a local 0-100 indicator of recent evidence, not a probability or an exam mark.

- `0`: no demonstrated evidence;
- `50`: the initial/default level, representing mixed or incomplete evidence;
- `100`: consistently strong recent evidence.

Use the accompanying `emerging`, `developing`, or `established` band as context rather than as a fixed threshold.

## Step 1: evidence sufficiency

Select `No` when the required check was not run, its output is unavailable or ambiguous, or the state marks it as unreliable. Plausible-looking code is not a substitute for reliable evidence.

If evidence is insufficient:

1. select `NEEDS_EVIDENCE`;
2. state what must be run or clarified;
3. enter `N/A` for all six teaching actions.

The analysis treats those six actions as `NOT_PERMITTED`, not as rater-assigned forbidden actions.

## Step 2: rate every teaching action

| Rating | Meaning |
|---|---|
| `ACCEPTABLE` | Educationally reasonable for this state, even if it is not the best choice. |
| `SUBOPTIMAL` | Could be used, but is unnecessarily weak, repetitive, intensive, inefficient, or slightly early. It is not a critical teaching error. |
| `FORBIDDEN` | A critical teaching error: it contradicts reliable evidence, advances while a material failure remains unresolved, or cannot plausibly address the demonstrated need. |

`FORBIDDEN` is deliberately narrow. It is not the complement of `ACCEPTABLE`. Mere inefficiency, repetition, excessive support, or a weaker choice belongs in `SUBOPTIMAL`.

Choose exactly one primary decision from the actions rated `ACCEPTABLE`.

## Teaching actions

| Action | Operational definition |
|---|---|
| `HINT` | Keep the task and provide one targeted conceptual clue, without an ordered procedure or code structure. |
| `RETRY_WITH_SCAFFOLD` | Keep the task and provide explicit subgoals, an ordered procedure, a code skeleton, or partial structure. |
| `EASIER` | Move temporarily to a separate prerequisite or micro-task that is simpler than the current exercise. |
| `SIMILAR` | Give another task at approximately the same conceptual level for consolidation. |
| `HARDER` | Give a related task with an additional constraint or greater difficulty. |
| `NEXT_CONCEPT` | Change the main learning focus to a later course concept. |

## Primary escalation rule for repeated failure

Use the least intensive action that has not already failed:

| Recorded state | Default primary | Other possible acceptable action |
|---|---|---|
| First local failure; no support recorded | `HINT` | `RETRY_WITH_SCAFFOLD` when organisation is also missing |
| Same failure after a targeted `HINT` | `RETRY_WITH_SCAFFOLD` | `EASIER` may also be acceptable |
| Same failure after a relevant scaffold | `EASIER` | `RETRY_WITH_SCAFFOLD` only when the scaffold was incomplete or not actually attempted |

Never infer that support was provided. Use only `support_received` and `support_outcome` recorded in the state.

## Critical-error boundary

| Evidence and learner state | Normally acceptable | Normally suboptimal | Normally forbidden |
|---|---|---|---|
| Reliable unresolved failure | hint, scaffold, or easier according to support history | `SIMILAR` when it does not directly address the error | `HARDER`, `NEXT_CONCEPT` |
| Reliable pass; mastery still developing | `SIMILAR` | remedial support, `HARDER`, or slightly early `NEXT_CONCEPT` | only an action that contradicts an explicitly unresolved prerequisite |
| Broad pass; established mastery or repeated success | `HARDER`, `NEXT_CONCEPT` | hint, scaffold, easier, or extra similar practice | only an action that contradicts another explicit unresolved failure |
| Narrow pass with missing edge-case coverage | consolidation such as `SIMILAR` | remedial support, `HARDER`, or `NEXT_CONCEPT` | advancement only when the missing coverage corresponds to a demonstrated unresolved requirement |

These are defaults, not mechanical labels. State-specific evidence and history take priority.

## Test coverage

Use `test_coverage` to distinguish broad reliable evidence from a narrow example check. A narrow pass may justify consolidation. Do not assume an untested edge case failed; treat it as weaker positive evidence, not as a hidden failure.

## Confidence

| Score | Meaning |
|---|---|
| 1 | Very uncertain; important information may be missing. |
| 2 | Somewhat uncertain; another primary action may be equally plausible. |
| 3 | Moderately confident. |
| 4 | Confident; the main alternative is weaker. |
| 5 | Very confident; the state strongly supports the decision. |

## Formal annotation procedure

1. Verify the guide and state-pack identities on the rater form.
2. Annotate states independently in the provided order without running a policy.
3. For evidence-sufficient states, rate all six actions before selecting the primary action.
4. Record confidence and a short evidence-based reason.
5. Submit both immutable forms before discussing disagreements.
6. Preserve the original forms and their hashes; resolve disagreements in a separate adjudication record.

Formal reporting separates primary-action agreement, evidence-sufficiency agreement, acceptable-set Jaccard, forbidden-set Jaccard, and adjudicated labels. The pilot states used to develop this guide are excluded from formal results.
