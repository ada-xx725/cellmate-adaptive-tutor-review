# Pilot v3 adjudication record

Status: annotation-readiness pilot only; not formal held-out labels

Date: 2026-07-15

Guide: `pilot-guide-v3`

State pack: `pilot-state-pack-v3`

State-pack canonical SHA-256: `5DAC2FB1A5C7E2D087AEC15030D933866A05FBA97F5A563D8F9184B96E36DED0`

Both forms were completed independently by human raters and are archived without editing after submission:

| Record | Rater | Canonical SHA-256 (UTF-8, CRLF normalized to LF) |
|---|---|---|
| `PILOT_RATER_FORM_V3_R1.md` | Rater 1 | `12B73D5DEB110A59912999FCABBB4A36026A60D74C80694A9448A98EE587E624` |
| `PILOT_RATER_FORM_V3_R2.md` | Rater 2 | `B601DDB7531824B739FEDF43D990963137406EFE41147ED130809B01DAFD116A` |

Rater 1 corrected an internal rater-ID data-entry error before archival. The pre-correction canonical hash was `83F4E07D75556EA88CDBF2CFE51824AF3249948128BF993746F684A6CC83D528`; the corrected record above is the archived source used for this analysis.

## Agreement results

| Measure | Result | Readiness target | Met? |
|---|---:|---:|---:|
| Evidence-sufficiency agreement | 6/6 (100%) | 100% | yes |
| Primary-decision agreement | 6/6 (100%) | at least 80% | yes |
| Primary Cohen's kappa | 1.000 | at least 0.6 | yes |
| Acceptable-set exact agreement | 5/6 (83.3%) | descriptive | - |
| Acceptable-set mean Jaccard | 0.917 | at least 0.8 | yes |
| Forbidden-set exact agreement | 4/6 (66.7%) | descriptive | - |
| Forbidden-set mean Jaccard | 0.889 | at least 0.8 | yes |
| Full tri-state cell agreement | 33/36 (91.7%) | descriptive | - |
| Confidence exact agreement | 3/6 (50%) | descriptive | - |

The kappa estimate is diagnostic because this focused pilot contains only six states. It demonstrates annotation readiness, not formal inter-rater reliability for the research dataset.

## Rating disagreements and adjudication

All six primary decisions agreed. The three remaining disagreements concerned secondary ratings only:

| State | Action | Rater 1 | Rater 2 | Adjudicated rating |
|---|---|---|---|---|
| `pilot-C01` | `RETRY_WITH_SCAFFOLD` | `ACCEPTABLE` | `SUBOPTIMAL` | `SUBOPTIMAL` |
| `pilot-C02` | `HINT` | `FORBIDDEN` | `SUBOPTIMAL` | `SUBOPTIMAL` |
| `pilot-C03` | `HINT` | `FORBIDDEN` | `SUBOPTIMAL` | `SUBOPTIMAL` |

For C01, the first failure was local and did not show missing problem organisation, so a scaffold was more intensive than necessary but not a critical error. For C02 and C03, repeating a previously ineffective hint was weak and inefficient, but it did not contradict the failure evidence or advance past an unresolved prerequisite. Guide v3 therefore classifies all three as `SUBOPTIMAL`.

## Decision

Pilot v3 met every pre-specified annotation-readiness threshold. The decision semantics in Guide v3 may now be frozen as formal Annotation Guide v1 without further threshold or category changes.

Pilot A, B, and C states and responses remain diagnostic material. They must not be reused in the formal held-out state set or reported as formal system-performance results.
