import * as vscode from "vscode";
import { GoalToTaskSpecAgent } from "./goalToTaskSpecAgent";
import { insertSelfStudyMiniTask } from "./notebookInserter";
import { PythonValidator } from "./pythonValidator";
import { AdaptiveStore } from "./store";
import { GeneratedExercise } from "./types";
import { fallbackTaskSpecFromGoal, selfStudyCandidateForTask, selfStudyWasConfirmed, toSelfStudyGeneratedExercise } from "./selfStudyTemplates";

export async function promptForSelfStudyGoal(): Promise<string | undefined> {
  const choice = await vscode.window.showInformationMessage(
    "I couldn't identify a learning task from this notebook context. Would you like to start from a learning goal instead?",
    { modal: true },
    "Start from goal"
  );
  if (!selfStudyWasConfirmed(choice)) return undefined;
  const goal = await vscode.window.showInputBox({
    title: "Start from a learning goal",
    prompt: "Describe one small Python skill you want to practise.",
    placeHolder: "I want to practise for loops and accumulators",
    ignoreFocusOut: true
  });
  return goal?.trim() || undefined;
}

export async function createValidatedSelfStudyExercise(input: {
  goal: string;
  validator: PythonValidator;
  pythonPath: string;
  goalAgent?: GoalToTaskSpecAgent;
}): Promise<GeneratedExercise> {
  const taskSpec = await (input.goalAgent ?? new GoalToTaskSpecAgent()).infer(input.goal).catch(() => fallbackTaskSpecFromGoal(input.goal));
  const candidate = selfStudyCandidateForTask(taskSpec);
  const generated = toSelfStudyGeneratedExercise(taskSpec, candidate);
  const validation = await input.validator.validateDetailed(generated, input.pythonPath);
  generated.validated = validation.ok;
  if (!generated.validated) {
    throw new Error(`The self-study fallback template failed validation, so no task was inserted. ${validation.summary}`);
  }
  generated.validationStatus = generated.validationStatus ?? "accepted";
  return generated;
}

export async function startSelfStudyGoal(input: {
  notebook: vscode.NotebookDocument;
  insertIndex: number;
  store: AdaptiveStore;
  validator: PythonValidator;
  pythonPath: string;
  goalAgent?: GoalToTaskSpecAgent;
}): Promise<boolean> {
  const goal = await promptForSelfStudyGoal();
  if (!goal) return false;
  const generated = await createValidatedSelfStudyExercise({
    goal,
    validator: input.validator,
    pythonPath: input.pythonPath,
    goalAgent: input.goalAgent
  });
  await input.store.saveGenerated(generated);
  await insertSelfStudyMiniTask({
    notebook: input.notebook,
    insertIndex: input.insertIndex,
    generated
  });
  return true;
}
