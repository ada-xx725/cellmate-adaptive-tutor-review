# Six Teaching-Action Cases

These are short coverage cases for the demo. They are not formal held-out
evaluation results. Their inputs are fixed fixtures, not records from observed
learner sessions or participant-study data.

Run them with:

```powershell
npm run demo:actions
```

The command loads the frozen inputs from `action-cases.jsonl`, runs the
production decision engine, checks that each result matches the named action,
and writes the complete traces to `action-traces/`.

## Coverage

| Action | Short learner situation | Evidence and state used | Decision source | Trace |
| --- | --- | --- | --- | --- |
| `HINT` | First local accumulator update error | Reliable failed pytest; no previous failure | `LlmDecisionEngine` with fixed selector replay | `action-traces/demo-action-01-hint-hint.json` |
| `RETRY_WITH_SCAFFOLD` | First broader multi-step failure | Reliable failed pytest; no previous support | `FullAdaptivePolicy` | `action-traces/demo-action-02-retry-retry_with_scaffold.json` |
| `EASIER` | Same misconception after scaffolded retry | Reliable failure plus previous failed attempt | `FullAdaptivePolicy` | `action-traces/demo-action-03-easier-easier.json` |
| `SIMILAR` | First reliable success, mastery still developing | Generated tests passed; mastery about 55 | `FullAdaptivePolicy` | `action-traces/demo-action-04-similar-similar.json` |
| `HARDER` | Current concept is solid | PyBryt passed; mastery about 75 | `FullAdaptivePolicy` | `action-traces/demo-action-05-harder-harder.json` |
| `NEXT_CONCEPT` | Current concept is stable | PyBryt passed; mastery above 85; next concept available | `FullAdaptivePolicy` | `action-traces/demo-action-06-next-concept-next_concept.json` |

## Important boundary

The five rule cases are direct runs of `DecisionEngine` with
`FullAdaptivePolicy`.

`HINT` is currently chosen by the LLM selector rather than by
`FullAdaptivePolicy`. For deterministic demo coverage, its trace runs the real
`LlmDecisionEngine` with a fixed selector response. The trace is deliberately
labelled:

```text
modelVersion: demo-scripted-selector-replay
traceNote: ... this is not a live model call.
```

The separate course and generated-attempt runtime exports are the application
evidence for model-backed selection in Extension Host runs. This replay case
only shows that the production decision and trace pipeline can carry a `HINT`;
it is not presented as a live-model evaluation result.

## What to point out in one trace

Open any JSON file in `action-traces/` and show:

1. `taskSpec` — what the learner was trying to do;
2. `evidence` — what was observed;
3. `learnerBefore` and `history` — the state available before selection;
4. `action` and `reasonCodes` — the selected next step;
5. `learnerAfter` — the state after the reliable attempt;
6. `policyVersion`, `modelVersion`, and `promptVersion` — reproducibility.
