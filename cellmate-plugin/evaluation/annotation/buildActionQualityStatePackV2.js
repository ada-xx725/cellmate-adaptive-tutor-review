"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { validateFormalStatePack } = require("./validateFormalStatePack");
const { buildActionQualityStatePack: buildV1Pack } = require("./buildActionQualityStatePack");

const PLUGIN_ROOT = path.resolve(__dirname, "..", "..");
const STATE_PATH = path.join(PLUGIN_ROOT, "evaluation", "states", "action-quality-v2.jsonl");
const MANIFEST_PATH = path.join(PLUGIN_ROOT, "evaluation", "states", "ACTION_QUALITY_STATE_PACK_V2.json");
const STATE_PACK_VERSION = "action-quality-states-v2";
const PROTOCOL_VERSION = "action-quality-protocol-v2";

function buildActionQualityStatePackV2() {
  const base = buildV1Pack();
  const idMap = new Map(base.states.map((state, index) => [
    state.state_id,
    `heldout-v2-${String(index + 1).padStart(3, "0")}`
  ]));
  let replacementCount = 0;
  const states = base.states.map((state) => {
    const transformed = structuredClone(state);
    const oldStateId = transformed.state_id;
    transformed.state_id = idMap.get(oldStateId);
    transformed.state_pack_version = STATE_PACK_VERSION;
    transformed.counterfactual_pair_id = transformed.counterfactual_pair_id
      ? transformed.counterfactual_pair_id.replace(/^cf-/, "cf-v2-")
      : transformed.counterfactual_pair_id;
    if (transformed.evidence?.error_signature === "accumulator_overwritten") {
      replacementCount += 1;
      replaceExposedAccumulatorCase(transformed, oldStateId);
    }
    return transformed;
  });
  if (replacementCount !== 4) {
    throw new Error(`Expected to replace four exposed accumulator states, found ${replacementCount}.`);
  }

  const validation = validateFormalStatePack(states, { final: true });
  if (!validation.valid) throw new Error(validation.errors.join("\n"));
  const invarianceGroups = base.manifest.invarianceGroups.map((group) => ({
    ...group,
    groupId: group.groupId.replace(/^inv-/, "inv-v2-"),
    stateIds: group.stateIds.map((stateId) => idMap.get(stateId))
  }));
  const jsonl = `${states.map((state) => JSON.stringify(state)).join("\n")}\n`;
  const manifest = {
    ...base.manifest,
    statePackVersion: STATE_PACK_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    file: path.basename(STATE_PATH),
    sha256: canonicalHash(jsonl),
    strata: validation.strata,
    sources: validation.sources,
    counterfactualPairCount: validation.counterfactualPairCount,
    invarianceGroups,
    generator: "evaluation/annotation/buildActionQualityStatePackV2.js",
    generatorSha256: canonicalFileHash(__filename),
    policyOutputsObserved: false,
    referenceLabelsPresent: false,
    formalResultsPresent: false,
    supersedesStatePackVersion: "action-quality-states-v1",
    replacementReason: "The v1 accumulator-overwritten cluster was exposed during connectivity preflight before formal execution.",
    createdAt: "2026-08-17"
  };
  return { states, jsonl, manifest };
}

function replaceExposedAccumulatorCase(state, oldStateId) {
  const alternateWording = ["heldout-007", "heldout-008"].includes(oldStateId);
  state.student_code = [
    "def my_sum(x):",
    "    total = 0",
    "    for value in x:",
    "        total += 1",
    "    return total",
    ""
  ].join("\n");
  state.evidence.error_signature = "accumulator_counts_items_instead_of_values";
  state.evidence.summary = alternateWording
    ? "The loop counted input elements instead of adding their numeric values."
    : "The function returned the input length rather than the sum of its values.";
  state.evidence.test_coverage = {
    summary: alternateWording
      ? "Coverage records 3 passing checks from 6 executed checks."
      : "3/6 explicit checks are represented for this state.",
    passed_checks: 3,
    total_checks: 6,
    categories: ["callable", "numeric result", "empty input", "mixed signs", "non-unit values", "long range"]
  };
  state.history = state.history.map((attempt) => ({
    ...attempt,
    support_received: {
      ...attempt.support_received,
      summary: "The scaffold separated initialization, value accumulation, and returning the completed total."
    },
    support_outcome: "same_counting_instead_of_summing_error_repeated"
  }));
}

function writeCommittedPack() {
  const built = buildActionQualityStatePackV2();
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, built.jsonl, "utf8");
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(built.manifest, null, 2)}\n`, "utf8");
  return built;
}

function verifyCommittedPack() {
  const built = buildActionQualityStatePackV2();
  const committedJsonl = fs.readFileSync(STATE_PATH, "utf8").replace(/\r\n/g, "\n");
  if (committedJsonl !== built.jsonl) throw new Error("Committed action-quality v2 state JSONL is not reproducible.");
  const committedManifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  if (JSON.stringify(committedManifest) !== JSON.stringify(built.manifest)) {
    throw new Error("Committed action-quality v2 state manifest is not reproducible.");
  }
  return built;
}

function canonicalHash(content) {
  return crypto.createHash("sha256").update(content.replace(/\r\n/g, "\n"), "utf8").digest("hex").toUpperCase();
}

function canonicalFileHash(filePath) {
  return canonicalHash(fs.readFileSync(filePath, "utf8"));
}

if (require.main === module) {
  try {
    const result = process.argv.includes("--check") ? verifyCommittedPack() : writeCommittedPack();
    process.stdout.write(`state_pack=${STATE_PACK_VERSION} states=${result.states.length} sha256=${result.manifest.sha256}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  MANIFEST_PATH,
  STATE_PATH,
  buildActionQualityStatePackV2,
  verifyCommittedPack,
  writeCommittedPack
};
