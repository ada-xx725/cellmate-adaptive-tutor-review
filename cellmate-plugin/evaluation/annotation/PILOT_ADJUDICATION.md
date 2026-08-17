# Pilot v1 Adjudication Record

Status: diagnostic pilot only; not formal held-out labels

Guide: `pilot-guide-v1`

State pack: `pilot_states.jsonl` (`pilot-A01` to `pilot-A06`)

Both forms were completed independently by human raters. Rater identities are omitted from the adjudication record.

## Integrity record

| Artifact | SHA-256 |
|---|---|
| `PILOT_RATER_FORM_R1.md` | `145B22BC37665DC81AE2DA6541BCFB8F0040D1EE36CDB881C44849BA7302B7BD` |
| `PILOT_RATER_FORM_R2.md` | `FD5C61EFA54AD91E0F179AF8A750492A28D1F4AE07BA4A583B4FE6AC0B2CA953` |
| `pilot_states.jsonl` | `61294F0CDCF9B06F5EA4D4E355946E6159662175EF03642D253390E5890531B0` |

The two response files are retained unchanged outside the repository. These hashes identify the reviewed originals and must be recalculated if archived copies are made.

## Diagnostic agreement

| Measure | Result |
|---|---:|
| Evidence-sufficiency agreement | 6/6 |
| Exact primary-decision agreement | 4/6 |
| Primary Cohen's kappa | 0.586 |
| Exact acceptable-set agreement | 4/6 |
| Mean acceptable-set Jaccard | 0.833 |
| Exact forbidden-set agreement | 2/6 |
| Mean forbidden-set Jaccard | 0.775 |
| Exact confidence agreement | 5/6 |

The sample contains only six diagnostic cases, so kappa and Jaccard values are used to revise the guide, not as formal reliability results.

## State-level comparison

| State | Rater 1 primary | Rater 2 primary | Review |
|---|---|---|---|
| `pilot-A01` | `NEEDS_EVIDENCE` | `NEEDS_EVIDENCE` | Evidence rule was clear. |
| `pilot-A02` | `RETRY_WITH_SCAFFOLD` | `HINT` | Both raters accepted both actions; the disagreement concerns minimum support intensity. |
| `pilot-A03` | `EASIER` | `RETRY_WITH_SCAFFOLD` | The state recorded a previous failure but not the support previously received. |
| `pilot-A04` | `SIMILAR` | `SIMILAR` | Primary action agreed; only whether `HARDER` was also acceptable differed. |
| `pilot-A05` | `NEXT_CONCEPT` | `NEXT_CONCEPT` | Primary and acceptable actions agreed. |
| `pilot-A06` | `NEXT_CONCEPT` | `NEXT_CONCEPT` | Progression decision was clear. |

No pilot label is converted into a formal reference label. In particular, the A02 and A03 disagreements are not resolved by selecting whichever action matches an existing policy.

## Problems identified

1. Raters interpreted `forbidden` differently: one treated it as the complement of acceptable, while the other reserved it for clearly inappropriate actions.
2. Evidence-insufficient states require a separate `NEEDS_EVIDENCE` branch; raters should not manually classify every teaching action in that branch.
3. `HINT` and `RETRY_WITH_SCAFFOLD` require an operational distinction and a least-intensive-effective-support principle.
4. Repeated failure alone does not reveal whether a previous hint or scaffold was provided.
5. Mastery values need neutral scale anchors that do not disclose policy thresholds.
6. Passed checks need a coverage summary without exposing hidden test implementations.

## Changes adopted for guide v2

- Rate each teaching action as `ACCEPTABLE`, `SUBOPTIMAL`, or `FORBIDDEN`, rather than treating forbidden as the complement of acceptable.
- Stop action rating when evidence is insufficient; downstream processing records teaching actions as not permitted for that state.
- Choose the least intensive action that is still likely to help as the primary action.
- Record prior `support_received` and its outcome when those facts are known; otherwise do not infer them.
- Show mastery score, a coarse descriptive band, and scale anchors.
- Add a `test_coverage` summary to evidence.
- Use a new `pilot-B` state pack for the second pilot; A01–A06 remain pilot-only and are never reused in the formal held-out set.
