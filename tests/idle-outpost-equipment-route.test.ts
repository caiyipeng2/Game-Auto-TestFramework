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
const routePath = join(root, "routes", "open-equipment-build.yaml");
const evidenceRoot = join(
  process.cwd(),
  "reports",
  "t8-real-device",
  "ZT4229J5ZR",
);
const liveEvidenceRoot = join(process.cwd(), "reports", "t8-real-device-live");

test("loads the equipment route from intro story through the build-window wait", async () => {
  const route = await loadRouteFile(routePath);

  assert.equal(route.id, "open-equipment-build");
  assert.deepEqual(
    route.steps.map((step) => step.type),
    ["branch", "screenshot"],
  );
  const branch = route.steps[0];
  assert.equal(branch?.type, "branch");
  if (branch?.type !== "branch") throw new Error("expected branch step");
  assert.deepEqual(branch.condition, { state: "startup-intro-story" });
  const thenSteps = branch.then as RouteStep[];
  assert.equal(thenSteps[0]?.type, "tap");
  if (thenSteps[0]?.type !== "tap") throw new Error("expected story tap");
  assert.equal(thenSteps[0].target, "tutorial.intro.advance");
  assert.equal(thenSteps[1]?.type, "wait");
  if (thenSteps[1]?.type !== "wait") throw new Error("expected entry wait");
  assert.equal(thenSteps[1].state, "first-equipment-entry");
  assert.equal(thenSteps[2]?.type, "tap");
  if (thenSteps[2]?.type !== "tap") throw new Error("expected entry tap");
  assert.equal(thenSteps[2].target, "tutorial.equipment.entry");
  assert.equal(thenSteps[3]?.type, "wait");
  if (thenSteps[3]?.type !== "wait") throw new Error("expected window wait");
  assert.equal(thenSteps[3].state, "equipment-build-window");
  const elseSteps = branch.else as RouteStep[];
  assert.equal(elseSteps[0]?.type, "branch");
  if (elseSteps[0]?.type !== "branch") throw new Error("expected entry branch");
  assert.deepEqual(elseSteps[0].condition, { state: "first-equipment-entry" });
});

test("opens the equipment build window from the first tutorial entry without purchasing", async () => {
  const scratch = await mkdtemp(
    join(tmpdir(), "game-auto-idle-equipment-route-"),
  );
  const screenshotPath = join(scratch, "current.png");
  const adapter = await createIdleOutpostScreenshotAdapter(
    join(root, "adapter.yaml"),
    join(root, "config", "idle-outpost-config.snapshot.json"),
    { screenshotPath },
  );
  const route = await loadRouteFile(routePath);
  const context = createContext(adapter);
  const taps: ScreenPoint[] = [];
  let storyAdvanced = false;
  let opened = false;
  const driver = {
    launch: async () => result("launch"),
    tap: async (_serial: string, point: ScreenPoint) => {
      taps.push(point);
      if (storyAdvanced) opened = true;
      else storyAdvanced = true;
      return result("tap");
    },
    captureScreenshot: async (_serial: string, path: string) => {
      const source = opened
        ? join(liveEvidenceRoot, "equipment-route-5037-final", "current.png")
        : storyAdvanced
          ? join(
              liveEvidenceRoot,
              "intro-story-5037",
              "after-dialog-advance.png",
            )
          : join(
              liveEvidenceRoot,
              "account-reset-5037-final",
              "prepare-current.png",
            );
      await copyFile(source, path);
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
    assert.deepEqual(taps, [
      { x: 0.347222 * 720, y: 0.654613 * 1604 },
      { x: 0.316667 * 720, y: 0.723192 * 1604 },
    ]);
    assert.equal(
      resultValue.steps[0]?.stateAfter?.state,
      "equipment-build-window",
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
    runId: "idle-outpost-equipment-route",
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
