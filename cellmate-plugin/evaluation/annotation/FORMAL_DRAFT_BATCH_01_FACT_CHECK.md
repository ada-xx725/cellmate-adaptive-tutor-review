# Formal Draft Batch 01 Fact Check

This is a private authoring audit. It must not be shown to raters. It contains no policy output and no human-reference action label.

## Method

1. Course task wording, function names, and asserts were checked against the pinned course commit `4317489856e3ece9d61e78638416c2e5451bf8bb`.
2. Generated and generic states were explicitly marked as controlled evaluation fixtures rather than real learner observations.
3. The student code and checks were executed by `runEvidenceFixtures.py`.
4. Observed status, passed-check count, total-check count, and diagnostic error signature were compared with the blinded state file.
5. Counterfactual pairs retained identical current task, code, and evidence; only learner state and history vary.

## Results

| States | Source | Observed evidence | Draft match | Notes |
| --- | --- | ---: | --- | --- |
| heldout-001/002 | Course Exercise 1.15, cells 163–166 | failed, 3/5 | Accepted | `my_sum` name and actual course asserts; overwrite signature reproduced. |
| heldout-003/004 | Controlled generated exercise | failed, 4/7 | Accepted | Negative truthiness error reproduced. |
| heldout-005/006 | Course Exercise 2.4, cells 59–62 | passed, 6/6 | Accepted | `my_factorial` name and all six course asserts. |
| heldout-007/008 | Controlled generic task | passed, 7/7 | Accepted | All controlled locally validated checks passed. |
| heldout-009/010 | Course Exercise 3.5 plus controlled unknown output | unavailable, 0/0 | Accepted | Course requires `ValueError` for negative input; unknown output remains unreliable evidence. |
| heldout-011/012 | Course Exercise 4.2, one visible-assert subset | passed, 1/1 | Accepted | `reverse_dict` and the real `"Katze"` visible assertion. |

The executable report records `all_expected_results_reproduced: true`. The draft continues to contain 12 blinded states, six complete counterfactual pairs, no policy output, and no reference labels.

## Corrections made before acceptance

- Replaced invented function names with the course-required `my_sum`, `my_factorial`, and `reverse_dict` names.
- Corrected Exercise 1.15 from an unsupported `2/6` claim to the reproduced `3/5` course-assert result.
- Removed the unsupported Exercise 3.5 non-integer exception requirement.
- Replaced the invented dictionary example with one actual visible assertion from Exercise 4.2.

## Boundary

This audit establishes that the state facts and executable evidence are internally reproducible. It does not establish that a particular next-step action is correct, and it does not evaluate any policy.
