const fs = require("node:fs");
const path = require("node:path");

const stateId = process.argv[2];
if (!/^pilot-[ABC]\d{2}$/.test(stateId ?? "")) {
  process.stderr.write("Usage: npm run annotation:show -- pilot-C01\n");
  process.exitCode = 1;
} else {
  const fileName = stateId.startsWith("pilot-C")
    ? "pilot_states_v3.jsonl"
    : stateId.startsWith("pilot-B")
      ? "pilot_states_v2.jsonl"
      : "pilot_states.jsonl";
  const states = fs.readFileSync(path.join(__dirname, fileName), "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const state = states.find((candidate) => candidate.state_id === stateId);
  if (!state) {
    process.stderr.write(`Unknown pilot state: ${stateId}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`${JSON.stringify(state, null, 2)}\n`);
  }
}
