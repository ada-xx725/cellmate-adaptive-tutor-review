import * as vscode from "vscode";
import {
  buildAdaptiveStudentMarkdown,
  buildSelfStudyStudentMarkdown
} from "./studentPresentation";
import { courseResultInsertIndex } from "./courseNotebookLayout";
import { AdaptiveAction, CourseRecommendation, GeneratedExercise, LearnerState, LlmFeedback, NextStepDecisionPresentation, NextStepSupport, TaskSpec, TestEvidence } from "./types";

export function hasAdaptiveResult(sourceCell: vscode.NotebookCell): boolean {
  const marker = resultMarker(sourceCell);
  const notebook = sourceCell.notebook;
  const end = Math.min(notebook.cellCount, sourceCell.index + 8);
  for (let index = sourceCell.index + 1; index < end; index += 1) {
    if (notebook.cellAt(index).document.getText().includes(marker)) return true;
  }
  return false;
}

export async function insertAdaptiveResult(input: {
  sourceCell: vscode.NotebookCell;
  action: AdaptiveAction;
  evidence: TestEvidence;
  learner: LearnerState;
  generated?: GeneratedExercise;
  courseRecommendation?: CourseRecommendation;
  targetConcepts?: string[];
  taskSpec?: TaskSpec;
  feedback?: LlmFeedback;
  support?: NextStepSupport;
  decisionPresentation?: NextStepDecisionPresentation;
}): Promise<void> {
  const { sourceCell, action, evidence, learner, generated, courseRecommendation, targetConcepts = [], taskSpec, feedback, support, decisionPresentation } = input;
  const marker = resultMarker(sourceCell);
  const presentation = buildAdaptiveStudentMarkdown({
    marker,
    action,
    evidence,
    learner,
    generated,
    courseRecommendation,
    targetConcepts,
    taskSpec,
    feedback,
    support,
    decisionPresentation,
    generationSource: generated ? generationSourceLabel(generated) : undefined
  });
  const cells: vscode.NotebookCellData[] = [
    new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, presentation.result, "markdown"),
    new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, presentation.nextStep, "markdown")
  ];
  if (generated && presentation.generatedPractice) {
    cells.push(new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, presentation.generatedPractice, "markdown"));
    cells.push(new vscode.NotebookCellData(vscode.NotebookCellKind.Code, generated.starterCode, "python"));
    cells.push(new vscode.NotebookCellData(vscode.NotebookCellKind.Code, visibleSanityCheck(generated), "python"));
  }
  const existing = existingAdaptiveResultRange(sourceCell);
  if (existing) {
    const remove = new vscode.WorkspaceEdit();
    remove.set(sourceCell.notebook.uri, [vscode.NotebookEdit.deleteCells(existing)]);
    if (!await vscode.workspace.applyEdit(remove)) {
      throw new Error("VS Code could not replace the previous adaptive feedback cells.");
    }
  }
  const edit = new vscode.WorkspaceEdit();
  edit.set(sourceCell.notebook.uri, [
    vscode.NotebookEdit.insertCells(adaptiveResultInsertIndex(sourceCell), cells)
  ]);
  if (!await vscode.workspace.applyEdit(edit)) throw new Error("VS Code could not insert the adaptive feedback cells.");
}

export async function insertSelfStudyMiniTask(input: {
  notebook: vscode.NotebookDocument;
  insertIndex: number;
  generated: GeneratedExercise;
}): Promise<void> {
  const { notebook, insertIndex, generated } = input;
  const cells = [
    new vscode.NotebookCellData(
      vscode.NotebookCellKind.Markup,
      buildSelfStudyStudentMarkdown({
        generated,
        generationSource: generationSourceLabel(generated)
      }),
      "markdown"
    ),
    new vscode.NotebookCellData(vscode.NotebookCellKind.Code, generated.starterCode, "python"),
    new vscode.NotebookCellData(vscode.NotebookCellKind.Code, visibleSanityCheck(generated), "python")
  ];
  const edit = new vscode.WorkspaceEdit();
  edit.set(notebook.uri, [vscode.NotebookEdit.insertCells(insertIndex, cells)]);
  if (!await vscode.workspace.applyEdit(edit)) throw new Error("VS Code could not insert the self-study task cells.");
}

function resultMarker(sourceCell: vscode.NotebookCell): string {
  return `<!-- cellmate-adaptive: source-cell=${sourceCell.index} -->`;
}

function existingAdaptiveResultRange(sourceCell: vscode.NotebookCell): vscode.NotebookRange | undefined {
  const marker = resultMarker(sourceCell);
  const notebook = sourceCell.notebook;
  const searchEnd = Math.min(notebook.cellCount, sourceCell.index + 10);
  let start = -1;
  for (let index = sourceCell.index + 1; index < searchEnd; index += 1) {
    if (notebook.cellAt(index).document.getText().includes(marker)) {
      start = index;
      break;
    }
  }
  if (start < 0) return undefined;

  let end = start;
  while (end < notebook.cellCount) {
    const text = notebook.cellAt(end).document.getText();
    const belongsToResult =
      text.includes(marker) ||
      /^#\s*EXERCISE_ID:\s*generated:/m.test(text) ||
      /^#\s*Visible sanity checks only for\s+generated:/m.test(text);
    if (!belongsToResult) break;
    end += 1;
  }
  return new vscode.NotebookRange(start, end);
}

function adaptiveResultInsertIndex(sourceCell: vscode.NotebookCell): number {
  const exerciseId = sourceCell.document.getText().match(/^#\s*EXERCISE_ID:\s*([^\r\n]+)/m)?.[1]?.trim();
  if (!exerciseId) {
    return courseResultInsertIndex(notebookCellTexts(sourceCell), sourceCell.index)
      ?? sourceCell.index + 1;
  }
  const checkPattern = new RegExp(`^#\\s*Visible sanity checks only for\\s+${escapeRegExp(exerciseId)}\\b`, "m");
  const notebook = sourceCell.notebook;
  for (let index = sourceCell.index + 1; index < Math.min(notebook.cellCount, sourceCell.index + 6); index += 1) {
    if (checkPattern.test(notebook.cellAt(index).document.getText())) {
      return index + 1;
    }
  }
  return sourceCell.index + 1;
}

function notebookCellTexts(sourceCell: vscode.NotebookCell): string[] {
  return Array.from(
    { length: sourceCell.notebook.cellCount },
    (_, index) => sourceCell.notebook.cellAt(index).document.getText()
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function generationSourceLabel(generated: GeneratedExercise): string {
  if (generated.fallbackUsed || generated.validationStatus === "fallback" || generated.model === "fallback-template") return "scaffold fallback";
  if (generated.validationStatus === "repaired") return "repaired";
  return "LLM-generated";
}

export function visibleSanityCheck(generated: GeneratedExercise): string {
  const lines = generated.testCode
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^import\b|^from\b/.test(line))
    .slice(0, 3);
  const body = lines.length ? lines.join("\n") : "# Add a small visible sanity check for your solution here.";
  return `# Visible sanity checks only for ${generated.id}\n# Full reference and negative-candidate validation is stored by the extension.\n${body}`;
}
