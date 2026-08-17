# Adaptive Next Step Formal Rater Form

Rater ID: `{{RATER_ID}}`

Date: `{{DATE}}`

Guide version: `annotation-guide-v1`

State-pack version: `{{STATE_PACK_VERSION}}`

State-pack canonical SHA-256 (UTF-8, CRLF normalized to LF): `{{STATE_PACK_SHA256}}`

Human-subset version: `{{HUMAN_SUBSET_VERSION}}`

Human-subset canonical SHA-256: `{{HUMAN_SUBSET_SHA256}}`

Start time: `{{START_TIME_AND_TIMEZONE}}`

End time: `{{END_TIME_AND_TIMEZONE}}`

Confirmation: I completed this form independently and did not view policy outputs or the other rater's answers. `[Yes/No]`

Read `FORMAL_ANNOTATION_GUIDE_V1.md` before starting. Do not execute a policy or inspect another rater's form.

`{{STATE_SECTIONS}}`

Each state section must use this structure:

```markdown
## heldout-XXX

- Evidence sufficient: `[Yes/No]`
- Primary decision: `[NEEDS_EVIDENCE/HINT/RETRY_WITH_SCAFFOLD/EASIER/SIMILAR/HARDER/NEXT_CONCEPT]`

| Action | Rating |
|---|---|
| `HINT` | `[ACCEPTABLE/SUBOPTIMAL/FORBIDDEN/N/A]` |
| `RETRY_WITH_SCAFFOLD` | `[ACCEPTABLE/SUBOPTIMAL/FORBIDDEN/N/A]` |
| `EASIER` | `[ACCEPTABLE/SUBOPTIMAL/FORBIDDEN/N/A]` |
| `SIMILAR` | `[ACCEPTABLE/SUBOPTIMAL/FORBIDDEN/N/A]` |
| `HARDER` | `[ACCEPTABLE/SUBOPTIMAL/FORBIDDEN/N/A]` |
| `NEXT_CONCEPT` | `[ACCEPTABLE/SUBOPTIMAL/FORBIDDEN/N/A]` |

- Confidence `1-5`: `[1/2/3/4/5]`
- Reason: `[one or two evidence-based sentences]`
```

Do not add policy guesses or discuss labels until both completed forms have been archived and hashed.
