# Adaptive Next Step Pilot Rater Form

Rater ID: Rater-1

Date: 2026-07-15

Guide version: `pilot-guide-v1`

Start time: 10:00

End time: 10:30

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
- Reason: Check wasn’t run, so no reliable test output to go on.

## pilot-A02

- Evidence sufficient: `Yes`
- Primary decision: `RETRY_WITH_SCAFFOLD`
- Acceptable actions: `RETRY_WITH_SCAFFOLD, HINT`
- Forbidden actions: `EASIER, SIMILAR, HARDER, NEXT_CONCEPT`
- Confidence: `4`
- Reason: Accumulator logic is wrong (overwriting instead of adding), but concept isn’t beyond reach – scaffolding should help.

## pilot-A03

- Evidence sufficient: `Yes`
- Primary decision: `EASIER`
- Acceptable actions: `EASIER`
- Forbidden actions: `HINT, RETRY_WITH_SCAFFOLD, SIMILAR, HARDER, NEXT_CONCEPT`
- Confidence: `5`
- Reason: Same error twice in a row – hints and retries haven’t worked, time to drop down to a simpler summing task.

## pilot-A04

- Evidence sufficient: `Yes`
- Primary decision: `SIMILAR`
- Acceptable actions: `SIMILAR`
- Forbidden actions: `HINT, RETRY_WITH_SCAFFOLD, EASIER, HARDER, NEXT_CONCEPT`
- Confidence: `4`
- Reason: Code passes, but prior scores on related concepts aren’t that high – best to consolidate with another similar exercise.

## pilot-A05

- Evidence sufficient: `Yes`
- Primary decision: `NEXT_CONCEPT`
- Acceptable actions: `NEXT_CONCEPT, HARDER`
- Forbidden actions: `HINT, RETRY_WITH_SCAFFOLD, EASIER, SIMILAR`
- Confidence: `4`
- Reason: Strong pass and high mastery – more practice at this level isn’t needed. Move on or give a harder variation.

## pilot-A06

- Evidence sufficient: `Yes`
- Primary decision: `NEXT_CONCEPT`
- Acceptable actions: `NEXT_CONCEPT, HARDER`
- Forbidden actions: `HINT, RETRY_WITH_SCAFFOLD, EASIER, SIMILAR`
- Confidence: `5`
- Reason: Very high mastery and passed prior similar exercises – clearly ready for the next concept.

## Guide feedback

- Which action definitions were difficult to distinguish?
  - HINT vs. SCAFFOLD – the line can be blurry; depends on how much structure you give.
- Which state fields were unclear or insufficient?
  - Mastery scores lack a reference point, so I just treated them as low/moderate/high qualitatively.
- Did any state require information that was not provided?
  - The exact test cases used for passed checks would be nice, but the high-confidence summary is enough.
- Other comments:
  - No