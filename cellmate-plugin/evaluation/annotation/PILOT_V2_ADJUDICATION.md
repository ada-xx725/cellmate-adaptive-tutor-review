# Pilot v2 adjudication record

Status: diagnostic pilot only; not formal held-out labels

Date: 2026-07-15

Guide: `pilot-guide-v2`

State pack: `pilot-state-pack-v2`

State-pack canonical SHA-256: `3B598C5C4504EAFD5D1FD214BA0B1B9F8FE42568046B747C1852468D368DC38A`

Both completed forms were produced independently by human raters. They are preserved without editing:

| Record | Canonical SHA-256 (UTF-8, CRLF normalized to LF) |
|---|---|
| `PILOT_RATER_FORM_V2_R1.md` | `1273290D5821C610EE948A74EF94C64AF274CD49FB8182A2F8F4029DBB4EF1C4` |
| `PILOT_RATER_FORM_V2_R2.md` | `94551449862D602B26BDEC2381C5825F95C8D7FF581D092D0D7C6DB67E394937` |

## Agreement results

Action-set measures exclude `pilot-B01`, because evidence was insufficient and all teaching-action ratings were `N/A`.

| Measure | Result | Readiness target | Met? |
|---|---:|---:|---:|
| Evidence-sufficiency agreement | 8/8 (100%) | 100% | yes |
| Primary-decision agreement | 7/8 (87.5%) | at least 80% | yes |
| Primary Cohen's kappa | 0.846 | at least 0.6 | yes |
| Acceptable-set exact agreement | 5/7 (71.4%) | descriptive | - |
| Acceptable-set mean Jaccard | 0.857 | at least 0.8 | yes |
| Forbidden-set exact agreement | 1/7 (14.3%) | descriptive | - |
| Forbidden-set mean Jaccard | 0.310 | at least 0.8 | no |
| Full tri-state cell agreement | 23/42 (54.8%) | descriptive | - |
| Confidence exact agreement | 6/8 (75%) | descriptive | - |

The kappa estimate is diagnostic because the pilot contains only eight states. It is not a formal inter-rater reliability result.

## Primary disagreement

For `pilot-B03`, both raters marked `RETRY_WITH_SCAFFOLD` and `EASIER` acceptable, but selected different primary actions:

- Rater 1: `EASIER`;
- Rater 2: `RETRY_WITH_SCAFFOLD`.

The state recorded one unsuccessful targeted hint but no earlier scaffold. The agreed escalation rule for the next guide is therefore:

1. first local failure: prefer `HINT`;
2. the same failure after a recorded hint: prefer `RETRY_WITH_SCAFFOLD`;
3. the same failure after a recorded scaffold: prefer `EASIER`.

Under this clarified rule, `RETRY_WITH_SCAFFOLD` is the primary action for B03 and `EASIER` remains acceptable.

## Forbidden-rating disagreement

The remaining weakness was not action selection. It was the boundary between `SUBOPTIMAL` and `FORBIDDEN`.

Rater 1 generally treated unnecessary remedial support after a reliable pass as suboptimal. Rater 2 often treated it as forbidden. Rater 1 also treated some early advancement after a pass as forbidden where Rater 2 used suboptimal.

For the next guide, `FORBIDDEN` is reserved for a critical teaching error: an action that contradicts reliable evidence, advances while a material failure remains unresolved, or cannot plausibly address the demonstrated need. An action that is merely repetitive, inefficient, over-supportive, or slightly early is normally `SUBOPTIMAL`.

Examples adopted for Guide v3:

- `HARDER` or `NEXT_CONCEPT` after a reliable unresolved failure is forbidden;
- remedial support after a reliable pass is normally suboptimal rather than forbidden;
- extra same-level practice after established repeated success is normally suboptimal;
- moving forward slightly early after a reliable pass is normally suboptimal unless the state shows an unresolved prerequisite failure.

## Decision

Pilot v2 improved evidence, primary-decision, and acceptable-action agreement, but it did not meet the pre-specified forbidden-agreement target. Guide v2 is therefore not frozen for formal annotation.

A focused third micro-pilot will use new states to test the critical-error boundary and the hint-to-scaffold-to-easier escalation sequence. States from pilot A, B, or C remain pilot-only and must not enter the formal held-out set.
