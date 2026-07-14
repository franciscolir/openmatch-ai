import test from "node:test";
import assert from "node:assert/strict";
import { ANALYSIS_MODES, getAnalysisMode } from "../src/config/analysis-config.js";

test("every analysis mode has a valid inference configuration", () => {
  for (const mode of Object.values(ANALYSIS_MODES)) {
    assert.ok(mode.inferenceFps > 0);
    assert.ok(mode.maxDimension >= 480);
    assert.equal(typeof mode.poseEnabled, "boolean");
  }
});

test("unknown modes fall back to balanced", () => {
  assert.equal(getAnalysisMode("unsupported"), ANALYSIS_MODES.balanced);
});
