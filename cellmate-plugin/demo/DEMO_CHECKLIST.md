# Final Demo Checklist

Use this checklist for the final CellMate Adaptive Next Step demonstration.
Keep the live demo focused on two paths:

1. a passed course exercise that leads to a course-first recommendation;
2. an empty notebook that starts one validated self-study task.

Use screenshots or the backup recording for failure, missing-evidence, and
LLM-backup paths.

## One day before the meeting

- [ ] Open PowerShell in `<repository-root>\cellmate-plugin`.
- [ ] Run `npm ci`.
- [ ] Run `npm test` and save the passing result.
- [ ] From `<repository-root>`, run `python -m pytest`.
- [ ] Press `F5` and confirm the second window says
      `[Extension Development Host]`.
- [ ] Select the correct Python kernel in the course notebook.
- [ ] Confirm PyBryt works with the chosen kernel.
- [ ] Configure the LLM before taking any screenshot or recording.
- [ ] Close `settings.json`, API dashboards, emails, terminals containing
      secrets, and all account pages.
- [ ] Never show or paste an API key during the presentation.
- [ ] Use the command palette to run
      `Adaptive Next Step: Set Anonymous Participant ID`.
- [ ] Use a non-identifying ID such as `final-demo`.
- [ ] Run `Adaptive Next Step: Reset Learner State`.
- [ ] Prepare one clean course notebook at the chosen exercise.
- [ ] Prepare one empty notebook for the self-study path.
- [ ] Increase VS Code zoom until notebook text is readable on the projector.
- [ ] Turn off desktop notifications and close unrelated applications.
- [ ] Complete three full rehearsals.

## Course-path rehearsal

- [ ] Open the prepared course exercise.
- [ ] Run the learner code.
- [ ] Run the matching PyBryt or assertion check.
- [ ] Click `Adaptive Next Step` on the learner code cell.
- [ ] Confirm the result identifies `course_verified`.
- [ ] Confirm the evidence is shown as reliable.
- [ ] Confirm the chosen action does not contradict a passed result.
- [ ] Confirm the teacher's course material is recommended before generated
      practice.
- [ ] Confirm the displayed recommendation is easy to read.

## Self-study rehearsal

- [ ] Open a clean, empty `.ipynb` notebook.
- [ ] Click `Adaptive Next Step` on its empty code cell.
- [ ] Choose `Start from goal`.
- [ ] Enter: `I want to practise for loops and accumulators.`
- [ ] Confirm one mini task is inserted.
- [ ] Confirm the starter code immediately follows the task description.
- [ ] Confirm its visible sanity-check cell immediately follows the code cell.
- [ ] Confirm `Local validation: passed` is visible.
- [ ] Complete the generated task and run the visible check.
- [ ] Click `Adaptive Next Step` on the generated exercise cell.
- [ ] Confirm the mode is now `generated_attempt`.

## Backup evidence to prepare

- [ ] Screenshot: failed course check produces
      `HINT`, `RETRY_WITH_SCAFFOLD`, or `EASIER`.
- [ ] Screenshot: no reliable check produces `NEEDS_EVIDENCE`.
- [ ] Screenshot: unavailable or invalid LLM response uses the documented
      rule-based backup.
- [ ] Export one evaluation trace with
      `Adaptive Next Step: Export Evaluation Trace`.
- [ ] Verify the exported trace contains no API key or personal information.
- [ ] Record a silent 2–3 minute backup demo.
- [ ] Open the capture folder before the meeting so the backup is one click
      away.

## Capture safety

The capture scripts only capture pixels from the desktop. They do not read
VS Code settings, environment variables, the clipboard, browser storage, or
API credentials. A visible secret would still appear in a screen capture, so
the scripts require confirmation that no secret is visible before they start.

Before confirming:

- [ ] Close VS Code settings and `settings.json`.
- [ ] Close terminals that show keys or environment variables.
- [ ] Close browser pages for API keys, billing, email, or accounts.
- [ ] Hide notifications and personal chat windows.
- [ ] Check every connected monitor because the scripts capture the full
      virtual desktop.

Take a 16:9 screenshot for slides:

```powershell
cd <repository-root>\cellmate-plugin
.\demo\capture-demo-16x9.ps1 -Label course-pass
```

Use `capture-fullscreen.ps1` only for diagnostic evidence that needs the whole
desktop. The native laptop display is 3:2, so a full-screen image is not the
right shape for a 16:9 slide.

Record a three-minute silent backup:

```powershell
cd <repository-root>\cellmate-plugin
.\demo\record-desktop.ps1 -Label final-demo -DurationSeconds 180
```

Record until you press `q` in the recording terminal:

```powershell
.\demo\record-desktop.ps1 -Label final-demo
```

Captures are written under:

```text
<repository-root>\cellmate-plugin\demo\captures
```

## Meeting-day check: 30 minutes before

- [ ] Start the Extension Development Host.
- [ ] Confirm the Python kernel.
- [ ] Make one harmless LLM test request.
- [ ] Reset the anonymous demo learner.
- [ ] Open the two prepared notebooks.
- [ ] Position the course notebook at the exact exercise.
- [ ] Open the backup capture folder.
- [ ] Close settings and all secret-bearing windows again.
- [ ] Turn off notifications.
- [ ] Plug in power and check the network.
- [ ] Stop editing code and dependencies.

## Live-demo recovery

If the LLM request is slow:

> The model call is delayed, so I will show the recorded result. The decision
> trace records whether the LLM or the backup method produced the action.

If PyBryt or the kernel fails:

> This is an environment problem rather than a decision result. I will use the
> prepared course-path screenshot and show the stored decision trace.

If the notebook layout moves:

> I will switch to the prepared clean notebook rather than repair the notebook
> during the meeting.
