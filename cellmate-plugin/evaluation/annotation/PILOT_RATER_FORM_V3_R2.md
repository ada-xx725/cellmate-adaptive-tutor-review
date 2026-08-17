# Adaptive Next Step Pilot v3 Rater Form

Rater ID: `Rater-2`

Date: `2026-07-15`

Guide version: `pilot-guide-v3`

State-pack version: `pilot-state-pack-v3`

State-pack canonical SHA-256 (UTF-8, CRLF normalized to LF): `5DAC2FB1A5C7E2D087AEC15030D933866A05FBA97F5A563D8F9184B96E36DED0`

Start time: `07:17 BST`

End time: `07:39 BST`

Confirmation: I completed this form independently and did not view policy outputs or the other rater's answers. `Yes`

Read `ANNOTATION_GUIDE_V3.md` first. View each state with:

```powershell
npm run annotation:show -- pilot-C01
```

For evidence-insufficient states, choose `NEEDS_EVIDENCE` and enter `N/A` in the action table. Otherwise rate every action `ACCEPTABLE`, `SUBOPTIMAL`, or `FORBIDDEN` before selecting one acceptable primary action.

## pilot-C01

- Evidence sufficient: `Yes`
- Primary decision: `HINT`

| Action | Rating |
|---|---|
| `HINT` | `ACCEPTABLE` |
| `RETRY_WITH_SCAFFOLD` | `SUBOPTIMAL` |
| `EASIER` | `SUBOPTIMAL` |
| `SIMILAR` | `SUBOPTIMAL` |
| `HARDER` | `FORBIDDEN` |
| `NEXT_CONCEPT` | `FORBIDDEN` |

- Confidence `1-5`: `5`
- Reason: `The reliable tests show one specific accumulator error: the counter is never updated when a value matches. This is the first recorded failure, so a focused hint about changing the running total is the lightest useful next step.`

## pilot-C02

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
- Reason: `The student made the identical error after receiving a direct hint, so simply repeating that hint is unlikely to add much. A scaffold can make the missing update step concrete while keeping attention on the same skill; a short prerequisite task would also be reasonable but is less direct.`

## pilot-C03

- Evidence sufficient: `Yes`
- Primary decision: `EASIER`

| Action | Rating |
|---|---|
| `HINT` | `SUBOPTIMAL` |
| `RETRY_WITH_SCAFFOLD` | `SUBOPTIMAL` |
| `EASIER` | `ACCEPTABLE` |
| `SIMILAR` | `SUBOPTIMAL` |
| `HARDER` | `FORBIDDEN` |
| `NEXT_CONCEPT` | `FORBIDDEN` |

- Confidence `1-5`: `5`
- Reason: `The same missing count update remained after both a targeted hint and a scaffold that exposed the exact blank step. A simpler accumulator micro-task is now the most proportionate way to rebuild the prerequisite before returning to this exercise.`

## pilot-C04

- Evidence sufficient: `Yes`
- Primary decision: `SIMILAR`

| Action | Rating |
|---|---|
| `HINT` | `SUBOPTIMAL` |
| `RETRY_WITH_SCAFFOLD` | `SUBOPTIMAL` |
| `EASIER` | `SUBOPTIMAL` |
| `SIMILAR` | `ACCEPTABLE` |
| `HARDER` | `SUBOPTIMAL` |
| `NEXT_CONCEPT` | `SUBOPTIMAL` |

- Confidence `1-5`: `4`
- Reason: `This is a broad, reliable pass, but the relevant skills are still developing rather than established. One comparable exercise would consolidate the successful use of a set, loop, and ordered result without adding unnecessary remediation or acceleration.`

## pilot-C05

- Evidence sufficient: `Yes`
- Primary decision: `NEXT_CONCEPT`

| Action | Rating |
|---|---|
| `HINT` | `SUBOPTIMAL` |
| `RETRY_WITH_SCAFFOLD` | `SUBOPTIMAL` |
| `EASIER` | `SUBOPTIMAL` |
| `SIMILAR` | `SUBOPTIMAL` |
| `HARDER` | `ACCEPTABLE` |
| `NEXT_CONCEPT` | `ACCEPTABLE` |

- Confidence `1-5`: `4`
- Reason: `The current solution passed every check, the component skills are established, and the learner also has two recent independent passes. Moving into the scheduled next concept is appropriate; a harder related exercise would also be a sound extension, but is less aligned with the course sequence.`

## pilot-C06

- Evidence sufficient: `Yes`
- Primary decision: `SIMILAR`

| Action | Rating |
|---|---|
| `HINT` | `SUBOPTIMAL` |
| `RETRY_WITH_SCAFFOLD` | `SUBOPTIMAL` |
| `EASIER` | `SUBOPTIMAL` |
| `SIMILAR` | `ACCEPTABLE` |
| `HARDER` | `SUBOPTIMAL` |
| `NEXT_CONCEPT` | `SUBOPTIMAL` |

- Confidence `1-5`: `5`
- Reason: `The available check passed, but it covers only one ordinary example and leaves important cases untested. A similar task with deliberately varied inputs gives useful consolidation and broader evidence; there is no demonstrated failure that would justify remedial support.`

## Guide feedback

- Was the Hint -> Scaffold -> Easier escalation order clear? `Yes. The support history makes the intended escalation point easy to identify.`
- Was the `SUBOPTIMAL` versus `FORBIDDEN` critical-error boundary clear? `Yes. It was clear that a weaker or repetitive choice is not automatically a critical error.`
- Were broad and narrow passing evidence treated clearly? `Yes. The coverage descriptions distinguish a full pass from a single-example pass well.`
- Did any state require information that was not provided? `No.`
- Other comments: `The states include enough concrete evidence, support history, and course context to make the decisions without having to infer missing interventions.`
