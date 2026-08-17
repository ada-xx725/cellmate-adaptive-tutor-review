import { canonicalConceptId, canonicalConcepts } from "./concepts";
import { CourseExercise, GeneratedExercise, TaskSpec } from "./types";

export function taskSpecFromExercise(exercise: CourseExercise): TaskSpec {
  const generated = exercise.origin === "generated" ? exercise as GeneratedExercise : undefined;
  const targetConcepts = canonicalConcepts(exercise.targetConcepts);
  return {
    id: exercise.id,
    sourceMode: exercise.origin === "generated" ? "generated_attempt" : exercise.origin === "course" ? "course_verified" : "generic_llm",
    taskSummary: exercise.title,
    expectedBehavior: exercise.promptMarkdown,
    title: exercise.title,
    promptMarkdown: exercise.promptMarkdown,
    targetConcepts,
    primaryConcept: exercise.primaryConcept ? canonicalConceptId(exercise.primaryConcept) : targetConcepts[0] ?? "python_basics",
    difficulty: exercise.difficulty ?? difficultyFromExercise(exercise),
    confidence: exercise.origin === "course" ? 0.95 : exercise.origin === "generated" ? 0.9 : 0.6,
    expectedFunction: generated?.taskSpec?.expectedFunction,
    generatedTests: generated?.testCode,
    learningGoal: generated?.learningGoal ?? generated?.taskSpec?.learningGoal,
    exercise
  };
}

export function exerciseFromTaskSpec(taskSpec: TaskSpec): CourseExercise {
  return taskSpec.exercise ?? {
    id: taskSpec.id,
    origin: "generic",
    title: taskSpec.title,
    promptMarkdown: taskSpec.promptMarkdown,
    targetConcepts: taskSpec.targetConcepts
  };
}

function difficultyFromExercise(exercise: CourseExercise): number {
  if ((exercise.lecture ?? 1) >= 4) return 4;
  if ((exercise.lecture ?? 1) >= 2) return 3;
  return 2;
}
