# Adaptive Next Step Pilot v2 Rater Form

Rater ID: `Rater-1`

Date: 2026-07-15

Guide version: `pilot-guide-v2`

State-pack version: `pilot-state-pack-v2`

State-pack canonical SHA-256 (UTF-8, CRLF normalized to LF): `3B598C5C4504EAFD5D1FD214BA0B1B9F8FE42568046B747C1852468D368DC38A`

Start time: 11:00

End time: 11:45

Confirmation: I completed this form independently and did not view policy outputs or the other rater's answers. `Yes`

For evidence-insufficient states, choose `NEEDS_EVIDENCE` and write `N/A` in the action table. For evidence-sufficient states, rate every action `ACCEPTABLE`, `SUBOPTIMAL`, or `FORBIDDEN`, then select one acceptable action as primary.

## pilot-B01

- Evidence sufficient: `No`
- Primary decision: `NEEDS_EVIDENCE`

| Action | Rating |
|---|---|
| `HINT` | N/A |
| `RETRY_WITH_SCAFFOLD` | N/A |
| `EASIER` | N/A |
| `SIMILAR` | N/A |
| `HARDER` | N/A |
| `NEXT_CONCEPT` | N/A |

- Confidence `1–5`: `5`
- Reason: No reliable check output – the test didn't run properly.

## pilot-B02

- Evidence sufficient: `Yes`
- Primary decision: `HINT`

| Action | Rating |
|---|---|
| `HINT` | ACCEPTABLE |
| `RETRY_WITH_SCAFFOLD` | ACCEPTABLE |
| `EASIER` | SUBOPTIMAL |
| `SIMILAR` | SUBOPTIMAL |
| `HARDER` | FORBIDDEN |
| `NEXT_CONCEPT` | FORBIDDEN |

- Confidence `1–5`: `4`
- Reason: Forgot to increment count in loop – a simple hint should fix it. Scaffolding also okay, but harder or moving on isn't warranted yet.

## pilot-B03

- Evidence sufficient: `Yes`
- Primary decision: `EASIER`

| Action | Rating |
|---|---|
| `HINT` | FORBIDDEN |
| `RETRY_WITH_SCAFFOLD` | ACCEPTABLE |
| `EASIER` | ACCEPTABLE |
| `SIMILAR` | SUBOPTIMAL |
| `HARDER` | FORBIDDEN |
| `NEXT_CONCEPT` | FORBIDDEN |

- Confidence `1–5`: `5`
- Reason: Same error after a hint was already given – need to drop to a simpler counting task.

## pilot-B04

- Evidence sufficient: `Yes`
- Primary decision: `EASIER`

| Action | Rating |
|---|---|
| `HINT` | SUBOPTIMAL |
| `RETRY_WITH_SCAFFOLD` | SUBOPTIMAL |
| `EASIER` | ACCEPTABLE |
| `SIMILAR` | SUBOPTIMAL |
| `HARDER` | FORBIDDEN |
| `NEXT_CONCEPT` | FORBIDDEN |

- Confidence `1–5`: `4`
- Reason: Prior scaffold didn't help, and the concept (nested loops with conditionals) is too hard – better to step back.

## pilot-B05

- Evidence sufficient: `Yes`
- Primary decision: `SIMILAR`

| Action | Rating |
|---|---|
| `HINT` | SUBOPTIMAL |
| `RETRY_WITH_SCAFFOLD` | SUBOPTIMAL |
| `EASIER` | SUBOPTIMAL |
| `SIMILAR` | ACCEPTABLE |
| `HARDER` | SUBOPTIMAL |
| `NEXT_CONCEPT` | FORBIDDEN |

- Confidence `1–5`: `4`
- Reason: Code passes but mastery is only moderate – consolidation with a similar task is safest.

## pilot-B06

- Evidence sufficient: `Yes`
- Primary decision: `NEXT_CONCEPT`

| Action | Rating |
|---|---|
| `HINT` | SUBOPTIMAL |
| `RETRY_WITH_SCAFFOLD` | SUBOPTIMAL |
| `EASIER` | SUBOPTIMAL |
| `SIMILAR` | SUBOPTIMAL |
| `HARDER` | ACCEPTABLE |
| `NEXT_CONCEPT` | ACCEPTABLE |

- Confidence `1–5`: `4`
- Reason: Strong pass and high mastery – moving ahead or giving a harder variant both make sense.

## pilot-B07

- Evidence sufficient: `Yes`
- Primary decision: `NEXT_CONCEPT`

| Action | Rating |
|---|---|
| `HINT` | SUBOPTIMAL |
| `RETRY_WITH_SCAFFOLD` | SUBOPTIMAL |
| `EASIER` | SUBOPTIMAL |
| `SIMILAR` | SUBOPTIMAL |
| `HARDER` | ACCEPTABLE |
| `NEXT_CONCEPT` | ACCEPTABLE |

- Confidence `1–5`: `5`
- Reason: Very high prior scores and passed similar class exercises – clearly ready for the next concept.

## pilot-B08

- Evidence sufficient: `Yes`
- Primary decision: `SIMILAR`

| Action | Rating |
|---|---|
| `HINT` | SUBOPTIMAL |
| `RETRY_WITH_SCAFFOLD` | SUBOPTIMAL |
| `EASIER` | SUBOPTIMAL |
| `SIMILAR` | ACCEPTABLE |
| `HARDER` | ACCEPTABLE |
| `NEXT_CONCEPT` | FORBIDDEN |

- Confidence `1–5`: `4`
- Reason: Passed but only tested positive numbers; still need to solidify exception handling, so give a similar or harder coverage exercise.

## Guide feedback

- Which distinctions remained difficult?
  - HINT vs. RETRY_WITH_SCAFFOLD is clearer now with the operational definitions.
- Was previous support sufficiently clear?
  - Yes, the `support_received` and `support_outcome` fields were very helpful.
- Were mastery score/band and test coverage useful?
  - Yes, especially for deciding between consolidation and advancement.
- Did any state require information that was not provided?
  - No, everything needed was there.
- Other comments:
  - The v2 format with full action ratings forces more deliberate reasoning.