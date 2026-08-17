import * as vscode from "vscode";
import { chooseLLMConfig, LLMConfig, LLMSettings } from "./llmConfiguration";

export function readWorkspaceLlmConfig(
  prefer: "general" | "adaptive" = "general"
): LLMConfig {
  return chooseLLMConfig(
    readSettings(vscode.workspace.getConfiguration("CellMate")),
    readSettings(vscode.workspace.getConfiguration("CellMate.adaptive")),
    prefer
  );
}

function readSettings(configuration: vscode.WorkspaceConfiguration): LLMSettings {
  return {
    apiUrl: configuration.get<string>("apiUrl"),
    apiKey: configuration.get<string>("apiKey"),
    modelName: configuration.get<string>("modelName")
  };
}
