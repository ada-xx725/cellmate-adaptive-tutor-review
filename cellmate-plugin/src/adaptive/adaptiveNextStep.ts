import * as vscode from "vscode";
import { createAnalysisFingerprint } from "./analysisFingerprint";
import { readWorkspaceLlmConfig } from "../workspaceLlmConfiguration";
import { extractNotebookContext } from "./contextExtractor";
import { chooseCourseRecommendation } from "./courseRecommendation";
import { CourseExerciseResolver } from "./courseExerciseResolver";
import { EvidenceExtractor } from "./evidenceExtractor";
import { FeedbackAgent, FEEDBACK_PROMPT_VERSION } from "./feedbackAgent";
import { ConstrainedExerciseGenerator } from "./generation";
import { GenericTaskInferer } from "./genericTaskInferer";
import { hasAdaptiveResult, insertAdaptiveResult } from "./notebookInserter";
import {
  actionStudentLabel,
  createDecisionPresentation
} from "./decisionPresentation";
import {
  offerCourseRecommendation,
  showNeedsEvidenceAction
} from "./notebookNavigation";
import { LlmDecisionEngine } from "./core/llmDecisionEngine";
import { createDecisionTrace } from "./core/decisionTrace";
import { resolveAttemptDecision } from "./core/attemptDecisionCoordinator";
import { LLM_NEXT_STEP_PROMPT_VERSION } from "./llmNextStepSelector";
import { NEXT_STEP_SUPPORT_PROMPT_VERSION, NextStepSupportAgent } from "./nextStepSupport";
import { PythonValidator } from "./pythonValidator";
import { startSelfStudyGoal } from "./selfStudyGoal";
import { assessNotebookTaskIntent, shouldOfferSelfStudyFallback } from "./selfStudyTemplates";
import { AdaptiveStore } from "./store";
import { DecisionTraceStore } from "./traceStore";
import { getOrCreateParticipantId, isValidParticipantId, setParticipantId } from "./participant";
import { CourseExercise, CourseRecommendation, GeneratedExercise, NotebookContext, TaskSpec, TestEvidence } from "./types";
import { exerciseFromTaskSpec, taskSpecFromExercise } from "./taskSpec";
import { STUDENT_PRESENTATION_VERSION } from "./studentPresentation";

const decisionEngine = new LlmDecisionEngine();

export function registerAdaptiveNextStep(context: vscode.ExtensionContext): void {
  const store = new AdaptiveStore(context);
  const traceStore = new DecisionTraceStore(context);
  const resolver = new CourseExerciseResolver(store);
  const generator = new ConstrainedExerciseGenerator();
  const validator = new PythonValidator();
  const evidenceExtractor = new EvidenceExtractor(validator);
  const genericTaskInferer = new GenericTaskInferer();
  const feedbackAgent = new FeedbackAgent();
  const supportAgent = new NextStepSupportAgent();
  const running = new Set<string>();

  context.subscriptions.push(vscode.notebooks.registerNotebookCellStatusBarItemProvider("jupyter-notebook", {
    provideCellStatusBarItems(cell) {
      if (cell.kind !== vscode.NotebookCellKind.Code || cell.document.languageId !== "python") return [];
      const item = new vscode.NotebookCellStatusBarItem("$(mortar-board) Adaptive Next Step", vscode.NotebookCellStatusBarAlignment.Right);
      item.priority = 80;
      item.command = { command: "CellMate.adaptiveNextStep", title: "Adaptive Next Step", arguments: [cell] };
      item.tooltip = "Recommend and validate the next course-grounded or generic learning step";
      return [item];
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand("CellMate.adaptiveNextStep", async (argument?: vscode.NotebookCell) => {
    const cell = resolveCell(argument);
    const pythonPath = vscode.workspace.getConfiguration("CellMate.adaptive").get<string>("pythonPath", "python");
    if (!cell) {
      const editor = vscode.window.activeNotebookEditor;
      if (!editor) return vscode.window.showErrorMessage("Select a Python exercise cell first.");
      try {
        const started = await startSelfStudyGoal({
          notebook: editor.notebook,
          insertIndex: editor.notebook.cellCount ? editor.selection.start + 1 : 0,
          store,
          validator,
          pythonPath
        });
        if (started) void vscode.window.showInformationMessage(selfStudyReadyMessage());
      } catch (error) {
        void vscode.window.showErrorMessage(`Adaptive Next Step: ${error instanceof Error ? error.message : String(error)}`);
      }
      return;
    }
    const key = `${cell.notebook.uri.toString()}#${cell.index}`;
    if (running.has(key)) return vscode.window.showWarningMessage("Adaptive Next Step is already analysing this cell.");
    running.add(key);
    try {
      const participantId = await getOrCreateParticipantId(context);
      await store.adoptLegacyParticipant(participantId);
      // Keep interactive prompts visible. A notification-scoped progress item can
      // cover the self-study confirmation notification and make the command look
      // unresponsive on an otherwise empty notebook.
      await vscode.window.withProgress({ location: vscode.ProgressLocation.Window, title: "CellMate: choosing the next learning step" }, async (progress) => {
        progress.report({ message: "Extracting notebook context..." });
        const notebookContext = extractNotebookContext(cell);
        const courseExercise = await resolver.tryResolve(cell);
        const taskIntent = courseExercise ? undefined : assessNotebookTaskIntent(notebookContext);
        if (taskIntent?.status === "needs_evidence") {
          progress.report({ message: "Task intent is missing; asking for a learning goal..." });
          const started = await startSelfStudyGoal({
            notebook: cell.notebook,
            insertIndex: cell.index + 1,
            store,
            validator,
            pythonPath
          });
          if (started) {
            void vscode.window.showInformationMessage(selfStudyReadyMessage());
          } else {
            void vscode.window.showInformationMessage("Self-study setup cancelled. Nothing was inserted or saved.");
          }
          return;
        }
        const taskSpec = courseExercise
          ? taskSpecFromExercise(courseExercise)
          : await genericTaskInferer.infer(notebookContext, taskIntent!.statement);
        if (!courseExercise && shouldOfferSelfStudyFallback(taskSpec)) {
          progress.report({ message: "No reliable task found; asking for a learning goal..." });
          const started = await startSelfStudyGoal({
            notebook: cell.notebook,
            insertIndex: cell.index + 1,
            store,
            validator,
            pythonPath
          });
          if (started) {
            void vscode.window.showInformationMessage(selfStudyReadyMessage());
          } else {
            void vscode.window.showInformationMessage("Self-study setup cancelled. Nothing was inserted or saved.");
          }
          return;
        }
        const parent = exerciseFromTaskSpec(taskSpec);

        progress.report({ message: `Collecting ${taskSpec.sourceMode} evidence...` });
        const evidence = await collectEvidence({ cell, parent, taskSpec, pythonPath, resolver, validator, evidenceExtractor, notebookContext });
        const attemptFingerprint = fingerprint(cell, participantId, taskSpec.id, evidence);
        const resolution = await resolveAttemptDecision({
          attemptFingerprint,
          participantId,
          taskSpec,
          evidence,
          courseContext: taskSpec.exercise ? {
            exerciseId: taskSpec.exercise.id,
            difficulty: taskSpec.exercise.difficulty,
            nextExercises: taskSpec.exercise.nextExercises,
            nextConcepts: taskSpec.exercise.nextConcepts
          } : undefined
        }, store, decisionEngine);
        if (resolution.kind === "saved_attempt") {
          const savedAttempt = resolution.attempt;
          if (!hasAdaptiveResult(cell)) {
            const generated = savedAttempt.generatedId
              ? await store.getGenerated(savedAttempt.generatedId)
              : await store.findLatestGenerated(taskSpec.id, savedAttempt.action);
            const restoredLearner = savedAttempt.learnerAfter ?? await store.getLearner(participantId);
            await insertAdaptiveResult({
              sourceCell: cell,
              action: savedAttempt.action,
              evidence: savedAttempt.evidence,
              learner: restoredLearner,
              generated,
              courseRecommendation: savedAttempt.courseRecommendation,
              targetConcepts: savedAttempt.taskSpec?.targetConcepts ?? taskSpec.targetConcepts,
              taskSpec: savedAttempt.taskSpec ?? taskSpec,
              feedback: savedAttempt.feedback,
              support: savedAttempt.support,
              decisionPresentation: savedAttempt.decisionPresentation
            });
            void vscode.window.showInformationMessage("Previous result restored. Learner progress was not changed again.");
            if (savedAttempt.courseRecommendation) {
              void offerCourseRecommendation(cell, savedAttempt.courseRecommendation);
            }
            return;
          }
          void vscode.window.showInformationMessage("This result is already up to date. Learner progress was not changed again.");
          return;
        }

        const learner = resolution.learnerBefore;
        const history = resolution.history;
        const decision = resolution.decision;
        const decisionLatencyMs = resolution.latencyMs;
        if (decision.status === "needs_evidence") {
          try {
            await traceStore.append(createDecisionTrace({
              stateId: attemptFingerprint,
              participantId,
              taskSpec,
              evidence,
              learnerBefore: learner,
              history,
              decision,
              latencyMs: decisionLatencyMs,
              modelVersion: "not-used-needs-evidence",
              promptVersion: "not-used-needs-evidence"
            }));
          } catch (error) {
            void vscode.window.showWarningMessage(`The evidence request could not be recorded: ${error instanceof Error ? error.message : String(error)}`);
          }
          void showNeedsEvidenceAction(cell, decision.reasonCodes);
          return;
        }

        const action = decision.action;
        const updatedLearner = decision.learnerAfter;
        const configuredModel = readWorkspaceLlmConfig("adaptive").modelName;
        const decisionPresentation = createDecisionPresentation(decision, configuredModel);
        const feedback = await feedbackAgent.generate({ taskSpec, evidence, learner, action, studentCode: cell.document.getText() });
        const support = await supportAgent.generate({
          taskSpec,
          evidence,
          action,
          studentCode: cell.document.getText(),
          feedback
        });
        const courseRecommendation = chooseCourseRecommendation({
          taskSpec,
          action,
          attemptedExerciseIds: await store.attemptedExerciseIds(participantId)
        });

        let generated: GeneratedExercise | undefined;
        if (shouldGeneratePractice({ taskSpec, action, courseRecommendation })) {
          progress.report({ message: "Generating a validated next-step task..." });
          generated = await generator.generate({ parent, action, context: taskSpec.promptMarkdown });
          let validation = await validator.validateDetailed(generated, pythonPath);
          generated.validated = validation.ok;
          if (!validation.ok && generated.model !== "fallback-template") {
            const repaired = await generator.repair({ exercise: generated, validationSummary: validation.summary });
            if (repaired) {
              const repairedValidation = await validator.validateDetailed(repaired, pythonPath);
              if (repairedValidation.ok) {
                generated = repaired;
                generated.validated = true;
                generated.validationStatus = "repaired";
                validation = repairedValidation;
              }
            }
          }
          if (!generated.validated) {
            void vscode.window.showWarningMessage("The LLM-generated exercise failed validation/repair, so Adaptive Next Step is falling back to a verified scaffold.");
            generated = generator.generateFallback({ parent, action });
            validation = await validator.validateDetailed(generated, pythonPath);
            generated.validated = validation.ok;
          }
          if (!generated.validated) {
            generated.validationStatus = "failed";
            throw new Error(`Both the generated exercise and fallback scaffold failed validation; no task was inserted. ${validation.summary}`);
          }
          generated.validationStatus = generated.validationStatus ?? "accepted";
        }

        const committed = await store.commitAttempt({
          learnerBefore: learner,
          learnerAfter: updatedLearner,
          generated,
          attempt: {
            participantId,
            fingerprint: attemptFingerprint,
            exerciseId: taskSpec.id,
            action,
            evidence,
            feedback,
            support,
            taskSpec,
            courseRecommendation,
            generatedId: generated?.id,
            decisionPresentation,
            createdAt: new Date().toISOString()
          }
        });
        if (!committed.created) {
          const savedGenerated = committed.attempt.generatedId
            ? await store.getGenerated(committed.attempt.generatedId)
            : undefined;
          if (!hasAdaptiveResult(cell)) {
            await insertAdaptiveResult({
              sourceCell: cell,
              action: committed.attempt.action,
              evidence: committed.attempt.evidence,
              learner: committed.learner,
              generated: savedGenerated,
              courseRecommendation: committed.attempt.courseRecommendation,
              targetConcepts: committed.attempt.taskSpec?.targetConcepts ?? taskSpec.targetConcepts,
              taskSpec: committed.attempt.taskSpec ?? taskSpec,
              feedback: committed.attempt.feedback,
              support: committed.attempt.support,
              decisionPresentation: committed.attempt.decisionPresentation
            });
          }
          void vscode.window.showInformationMessage("A concurrent result was restored. Learner progress was not changed again.");
          return;
        }
        try {
          await traceStore.append(createDecisionTrace({
            stateId: attemptFingerprint,
            participantId,
            taskSpec,
            evidence,
            learnerBefore: learner,
            history,
            decision,
            latencyMs: decisionLatencyMs,
            modelVersion: configuredModel || "llm-model-unconfigured",
            promptVersion: decision.policyVersion
          }));
        } catch (error) {
          void vscode.window.showWarningMessage(`The learning action succeeded, but its evaluation trace could not be saved: ${error instanceof Error ? error.message : String(error)}`);
        }
        progress.report({ message: "Writing feedback to the notebook..." });
        await insertAdaptiveResult({ sourceCell: cell, action, evidence, learner: committed.learner, generated, courseRecommendation, targetConcepts: taskSpec.targetConcepts, taskSpec, feedback, support, decisionPresentation });
        if (courseRecommendation) {
          void offerCourseRecommendation(cell, courseRecommendation);
        } else {
          void vscode.window.showInformationMessage(`Next step: ${actionStudentLabel(action)}.`);
        }
      });
    } catch (error) {
      void vscode.window.showErrorMessage(`Adaptive Next Step: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      running.delete(key);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand("CellMate.startSelfStudyGoal", async () => {
    const editor = vscode.window.activeNotebookEditor;
    if (!editor) return vscode.window.showErrorMessage("Open a notebook before starting a self-study goal.");
    const pythonPath = vscode.workspace.getConfiguration("CellMate.adaptive").get<string>("pythonPath", "python");
    try {
      const started = await startSelfStudyGoal({
        notebook: editor.notebook,
        insertIndex: editor.notebook.cellCount ? editor.selection.start + 1 : 0,
        store,
        validator,
        pythonPath
      });
      if (started) void vscode.window.showInformationMessage(selfStudyReadyMessage());
    } catch (error) {
      void vscode.window.showErrorMessage(`Self-study goal: ${error instanceof Error ? error.message : String(error)}`);
    }
  }));

  context.subscriptions.push(vscode.commands.registerCommand("CellMate.setAdaptiveParticipantId", async () => {
    const current = await getOrCreateParticipantId(context);
    const value = await vscode.window.showInputBox({
      title: "Set anonymous Adaptive Next Step participant ID",
      value: current,
      prompt: "Use an anonymous study code, not a name or email address.",
      validateInput: (input) => isValidParticipantId(input) ? undefined : "Use 3-40 letters, numbers, underscores, or hyphens."
    });
    if (value === undefined) return;
    await setParticipantId(context, value);
    void vscode.window.showInformationMessage(`Adaptive Next Step participant ID set to ${value}.`);
  }));

  context.subscriptions.push(vscode.commands.registerCommand("CellMate.resetAdaptiveLearnerState", async () => {
    const participantId = await getOrCreateParticipantId(context);
    const confirmed = await vscode.window.showWarningMessage(
      `Reset learner mastery and attempts for ${participantId}? Saved generated exercises and evaluation traces will be kept.`,
      { modal: true },
      "Reset"
    );
    if (confirmed !== "Reset") return;
    await store.resetParticipant(participantId);
    void vscode.window.showInformationMessage(`Adaptive learner state reset for ${participantId}.`);
  }));

  context.subscriptions.push(vscode.commands.registerCommand("CellMate.exportAdaptiveDecisionTrace", async () => {
    const uri = await vscode.window.showSaveDialog({
      title: "Export Adaptive Next Step decision traces",
      defaultUri: vscode.Uri.file("adaptive-decision-traces.jsonl"),
      filters: { "JSON Lines": ["jsonl"] }
    });
    if (!uri) return;
    const count = await traceStore.exportTo(uri);
    void vscode.window.showInformationMessage(`Exported ${count} Adaptive Next Step decision traces.`);
  }));
}

function selfStudyReadyMessage(): string {
  return "Your self-study task is ready. Complete the code, run the visible check, then select Adaptive Next Step on the task cell.";
}

async function collectEvidence(input: {
  cell: vscode.NotebookCell;
  parent: CourseExercise;
  taskSpec: TaskSpec;
  pythonPath: string;
  resolver: CourseExerciseResolver;
  validator: PythonValidator;
  evidenceExtractor: EvidenceExtractor;
  notebookContext: NotebookContext;
}): Promise<TestEvidence> {
  if (isGeneratedExercise(input.parent)) {
    const generatedEvidence = await input.validator.run(input.cell.document.getText(), input.parent.testCode, input.pythonPath);
    return { ...generatedEvidence, source: "llm_generated_tests", confidence: "high", hasReliableCheck: generatedEvidence.status === "passed" || generatedEvidence.status === "failed" };
  }
  if (input.taskSpec.sourceMode === "course_verified") {
    return input.resolver.collectCourseEvidence(input.cell);
  }
  return input.evidenceExtractor.collectGenericEvidence({ context: input.notebookContext, taskSpec: input.taskSpec, pythonPath: input.pythonPath });
}

function resolveCell(argument?: vscode.NotebookCell): vscode.NotebookCell | undefined {
  if (argument?.kind === vscode.NotebookCellKind.Code) return argument;
  const editor = vscode.window.activeNotebookEditor;
  if (!editor) return undefined;
  const cell = editor.notebook.cellAt(editor.selection.start);
  return cell.kind === vscode.NotebookCellKind.Code ? cell : undefined;
}

function fingerprint(cell: vscode.NotebookCell, participantId: string, taskId: string, evidence: { status: string; summary: string }): string {
  return createAnalysisFingerprint({
    participantId,
    notebookUri: cell.notebook.uri.toString(),
    cellIndex: cell.index,
    taskId,
    code: cell.document.getText(),
    evidenceStatus: evidence.status,
    evidenceSummary: evidence.summary,
    decisionVersion: LLM_NEXT_STEP_PROMPT_VERSION,
    feedbackVersion: FEEDBACK_PROMPT_VERSION,
    supportVersion: NEXT_STEP_SUPPORT_PROMPT_VERSION,
    presentationVersion: STUDENT_PRESENTATION_VERSION
  });
}

function isGeneratedExercise(exercise: CourseExercise): exercise is GeneratedExercise {
  return exercise.origin === "generated" && "testCode" in exercise;
}

function shouldGeneratePractice(input: {
  taskSpec: TaskSpec;
  action: string;
  courseRecommendation?: CourseRecommendation;
}): boolean {
  if (input.action === "HINT" || input.action === "RETRY_WITH_SCAFFOLD") return false;
  if (input.taskSpec.sourceMode === "generic_llm") return true;
  return !input.courseRecommendation;
}
