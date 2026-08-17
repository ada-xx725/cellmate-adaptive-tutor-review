# Adaptive Next Step Demo Pack

Recording and replacement instructions for the student-facing UI:

`RECORDING_GUIDE.md`

## Evidence provenance and limits

Nothing in this pack is a formal evaluation result or evidence from a human
participant study. In this directory, **real** means that the interaction ran
inside an Extension Development Host; it does not mean held-out evaluation,
independent replication, or measured learning gain.

| Evidence | Provenance | Model involvement | Intended claim |
| --- | --- | --- | --- |
| `action-cases.jsonl` | Six fixed demo inputs; they are fixtures, not observed learner sessions | None while loading the inputs | Reproducible coverage inputs |
| `action-traces/demo-action-01-hint-hint.json` | Production `LlmDecisionEngine` run on the fixed HINT fixture | Fixed selector replay; no external model request | The production decision and trace pipeline can carry `HINT` |
| The other five files under `action-traces/` | Production `DecisionEngine` runs on fixed fixtures | Rule policy; no model request | Deterministic coverage of the five rule-selected actions |
| `runtime-traces/course-verified-REAL-TRACE.json` | Exported from Extension Development Host storage after a course demo run | The trace reports `policyUsesLlm: true`, `modelVersion: gpt-4.1-mini`, and `fallbackUsed: false` | A real extension run used the model-backed selector |
| `runtime-traces/generated-attempt-REAL-TRACE.json` | Exported from Extension Development Host storage after a generated-attempt demo run | The trace reports `policyUsesLlm: true`, `modelVersion: gpt-4.1-mini`, and `fallbackUsed: false` | A real extension run used the model-backed selector |
| `runtime-traces/needs-evidence-REAL-TRACE.json` | Exported from Extension Development Host storage after a missing-evidence demo run | No model request (`policyUsesLlm: false`) | The real extension stopped safely before action selection |

The runtime exports are application traces, not independent provider receipts.
The model fields above are claims recorded by the application trace itself.
All three raw runtime files use the legacy pseudonymous demo ID
`final-demo-selfstudy-01`; it is not a name or email address. The per-flow IDs
in `RECORDING_GUIDE.md` apply to replacement recordings. Keep the historical
JSON unchanged so that the hashes below remain verifiable.

## Recommended playback order

### 1. Course exercise: real click

Video:

`captures/course-real-click-with-result-FINAL-16x9.mp4`

What it proves:

- the learner clicks the real cell toolbar command;
- the source is identified as `course_verified`;
- the existing PyBryt output is read as high-confidence evidence;
- the result shows the task, evidence, learner state, and next-step decision.

Matching Extension Host trace:

`runtime-traces/course-verified-REAL-TRACE.json`

Short speaking line:

> This is a course exercise. The student clicks the same Adaptive Next Step
> button on their answer cell. The tool finds the matching PyBryt check,
> identifies reliable course evidence, and then selects the next learning
> action.

### 2. Generated exercise: real click

Video:

`captures/self-study-full-loop-v3-FINAL-16x9.mp4`

What it proves:

- an unresolved notebook can start from a learner goal;
- one validated self-study exercise is inserted;
- after the learner completes it, the same button recognises it as
  `generated_attempt`;
- stored generated tests provide reliable evidence;
- the exported application trace records a non-fallback model-backed selector
  choosing `SIMILAR`.

Matching Extension Host trace:

`runtime-traces/generated-attempt-REAL-TRACE.json`

Short speaking line:

> The first click creates one validated task from the learner's goal. After
> the learner answers it, the second click does not infer the task again. It
> restores the stored tests and metadata and handles the submission as a
> generated attempt.

### 3. Evidence missing: real click

Video:

`captures/needs-evidence-real-click-FINAL-16x9.mp4`

What it proves:

- the learner clicks the real command before running the matching check;
- the system records `needs_evidence` with `CHECK_NOT_RUN`;
- it does not choose a teaching action;
- it does not change learner mastery.

Matching Extension Host trace:

`runtime-traces/needs-evidence-REAL-TRACE.json`

Short speaking line:

> Here the same course answer has no check output. The tool refuses to guess.
> It asks the learner to run the check first, records that decision, and
> leaves the learner state unchanged.

### 4. Six-action coverage

Overview:

`SIX_ACTION_CASES.md`

Frozen inputs:

`action-cases.jsonl`

Reproduce the traces:

```powershell
npm run demo:actions
```

Expected console output:

```text
demo-action-01-hint: HINT ... matched=true
demo-action-02-retry: RETRY_WITH_SCAFFOLD ... matched=true
demo-action-03-easier: EASIER ... matched=true
demo-action-04-similar: SIMILAR ... matched=true
demo-action-05-harder: HARDER ... matched=true
demo-action-06-next-concept: NEXT_CONCEPT ... matched=true
```

Short speaking line:

> These six cases are coverage examples, not formal evaluation data. Each
> uses a frozen learner state and the production decision pipeline, and each
> produces a complete versioned trace.

## Trace integrity

The three files under `runtime-traces/` were exported from the Extension
Development Host storage immediately after the recordings.

SHA-256:

```text
course-verified-REAL-TRACE.json
00F8105190B683C7A694625759A01919A23403C7913DE6213B79DA32007BF017

generated-attempt-REAL-TRACE.json
7357C1E06BC23DD65FC65C581ECA59FAD5F4433395482C9C6AA058550A0F86EB

needs-evidence-REAL-TRACE.json
65294AF22EB8E6FF31D12FBD7FE3EE654DEBA9E2A4C123DD2F24DF72A72EC7FE
```

## Honest claims

- The course, generated-attempt, and needs-evidence videos are real Extension
  Host interactions.
- Only the course and generated-attempt runtime traces record model-backed
  selection; the needs-evidence path stops before any model request.
- The action cases are reproducible coverage fixtures, not unseen formal
  evaluation states.
- The `HINT` coverage trace uses a fixed selector replay and is marked as
  such; it is not described as a live model call.
- `NEEDS_EVIDENCE` is a safe status, not a seventh teaching action.
- None of these artifacts supports a claim about participant outcomes or
  learning improvement.
