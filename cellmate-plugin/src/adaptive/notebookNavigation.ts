import * as path from "path";
import * as vscode from "vscode";
import {
  courseExerciseDisplayId
} from "./decisionPresentation";
import {
  CourseRecommendation,
  DecisionReasonCode
} from "./types";

export async function offerCourseRecommendation(
  sourceCell: vscode.NotebookCell,
  recommendation: CourseRecommendation
): Promise<void> {
  const displayId = courseExerciseDisplayId(recommendation.exerciseId);
  const openLabel = `Open ${displayId}`;
  const choice = await vscode.window.showInformationMessage(
    `Next step: ${displayId} — ${recommendation.title}`,
    openLabel
  );
  if (choice !== openLabel) return;

  const target = await resolveCourseNotebookUri(
    sourceCell.notebook.uri,
    recommendation.notebook
  );
  if (!target) {
    void vscode.window.showWarningMessage(
      `I could not find the notebook for ${displayId}. Open ${recommendation.notebook ?? "the course notebook"} manually.`
    );
    return;
  }

  const document = await vscode.workspace.openNotebookDocument(target);
  const targetIndex = findRecommendedExerciseCellIndex(
    document,
    recommendation
  );
  const selection = new vscode.NotebookRange(
    targetIndex,
    Math.min(document.cellCount, targetIndex + 1)
  );
  const editor = await vscode.window.showNotebookDocument(document, {
    preview: false,
    selections: [selection]
  });
  editor.revealRange(selection, vscode.NotebookEditorRevealType.InCenter);
}

export async function showNeedsEvidenceAction(
  sourceCell: vscode.NotebookCell,
  reasonCodes: DecisionReasonCode[]
): Promise<void> {
  const message = reasonCodes.includes("CHECK_NOT_RUN")
    ? "I can’t recommend a next step yet. Run the exercise check, then try again."
    : "I can’t recommend a next step because the check result is unclear. Run or fix the check, then try again.";
  const checkIndex = findRelevantCheckCellIndex(sourceCell);
  if (checkIndex === undefined) {
    void vscode.window.showInformationMessage(message);
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    message,
    "Go to check cell"
  );
  if (choice !== "Go to check cell") return;

  const editor = vscode.window.visibleNotebookEditors.find(
    (candidate) =>
      candidate.notebook.uri.toString() === sourceCell.notebook.uri.toString()
  );
  if (!editor) return;
  const range = new vscode.NotebookRange(checkIndex, checkIndex + 1);
  editor.selection = range;
  editor.selections = [range];
  editor.revealRange(range, vscode.NotebookEditorRevealType.InCenter);
}

export function findRelevantCheckCellIndex(
  sourceCell: vscode.NotebookCell
): number | undefined {
  const notebook = sourceCell.notebook;
  const end = Math.min(notebook.cellCount, sourceCell.index + 8);
  for (let index = sourceCell.index + 1; index < end; index += 1) {
    const text = notebook.cellAt(index).document.getText();
    if (
      /\bpybryt\.check\s*\(/.test(text) ||
      /^\s*assert\b/m.test(text) ||
      /\bpytest\b/.test(text)
    ) {
      return index;
    }
  }
  return undefined;
}

async function resolveCourseNotebookUri(
  sourceNotebookUri: vscode.Uri,
  notebookPath: string | undefined
): Promise<vscode.Uri | undefined> {
  if (!notebookPath) return undefined;
  const normalized = notebookPath.replace(/[\\/]+/g, path.sep);
  const candidates: vscode.Uri[] = [];

  if (path.isAbsolute(normalized)) {
    candidates.push(vscode.Uri.file(normalized));
  }

  let ancestor = path.dirname(sourceNotebookUri.fsPath);
  for (let depth = 0; depth < 10; depth += 1) {
    candidates.push(vscode.Uri.file(path.join(ancestor, normalized)));
    candidates.push(
      vscode.Uri.file(
        path.join(
          ancestor,
          "external",
          "introduction-to-python",
          normalized
        )
      )
    );
    const parent = path.dirname(ancestor);
    if (parent === ancestor) break;
    ancestor = parent;
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    candidates.push(vscode.Uri.file(path.join(folder.uri.fsPath, normalized)));
    candidates.push(
      vscode.Uri.file(
        path.join(
          folder.uri.fsPath,
          "external",
          "introduction-to-python",
          normalized
        )
      )
    );
  }

  const visited = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.fsPath.toLowerCase();
    if (visited.has(key)) continue;
    visited.add(key);
    if (await uriExists(candidate)) return candidate;
  }

  const globPath = notebookPath.replace(/\\/g, "/");
  const matches = await vscode.workspace.findFiles(
    `**/external/introduction-to-python/${globPath}`,
    "**/node_modules/**",
    1
  );
  return matches[0];
}

async function uriExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

function findRecommendedExerciseCellIndex(
  document: vscode.NotebookDocument,
  recommendation: CourseRecommendation
): number {
  const displayId = courseExerciseDisplayId(recommendation.exerciseId);
  const idParts = recommendation.exerciseId.match(
    /^exercise-(\d+)_(\d+)$/i
  );
  const pybrytPattern = idParts
    ? new RegExp(
      `pybryt_reference\\s*\\(\\s*${idParts[1]}\\s*,\\s*${idParts[2]}\\s*\\)`
    )
    : undefined;
  for (let index = 0; index < document.cellCount; index += 1) {
    const text = document.cellAt(index).document.getText();
    if (
      text.includes(displayId) ||
      text.includes(recommendation.exerciseId) ||
      (pybrytPattern?.test(text) ?? false)
    ) {
      return index;
    }
  }
  return 0;
}
