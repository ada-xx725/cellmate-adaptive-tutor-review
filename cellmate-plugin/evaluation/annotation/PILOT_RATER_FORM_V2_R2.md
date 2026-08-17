# Adaptive Next Step Pilot v2 Rater Form

Rater ID: `Rater-2`

Date: 2026-07-15

Guide version: `pilot-guide-v2`

State-pack version: `pilot-state-pack-v2`

State-pack canonical SHA-256 (UTF-8, CRLF normalized to LF): `3B598C5C4504EAFD5D1FD214BA0B1B9F8FE42568046B747C1852468D368DC38A`

Start time: 04:45 BST (approx.)

End time: 05:20 BST

Confirmation: I completed this form independently and did not view policy outputs or the other rater's answers. `Yes`

For evidence-insufficient states, choose `NEEDS_EVIDENCE` and write `N/A` in the action table. For evidence-sufficient states, rate every action `ACCEPTABLE`, `SUBOPTIMAL`, or `FORBIDDEN`, then select one acceptable action as primary.

## pilot-B01

- Evidence sufficient: `No`
- Primary decision: `NEEDS_EVIDENCE`

| Action | Rating |
|---|---|
| `HINT` | `N/A` |
| `RETRY_WITH_SCAFFOLD` | `N/A` |
| `EASIER` | `N/A` |
| `SIMILAR` | `N/A` |
| `HARDER` | `N/A` |
| `NEXT_CONCEPT` | `N/A` |

- Confidence `1-5`: `5`
- Reason: The code looks plausible, but the check produced no usable result. I would rerun the factorial checks, including zero and a positive input, before choosing a teaching action.

## pilot-B02

- Evidence sufficient: `Yes`
- Primary decision: `HINT`

| Action | Rating |
|---|---|
| `HINT` | `ACCEPTABLE` |
| `RETRY_WITH_SCAFFOLD` | `ACCEPTABLE` |
| `EASIER` | `SUBOPTIMAL` |
| `SIMILAR` | `SUBOPTIMAL` |
| `HARDER` | `FORBIDDEN` |
| `NEXT_CONCEPT` | `FORBIDDEN` |

- Confidence `1-5`: `4`
- Reason: The loop and integer division are in place; the learner has just forgotten to update `count`. A direct hint should be enough on a first attempt.

## pilot-B03

- Evidence sufficient: `Yes`
- Primary decision: `RETRY_WITH_SCAFFOLD`

| Action | Rating |
|---|---|
| `HINT` | `SUBOPTIMAL` |
| `RETRY_WITH_SCAFFOLD` | `ACCEPTABLE` |
| `EASIER` | `ACCEPTABLE` |
| `SIMILAR` | `SUBOPTIMAL` |
| `HARDER` | `FORBIDDEN` |
| `NEXT_CONCEPT` | `FORBIDDEN` |

- Confidence `1-5`: `5`
- Reason: The previous hint named the missing counter update, but the same error remained. The next attempt needs explicit steps showing what changes on each loop iteration.

## pilot-B04

- Evidence sufficient: `Yes`
- Primary decision: `EASIER`

| Action | Rating |
|---|---|
| `HINT` | `FORBIDDEN` |
| `RETRY_WITH_SCAFFOLD` | `SUBOPTIMAL` |
| `EASIER` | `ACCEPTABLE` |
| `SIMILAR` | `FORBIDDEN` |
| `HARDER` | `FORBIDDEN` |
| `NEXT_CONCEPT` | `FORBIDDEN` |

- Confidence `1-5`: `5`
- Reason: The learner repeated the same unconditional append after a scaffold had already introduced the flag and placement of the append. A smaller task on flags and post-loop decisions is more appropriate now.

## pilot-B05

- Evidence sufficient: `Yes`
- Primary decision: `SIMILAR`

| Action | Rating |
|---|---|
| `HINT` | `FORBIDDEN` |
| `RETRY_WITH_SCAFFOLD` | `FORBIDDEN` |
| `EASIER` | `FORBIDDEN` |
| `SIMILAR` | `ACCEPTABLE` |
| `HARDER` | `ACCEPTABLE` |
| `NEXT_CONCEPT` | `SUBOPTIMAL` |

- Confidence `1-5`: `4`
- Reason: This was a broad pass, but the relevant mastery is still developing and there is no earlier success history. One more task at the same level would help confirm the skill.

## pilot-B06

- Evidence sufficient: `Yes`
- Primary decision: `NEXT_CONCEPT`

| Action | Rating |
|---|---|
| `HINT` | `FORBIDDEN` |
| `RETRY_WITH_SCAFFOLD` | `FORBIDDEN` |
| `EASIER` | `FORBIDDEN` |
| `SIMILAR` | `SUBOPTIMAL` |
| `HARDER` | `ACCEPTABLE` |
| `NEXT_CONCEPT` | `ACCEPTABLE` |

- Confidence `1-5`: `4`
- Reason: The same broad checks passed and all three concepts are established. A harder dictionary task would be reasonable, but moving on to classes is the better use of time.

## pilot-B07

- Evidence sufficient: `Yes`
- Primary decision: `NEXT_CONCEPT`

| Action | Rating |
|---|---|
| `HINT` | `FORBIDDEN` |
| `RETRY_WITH_SCAFFOLD` | `FORBIDDEN` |
| `EASIER` | `FORBIDDEN` |
| `SIMILAR` | `FORBIDDEN` |
| `HARDER` | `ACCEPTABLE` |
| `NEXT_CONCEPT` | `ACCEPTABLE` |

- Confidence `1-5`: `5`
- Reason: The learner passed a fairly demanding task with broad coverage and has two earlier independent passes in the same area. More same-level class practice would add little.

## pilot-B08

- Evidence sufficient: `Yes`
- Primary decision: `SIMILAR`

| Action | Rating |
|---|---|
| `HINT` | `SUBOPTIMAL` |
| `RETRY_WITH_SCAFFOLD` | `FORBIDDEN` |
| `EASIER` | `FORBIDDEN` |
| `SIMILAR` | `ACCEPTABLE` |
| `HARDER` | `SUBOPTIMAL` |
| `NEXT_CONCEPT` | `SUBOPTIMAL` |

- Confidence `1-5`: `3`
- Reason: The positive cases passed and the code appears to handle invalid inputs, but the required exception behaviour was not tested. I would consolidate before advancing on this evidence alone.

## Guide feedback

- Which distinctions remained difficult? The hardest distinction was `SUBOPTIMAL` versus `FORBIDDEN` for actions that are unnecessary after a pass. `HARDER` versus `NEXT_CONCEPT` was also close in the high-mastery cases.
- Was previous support sufficiently clear? Yes. The support summary and outcome in B03 and B04 made the escalation decision much easier.
- Were mastery score/band and test coverage useful? Yes. The score/band helped distinguish B05 from B06, and the coverage summary was important for treating B08 more cautiously than the other passing states.
- Did any state require information that was not provided? B01 needs a usable check result. B08 would benefit from tests for zero, invalid inputs, and the exception type, although there was still enough evidence for a cautious teaching decision.
- Other comments: It may help to add one example clarifying when remedial support after a reliable pass should be `SUBOPTIMAL` rather than `FORBIDDEN`.
