import { AdaptiveAction, LearnerState, LlmFeedback, TaskSpec, TestEvidence } from "./types";

export const FEEDBACK_PROMPT_VERSION = "adaptive-feedback-v3";

export function buildFeedbackPrompt(input: {
  taskSpec: TaskSpec;
  evidence: TestEvidence;
  learner: LearnerState;
  action: AdaptiveAction;
  studentCode: string;
}): string {
  return `Write evidence-grounded feedback for a beginner Python learner.
Return JSON only:
{"diagnosis":string,"affectedConcepts":string[],"explanation":string,"confidence":number}.

The explanation must add useful information beyond "passed" or "failed".
If the check passed:
- state only behaviour explicitly supported by the evidence;
- identify one reusable programming method visible in the student's code;
- explain in one short sentence what to carry into the recommended next step;
- never infer mastery or a "solid grasp" from one successful attempt.
If the check failed:
- explain only what the evidence says went wrong and why it blocks the task;
- do not give a formula, code correction, steps, hint, or completed solution;
- do not repeat the recommended action because a separate next-step section will provide the support.
Use plain English, at most 45 words, and distinguish verified test evidence from observations about the code.

Task: ${input.taskSpec.taskSummary}
Expected behaviour: ${input.taskSpec.expectedBehavior}
Target concepts: ${input.taskSpec.targetConcepts.join(", ")}
Evidence: ${input.evidence.status} (${input.evidence.source ?? "unknown"}, ${input.evidence.confidence ?? "unknown"})
Evidence details:
${input.evidence.summary}
Recommended action: ${input.action}
Learner state before this result: ${JSON.stringify(input.learner.mastery)}
Student code:
${input.studentCode.slice(0, 3000)}`;
}

export function fallbackFeedback(
  taskSpec: TaskSpec,
  evidence: TestEvidence,
  action: AdaptiveAction
): LlmFeedback {
  const verifiedMessages = extractVerifiedMessages(evidence.summary);
  const diagnosis = evidence.status === "passed"
    ? verifiedMessages.length
      ? `The check confirmed ${joinMessages(verifiedMessages)}.`
      : "The available check confirmed the tested behaviour."
    : evidence.summary || "The system does not yet have reliable evidence.";

  const explanation = evidence.status === "passed"
    ? `${diagnosis} ${strategyFor(taskSpec)} Carry that method into the next ${action === "NEXT_CONCEPT" ? "course concept" : "practice task"}.`
    : `${diagnosis} This prevents the program from completing the expected ${readableConcept(taskSpec.primaryConcept)} behaviour.`;

  return {
    diagnosis,
    affectedConcepts: taskSpec.targetConcepts,
    explanation,
    confidence: evidence.confidence === "high" ? 0.85 : evidence.confidence === "medium" ? 0.6 : 0.35
  };
}

function extractVerifiedMessages(summary: string): string[] {
  return summary
    .split(/\r?\n/)
    .filter(line => /^\s*-\s*SUCCESS:/i.test(line))
    .map(line => line.replace(/^\s*-\s*SUCCESS:\s*/i, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function joinMessages(messages: string[]): string {
  if (messages.length === 1) return lowerFirst(trimPunctuation(messages[0]));
  const cleaned = messages.map(message => lowerFirst(trimPunctuation(message)));
  return `${cleaned.slice(0, -1).join(", ")}, and ${cleaned.at(-1)}`;
}

function trimPunctuation(value: string): string {
  return value.replace(/[.!]+$/, "");
}

function lowerFirst(value: string): string {
  return value ? value[0].toLowerCase() + value.slice(1) : value;
}

function strategyFor(taskSpec: TaskSpec): string {
  const concepts = new Set(taskSpec.targetConcepts);
  if (concepts.has("sequential_assignment") || concepts.has("unit_conversion")) {
    return "Your code keeps the calculation in named intermediate steps, which makes each conversion easier to inspect.";
  }
  if (concepts.has("accumulators")) {
    return "Reuse the pattern of initialising a running total and updating it once per loop iteration.";
  }
  if (concepts.has("for_loops")) {
    return "Reuse the loop structure, and trace how one example value changes during each iteration.";
  }
  if (concepts.has("conditionals")) {
    return "Reuse the clear separation between the condition and the behaviour selected by each branch.";
  }
  if (concepts.has("functions")) {
    return "Reuse the clear mapping from function inputs to one well-defined returned result.";
  }
  return "Reuse the step-by-step structure and clearly named intermediate values from this solution.";
}

function readableConcept(concept: string): string {
  return concept.replace(/_/g, " ");
}
