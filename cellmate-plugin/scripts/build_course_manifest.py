"""Build a versioned manifest of PyBryt-backed course exercises."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

HEADING = re.compile(r"^##\s*Exercise\s+(\d+)\.(\d+):\s*(.+)$", re.MULTILINE)
REFERENCE = re.compile(r"pybryt_reference\(\s*(\d+)\s*,\s*(\d+)\s*\)")

REQUIRED_EXPERT_FIELDS = {"primary_concept", "concepts", "difficulty", "next_exercises", "next_concepts"}


def load_expert_overlay(path: Path, course_commit: str) -> dict[str, dict[str, object]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("courseCommit") != course_commit:
        raise ValueError(f"Expert metadata targets {data.get('courseCommit')}, but the course is at {course_commit}.")
    exercises = data.get("exercises")
    if not isinstance(exercises, dict):
        raise ValueError("Expert metadata must contain an exercises object.")
    for exercise_id, metadata in exercises.items():
        missing = REQUIRED_EXPERT_FIELDS.difference(metadata)
        if missing:
            raise ValueError(f"Expert metadata for {exercise_id} is missing: {', '.join(sorted(missing))}")
    return exercises


def infer_concepts(text: str) -> list[str]:
    checks = {
        "functions": r"function|\bdef\b",
        "loops": r"\bfor\b|\bwhile\b|loop",
        "conditionals": r"\bif\b|condition",
        "lists": r"list|array",
        "dictionaries": r"dictionary|\bdict\b",
        "classes": r"\bclass\b|object",
        "files": r"\bfile\b|read_",
    }
    result = [name for name, pattern in checks.items() if re.search(pattern, text, re.I)]
    return result or ["python_basics"]


def main(course_root: Path, output: Path, expert_metadata: Path) -> None:
    commit = subprocess.check_output(["git", "-C", str(course_root), "rev-parse", "HEAD"], text=True).strip()
    expert_overlay = load_expert_overlay(expert_metadata, commit)
    exercises: list[dict[str, object]] = []
    for notebook_path in sorted(course_root.glob("lecture*/lecture*.ipynb")):
        notebook = json.loads(notebook_path.read_text(encoding="utf-8"))
        current_heading: re.Match[str] | None = None
        for cell in notebook.get("cells", []):
            source = "".join(cell.get("source", []))
            if cell.get("cell_type") == "markdown":
                match = HEADING.search(source)
                if match:
                    current_heading = match
            for reference in REFERENCE.finditer(source):
                lecture, exercise = map(int, reference.groups())
                title = current_heading.group(3).strip() if current_heading else f"Exercise {lecture}.{exercise}"
                prompt = current_heading.group(0) if current_heading else ""
                exercise_id = f"exercise-{lecture}_{exercise}"
                item = {
                    "id": f"exercise-{lecture}_{exercise}",
                    "lecture": lecture,
                    "exercise": exercise,
                    "title": title,
                    "concepts": infer_concepts(prompt),
                    "notebook": str(notebook_path.relative_to(course_root)).replace("\\", "/"),
                }
                item.update(expert_overlay.get(exercise_id, {}))
                exercises.append(item)

    unknown = sorted(set(expert_overlay).difference(item["id"] for item in exercises))
    if unknown:
        raise ValueError(f"Expert metadata contains unknown exercises: {', '.join(unknown)}")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"courseCommit": commit, "exercises": exercises}, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(exercises)} exercises to {output}")


if __name__ == "__main__":
    plugin_root = Path(__file__).resolve().parents[1]
    course = Path(sys.argv[1]) if len(sys.argv) > 1 else plugin_root.parent / "external" / "introduction-to-python"
    main(
        course,
        plugin_root / "resources" / "course_manifest.json",
        plugin_root / "resources" / "expert_course_metadata.json",
    )
