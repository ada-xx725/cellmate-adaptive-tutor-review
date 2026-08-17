# Final Demo Recording Guide

This guide records real Extension Development Host interactions. The three
main videos should show button clicks and student-visible results, not a long
scroll through source code.

These recordings and their exported traces are demonstration evidence only.
They are not participant-study data or formal action-quality evaluation
results. See `DEMO_PACK_INDEX.md` for the provenance and limits of each trace.

## 1. One-time preparation

In the normal VS Code window, open a terminal in `cellmate-plugin/` and run:

```powershell
npm run compile
npm test
```

Press `F5` and use the new `[Extension Development Host]` window.

Before every take:

1. Maximise the Extension Development Host.
2. Use a 16:9 resolution, preferably `1920 × 1080`.
3. Press `Ctrl+0` to reset VS Code zoom. Increase zoom once only if the
   notebook text is too small.
4. Close the Explorer and bottom panel unless they are needed.
5. Close unrelated notebook tabs and dismiss old notifications.
6. Never open `settings.json` while recording because it may contain an API
   key.
7. Run `Adaptive Next Step: Set Anonymous Participant ID` and use a different
   ID for each flow:
   - `demo-course-ui`
   - `demo-selfstudy-ui`
   - `demo-needs-ui`
8. Run `Adaptive Next Step: Reset Learner State` after setting each ID.
9. Start with a clean notebook copy. If old Adaptive Next Step result cells
   are present, close without saving and reopen the clean source file.

Use `Win+Alt+R` to start and stop Xbox Game Bar recording. Leave two seconds
of still screen at the start and end of each take.

Do not overwrite the old final recording until the new take has been watched
from beginning to end.

## 2. Video A — course exercise and course navigation

Source notebook:

```text
demo\captures\course-exercise-1_2-executed-check.ipynb
```

Target filename after review:

```text
course-real-click-with-result-FINAL-16x9.mp4
```

### Actions

1. Set participant ID to `demo-course-ui` and reset its learner state.
2. Open the source notebook.
3. Position the screen so the Exercise 1.2 answer cell and its completed
   PyBryt check are visible.
4. Start recording and wait two seconds.
5. Select **Adaptive Next Step** on the answer cell, not on the PyBryt cell.
6. Do not click again while the progress message is visible.
7. When the result is inserted, show these headings:
   - `Check passed`
   - `Learning progress`
   - `Next step: Practise a similar exercise`
   - `Continue with Exercise 1.3`
8. Keep `Technical details` collapsed. Open `Why this recommendation?` for
   two or three seconds only if the meeting needs to show the LLM source.
9. In the notification, choose **Open Exercise 1.3**.
10. Show that the pinned course notebook opens at Exercise 1.3.
11. Wait two seconds and stop recording.

Expected length: 30–45 seconds.

### Speaking line

> This is a course exercise. The tool reads the completed PyBryt check,
> recognises reliable evidence, and recommends the next suitable course
> exercise. The student can open that exercise directly.

## 3. Video B — self-study goal to generated attempt

Source notebook:

```text
demo\self-study-start.ipynb
```

Target filename after review:

```text
self-study-full-loop-v3-FINAL-16x9.mp4
```

### Actions

1. Set participant ID to `demo-selfstudy-ui` and reset its learner state.
2. Open the blank source notebook.
3. Start recording and wait two seconds.
4. Select **Adaptive Next Step** on the blank Python cell.
5. Choose **Start from goal**.
6. Enter:

   ```text
   I want to practise for loops and accumulators
   ```

7. Wait for the mini task to appear.
8. Show that `Validation details` is collapsed by default.
9. Complete the generated function. If the local accumulator fallback is
   used, enter:

   ```python
   def sum_small_numbers(values):
       total = 0
       for value in values:
           total += value
       return total
   ```

   Keep the generated `EXERCISE_ID`, source-mode and target-concept comments
   above the function.

10. Run the task code cell.
11. Run the visible sanity-check cell immediately below it.
12. Return to the generated task code cell and select **Adaptive Next Step**
    on that cell.
13. Wait for the stored tests to run and for the result to be inserted.
14. Show:
    - `Check passed`
    - readable learning-progress bands rather than raw scores
    - the natural-language next-step title
    - the new `Practice task`
    - its visible sanity check directly below its code cell
15. Leave `Technical details` and `Validation details` collapsed.
16. Wait two seconds and stop recording.

Expected length: 45–65 seconds.

### Speaking line

> When there is no course task, the student can start from one small learning
> goal. The first click creates a validated exercise. After the student
> answers it, the same button recognises the stored generated task, runs its
> tests, and selects the next learning step.

## 4. Video C — safe stop when evidence is missing

Source notebook:

```text
demo\course-exercise-1_2.ipynb
```

Target filename after review:

```text
needs-evidence-real-click-FINAL-16x9.mp4
```

### Actions

1. Set participant ID to `demo-needs-ui` and reset its learner state.
2. Open the source notebook.
3. Do not run the PyBryt check.
4. Position the answer cell and the unrun check cell on screen.
5. Start recording and wait two seconds.
6. Select **Adaptive Next Step** on the answer cell.
7. Show the message:

   ```text
   I can’t recommend a next step yet. Run the exercise check, then try again.
   ```

8. Choose **Go to check cell**.
9. Show that VS Code focuses and reveals the matching check cell.
10. Point out that no teaching action or result cells were inserted.
11. Wait two seconds and stop recording.

Expected length: 10–15 seconds.

### Speaking line

> Here the check has not been run. The system does not guess. It asks for the
> missing evidence, takes the student to the check cell, and leaves the
> learner state unchanged.

## 5. Optional recording — six teaching-action traces

This is coverage evidence, not a live student-learning experiment.

Run:

```powershell
npm run demo:actions
```

Record the six `matched=true` lines:

```text
HINT
RETRY_WITH_SCAFFOLD
EASIER
SIMILAR
HARDER
NEXT_CONCEPT
```

Then open one JSON file under:

```text
demo\action-traces
```

Show only:

1. `taskSpec`
2. `evidence`
3. `learnerBefore`
4. `history`
5. `action`
6. `learnerAfter`
7. version fields

Say clearly that `NEEDS_EVIDENCE` is a safe status, not a seventh teaching
action.

## 6. Final review checklist

Watch every new recording and confirm:

- [ ] The window is `[Extension Development Host]`.
- [ ] The video is 16:9 and the notebook text is readable.
- [ ] No API key, email address or personal participant name is visible.
- [ ] The recording says **PyBryt**, not Pyright.
- [ ] No policy enum such as `RETRY_WITH_SCAFFOLD` is shown in the default
      student view.
- [ ] No mojibake or broken punctuation is visible.
- [ ] Exact scores, model names and prompt versions are collapsed.
- [ ] The course notification contains a working `Open Exercise ...` button.
- [ ] The missing-evidence notification contains a working
      `Go to check cell` button.
- [ ] A generated exercise's visible check is directly below its code cell.
- [ ] The cursor pauses long enough for each result to be read.
- [ ] The final two seconds are still, so the video does not end abruptly.

Only after all checks pass should the new videos replace the three existing
`FINAL-16x9.mp4` files.
