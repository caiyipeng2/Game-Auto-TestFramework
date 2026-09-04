import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type {
  DeviceDriver,
  DeviceInfo,
  InstallableArtifact,
  ScreenPoint,
} from "../packages/core/src/contracts/device-driver.js";
import type {
  AdapterContext,
  GameAdapter,
} from "../packages/core/src/contracts/game-adapter.js";
import type { RouteStep } from "../packages/core/src/contracts/flow.js";
import { FlowRunner } from "../packages/core/src/flow/flow-runner.js";
import { loadRouteFile } from "../packages/core/src/flow/route-loader.js";
import { createIdleOutpostScreenshotAdapter } from "../adapters/idle-outpost/src/idle-outpost-adapter.js";

const root = join(process.cwd(), "adapters", "idle-outpost");
const routePath = join(root, "routes", "build-first-equipment.yaml");
const liveEvidenceRoot = join(process.cwd(), "reports", "t8-real-device-live");

test("loads the first equipment build route with a completion-state wait", async () => {
  const route = await loadRouteFile(routePath);

  assert.equal(route.id, "build-first-equipment");
  assert.deepEqual(
    route.steps.map((step) => step.type),
    ["branch", "screenshot"],
  );
  const branch = route.steps[0];
  assert.equal(branch?.type, "branch");
  if (branch?.type !== "branch") throw new Error("expected branch step");
  assert.deepEqual(branch.condition, { state: "equipment-build-window" });
  const thenSteps = branch.then as RouteStep[];
  assert.equal(thenSteps[0]?.type, "tap");
  if (thenSteps[0]?.type !== "tap") throw new Error("expected build tap");
  assert.equal(thenSteps[0].target, "tutorial.equipment.build");
  assert.equal(thenSteps[1]?.type, "wait");
  if (thenSteps[1]?.type !== "wait")
    throw new Error("expected completion wait");
  assert.equal(thenSteps[1].state, "equipment-build-complete");
  const elseSteps = branch.else as RouteStep[];
  assert.equal(elseSteps[0]?.type, "assert");
  if (elseSteps[0]?.type !== "assert")
    throw new Error("expected completion assertion");
  assert.equal(elseSteps[0].state, "equipment-build-complete");
});

test("builds the first equipment and verifies the completion state without a second tap", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "game-auto-idle-build-route-"));
  const screenshotPath = join(scratch, "current.png");
  const adapter = await createIdleOutpostScreenshotAdapter(
    join(root, "adapter.yaml"),
    join(root, "config", "idle-outpost-config.snapshot.json"),
    { screenshotPath },
  );
  const route = await loadRouteFile(routePath);
  const context = createContext(adapter);
  const taps: ScreenPoint[] = [];
  let built = false;
  const driver = {
    launch: async () => result("launch"),
    tap: async (_serial: string, point: ScreenPoint) => {
      taps.push(point);
      built = true;
      return result("tap");
    },
    captureScreenshot: async (_serial: string, path: string) => {
      await copyFile(
        built
          ? join(liveEvidenceRoot, "equipment-build-5038", "after-build.png")
          : join(liveEvidenceRoot, "equipment-route-5037-final", "current.png"),
        path,
      );
      return { ...result("screenshot"), stdout: path };
    },
  } as unknown as DeviceDriver;

  try {
    const resultValue = await new FlowRunner(driver, adapter, context, {
      evidenceDir: scratch,
      sleep: async () => {},
    }).run(route);

    assert.equal(resultValue.status, "PASS");
    assert.equal(resultValue.steps.length, 2);
    assert.deepEqual(taps, [{ x: 0.319444 * 720, y: 0.664589 * 1604 }]);
    assert.equal(
      resultValue.steps[0]?.stateAfter?.state,
      "equipment-build-complete",
    );
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

function createContext(adapter: GameAdapter): AdapterContext {
  const device: DeviceInfo = {
    serial: "fixture-device",
    model: "Motorola fixture",
    apiLevel: 35,
    supportedAbis: ["arm64-v8a"],
    display: { width: 720, height: 1604, density: 280 },
  };
  const artifact: InstallableArtifact = {
    path: "fixture.apks",
    kind: "apks",
    packageId: adapter.identity().packageId,
  };
  return {
    runId: "idle-outpost-build-route",
    device,
    artifact,
    profile: adapter.profiles()[0]!,
    variables: {},
  };
}

function result(command: string): {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
} {
  return { command, exitCode: 0, stdout: "", stderr: "", durationMs: 1 };
}
