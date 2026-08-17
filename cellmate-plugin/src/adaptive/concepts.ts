import { LearnerState } from "./types";

const CONCEPT_ALIASES: Record<string, string> = {
  loop: "for_loops",
  loops: "for_loops",
  for_loop: "for_loops",
  for_loops: "for_loops",
  while_loop: "for_loops",
  while_loops: "for_loops",
  conditional: "conditionals",
  conditionals: "conditionals",
  conditional_statement: "conditionals",
  conditional_statements: "conditionals",
  if_statements: "conditionals",
  arithmetic: "arithmetic_operations",
  arithmetic_operation: "arithmetic_operations",
  arithmetic_operations: "arithmetic_operations",
  mathematical_operation: "arithmetic_operations",
  mathematical_operations: "arithmetic_operations",
  math_operations: "arithmetic_operations",
  accumulator: "accumulators",
  accumulators: "accumulators",
  running_total: "accumulators",
  running_totals: "accumulators",
  function: "functions",
  functions: "functions",
  variable: "variables",
  variables: "variables",
  variable_assignment: "variables",
  assignments: "variables"
};

export function canonicalConceptId(concept: string): string {
  const normalised = concept
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return CONCEPT_ALIASES[normalised] ?? normalised;
}

export function canonicalConcepts(concepts: string[] | undefined, fallback: string[] = ["python_basics"]): string[] {
  const cleaned = concepts?.map(canonicalConceptId).filter(Boolean);
  const unique = cleaned?.length ? Array.from(new Set(cleaned)) : fallback;
  return unique.slice(0, 6);
}

export function masteryFor(learner: LearnerState, concept: string): number {
  const canonical = canonicalConceptId(concept);
  if (learner.mastery[canonical] !== undefined) return learner.mastery[canonical];
  if (learner.mastery[concept] !== undefined) return learner.mastery[concept];
  const alias = Object.entries(learner.mastery).find(([savedConcept]) => canonicalConceptId(savedConcept) === canonical);
  return alias?.[1] ?? 50;
}

export function normaliseLearnerState(state: LearnerState): LearnerState {
  const mastery: Record<string, number> = {};
  for (const [concept, score] of Object.entries(state.mastery)) {
    const canonical = canonicalConceptId(concept);
    mastery[canonical] = Math.max(mastery[canonical] ?? 0, Math.max(0, Math.min(100, score)));
  }
  return { ...state, mastery };
}
