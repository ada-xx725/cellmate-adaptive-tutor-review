import * as vscode from "vscode";
import { extractAdaptiveExerciseId } from "./adaptiveExerciseId";
import { classifyCourseCheckOutput } from "./courseCheckParser";
import { findFollowingCourseCheck } from "./courseNotebookLayout";
import { findManifestExercise } from "./courseManifest";
import { AdaptiveStore } from "./store";
import { CourseExercise, TestEvidence } from "./types";

const EXERCISE_HEADING = /^##\s*Exercise\s+(\d+)\.(\d+):\s*(.+)$/mi;

export class CourseExerciseResolver {
  constructor(private readonly store: AdaptiveStore) {}

  async tryResolve(cell: vscode.NotebookCell): Promise<CourseExercise | undefined> {
    try {
      return await this.resolve(cell);
    } catch {
      return undefined;
    }
  }

  async resolve(cell: vscode.NotebookCell): Promise<CourseExercise> {
    const generatedId = extractAdaptiveExerciseId(cell.document.getText());
    if (generatedId) {
      const generated = await this.store.getGenerated(generatedId);
      if (!generated || !generated.validated) {
        throw new Error(`Generated exercise ${generatedId} is unknown or has not passed validation.`);
      }
      return generated;
    }

    const check = findFollowingCourseCheck(notebookCellTexts(cell), cell.index);
    if (check) {
      const heading = this.findHeading(cell);
      const id = `exercise-${check.lecture}_${check.exercise}`;
      const manifestExercise = findManifestExercise(id);
      return {
        ...(manifestExercise ?? {}),
        id,
        origin: "course",
        lecture: check.lecture,
        exercise: check.exercise,
        title: manifestExercise?.title ?? heading?.[3] ?? `Course exercise ${check.lecture}.${check.exercise}`,
        promptMarkdown: heading?.[0] ?? manifestExercise?.promptMarkdown ?? "Course exercise context was found in the notebook.",
        targetConcepts: manifestExercise?.targetConcepts ?? inferConcepts(heading?.[0] ?? cell.document.getText())
      };
    }
    throw new Error("This cell is not followed by a recognised course exercise check.");
  }

  collectCourseEvidence(cell: vscode.NotebookCell): TestEvidence {
    const check = findFollowingCourseCheck(notebookCellTexts(cell), cell.index);
    if (!check) return { status: "unavailable", summary: "No course check cell was found.", source: "none", confidence: "low", hasReliableCheck: false };
    const checkIndex = check.index;
    const checkCell = cell.notebook.cellAt(checkIndex);

    let output = outputText(checkCell);
    if (check.source === "pybryt") {
      for (let index = checkIndex + 1; index < Math.min(checkIndex + 3, cell.notebook.cellCount); index += 1) {
        const candidate = cell.notebook.cellAt(index);
        if (candidate.kind !== vscode.NotebookCellKind.Code) continue;
        if (/BEGIN HIDDEN TESTS/.test(candidate.document.getText())) output += `\n${outputText(candidate)}`;
        break;
      }
    }
    return classifyCourseCheckOutput(output, check.source, checkCell.executionSummary?.success);
  }

  private findHeading(cell: vscode.NotebookCell): RegExpMatchArray | undefined {
    for (let index = cell.index - 1; index >= Math.max(0, cell.index - 4); index -= 1) {
      const heading = cell.notebook.cellAt(index).document.getText().match(EXERCISE_HEADING);
      if (heading) return heading;
    }
    return undefined;
  }
}

function notebookCellTexts(cell: vscode.NotebookCell): string[] {
  return Array.from(
    { length: cell.notebook.cellCount },
    (_, index) => cell.notebook.cellAt(index).document.getText()
  );
}

function outputText(cell: vscode.NotebookCell): string {
  return cell.outputs.flatMap((output) => output.items.map((item) => Buffer.from(item.data).toString("utf8"))).join("\n");
}

function inferConcepts(text: string): string[] {
  const lower = text.toLowerCase();
  const concepts = [
    ["functions", /function|def\s/], ["loops", /for loop|while loop|\bfor\b|\bwhile\b/],
    ["conditionals", /if |condition/], ["lists", /list|array/], ["dictionaries", /dictionary|dict/],
    ["classes", /class |object/], ["files", /file|read_/]
  ].filter(([, pattern]) => (pattern as RegExp).test(lower)).map(([concept]) => concept as string);
  return concepts.length ? concepts : ["python_basics"];
}
