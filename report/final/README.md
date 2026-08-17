# Final report source

Status: **formal Action-Quality v2 results inserted; broader report sections still require completion and review.**

`final-report.tex` now cites only the locked v2 selector, judge, and statistics
artifacts for its formal numerical results. It reuses the
project report class through `../project-plan/report-template.cls`, so compile it
from this directory:

```text
pdflatex -interaction=nonstopmode -halt-on-error final-report.tex
```

## Formal-results gate

The formal-results gate was satisfied as follows:

1. The frozen protocol and the 60-state pack plus invariance manifest validate,
   and their canonical SHA-256 values are recorded before any formal request.
2. A clean-worktree run covers every state in all four conditions with seed
   `20260816`; its source commit, dirty-tree status, protocol hash, redacted
   selector configuration, failures, retries, exclusions, and provider outages
   are retained in the manifest and run log.
3. Raw records from `aq-v2-primary-001` were locked and hashed before judging.
4. The separately configured blinded judge produced
   `aq-v2-judge-001`; judge failures remain missing rather than being replaced
   with guessed scores, and the judge records are locked and hashed.
5. `aq-v2-summary-001` was generated only from those locked run and judge
   artefacts, with manifest hashes cross-checked before any number is quoted.

The report must preserve the observed null primary comparisons, five missing
judge assessments, hard-constraint violations, one selector fallback, and the
metric-denominator limitation documented in the limitations section. Do not
silently replace these with a rerun.

If a held-out formal result motivates a system change, do not tune and reuse the
same suite for confirmatory reporting. Create a new protocol/suite version and a
new state split, as required by the frozen protocol.

## Evidence and ethics boundary

- No participants were recruited for this formal action-quality evaluation.
- Results describe the constructed, blinded state pack and the configured
  selector/judge pipeline; they are not population estimates of real learners.
- The report must not claim real-student learning gains, improved attainment,
  usability, or behavioural benefit from these runs.
- Pilot ratings, development states, demo traces, simulated results, and outputs
  observed during debugging must remain separate from formal results.
- Any limitation caused by using the same provider or model family for selector
  and judge must be stated explicitly.

Do not commit LaTeX build artefacts in this directory. Publish a verified final
PDF to the canonical deliverable path only after the evidence gate and report
review are complete.
