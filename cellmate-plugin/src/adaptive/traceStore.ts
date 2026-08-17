import { promises as fs } from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { DecisionTrace } from "./core/decisionTrace";

export class DecisionTraceStore {
  private readonly filePath: string;

  constructor(context: vscode.ExtensionContext) {
    this.filePath = path.join(context.globalStorageUri.fsPath, "adaptive-decision-traces.jsonl");
  }

  async append(trace: DecisionTrace): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(trace)}\n`, "utf8");
  }

  async exportTo(uri: vscode.Uri): Promise<number> {
    let content = "";
    try {
      content = await fs.readFile(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
    return content.split(/\r?\n/).filter(Boolean).length;
  }
}
