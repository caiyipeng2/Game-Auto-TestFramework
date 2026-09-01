import assert from "node:assert/strict";
import test from "node:test";

import { FRAMEWORK_CONTRACT_VERSION } from "../packages/core/src/index.js";

test("exposes the framework contract version from the core package", () => {
  assert.equal(FRAMEWORK_CONTRACT_VERSION, "1.0");
});
