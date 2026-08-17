const assert = require("node:assert/strict");
const test = require("node:test");

const {
  deterministicPairedBootstrap,
  rateSummary,
  scoreSummary,
  statisticsToCsv,
  statisticsToMarkdown,
  summarizeActionQuality
} = require("../out-evaluation/evaluation/actionQualityStatistics");

test("summary computes frozen condition metrics and keeps no-history secondary", () => {
  const { runRecords, judgeRecords, stateManifest } = fixtures();
  const summary = summarizeActionQuality({
    runRecords,
    judgeRecords,
    stateManifest,
    seed: "20260810",
    resamples: 1000
  });

  assert.equal(summary.statisticsVersion, "action-quality-statistics-v1");
  assert.deepEqual(summary.primaryConditions, ["fixed-v2", "full-adaptive-v1", "llm-next-step-v6"]);
  assert.deepEqual(summary.secondaryAblations, ["no-history-v1"]);
  assert.equal(summary.constructedStateCount, 3);

  const fixed = condition(summary, "fixed-v2");
  assert.equal(fixed.judgeScore.count, 3);
  assert.ok(close(fixed.judgeScore.mean, 8 / 3));
  assert.deepEqual(counts(fixed.hardConstraintViolation), [1, 3]);
  assert.deepEqual(counts(fixed.judgeCriticalError), [1, 3]);
  assert.deepEqual(counts(fixed.invarianceStability), [1, 1]);

  const full = condition(summary, "full-adaptive-v1");
  assert.deepEqual(counts(full.needsEvidenceAccuracy), [2, 3]);
  assert.deepEqual(counts(full.invarianceStability), [0, 1]);

  const llm = condition(summary, "llm-next-step-v6");
  assert.ok(close(llm.judgeScore.mean, 13 / 3));
  assert.deepEqual(counts(llm.selectorFallback), [1, 2]);
  assert.deepEqual(counts(llm.invarianceStability), [1, 1]);

  const noHistory = condition(summary, "no-history-v1");
  assert.equal(noHistory.role, "secondary_ablation");
  assert.equal(noHistory.judgeScore.count, 2);
  assert.deepEqual(counts(noHistory.judgeCompletionCoverage), [2, 3]);

  assert.deepEqual(summary.pairedDifferences.map((difference) => [
    difference.leftCondition,
    difference.rightCondition,
    difference.pairedStateCount,
    difference.meanDifference
  ]), [
    ["fixed-v2", "full-adaptive-v1", 3, 1],
    ["fixed-v2", "llm-next-step-v6", 3, 5 / 3],
    ["full-adaptive-v1", "llm-next-step-v6", 3, 2 / 3]
  ]);
  assert.match(summary.interpretationBoundary, /not estimates of real-student learning gains/);
});

test("score and Wilson summaries expose counts and 95 percent intervals", () => {
  const scores = scoreSummary([1, 3, 4]);
  assert.equal(scores.count, 3);
  assert.ok(close(scores.mean, 8 / 3));
  assert.ok(close(scores.sampleStandardDeviation, Math.sqrt(7 / 3)));
  assert.equal(scores.ci95.length, 2);

  const rate = rateSummary(1, 2);
  assert.equal(rate.rate, 0.5);
  assert.ok(close(rate.ci95[0], 0.09453120573423074));
  assert.ok(close(rate.ci95[1], 0.9054687942657693));
  assert.deepEqual(rateSummary(0, 0), { numerator: 0, denominator: 0, rate: null, ci95: null });
  assert.throws(() => rateSummary(2, 1), /Invalid rate counts/);
});

test("paired bootstrap is deterministic for the recorded seed and resample count", () => {
  const first = deterministicPairedBootstrap([3, 2, 0], "20260810", "llm-minus-fixed", 2000);
  const repeated = deterministicPairedBootstrap([3, 2, 0], "20260810", "llm-minus-fixed", 2000);
  assert.deepEqual(first, repeated);
  assert.equal(first.length, 2);
  assert.ok(first[0] <= 5 / 3 && first[1] >= 5 / 3);
  assert.deepEqual(deterministicPairedBootstrap([2, 2, 2], "1", "constant", 100), [2, 2]);
  assert.equal(deterministicPairedBootstrap([], "1", "empty", 100), null);
});

test("CSV and Markdown render the same condition and provenance boundary", () => {
  const data = fixtures();
  const summary = summarizeActionQuality({ ...data, seed: "20260810", resamples: 100 });
  const csv = statisticsToCsv(summary);
  const markdown = statisticsToMarkdown(summary);
  assert.match(csv, /^condition,role,judge_n,/);
  assert.match(csv, /llm-next-step-v6,primary,3,/);
  assert.match(markdown, /Action-quality statistics/);
  assert.match(markdown, /constructed blinded state pack/);
  assert.match(markdown, /llm-next-step-v6 minus fixed-v2/);
});

test("statistics reject missing judges and candidate/source mismatches", () => {
  const missing = fixtures();
  assert.throws(() => summarizeActionQuality({
    ...missing,
    judgeRecords: missing.judgeRecords.slice(0, -1),
    seed: "1",
    resamples: 10
  }), /Expected 12 judge records/);

  const mismatch = fixtures();
  mismatch.judgeRecords[0] = { ...mismatch.judgeRecords[0], candidateAction: "NEXT_CONCEPT" };
  assert.throws(() => summarizeActionQuality({ ...mismatch, seed: "1", resamples: 10 }), /does not match the locked source decision/);
});

function fixtures() {
  const stateIds = ["state-1", "state-2", "state-3"];
  const conditions = ["fixed-v2", "full-adaptive-v1", "llm-next-step-v6", "no-history-v1"];
  const actions = {
    "fixed-v2": ["HINT", "HINT", undefined],
    "full-adaptive-v1": ["HINT", "EASIER", "HINT"],
    "llm-next-step-v6": ["SIMILAR", "SIMILAR", undefined],
    "no-history-v1": ["EASIER", "EASIER", undefined]
  };
  const scores = {
    "fixed-v2": [1, 3, 4],
    "full-adaptive-v1": [3, 4, 4],
    "llm-next-step-v6": [4, 5, 4],
    "no-history-v1": [2, 3, undefined]
  };
  const runRecords = [];
  const judgeRecords = [];
  for (const conditionName of conditions) {
    for (let index = 0; index < stateIds.length; index += 1) {
      const stateId = stateIds[index];
      const action = actions[conditionName][index];
      const status = action ? "action" : "needs_evidence";
      const needsExpected = index === 2;
      const hardViolation = conditionName === "fixed-v2" && index === 0;
      const fallback = conditionName === "llm-next-step-v6" && index === 0;
      runRecords.push({
        schemaVersion: 1,
        suiteVersion: "evaluation-policy-suite-v3",
        runId: "source-run",
        statePackVersion: "action-quality-states-v2",
        stateId,
        condition: conditionName,
        executionStatus: "completed",
        needsEvidenceExpected: needsExpected,
        needsEvidenceCorrect: conditionName === "full-adaptive-v1" && index === 2 ? false : true,
        hardConstraintViolations: hardViolation ? ["FIXTURE_VIOLATION"] : [],
        trace: {
          status,
          ...(action ? { action } : {}),
          fallbackUsed: fallback
        }
      });
      const score = scores[conditionName][index];
      judgeRecords.push({
        schemaVersion: 1,
        sourceRunId: "source-run",
        stateId,
        condition: conditionName,
        candidateStatus: status,
        ...(action ? { candidateAction: action } : {}),
        executionStatus: score === undefined ? "error" : "completed",
        ...(score === undefined ? { errorCategory: "timeout" } : {
          score,
          criticalError: score === 1,
          confidence: 4
        })
      });
    }
  }
  return {
    runRecords,
    judgeRecords,
    stateManifest: {
      statePackVersion: "action-quality-states-v2",
      stateCount: 3,
      invarianceGroups: [{
        groupId: "inv-1",
        stateIds: ["state-1", "state-2"],
        relation: "meaning_preserving_rewording"
      }]
    }
  };
}

function condition(summary, name) {
  return summary.conditions.find((entry) => entry.condition === name);
}

function counts(summary) {
  return [summary.numerator, summary.denominator];
}

function close(actual, expected, tolerance = 1e-12) {
  return Math.abs(actual - expected) <= tolerance;
}
