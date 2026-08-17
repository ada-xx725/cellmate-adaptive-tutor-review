# Adaptive Next Step Annotation Guide v2

Guide version: `pilot-guide-v2`

This guide is for a second diagnostic pilot. Pilot states and responses must not be included in the formal held-out evaluation.

## Purpose and independence

Judge whether the available learner state supports a teaching decision and, when it does, which next-step actions are educationally appropriate. Evaluate the state, not a system output.

Raters work independently, use the same versioned state pack, and must not view policy outputs or another rater's answers before both forms are submitted.

## Information provided

Each state contains:

- exercise, expected behaviour, concepts, and difficulty;
- current student code;
- evidence status, reliability, and test-coverage summary;
- learner mastery before the current attempt;
- previous attempts and any support known to have been provided;
- course position and possible later topics.

Policy names, current recommendations, learner-after values, and reference labels are excluded.

## Mastery interpretation

Mastery is a local 0–100 indicator of recent evidence, not a probability and not an exam mark.

- `0` means no demonstrated evidence of the concept.
- `50` is the initial/default level and represents mixed or incomplete evidence.
- `100` means consistently strong recent evidence.

States also provide a coarse band: `emerging`, `developing`, or `established`. Use the score and band as context, not as a fixed decision threshold.

## Step 1: evidence sufficiency

Select `No` when the check was not run, the output is unavailable or ambiguous, or the state explicitly marks the evidence as low-confidence or unreliable. Plausible-looking code is not a substitute for the required reliable check.

If evidence is insufficient:

1. choose `NEEDS_EVIDENCE` as the primary decision;
2. explain what must be run or clarified;
3. do not rate the six teaching actions.

The analysis pipeline records all teaching actions as `NOT_PERMITTED` for this branch. Raters do not need to enter six repetitive forbidden values.

## Step 2: teaching-action ratings

When evidence is sufficient, rate every teaching action using exactly one category:

| Rating | Meaning |
|---|---|
| `ACCEPTABLE` | Educationally reasonable for this state, even if it is not the best choice. |
| `SUBOPTIMAL` | Not preferred, but not clearly unsafe or seriously inappropriate. |
| `FORBIDDEN` | Contradicts reliable evidence, skips necessary support, or is likely to be materially harmful or wasteful. |

`FORBIDDEN` is not the complement of `ACCEPTABLE`. An action that is merely weaker than the primary choice should normally be `SUBOPTIMAL`.

Choose exactly one `primary_decision` from the actions rated `ACCEPTABLE`. Choose the least intensive acceptable action that is still likely to help.

## Teaching actions

| Action | Operational definition |
|---|---|
| `HINT` | Keep the original task and give one targeted conceptual clue. Do not provide an ordered procedure, code skeleton, or partial implementation. |
| `RETRY_WITH_SCAFFOLD` | Keep the original task and provide explicit subgoals, an ordered procedure, a code skeleton, or partial structure. |
| `EASIER` | Move temporarily to a separate prerequisite or micro-task that is simpler than the current exercise. |
| `SIMILAR` | Give another task at approximately the same conceptual level for consolidation. |
| `HARDER` | Give a related task with an additional constraint or greater difficulty. |
| `NEXT_CONCEPT` | Change the main learning focus to a later course concept. |

## Support history rules

- A previous failure does not prove that a hint or scaffold was provided.
- Do not infer previous support unless `support_received` explicitly records it.
- Repeated failure with no previous scaffold may make both `RETRY_WITH_SCAFFOLD` and `EASIER` reasonable.
- Repeating the same misconception after a recorded scaffold is stronger evidence for `EASIER`.
- Judge the recorded outcome of prior support, not the action name alone.

## Test-coverage rules

Use `test_coverage` to distinguish a broad reliable pass from a narrow example check. Coverage summaries describe categories such as normal, empty, boundary, negative, or malformed inputs without exposing hidden test code.

A narrow pass may still justify consolidation. A broad pass gives stronger evidence when considering `HARDER` or `NEXT_CONCEPT`.

## Confidence

| Score | Meaning |
|---|---|
| 1 | Very uncertain; important information may be missing. |
| 2 | Somewhat uncertain; another primary action may be equally plausible. |
| 3 | Moderately confident. |
| 4 | Confident; the main alternative is clearly weaker. |
| 5 | Very confident; the state strongly supports the decision. |

## Second-pilot procedure

1. Verify the state-pack version and SHA-256 shown on the rater form.
2. Annotate all `pilot-B` states without consulting the other rater or running any policy.
3. For evidence-sufficient states, rate all six actions before selecting the primary action.
4. Record confidence, a short reason, completion time, and guide feedback.
5. Submit both private forms before discussing disagreements.

The second pilot is successful enough to freeze the formal guide when evidence-decision agreement is 100%, primary agreement is at least 80%, primary kappa is at least 0.6, and both acceptable and forbidden agreement measures are at least 0.8. These are readiness criteria for the annotation process, not research hypotheses or system-effectiveness outcomes.
