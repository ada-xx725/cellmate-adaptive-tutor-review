import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import * as path from "path";
import type * as vscode from "vscode";
import { canonicalConceptId, canonicalConcepts, normaliseLearnerState } from "./concepts";
import { AdaptiveAction, AttemptRecord, GeneratedExercise, LearnerState } from "./types";

interface StoreData {
  version: 3;
  learners: Record<string, LearnerState>;
  attempts: AttemptRecord[];
  generated: Record<string, GeneratedExercise>;
}

interface StoreFileSystem {
  readFile(filePath: string, encoding: "utf8"): Promise<string>;
  mkdir(directoryPath: string, options: { recursive: true }): Promise<unknown>;
  writeFile(filePath: string, content: string, encoding: "utf8"): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  unlink(filePath: string): Promise<void>;
}

export interface CommitAttemptInput {
  attempt: AttemptRecord;
  learnerBefore: LearnerState;
  learnerAfter: LearnerState;
  generated?: GeneratedExercise;
}

export interface CommitAttemptResult {
  created: boolean;
  attempt: AttemptRecord;
  learner: LearnerState;
}

export class AdaptiveStoreConflictError extends Error {
  constructor() {
    super("Learner state changed while this decision was being prepared. Run Adaptive Next Step again using the latest state.");
    this.name = "AdaptiveStoreConflictError";
  }
}

const EMPTY: StoreData = { version: 3, learners: {}, attempts: [], generated: {} };
const DEFAULT_FILE_SYSTEM: StoreFileSystem = {
  readFile: (filePath, encoding) => fs.readFile(filePath, encoding),
  mkdir: (directoryPath, options) => fs.mkdir(directoryPath, options),
  writeFile: (filePath, content, encoding) => fs.writeFile(filePath, content, encoding),
  rename: (oldPath, newPath) => fs.rename(oldPath, newPath),
  unlink: (filePath) => fs.unlink(filePath)
};

export class AdaptiveStore {
  private readonly filePath: string;
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(
    context: Pick<vscode.ExtensionContext, "globalStorageUri">,
    private readonly fileSystem: StoreFileSystem = DEFAULT_FILE_SYSTEM
  ) {
    this.filePath = path.join(context.globalStorageUri.fsPath, "adaptive-next-step.json");
  }

  async getLearner(studentId: string): Promise<LearnerState> {
    const data = await this.readData();
    return normaliseLearnerState(data.learners[studentId] ?? { studentId, mastery: {} });
  }

  async saveLearner(state: LearnerState): Promise<void> {
    await this.mutate(async () => {
      const data = await this.loadUnlocked();
      data.learners[state.studentId] = normaliseLearnerState(state);
      await this.saveUnlocked(data);
    });
  }

  async getGenerated(id: string): Promise<GeneratedExercise | undefined> {
    return (await this.readData()).generated[id];
  }

  async findLatestGenerated(parentId: string, action: AdaptiveAction): Promise<GeneratedExercise | undefined> {
    const generated = Object.values((await this.readData()).generated)
      .filter((exercise) => exercise.parentId === parentId && exercise.action === action)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    return generated[0];
  }

  async saveGenerated(exercise: GeneratedExercise): Promise<void> {
    await this.mutate(async () => {
      const data = await this.loadUnlocked();
      data.generated[exercise.id] = exercise;
      await this.saveUnlocked(data);
    });
  }

  async attemptsFor(exerciseId: string, participantId: string): Promise<number> {
    return (await this.readData()).attempts.filter((attempt) => attempt.participantId === participantId && attempt.exerciseId === exerciseId).length;
  }

  async attemptsForConcept(conceptId: string, participantId: string): Promise<number> {
    const concept = canonicalConceptId(conceptId);
    return (await this.readData()).attempts.filter((attempt) => attempt.participantId === participantId && attemptHasConcept(attempt, concept)).length;
  }

  async successStreakForConcept(conceptId: string, participantId: string): Promise<number> {
    const concept = canonicalConceptId(conceptId);
    const attempts = (await this.readData()).attempts
      .filter((attempt) => attempt.participantId === participantId && attemptHasConcept(attempt, concept))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    let streak = 0;
    for (const attempt of attempts) {
      if (attempt.evidence.status === "passed" && attempt.evidence.hasReliableCheck !== false) {
        streak += 1;
        continue;
      }
      break;
    }
    return streak;
  }

  async recentFailuresForConcept(conceptId: string, participantId: string, limit = 3): Promise<number> {
    const concept = canonicalConceptId(conceptId);
    return (await this.readData()).attempts
      .filter((attempt) => attempt.participantId === participantId && attemptHasConcept(attempt, concept))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit)
      .filter((attempt) => attempt.evidence.status === "failed" && attempt.evidence.hasReliableCheck !== false)
      .length;
  }

  async attemptedExerciseIds(participantId: string): Promise<string[]> {
    return Array.from(new Set((await this.readData()).attempts.filter((attempt) => attempt.participantId === participantId).map((attempt) => attempt.exerciseId)));
  }

  async attemptHistory(participantId: string): Promise<AttemptRecord[]> {
    return (await this.readData()).attempts
      .filter((attempt) => attempt.participantId === participantId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async hasAttempt(fingerprint: string): Promise<boolean> {
    return (await this.readData()).attempts.some((attempt) => attempt.fingerprint === fingerprint);
  }

  async getAttempt(fingerprint: string): Promise<AttemptRecord | undefined> {
    return (await this.readData()).attempts.find((attempt) => attempt.fingerprint === fingerprint);
  }

  async recordAttempt(attempt: AttemptRecord): Promise<void> {
    await this.mutate(async () => {
      const data = await this.loadUnlocked();
      if (data.attempts.some((saved) => saved.fingerprint === attempt.fingerprint)) return;
      data.attempts.push(attempt);
      await this.saveUnlocked(data);
    });
  }

  async commitAttempt(input: CommitAttemptInput): Promise<CommitAttemptResult> {
    return this.mutate(async () => {
      const data = await this.loadUnlocked();
      const existing = data.attempts.find((attempt) => attempt.fingerprint === input.attempt.fingerprint);
      if (existing) {
        return {
          created: false,
          attempt: existing,
          learner: normaliseLearnerState(existing.learnerAfter ?? data.learners[existing.participantId] ?? input.learnerBefore)
        };
      }
      if (input.attempt.participantId !== input.learnerBefore.studentId
        || input.attempt.participantId !== input.learnerAfter.studentId) {
        throw new Error("Attempt and learner participant IDs must match.");
      }

      const currentLearner = normaliseLearnerState(
        data.learners[input.attempt.participantId]
          ?? { studentId: input.attempt.participantId, mastery: {} }
      );
      if (!sameLearnerState(currentLearner, normaliseLearnerState(input.learnerBefore))) {
        throw new AdaptiveStoreConflictError();
      }

      const learner = normaliseLearnerState(input.learnerAfter);
      const attempt: AttemptRecord = {
        ...input.attempt,
        learnerBefore: normaliseLearnerState(input.learnerBefore),
        learnerAfter: learner
      };
      data.learners[learner.studentId] = learner;
      data.attempts.push(attempt);
      if (input.generated) data.generated[input.generated.id] = input.generated;
      await this.saveUnlocked(data);
      return { created: true, attempt, learner };
    });
  }

  async resetParticipant(participantId: string): Promise<void> {
    await this.mutate(async () => {
      const data = await this.loadUnlocked();
      delete data.learners[participantId];
      data.attempts = data.attempts.filter((attempt) => attempt.participantId !== participantId);
      await this.saveUnlocked(data);
    });
  }

  async adoptLegacyParticipant(participantId: string): Promise<void> {
    await this.mutate(async () => {
      const data = await this.loadUnlocked();
      const legacy = data.learners["local-demo-student"];
      const legacyAttempts = data.attempts.filter((attempt) => !attempt.participantId);
      if (!legacy && !legacyAttempts.length) return;
      if (legacy && !data.learners[participantId]) {
        data.learners[participantId] = { ...legacy, studentId: participantId };
        delete data.learners["local-demo-student"];
      }
      data.attempts = data.attempts.map((attempt) => attempt.participantId ? attempt : { ...attempt, participantId });
      await this.saveUnlocked(data);
    });
  }

  private async readData(): Promise<StoreData> {
    await this.mutationQueue;
    return this.loadUnlocked();
  }

  private mutate<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation, operation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async loadUnlocked(): Promise<StoreData> {
    try {
      const content = await this.fileSystem.readFile(this.filePath, "utf8");
      return migrateStore(JSON.parse(content));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return structuredClone(EMPTY);
      }
      throw error;
    }
  }

  private async saveUnlocked(data: StoreData): Promise<void> {
    const directory = path.dirname(this.filePath);
    const temporaryPath = `${this.filePath}.${process.pid}.${randomUUID()}.tmp`;
    await this.fileSystem.mkdir(directory, { recursive: true });
    try {
      await this.fileSystem.writeFile(temporaryPath, JSON.stringify({ ...data, version: 3 }, null, 2), "utf8");
      await this.fileSystem.rename(temporaryPath, this.filePath);
    } catch (error) {
      try {
        await this.fileSystem.unlink(temporaryPath);
      } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
          // The original write error is the actionable failure; a stale temp file
          // is deliberately not allowed to replace or delete the last good store.
        }
      }
      throw error;
    }
  }
}

function migrateStore(raw: unknown): StoreData {
  if (!isRecord(raw)) throw new Error("Adaptive store is not a JSON object.");
  const version = raw.version;
  if (version !== 1 && version !== 2 && version !== 3) {
    throw new Error(`Unsupported adaptive store version: ${String(version)}.`);
  }
  if (!isRecord(raw.learners) || !Array.isArray(raw.attempts)) {
    throw new Error("Adaptive store is missing learner or attempt data.");
  }

  const learners: Record<string, LearnerState> = {};
  for (const [studentId, learner] of Object.entries(raw.learners)) {
    if (!isRecord(learner) || !isRecord(learner.mastery)) {
      throw new Error(`Adaptive store learner ${studentId} is malformed.`);
    }
    learners[studentId] = normaliseLearnerState({
      studentId: typeof learner.studentId === "string" ? learner.studentId : studentId,
      mastery: numericMastery(learner.mastery)
    });
  }

  const attempts = raw.attempts.map((attempt, index) => migrateAttempt(attempt, index));
  const generated = raw.generated === undefined ? {} : raw.generated;
  if (!isRecord(generated)) throw new Error("Adaptive store generated exercise data is malformed.");
  return {
    version: 3,
    learners,
    attempts,
    generated: generated as Record<string, GeneratedExercise>
  };
}

function migrateAttempt(raw: unknown, index: number): AttemptRecord {
  if (!isRecord(raw)
    || typeof raw.fingerprint !== "string"
    || typeof raw.exerciseId !== "string"
    || typeof raw.action !== "string"
    || !isRecord(raw.evidence)
    || typeof raw.createdAt !== "string") {
    throw new Error(`Adaptive store attempt ${index} is malformed.`);
  }
  const migrated = {
    ...raw,
    participantId: typeof raw.participantId === "string" ? raw.participantId : ""
  } as unknown as AttemptRecord;
  if (isLearnerState(raw.learnerBefore)) migrated.learnerBefore = normaliseLearnerState(raw.learnerBefore);
  if (isLearnerState(raw.learnerAfter)) migrated.learnerAfter = normaliseLearnerState(raw.learnerAfter);
  return migrated;
}

function isLearnerState(value: unknown): value is LearnerState {
  return isRecord(value) && typeof value.studentId === "string" && isRecord(value.mastery);
}

function numericMastery(value: Record<string, unknown>): Record<string, number> {
  const mastery: Record<string, number> = {};
  for (const [concept, score] of Object.entries(value)) {
    if (typeof score === "number" && Number.isFinite(score)) mastery[concept] = score;
  }
  return mastery;
}

function sameLearnerState(left: LearnerState, right: LearnerState): boolean {
  if (left.studentId !== right.studentId) return false;
  const keys = Array.from(new Set([...Object.keys(left.mastery), ...Object.keys(right.mastery)])).sort();
  return keys.every((key) => (left.mastery[key] ?? 50) === (right.mastery[key] ?? 50));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function attemptHasConcept(attempt: AttemptRecord, canonicalConcept: string): boolean {
  const concepts = canonicalConcepts(attempt.taskSpec?.targetConcepts);
  return concepts.includes(canonicalConcept);
}
