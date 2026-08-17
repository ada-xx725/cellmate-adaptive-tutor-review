# LLM-driven Adaptive Next Step

This CellMate extension adds a notebook-native `Adaptive Next Step` action to
Python notebook cells. The Introduction to Python course is the high-confidence
evaluation case study, not the only supported setting.

The runtime is exposed as one CellMate button, but internally resolves four
source modes:

1. `generated_attempt`: recognises a previously generated `generated:` or
   `selfstudy:` exercise ID and reuses the stored TaskSpec, tests, and metadata.
2. `course_verified`: recognises a course exercise from adjacent PyBryt references
   and uses PyBryt/assert output as high-confidence evidence.
3. `generic_llm`: when no course exercise is recognised, extracts notebook context
   and asks an LLM to infer a task specification, concepts, and optional candidate
   tests.
4. `self_study_goal`: when no reliable task context exists, asks whether the
   learner wants to start from a short goal, creates one validated mini task, and
   stores it as a generated exercise. Later attempts on that task return through
   `generated_attempt`.

The core contract is:

```text
LLM infers and generates.
Policy decides action.
Validator verifies.
Notebook delivers.
```

The workflow:

1. Extract nearby markdown, code, outputs, and the selected code cell.
2. Build a structured task spec from generated metadata, course metadata, LLM
   inference, or a self-study goal fallback.
3. Collect evidence from PyBryt/assert/output/generated tests with confidence.
4. Update learner state only when evidence is reliable.
5. Use deterministic policy to select `HINT`, `RETRY_WITH_SCAFFOLD`, `EASIER`,
   `SIMILAR`, `HARDER`, or `NEXT_CONCEPT`.
6. Ask the LLM for feedback and, where appropriate, a next-step exercise.
   In course mode, the teacher-designed course path is preferred over generated
   practice when a suitable course recommendation exists.
7. Validate generated exercises locally; repair once; otherwise fall back to a
   verified scaffold.
8. Insert adaptive feedback, learner model, recommended action, course
   recommendation, generated exercise, and visible sanity-check cells.

The deterministic policy now uses canonical concept IDs and concept-level recent
history. A first reliable pass can move from `SIMILAR` to `HARDER`; repeated
success for the same primary concept can move to `NEXT_CONCEPT`. Generated
exercises carry explicit `primaryConcept` and `difficulty` metadata rather than
inferring them from concept order.

Generated tests and reference solutions stay in Extension Storage rather than the
student-visible notebook. This is a trusted-local teaching prototype, not a code
sandbox.
