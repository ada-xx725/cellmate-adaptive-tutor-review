import {
  actionExplanation,
  actionStudentLabel,
  confidenceLabel,
  courseExerciseDisplayId,
  decisionPresentationMarkdown,
  displayConceptName,
  evidenceStudentOutcome,
  sourceModeLabel
} from "./decisionPresentation";
import {
  AdaptiveAction,
  CourseRecommendation,
  GeneratedExercise,
  LearnerState,
  LlmFeedback,
  NextStepDecisionPresentation,
  NextStepSupport,
  TaskSpec,
  TestEvidence
} from "./types";

export const STUDENT_PRESENTATION_VERSION = "student-presentation-v3";

export interface AdaptiveStudentPresentationInput {
  marker: string;
  action: AdaptiveAction;
  evidence: TestEvidence;
  learner: LearnerState;
  generated?: GeneratedExercise;
  courseRecommendation?: CourseRecommendation;
  targetConcepts?: string[];
  taskSpec?: TaskSpec;
  feedback?: LlmFeedback;
  support?: NextStepSupport;
  decisionPresentation?: NextStepDecisionPresentation;
  generationSource?: string;
}

export interface AdaptiveStudentMarkdown {
  result: string;
  nextStep: string;
  generatedPractice?: string;
}

export function buildAdaptiveStudentMarkdown(
  input: AdaptiveStudentPresentationInput
): AdaptiveStudentMarkdown {
  const {
    marker,
    action,
    evidence,
    learner,
    generated,
    courseRecommendation,
    targetConcepts = [],
    taskSpec,
    feedback,
    support,
    decisionPresentation,
    generationSource
  } = input;
  const outcome = evidenceStudentOutcome(evidence);
  const feedbackText = feedback?.explanation || feedback?.diagnosis;
  const feedbackBlock = feedbackText
    ? `\n\n### ${evidence.status === "failed" ? "What to work on" : "What this result shows"}\n${feedbackText}`
    : "";
  const technicalDetails = technicalDetailsMarkdown({
    evidence,
    learner,
    targetConcepts,
    taskSpec,
    feedback
  });
  const result = `${marker}
## ${outcome.heading}

${outcome.message}${feedbackBlock}

${technicalDetails}`;

  const decisionReason =
    courseRecommendation?.reason ||
    actionExplanation(action, Boolean(courseRecommendation));
  const courseBlock = courseRecommendation
    ? `

### Continue with ${courseExerciseDisplayId(courseRecommendation.exerciseId)}

**${courseRecommendation.title}**

${courseRecommendation.reason}

Use **Open ${courseExerciseDisplayId(courseRecommendation.exerciseId)}** in the notification to go straight to the exercise.`
    : "";
  const selectionDetails = decisionPresentationMarkdown(decisionPresentation);
  const supportBlock = supportMarkdown(support);
  const whyDetails = `<details>
<summary><strong>Why this recommendation?</strong></summary>

${decisionReason}

${selectionDetails}

</details>`;
  const nextStep = `${marker}
## Next step: ${actionStudentLabel(action)}

${support?.instruction ?? actionExplanation(action, Boolean(courseRecommendation))}${supportBlock}${courseBlock}

${whyDetails}`;

  let generatedPractice: string | undefined;
  if (generated) {
    const heading = courseRecommendation ? "Optional practice" : "Practice task";
    const validationDetails = `<details>
<summary><strong>Validation details</strong></summary>

**Generated exercise source:** ${generationSource ?? "unknown"}

**Local validation:** ${generated.validated ? "passed" : "failed"}

Visible checks are provided for quick feedback. The full task was also validated locally before insertion.

</details>`;
    generatedPractice = `${marker}
## ${heading}: ${generated.title}

${generated.promptMarkdown}

${validationDetails}`;
  }

  return { result, nextStep, generatedPractice };
}

export function buildSelfStudyStudentMarkdown(input: {
  generated: GeneratedExercise;
  generationSource: string;
}): string {
  const { generated, generationSource } = input;
  const goal = generated.learningGoal
    ? `\n\n**Your goal:** ${generated.learningGoal}`
    : "";
  const titleConcept = displayConcepts(generated);
  return `<!-- cellmate-selfstudy: exercise-id=${generated.id} -->
## Self-study mini task: ${titleConcept}
${goal}

${generated.promptMarkdown}

> This is one short practice task for your goal, not a complete generated course.

<details>
<summary><strong>Validation details</strong></summary>

**Generated exercise source:** ${generated.originMode ?? generationSource}

**Local validation:** ${generated.validated ? "passed" : "failed"}

Visible checks are provided for quick feedback. The full task was also validated locally before insertion.

</details>`;
}

function technicalDetailsMarkdown(input: {
  evidence: TestEvidence;
  learner: LearnerState;
  targetConcepts: string[];
  taskSpec?: TaskSpec;
  feedback?: LlmFeedback;
}): string {
  const { evidence, learner, targetConcepts, taskSpec, feedback } = input;
  const currentScores = targetConcepts.length
    ? targetConcepts
      .map((concept) => `- **${displayConceptName(concept)}:** ${learner.mastery[concept] ?? 50}`)
      .join("\n")
    : "- No current exercise concept tags available.";
  const trackedScores = Object.entries(learner.mastery).length
    ? Object.entries(learner.mastery)
      .map(([concept, score]) => `- **${displayConceptName(concept)}:** ${score}`)
      .join("\n")
    : "- No concept score available yet.";
  const taskDetails = taskSpec
    ? `**Detected context:** ${sourceModeLabel(taskSpec.sourceMode)}

**Task:** ${taskSpec.taskSummary}

**Primary concept:** ${displayConceptName(taskSpec.primaryConcept)}

`
    : "";
  const affectedConcepts = feedback?.affectedConcepts.length
    ? `\n\n**Feedback concepts:** ${feedback.affectedConcepts.map(displayConceptName).join(", ")}`
    : "";
  return `<details>
<summary><strong>Technical details</strong></summary>

${taskDetails}**Evidence source:** ${evidence.source ?? "unknown"}

**Evidence confidence:** ${confidenceLabel(evidence.confidence)}

**Reliable check:** ${evidence.hasReliableCheck ? "yes" : "no"}

${evidence.summary}${affectedConcepts}

**Current exercise scores**

${currentScores}

**Full learner model**

${trackedScores}

</details>`;
}

function supportMarkdown(support?: NextStepSupport): string {
  if (!support) return "";
  if (support.action === "HINT" && support.hint) {
    return `

> **Hint:** ${support.hint}

Make that one change and run the same check again.`;
  }
  const steps = support.steps?.length
    ? `\n\n${support.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}`
    : "";
  const scaffold = support.scaffoldCode
    ? `\n\nUse this incomplete structure in your current cell:\n\n\`\`\`python\n${support.scaffoldCode}\n\`\`\``
    : "";
  return `${steps}${scaffold}

Fill the blank yourself, then run the same check again.`;
}

function displayConcepts(generated: GeneratedExercise): string {
  const concepts = generated.targetConcepts.filter(
    (concept) => !["variables", "python_basics"].includes(concept)
  );
  return (concepts.length
    ? concepts
    : [generated.primaryConcept ?? generated.targetConcepts[0] ?? "python_basics"])
    .slice(0, 2)
    .map(displayConceptName)
    .join(" and ");
}
