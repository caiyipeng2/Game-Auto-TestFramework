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
const routePath = join(root, "routes", "buy-first-terrain-upgrade.yaml");
const evidenceRoot = join(process.cwd(), "reports", "t8-real-device-live");

test("loads the first terrain upgrade route with a first-available guard", async () => {
  const route = await loadRouteFile(routePath);

  assert.equal(route.id, "buy-first-terrain-upgrade");
  assert.deepEqual(
    route.steps.map((step) => step.type),
    ["branch", "screenshot"],
  );
  const branch = route.steps[0];
  assert.equal(branch?.type, "branch");
  if (branch?.type !== "branch") throw new Error("expected branch step");
  assert.deepEqual(branch.condition, { state: "new-account" });
  const thenSteps = branch.then as RouteStep[];
  assert.equal(thenSteps[0]?.type, "tap");
  if (thenSteps[0]?.type !== "tap")
    throw new Error("expected terrain entry tap");
  assert.equal(thenSteps[0].target, "main.terrain.upgrade.entry");
  assert.equal(thenSteps[1]?.type, "wait");
  if (thenSteps[1]?.type !== "wait")
    throw new Error("expected first-available wait");
  assert.equal(thenSteps[1].state, "terrain-upgrade-first-available");
  assert.equal(thenSteps[2]?.type, "tap");
  if (thenSteps[2]?.type !== "tap")
    throw new Error("expected first upgrade tap");
  assert.equal(thenSteps[2].target, "terrain.upgrade.first");
  assert.equal(thenSteps[3]?.type, "wait");
  if (thenSteps[3]?.type !== "wait") throw new Error("expected owned wait");
  assert.equal(thenSteps[3].state, "terrain-upgrade-owned");
});

test("buys the first terrain upgrade once and verifies it is owned", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "game-auto-idle-terrain-buy-"));
  const screenshotPath = join(scratch, "current.png");
  const adapter = await createIdleOutpostScreenshotAdapter(
    join(root, "adapter.yaml"),
    join(root, "config", "idle-outpost-config.snapshot.json"),
    { screenshotPath },
  );
  const route = await loadRouteFile(routePath);
  const context = createContext(adapter);
  const taps: ScreenPoint[] = [];
  let windowOpened = false;
  let purchased = false;
  const driver = {
    launch: async () => result("launch"),
    tap: async (_serial: string, point: ScreenPoint) => {
      taps.push(point);
      if (windowOpened) purchased = true;
      else windowOpened = true;
      return result("tap");
    },
    captureScreenshot: async (_serial: string, path: string) => {
      const source = purchased
        ? join(evidenceRoot, "terrain-upgrade-5038", "after-first-upgrade.png")
        : windowOpened
          ? join(
              evidenceRoot,
              "after-build-next-5038",
              "after-terrain-upgrades.png",
            )
          : join(
              evidenceRoot,
              "after-build-next-5038",
              "after-workshop-open-wait5s.png",
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
      { x: 0.923611 * 720, y: 0.894015 * 1604 },
      { x: 0.765278 * 720, y: 0.475686 * 1604 },
    ]);
    assert.equal(
      resultValue.steps[0]?.stateAfter?.state,
      "terrain-upgrade-owned",
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
    runId: "idle-outpost-terrain-upgrade-buy",
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
