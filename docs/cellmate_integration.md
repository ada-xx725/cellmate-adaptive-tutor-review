# Cellmate integration notes

This note records the first code audit of Cellmate and the proposed integration
point for the adaptive decision layer. The aim is not to fork or modify Cellmate
yet, but to make the Python prototype compatible with the data Cellmate already
produces.

## What Cellmate already does

Cellmate is a VS Code Jupyter Notebook feedback extension. Its current workflow
already covers the parts this project should not replace:

1. Read the submitted notebook code cell.
2. Extract an exercise id from a comment such as `# EXERCISE_ID: ...`.
3. Fetch hidden tests and exercise metadata from the teaching repository.
4. Run the student's code against hidden tests with `pytest` and
   `pytest-json-report`.
5. Build feedback text and insert a generated Markdown cell back into the
   notebook.

The adaptive coach should therefore sit after hidden-test execution. It should
use the evidence that Cellmate already has, then choose a support format and a
next learning action.

## Relevant Cellmate files inspected

- `src/extension.ts`: command registration, notebook cell reading, hidden-test
  execution, prompt construction, and Markdown cell insertion.
- `src/testUtils.ts`: local pytest execution and helpers for reading
  `pytest-json-report` output.
- `src/promptUtils.ts`: parsing of `EXERCISE_ID` and prompt placeholders.
- `src/gitUtils.ts`: fetching test files and `metadata.json` from the teaching
  prompt/test repository.

## Observed hidden-test flow

In the `CellMate.sendNotebookCell` command, Cellmate reads the selected notebook
cell and obtains its source with `cell.document.getText()`. When hidden tests are
enabled, it then:

1. Calls `extractExerciseId(code)`.
2. Calls `getTestFiles(exId)` to load the hidden test file and metadata.
3. Resolves the notebook Python interpreter.
4. Calls `runLocalTest(code, test, pythonPath, 15000, resourceDirs)`.
5. Receives a result object with:
   - `stdout`
   - `stderr`
   - `timeout`
   - `report`

The `report` object follows the structure produced by `pytest-json-report`.
The important part for this project is `report.tests`, where each test has a
`nodeid`, an `outcome`, and failure details under `call.longrepr`.

## Proposed integration point

The cleanest first integration point is immediately after `runLocalTest(...)`
returns in `src/extension.ts`, before Cellmate converts the hidden-test result
into prompt text for the LLM.

At that point, Cellmate already knows:

- the submitted code;
- the exercise id;
- the hidden-test result;
- the exercise metadata;
- whether the run timed out;
- which tests passed or failed.

The adaptive layer can be called with this evidence and return a small object
that Cellmate can render as a Markdown feedback cell, or include as part of a
larger LLM prompt later.

## Minimal event shape for the Python prototype

The updated adapter accepts a Cellmate-like event:

```json
{
  "exerciseId": "sum_numbers",
  "code": "def sum_numbers(values): ...",
  "attemptCount": 2,
  "previousMistakeTypes": ["accumulator_update_error"],
  "testResult": {
    "stdout": "",
    "stderr": "",
    "timeout": false,
    "report": {
      "tests": [
        {
          "nodeid": "test_hidden.py::test_positive_list",
          "outcome": "failed",
          "call": {
            "longrepr": {
              "reprcrash": {
                "message": "assert 4 == 10"
              }
            }
          }
        }
      ]
    }
  },
  "metadata": {}
}
```

Only `exerciseId`, `code`, and `testResult` are essential for the current rule
prototype. `attemptCount` and `previousMistakeTypes` are needed for repeated
mistake decisions. `metadata` is accepted now but not used yet.

## Current adapter behaviour

The adapter now converts a Cellmate-style pytest report into the local
`HiddenTestRun` model:

- passed pytest cases become passed `TestResult` objects;
- simple assertion messages such as `assert 4 == 10` are parsed into
  `actual = 4` and `expected = 10`;
- timeout results become a controlled `timeout` mistake rather than a crash;
- unknown failures remain runtime-style failures.

This lets the existing classifier work with Cellmate-style hidden-test output
without re-running tests inside the adaptive layer.

## Bridge options for later implementation

There are three realistic ways to connect this to Cellmate later:

1. Call a Python CLI from the TypeScript extension and pass the event as JSON.
2. Rewrite the rule-based decision layer in TypeScript.
3. Run the adaptive layer as a local HTTP service.

For the next milestone, the Python CLI option is likely the simplest bridge. It
keeps the prototype close to the current tested code while avoiding a full
extension rewrite.
