# Final Demo: Action and Mode Coverage

This is a demonstration pack, not part of the formal evaluation set.
It contains no participant-study results. `DEMO_PACK_INDEX.md` records the
provenance and claim limits for the saved fixtures and runtime traces.

## Terminology

The workflow has six teaching actions:

- `HINT`
- `RETRY_WITH_SCAFFOLD`
- `EASIER`
- `SIMILAR`
- `HARDER`
- `NEXT_CONCEPT`

`NEEDS_EVIDENCE` is a safe status, not a teaching action. It means that the
system does not have reliable evidence and will not make a learning
recommendation or update the learner state.

The implemented source modes are:

- `course_verified`
- `generated_attempt`
- `generic_llm`
- `self_study_goal`

An empty or unclear notebook is initially unresolved. If the learner chooses
to enter a learning goal, `self_study_goal` creates one validated mini task.
The learner's later submission is handled as `generated_attempt`.

## Layer 1: live interaction

Use real interactions rather than scrolling through a prepared result:

1. Course exercise: run the matching PyBryt check, then click
   `Adaptive Next Step`.
2. Empty notebook: run `Adaptive Next Step`, choose `Start from goal`, enter
   `I want to practise for loops and accumulators.`, and show the validated
   task that is inserted.
3. Complete that task, run its visible check, then click the same command to
   show that it is now a `generated_attempt`.

Only one fresh LLM request should be required during the meeting. Keep the
recorded first runs as backup because model latency and output wording can
vary.

## Layer 2: prepared coverage cases

Each case must be a genuine first run or a saved decision trace. Do not
recreate an action by deleting previously inserted result cells.

| Case | Source mode | Learner situation | Expected result |
| --- | --- | --- | --- |
| C01 | `course_verified` | First localised error with reliable evidence | `HINT` |
| C02 | `course_verified` | The error remains and more structure is needed | `RETRY_WITH_SCAFFOLD` |
| C03 | `course_verified` | Repeated prerequisite gap after earlier support | `EASIER` |
| C04 | `generated_attempt` | One success but mastery is still developing | `SIMILAR` |
| C05 | `generated_attempt` | Stable successes and readiness for a challenge | `HARDER` |
| C06 | `course_verified` | Current concept is mastered and the course has a next step | `NEXT_CONCEPT` |
| C07 | `course_verified` | The matching check has not been run | `NEEDS_EVIDENCE` |

Also prepare two mode demonstrations that are not additional actions:

| Case | Starting context | Expected path |
| --- | --- | --- |
| M01 | Ordinary notebook with a clear task and usable execution context | `generic_llm` |
| M02 | Empty notebook with no identifiable task | unresolved -> `self_study_goal` |

## Presentation order

1. Show the live course path.
2. Show the live self-study goal interaction.
3. Open this coverage matrix and switch to C01-C07 using prepared notebook
   tabs or VS Code Quick Open.
4. Play only the short first-run clip needed for each remaining result.
5. Finish with the automated test result and one exported decision trace.

Do not claim a scenario count or match rate until those cases and expected
labels have actually been created and checked.

## Prepared recordings and traces

The current demo pack is indexed in `DEMO_PACK_INDEX.md`.

Real-click recordings:

- `captures/course-real-click-with-result-FINAL-16x9.mp4`
- `captures/self-study-full-loop-v3-FINAL-16x9.mp4`
- `captures/needs-evidence-real-click-FINAL-16x9.mp4`

The matching Extension Host traces are under `runtime-traces/`.

The six teaching-action fixtures and their production-engine traces are
documented in `SIX_ACTION_CASES.md`.

## Recorded self-study fallback

The final backup recording covers the complete interaction:

1. click `Adaptive Next Step` in an empty notebook;
2. enter a learning goal;
3. receive one validated self-study task;
4. complete the generated exercise;
5. click `Adaptive Next Step` on that exercise;
6. observe `generated_attempt`, reliable generated-test evidence, learner
   state, and the LLM-selected `SIMILAR` recommendation.

Backup file:

`captures/self-study-full-loop-v3-FINAL-16x9.mp4`
