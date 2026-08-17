import { readFileSync } from "fs";
import * as path from "path";
import { CourseExercise } from "./types";
import { canonicalConceptId, canonicalConcepts } from "./concepts";

interface ManifestExercise {
  id: string;
  lecture: number;
  exercise: number;
  title: string;
  concepts: string[];
  primary_concept?: string;
  difficulty?: number;
  next_exercises?: string[];
  next_concepts?: string[];
  notebook?: string;
}

interface CourseManifest {
  courseCommit: string;
  exercises: ManifestExercise[];
}

let cached: CourseManifest | undefined;

export function loadCourseManifest(): CourseManifest {
  if (!cached) {
    const manifestPath = path.join(__dirname, "..", "..", "resources", "course_manifest.json");
    cached = JSON.parse(readFileSync(manifestPath, "utf8")) as CourseManifest;
  }
  return cached;
}

export function findManifestExercise(id: string): CourseExercise | undefined {
  const match = loadCourseManifest().exercises.find((exercise) => exercise.id === id);
  return match ? toCourseExercise(match) : undefined;
}

export function allManifestExercises(): CourseExercise[] {
  return loadCourseManifest().exercises.map(toCourseExercise);
}

function toCourseExercise(exercise: ManifestExercise): CourseExercise {
  return {
    id: exercise.id,
    origin: "course",
    lecture: exercise.lecture,
    exercise: exercise.exercise,
    title: exercise.title,
    promptMarkdown: `## Exercise ${exercise.lecture}.${exercise.exercise}: ${exercise.title}`,
    targetConcepts: canonicalConcepts(exercise.concepts),
    primaryConcept: canonicalConceptId(exercise.primary_concept ?? exercise.concepts[0] ?? "python_basics"),
    difficulty: exercise.difficulty,
    nextExercises: exercise.next_exercises,
    nextConcepts: exercise.next_concepts?.map(canonicalConceptId),
    notebook: exercise.notebook
  };
}
