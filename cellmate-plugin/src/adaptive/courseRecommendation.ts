import { allManifestExercises, findManifestExercise } from "./courseManifest";
import { AdaptiveAction, CourseRecommendation, TaskSpec } from "./types";

export function chooseCourseRecommendation(input: {
  taskSpec: TaskSpec;
  action: AdaptiveAction;
  attemptedExerciseIds: string[];
}): CourseRecommendation | undefined {
  if (input.taskSpec.sourceMode !== "course_verified") return undefined;
  if (input.action === "HINT" || input.action === "RETRY_WITH_SCAFFOLD") return undefined;

  const current = input.taskSpec.exercise;
  if (!current) return undefined;

  const attempted = new Set([current.id, ...input.attemptedExerciseIds]);
  if (input.action === "EASIER") {
    const prerequisite = allManifestExercises()
      .filter((exercise) => !attempted.has(exercise.id))
      .filter((exercise) => compareCourseOrder(exercise, current) < 0)
      .filter((exercise) => exercise.targetConcepts.some((concept) => current.targetConcepts.includes(concept)))
      .filter((exercise) => (exercise.difficulty ?? 2) <= (current.difficulty ?? 2))
      .sort((left, right) => compareCourseOrder(right, left))[0];
    if (prerequisite) {
      return {
        exerciseId: prerequisite.id,
        title: prerequisite.title,
        notebook: prerequisite.notebook,
        source: "same_concept",
        generatedFallbackNeeded: false,
        reason: `This earlier course exercise practises ${sharedConcepts(prerequisite.targetConcepts, current.targetConcepts).join(", ")} before retrying ${current.id}.`
      };
    }
    return undefined;
  }

  const explicit = firstAvailable(current.nextExercises ?? [], attempted);
  if (explicit) {
    return {
      exerciseId: explicit.id,
      title: explicit.title,
      notebook: explicit.notebook,
      source: "next_exercises",
      generatedFallbackNeeded: false,
      reason: `This is the next planned course exercise after ${current.id}. It keeps the learner on the course path before adding generated practice.`
    };
  }

  const future = allManifestExercises()
    .filter((exercise) => !attempted.has(exercise.id))
    .filter((exercise) => isAfter(exercise, current))
    .sort(compareCourseOrder);

  const nextConcepts = new Set(current.nextConcepts ?? []);
  const byNextConcept = future.find((exercise) => exercise.targetConcepts.some((concept) => nextConcepts.has(concept)));
  if (input.action === "NEXT_CONCEPT" && byNextConcept) {
    return {
      exerciseId: byNextConcept.id,
      title: byNextConcept.title,
      notebook: byNextConcept.notebook,
      source: "next_concept",
      generatedFallbackNeeded: false,
      reason: `This exercise introduces the next tagged concept after ${current.id}: ${sharedConcepts(byNextConcept.targetConcepts, Array.from(nextConcepts)).join(", ")}.`
    };
  }

  const bySameConcept = future.find((exercise) => exercise.targetConcepts.some((concept) => current.targetConcepts.includes(concept)));
  if (bySameConcept) {
    return {
      exerciseId: bySameConcept.id,
      title: bySameConcept.title,
      notebook: bySameConcept.notebook,
      source: "same_concept",
      generatedFallbackNeeded: false,
      reason: `This later course exercise reuses ${sharedConcepts(bySameConcept.targetConcepts, current.targetConcepts).join(", ")} while preserving the teacher's notebook sequence.`
    };
  }

  if (byNextConcept) {
    return {
      exerciseId: byNextConcept.id,
      title: byNextConcept.title,
      notebook: byNextConcept.notebook,
      source: "next_concept",
      generatedFallbackNeeded: false,
      reason: `This is the closest later course exercise for the next tagged concept: ${sharedConcepts(byNextConcept.targetConcepts, Array.from(nextConcepts)).join(", ")}.`
    };
  }

  return undefined;
}

function firstAvailable(ids: string[], attempted: Set<string>) {
  for (const id of ids) {
    if (attempted.has(id)) continue;
    const exercise = findManifestExercise(id);
    if (exercise) return exercise;
  }
  return undefined;
}

function isAfter(left: { lecture?: number; exercise?: number }, right: { lecture?: number; exercise?: number }): boolean {
  return compareCourseOrder(left, right) > 0;
}

function compareCourseOrder(left: { lecture?: number; exercise?: number }, right: { lecture?: number; exercise?: number }): number {
  return ((left.lecture ?? 0) - (right.lecture ?? 0)) || ((left.exercise ?? 0) - (right.exercise ?? 0));
}

function sharedConcepts(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((concept) => rightSet.has(concept));
}
