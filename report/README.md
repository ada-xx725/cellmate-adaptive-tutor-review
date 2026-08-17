# Report sources

This directory is the canonical home for editable report sources. Generated PDFs
belong in `deliverables/` only after their source and rendering have been checked;
LaTeX build artefacts (`*.aux`, `*.bbl`, `*.blg`, `*.log`, and similar files)
must not be committed here.

## Layout

- `project-plan/` is a byte-for-byte migration snapshot of the hand-authored
project-plan source formerly maintained in a separate local working directory.
- `final/` contains the final-report writing skeleton and its evidence gate.

The external source directory is intentionally retained as a recovery copy. Make
future report edits under this directory so that the repository has one active
source location.

## Project-plan provenance

The following SHA-256 values were recorded when the source was copied on
2026-08-16. They allow the migration snapshot to be checked against the retained
external original.

| File | SHA-256 |
| --- | --- |
| `project-plan/report.tex` | `69D8A5B36291A411405D0F647B1F5DB9381DAA63E91E678B7AC47EF718DCD7DD` |
| `project-plan/references.bib` | `0F77B68EF0174A722D6D0A6166A468F3C8E86056790A5F6BB48C1EB46AF63A4B` |
| `project-plan/report-template.cls` | `92487D066919DE9F267A3A296C6D8779E5AC6125F598D5387EB5840B87707877` |
| `project-plan/figures/figure1_basic_to_adaptive.png` | `3ED902260A39CEED913E6E66DF5850E5780425256335326E263E076923F2A27D` |
| `project-plan/figures/figure2_system_architecture.png` | `4F1C3B7173FB1FA8C8364C36EFD61D567BF046BC8F14A74D2E3E029A8370E75C` |
| `project-plan/figures/figure3_prototype_screenshot.png` | `6F4BC9B8FE728B92E1915C6A42A07F0CD83398AA48AFDF9E4750EBDC7EB6B654` |
| `project-plan/figures/figure4_evaluation_design.png` | `B977FA7A159E8DAE285A545C4F5CDE160C876930331DA4EAFCA712711DE7FC6C` |

## Building locally

From `report/project-plan/`:

```text
pdflatex -interaction=nonstopmode -halt-on-error report.tex
bibtex report
pdflatex -interaction=nonstopmode -halt-on-error report.tex
pdflatex -interaction=nonstopmode -halt-on-error report.tex
```

From `report/final/`:

```text
pdflatex -interaction=nonstopmode -halt-on-error final-report.tex
```

Build in a disposable output directory when possible. The final-report source
must remain visibly marked as pending until the gate in `final/README.md` is
satisfied from locked formal-evaluation artefacts.
