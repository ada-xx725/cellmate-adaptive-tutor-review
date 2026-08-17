const GENERATED_ID = /#\s*EXERCISE_ID:\s*((?:generated|selfstudy):[A-Za-z0-9:._-]+)/;

export function extractAdaptiveExerciseId(code: string): string | undefined {
  return code.match(GENERATED_ID)?.[1];
}
