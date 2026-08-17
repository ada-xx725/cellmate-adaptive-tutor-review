from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def run_code(code: str, namespace: dict[str, Any]) -> tuple[bool, str | None, str | None]:
    try:
        exec(code, namespace)
        return True, None, None
    except Exception as error:  # The fixture report needs the observed assertion/runtime failure.
        return False, type(error).__name__, str(error)


def run_fixture(fixture: dict[str, Any]) -> dict[str, Any]:
    if fixture["execution_mode"] == "unavailable":
        result = {
            "fixture_id": fixture["fixture_id"],
            "state_ids": fixture["state_ids"],
            "status": "unavailable",
            "passed_checks": 0,
            "total_checks": 0,
            "failed_test_ids": [],
            "error_signature": None,
            "error_signature_verified": None,
            "raw_output_excerpt": fixture["raw_output_excerpt"],
            "tests": [],
        }
        return add_expected_verification(result, fixture["expected"])

    namespace: dict[str, Any] = {"__builtins__": __builtins__}
    loaded, error_type, error_message = run_code(fixture["student_code"], namespace)
    if not loaded:
        result = {
            "fixture_id": fixture["fixture_id"],
            "state_ids": fixture["state_ids"],
            "status": "failed",
            "passed_checks": 0,
            "total_checks": len(fixture["tests"]),
            "failed_test_ids": [test["id"] for test in fixture["tests"]],
            "error_signature": fixture["expected"]["error_signature"],
            "error_signature_verified": False,
            "load_error": {"type": error_type, "message": error_message},
            "tests": [],
        }
        return add_expected_verification(result, fixture["expected"])

    test_results = []
    for test in fixture["tests"]:
        passed, observed_type, observed_message = run_code(test["code"], namespace)
        test_results.append(
            {
                "id": test["id"],
                "category": test["category"],
                "passed": passed,
                "error_type": observed_type,
                "error_message": observed_message,
            }
        )

    diagnostic_results = []
    for diagnostic in fixture.get("diagnostics", []):
        passed, observed_type, observed_message = run_code(diagnostic["code"], namespace)
        diagnostic_results.append(
            {
                "id": diagnostic["id"],
                "passed": passed,
                "error_type": observed_type,
                "error_message": observed_message,
            }
        )

    passed_checks = sum(1 for test in test_results if test["passed"])
    total_checks = len(test_results)
    error_signature = fixture["expected"]["error_signature"]
    result = {
        "fixture_id": fixture["fixture_id"],
        "state_ids": fixture["state_ids"],
        "status": "passed" if passed_checks == total_checks else "failed",
        "passed_checks": passed_checks,
        "total_checks": total_checks,
        "failed_test_ids": [test["id"] for test in test_results if not test["passed"]],
        "error_signature": error_signature,
        "error_signature_verified": (
            all(item["passed"] for item in diagnostic_results) if error_signature else None
        ),
        "tests": test_results,
        "diagnostics": diagnostic_results,
    }
    return add_expected_verification(result, fixture["expected"])


def add_expected_verification(result: dict[str, Any], expected: dict[str, Any]) -> dict[str, Any]:
    mismatches = []
    for field in ("status", "passed_checks", "total_checks", "error_signature"):
        if result.get(field) != expected.get(field):
            mismatches.append(
                {"field": field, "expected": expected.get(field), "observed": result.get(field)}
            )
    if expected.get("error_signature") and result.get("error_signature_verified") is not True:
        mismatches.append(
            {"field": "error_signature_verified", "expected": True, "observed": result.get("error_signature_verified")}
        )
    result["matches_expected"] = not mismatches
    result["mismatches"] = mismatches
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Reproduce the private evidence for a blinded formal state batch.")
    parser.add_argument("fixture_file", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--check", type=Path, help="Compare the reproduced report with a checked-in report.")
    args = parser.parse_args()

    source = json.loads(args.fixture_file.read_text(encoding="utf-8"))
    results = [run_fixture(fixture) for fixture in source["fixtures"]]
    report = {
        "schema_version": 1,
        "batch_version": source["batch_version"],
        "state_pack_sha256": source["state_pack_sha256"],
        "fixture_count": len(results),
        "state_count": sum(len(result["state_ids"]) for result in results),
        "all_expected_results_reproduced": all(result["matches_expected"] for result in results),
        "policy_outputs_observed": False,
        "reference_labels_present": False,
        "results": results,
    }
    encoded = json.dumps(report, indent=2, ensure_ascii=False) + "\n"
    if args.check:
        expected_report = json.loads(args.check.read_text(encoding="utf-8"))
        if report != expected_report:
            print("Reproduced evidence does not match the checked-in report.")
            return 1
        print("Reproduced evidence matches the checked-in report.")
    elif args.output:
        args.output.write_text(encoded, encoding="utf-8", newline="\n")
    else:
        print(encoded, end="")
    return 0 if report["all_expected_results_reproduced"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
