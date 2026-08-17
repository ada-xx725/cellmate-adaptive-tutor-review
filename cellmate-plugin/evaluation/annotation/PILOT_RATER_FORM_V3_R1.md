# Adaptive Next Step Pilot v3 Rater Form

Rater ID: `Rater-1`

Date: 2026-07-15

Guide version: `pilot-guide-v3`

State-pack version: `pilot-state-pack-v3`

State-pack SHA-256: `5DAC2FB1A5C7E2D087AEC15030D933866A05FBA97F5A563D8F9184B96E36DED0`

Start time: 12:00

End time: 12:40

Confirmation: I completed this form independently and did not view policy outputs or the other rater's answers. `Yes`

For evidence-insufficient states, choose `NEEDS_EVIDENCE` and write `N/A` in the action table. For evidence-sufficient states, rate every action `ACCEPTABLE`, `SUBOPTIMAL`, or `FORBIDDEN`, then select one acceptable action as primary.

---

## pilot-C01

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
- Reason: First failure, no prior support – a simple hint should fix the missing increment.

---

## pilot-C02

- Evidence sufficient: `Yes`
- Primary decision: `RETRY_WITH_SCAFFOLD`

| Action | Rating |
|---|---|
| `HINT` | FORBIDDEN |
| `RETRY_WITH_SCAFFOLD` | ACCEPTABLE |
| `EASIER` | ACCEPTABLE |
| `SIMILAR` | SUBOPTIMAL |
| `HARDER` | FORBIDDEN |
| `NEXT_CONCEPT` | FORBIDDEN |

- Confidence `1–5`: `5`
- Reason: Same error after a hint – provide explicit scaffolding; easier is also acceptable but scaffold is the natural next step.

---

## pilot-C03

- Evidence sufficient: `Yes`
- Primary decision: `EASIER`

| Action | Rating |
|---|---|
| `HINT` | FORBIDDEN |
| `RETRY_WITH_SCAFFOLD` | SUBOPTIMAL |
| `EASIER` | ACCEPTABLE |
| `SIMILAR` | SUBOPTIMAL |
| `HARDER` | FORBIDDEN |
| `NEXT_CONCEPT` | FORBIDDEN |

- Confidence `1–5`: `5`
- Reason: Same error after both hint and scaffold – time to drop to a simpler counting task.

---

## pilot-C04

- Evidence sufficient: `Yes`
- Primary decision: `SIMILAR`

| Action | Rating |
|---|---|
| `HINT` | SUBOPTIMAL |
| `RETRY_WITH_SCAFFOLD` | SUBOPTIMAL |
| `EASIER` | SUBOPTIMAL |
| `SIMILAR` | ACCEPTABLE |
| `HARDER` | SUBOPTIMAL |
| `NEXT_CONCEPT` | SUBOPTIMAL |

- Confidence `1–5`: `4`
- Reason: Full pass but mastery still developing – consolidate with a similar exercise.

---

## pilot-C05

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
- Reason: Strong pass and high mastery, with prior independent successes – moving on is the best use of time.

---

## pilot-C06

- Evidence sufficient: `Yes`
- Primary decision: `SIMILAR`

| Action | Rating |
|---|---|
| `HINT` | SUBOPTIMAL |
| `RETRY_WITH_SCAFFOLD` | SUBOPTIMAL |
| `EASIER` | SUBOPTIMAL |
| `SIMILAR` | ACCEPTABLE |
| `HARDER` | SUBOPTIMAL |
| `NEXT_CONCEPT` | SUBOPTIMAL |

- Confidence `1–5`: `4`
- Reason: Passed but only a narrow test – consolidate with another exercise that covers edge cases.

---

## Guide feedback

- Which distinctions remained difficult? None – the escalation rules and suboptimal/forbidden boundaries were clear.
- Was previous support sufficiently clear? Yes, the structured history and outcome fields helped a lot.
- Were mastery score/band and test coverage useful? Yes – they clearly guided the consolidation vs. advancement decisions.
- Did any state require information that was not provided? No, everything needed was present.
- Other comments: The v3 guide with explicit escalation rules made annotations more consistent and faster.