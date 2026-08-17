import { randomUUID } from "crypto";
import * as vscode from "vscode";

const PARTICIPANT_KEY = "CellMate.adaptive.participantId";

export async function getOrCreateParticipantId(context: vscode.ExtensionContext): Promise<string> {
  const saved = context.globalState.get<string>(PARTICIPANT_KEY);
  if (saved) return saved;
  const generated = `participant-${randomUUID().slice(0, 8)}`;
  await context.globalState.update(PARTICIPANT_KEY, generated);
  return generated;
}

export async function setParticipantId(context: vscode.ExtensionContext, participantId: string): Promise<void> {
  if (!isValidParticipantId(participantId)) throw new Error("Use 3-40 letters, numbers, underscores, or hyphens only.");
  await context.globalState.update(PARTICIPANT_KEY, participantId);
}

export function isValidParticipantId(participantId: string): boolean {
  return /^[A-Za-z0-9_-]{3,40}$/.test(participantId);
}
