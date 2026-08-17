# Adaptive Next Step Pilot Rater Form

Rater ID: Rater-2

Date: 2026-07-15

Guide version: `pilot-guide-v1`

Start time: 03:07 BST

End time: 03:28 BST

Confirmation: I completed this form independently and did not view policy outputs or the other rater's answers. `Yes`

Use only these values:

- Primary decision: `NEEDS_EVIDENCE`, `HINT`, `RETRY_WITH_SCAFFOLD`, `EASIER`, `SIMILAR`, `HARDER`, `NEXT_CONCEPT`.
- Acceptable/forbidden lists: teaching actions only, separated by commas; use `none` when empty.
- Confidence: integer from 1 to 5.

## pilot-A01

- Evidence sufficient: `No`
- Primary decision: `NEEDS_EVIDENCE`
- Acceptable actions: `none`
- Forbidden actions: `none`
- Confidence: `5`
- Reason: The adjacent PyBryt/assert check was not run, so the apparently correct code is not enough for a reliable teaching decision.

## pilot-A02

- Evidence sufficient: `Yes`
- Primary decision: `HINT`
- Acceptable actions: `HINT, RETRY_WITH_SCAFFOLD`
- Forbidden actions: `HARDER, NEXT_CONCEPT`
- Confidence: `4`
- Reason: The reliable check shows a specific accumulator error: `total` is overwritten instead of updated. A focused clue should keep the learner on the task without giving away the full structure.

## pilot-A03

- Evidence sufficient: `Yes`
- Primary decision: `RETRY_WITH_SCAFFOLD`
- Acceptable actions: `RETRY_WITH_SCAFFOLD, EASIER`
- Forbidden actions: `SIMILAR, HARDER, NEXT_CONCEPT`
- Confidence: `4`
- Reason: The same accumulator mistake has appeared again after a prior failed attempt, so the learner likely needs structured steps or a smaller running-total subtask rather than another unstructured try.

## pilot-A04

- Evidence sufficient: `Yes`
- Primary decision: `SIMILAR`
- Acceptable actions: `SIMILAR, HARDER`
- Forbidden actions: `HINT, RETRY_WITH_SCAFFOLD, EASIER, NEXT_CONCEPT`
- Confidence: `4`
- Reason: The file-parsing checks passed, but prior mastery is still modest across the relevant concepts. A similar consolidation task is the best next step, with a harder variant also reasonable.

## pilot-A05

- Evidence sufficient: `Yes`
- Primary decision: `NEXT_CONCEPT`
- Acceptable actions: `NEXT_CONCEPT, HARDER`
- Forbidden actions: `HINT, RETRY_WITH_SCAFFOLD, EASIER`
- Confidence: `4`
- Reason: The current file-parsing task passed and the learner already shows strong mastery, so moving toward the next course concept is preferable to remedial support.

## pilot-A06

- Evidence sufficient: `Yes`
- Primary decision: `NEXT_CONCEPT`
- Acceptable actions: `NEXT_CONCEPT, HARDER`
- Forbidden actions: `HINT, RETRY_WITH_SCAFFOLD, EASIER, SIMILAR`
- Confidence: `5`
- Reason: The class task passed, mastery is high, and there are multiple recent successful class-related attempts, so further same-level practice is not the best use of time.

## Guide feedback

- Which action definitions were difficult to distinguish? `HINT` versus `RETRY_WITH_SCAFFOLD` can be close when there is only one clear bug. `HARDER` versus `NEXT_CONCEPT` can also be close after a learner passes with high mastery.
- Which state fields were unclear or insufficient? The fields were mostly clear. It would help to know whether a passed check covers important edge cases when deciding between `SIMILAR`, `HARDER`, and `NEXT_CONCEPT`.
- Did any state require information that was not provided? `pilot-A01` required the missing reliable check result before any teaching action could be selected.
- Other comments: The pilot set usefully tests the evidence rule, repeated-failure handling, and progression decisions after successful attempts.
