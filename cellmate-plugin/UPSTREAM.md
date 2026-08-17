# Upstream and course provenance

This directory is an IRP-local source snapshot derived from CellMate.

- Upstream: https://github.com/teachnology/cellmate
- Imported commit: `d7c15dcc8f6dc918d3110d42f0fc859467595fa9`
- Upstream license: MIT; see `LICENSE` in this directory.

The course is tracked separately as the pinned Git submodule
`../external/introduction-to-python`.

- Upstream: https://github.com/ese-msc/introduction-to-python
- Pinned commit: `4317489856e3ece9d61e78638416c2e5451bf8bb`
- Course license: BSD-3-Clause; see the submodule's `LICENSE`.

The Adaptive Next Step modules under `src/adaptive/` are IRP project code. They
use CellMate for notebook interaction and the course for exercise context; they
do not modify the course notebooks.
