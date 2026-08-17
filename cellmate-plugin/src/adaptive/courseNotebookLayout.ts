const PYBRYT_REFERENCE = /pybryt_reference\(\s*(\d+)\s*,\s*(\d+)\s*\)/;
const EXPLICIT_COURSE_ID = /^\s*#\s*EXERCISE_ID:\s*exercise-(\d+)_(\d+)\s*$/mi;
const EXERCISE_HEADING = /^##\s*Exercise\s+\d+\.\d+:/mi;
const COURSE_SCAN_LIMIT = 40;

export type CourseCheckSource = "pybryt" | "assert" | "pytest";

export interface CourseCheckLocation {
  index: number;
  lecture: number;
  exercise: number;
  source: CourseCheckSource;
}

export function findFollowingCourseCheck(
  cellTexts: readonly string[],
  sourceIndex: number
): CourseCheckLocation | undefined {
  const explicitId = (cellTexts[sourceIndex] ?? "").match(EXPLICIT_COURSE_ID);
  const end = Math.min(cellTexts.length, sourceIndex + COURSE_SCAN_LIMIT);
  for (let index = sourceIndex + 1; index < end; index += 1) {
    const text = cellTexts[index] ?? "";
    if (EXERCISE_HEADING.test(text)) return undefined;
    if (isAdaptiveArtifact(text)) continue;
    const reference = text.match(PYBRYT_REFERENCE);
    if (reference) {
      return {
        index,
        lecture: Number(reference[1]),
        exercise: Number(reference[2]),
        source: "pybryt"
      };
    }
    if (!explicitId) continue;
    const source = explicitCheckSource(text);
    if (source) {
      return {
        index,
        lecture: Number(explicitId[1]),
        exercise: Number(explicitId[2]),
        source
      };
    }
  }
  return undefined;
}

function explicitCheckSource(text: string): CourseCheckSource | undefined {
  if (/(?:^|\n)\s*(?:!|%)?pytest\b|\bpytest\.main\s*\(|(?:^|\n)\s*(?:async\s+)?def\s+test_|(?:^|\n)\s*import\s+unittest\b|unittest\.main\s*\(/m.test(text)) {
    return "pytest";
  }
  return /^\s*assert\b/m.test(text) ? "assert" : undefined;
}

function isAdaptiveArtifact(text: string): boolean {
  return /cellmate-(?:adaptive|selfstudy)/i.test(text)
    || /^\s*#\s*EXERCISE_ID:\s*(?:generated|selfstudy):/mi.test(text)
    || /^\s*#\s*Visible sanity checks only for\s+(?:generated|selfstudy):/mi.test(text);
}

export function courseResultInsertIndex(
  cellTexts: readonly string[],
  sourceIndex: number
): number | undefined {
  const check = findFollowingCourseCheck(cellTexts, sourceIndex);
  if (!check) return undefined;

  let insertIndex = check.index + 1;
  while (
    insertIndex < cellTexts.length &&
    /BEGIN HIDDEN TESTS|^\s*assert\b/m.test(cellTexts[insertIndex] ?? "")
  ) {
    insertIndex += 1;
  }
  return insertIndex;
}
