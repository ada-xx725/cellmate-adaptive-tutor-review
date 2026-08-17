# Adaptive Next Step Pilot Annotation Guide

Guide version: `pilot-guide-v1`

These six states are for testing the annotation instructions only. They must not be included in the formal held-out evaluation.

## Purpose

For each learner state, decide whether there is enough evidence to recommend a teaching action. If there is, judge which next-step actions are educationally appropriate. You are evaluating the state itself, not any system output.

Raters must work independently. Do not discuss individual states or show completed forms to the other rater until both forms have been submitted.

## Information provided

Each state contains:

- the exercise and expected behaviour;
- the student's current code;
- current test or runtime evidence;
- learner mastery before the current attempt, on a 0–100 scale;
- previous attempts, if any;
- course position and possible later topics.

The states intentionally exclude policy names, recommended actions, learner-after values, and reference labels.

## Annotation procedure

1. Read the exercise, student code, and current evidence.
2. Decide whether the evidence is sufficient for a teaching decision.
3. If evidence is insufficient, choose `NEEDS_EVIDENCE` as the primary decision and explain what must be run or clarified.
4. If evidence is sufficient, choose exactly one primary teaching action.
5. Mark any additional actions that would also be acceptable.
6. Mark actions that would be clearly inappropriate or potentially harmful in this state.
7. Give a confidence score from 1 to 5 and a short reason.

Do not apply a numerical mastery threshold. Consider the evidence, mastery, task difficulty, and history together using your teaching judgement.

## Evidence decision

Choose `NEEDS_EVIDENCE` when the check was not run, the output is unavailable or ambiguous, or the evidence is explicitly low-confidence or unreliable. A plausible-looking answer is not a substitute for a reliable test when the state says the check was not run.

When evidence is sufficient, select one of the teaching actions below.

## Teaching actions

| Action | Meaning |
|---|---|
| `HINT` | Keep the learner on the original task and provide a focused clue without supplying a structured solution. |
| `RETRY_WITH_SCAFFOLD` | Keep the original task but add structure such as subgoals, a partial skeleton, or guided steps. |
| `EASIER` | Move temporarily to a separate prerequisite or micro-task that is simpler than the current exercise. |
| `SIMILAR` | Give another task at approximately the same conceptual level for consolidation. |
| `HARDER` | Give a related task with an additional constraint or greater difficulty. |
| `NEXT_CONCEPT` | Move to a later course concept because further practice on the current concept is not the best next use of time. |

Important distinctions:

- `HINT` and `RETRY_WITH_SCAFFOLD` both retain the original task, but scaffolded retry provides more explicit structure.
- `EASIER` changes to a smaller prerequisite task; `SIMILAR` keeps approximately the same level.
- `HARDER` deepens the current concept; `NEXT_CONCEPT` changes the main learning focus.

## Multi-label rules

- `primary_decision` must contain exactly one value: `NEEDS_EVIDENCE` or one teaching action.
- If the primary decision is a teaching action, it must also appear in `acceptable_actions`.
- An action cannot be both acceptable and forbidden.
- It is valid to leave some actions unmarked when they are neither clearly acceptable nor clearly forbidden.
- When the primary decision is `NEEDS_EVIDENCE`, leave acceptable and forbidden teaching-action lists empty.

## Confidence

| Score | Meaning |
|---|---|
| 1 | Very uncertain; important information may be missing. |
| 2 | Somewhat uncertain; another action may be equally plausible. |
| 3 | Moderately confident. |
| 4 | Confident; the main alternative is clearly weaker. |
| 5 | Very confident; the state strongly supports the decision. |

## Pilot procedure

1. Make one private copy of `PILOT_RATER_FORM.md` and add your rater ID.
2. Annotate all six states without consulting the other rater or running the policies.
3. Record the time taken and any confusing terminology.
4. Submit both private forms before discussing disagreements.
5. Use the discussion only to improve this guide and the future formal form. Pilot labels are not formal evaluation data.

For the formal study, the two raters will again label independently. Agreement will be reported separately for the primary action, evidence sufficiency, each acceptable-action indicator, and the acceptable-action set.
