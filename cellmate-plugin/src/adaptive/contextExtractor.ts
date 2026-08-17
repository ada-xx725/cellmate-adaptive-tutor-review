import * as vscode from "vscode";
import { NotebookContext } from "./types";

export function extractNotebookContext(cell: vscode.NotebookCell): NotebookContext {
  const notebook = cell.notebook;
  const beforeMarkdown: string[] = [];
  const afterMarkdown: string[] = [];
  const nearbyCode: string[] = [];
  const nearbyOutputs: string[] = [];
  const nearbyCodeCells: NotebookContext["nearbyCodeCells"] = [];
  const start = Math.max(0, cell.index - 6);
  const end = Math.min(notebook.cellCount, cell.index + 7);

  for (let index = start; index < end; index += 1) {
    const candidate = notebook.cellAt(index);
    const text = candidate.document.getText();
    if (candidate.kind === vscode.NotebookCellKind.Markup) {
      if (index < cell.index) beforeMarkdown.push(text);
      if (index > cell.index) afterMarkdown.push(text);
    } else if (candidate.kind === vscode.NotebookCellKind.Code && index !== cell.index) {
      nearbyCode.push(text);
      const output = outputText(candidate);
      if (output.trim()) nearbyOutputs.push(output);
      nearbyCodeCells.push({ cellIndex: index, code: text, output, executionSuccess: candidate.executionSummary?.success });
    }
  }

  return {
    notebookUri: notebook.uri.toString(),
    cellIndex: cell.index,
    currentCode: cell.document.getText(),
    currentOutput: outputText(cell),
    currentExecutionSuccess: cell.executionSummary?.success,
    beforeMarkdown,
    afterMarkdown,
    nearbyCode,
    nearbyOutputs,
    nearbyCodeCells
  };
}

function outputText(cell: vscode.NotebookCell): string {
  return cell.outputs.flatMap((output) => output.items.map((item) => Buffer.from(item.data).toString("utf8"))).join("\n");
}
