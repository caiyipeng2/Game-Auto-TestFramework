import assert from "node:assert/strict";
import test from "node:test";

import { unsupportedCapability } from "../packages/core/src/contracts/device-driver.js";
import {
  FrameworkError,
  getFailureCategory,
  type StepEvidence,
} from "../packages/core/src/contracts/evidence.js";
import type { TapStep } from "../packages/core/src/contracts/flow.js";

test("keeps input actions addressed by logical target IDs", () => {
  const step: TapStep = {
    id: "open-upgrade",
    type: "tap",
    target: "terrain.upgrade.entry",
  };

  assert.equal(step.target, "terrain.upgrade.entry");
});

test("reports unsupported device capabilities with a stable category and code", () => {
  const error = unsupportedCapability("uiHierarchy");

  assert.equal(error.category, "DEVICE_STATE");
  assert.equal(error.code, "UNSUPPORTED_CAPABILITY");
  assert.match(error.message, /uiHierarchy/);
});

test("classifies framework and unknown failures deterministically", () => {
  const timeout = new FrameworkError("route timed out", "WAIT_TIMEOUT");

  assert.equal(getFailureCategory(timeout), "WAIT_TIMEOUT");
  assert.equal(
    getFailureCategory(new Error("unknown host failure")),
    "HOST_TOOL",
  );
});

test("step evidence records lifecycle, state, and artifact references", () => {
  const evidence: StepEvidence = {
    stepId: "verify-upgrade",
    status: "PASS",
    startedAt: "2026-09-01T00:00:00.000Z",
    finishedAt: "2026-09-01T00:00:01.000Z",
    stateBefore: { window: "main" },
    stateAfter: { window: "main", upgradeOwned: true },
    artifacts: [{ kind: "screenshot", path: "evidence/after.png" }],
  };

  assert.equal(evidence.status, "PASS");
  assert.equal(evidence.stateAfter?.upgradeOwned, true);
  assert.equal(evidence.artifacts[0].kind, "screenshot");
});
