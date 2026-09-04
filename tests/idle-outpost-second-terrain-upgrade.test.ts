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
import {
  createIdleOutpostAdapter,
  createIdleOutpostScreenshotAdapter,
} from "../adapters/idle-outpost/src/idle-outpost-adapter.js";

const root = join(process.cwd(), "adapters", "idle-outpost");
const routePath = join(root, "routes", "buy-second-terrain-upgrade.yaml");
const evidenceRoot = join(
  process.cwd(),
  "reports",
  "t8-real-device-live",
  "second-terrain-upgrade-5038",
);

test("classifies the Motorola screenshot after the second terrain upgrade", async () => {
  const scratch = await mkdtemp(
    join(tmpdir(), "game-auto-idle-terrain-second-owned-"),
  );
  const screenshotPath = join(scratch, "current.png");
  const adapter = await createIdleOutpostScreenshotAdapter(
    join(root, "adapter.yaml"),
    join(root, "config", "idle-outpost-config.snapshot.json"),
    { screenshotPath },
  );
  const driver = {
    captureScreenshot: async (_serial: string, path: string) => {
      await copyFile(join(evidenceRoot, "after-second-upgrade.png"), path);
      return result("screenshot");
    },
  } as unknown as DeviceDriver;

  try {
    const state = await adapter.readState(createContext(adapter), driver);
    assert.equal(state.state, "terrain-upgrade-second-owned");
    assert.equal(state.accountMode, "new");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("exposes the second configured terrain upgrade facts and reusable next-row target", async () => {
  const adapter = await createIdleOutpostAdapter(
    join(root, "adapter.yaml"),
    join(root, "config", "idle-outpost-config.snapshot.json"),
  );
  const upgrades = adapter.config.getTerrainUpgrades(1);

  assert.equal(upgrades[1]?.upgradeId, 2);
  assert.equal(upgrades[1]?.needCoin, 30);
  assert.deepEqual(
    await adapter.resolveTarget("terrain.upgrade.next", createContext(adapter)),
    {
      kind: "normalized-point",
      x: 0.765278,
      y: 0.475686,
    },
  );
});

test("loads the second terrain upgrade route with an idempotent ownership guard", async () => {
  const route = await loadRouteFile(routePath);

  assert.equal(route.id, "buy-second-terrain-upgrade");
  assert.equal(
    (route as typeof route & { accountPolicy?: string }).accountPolicy,
    "preserve",
  );
  assert.deepEqual(
    route.steps.map((step) => step.type),
    ["branch", "screenshot"],
  );
  const outerBranch = route.steps[0];
  assert.equal(outerBranch?.type, "branch");
  if (outerBranch?.type !== "branch") throw new Error("expected branch step");
  const newAccountSteps = outerBranch.then as RouteStep[];
  assert.equal(newAccountSteps[0]?.type, "tap");
  assert.equal(newAccountSteps[1]?.type, "wait");
  if (newAccountSteps[1]?.type !== "wait")
    throw new Error("expected first-owned wait");
  assert.equal(newAccountSteps[1].state, "terrain-upgrade-owned");
  assert.equal(newAccountSteps[2]?.type, "tap");
  if (newAccountSteps[2]?.type !== "tap")
    throw new Error("expected next-upgrade tap");
  assert.equal(newAccountSteps[2].target, "terrain.upgrade.next");
  assert.equal(newAccountSteps[3]?.type, "wait");
  if (newAccountSteps[3]?.type !== "wait")
    throw new Error("expected second-owned wait");
  assert.equal(newAccountSteps[3].state, "terrain-upgrade-second-owned");
});

test("executes exactly one second terrain upgrade tap and accepts an already-owned state", async () => {
  const scratch = await mkdtemp(
    join(tmpdir(), "game-auto-idle-terrain-second-"),
  );
  const states = [
    "terrain-upgrade-owned",
    "terrain-upgrade-owned",
    "terrain-upgrade-owned",
    "terrain-upgrade-owned",
    "terrain-upgrade-second-owned",
    "terrain-upgrade-second-owned",
    "terrain-upgrade-second-owned",
  ];
  const taps: ScreenPoint[] = [];
  const adapter = await createIdleOutpostAdapter(
    join(root, "adapter.yaml"),
    join(root, "config", "idle-outpost-config.snapshot.json"),
    {
      stateReader: {
        read: async () => ({
          state: states.shift() ?? "terrain-upgrade-second-owned",
        }),
      },
    },
  );
  const route = await loadRouteFile(routePath);
  const driver = {
    launch: async () => result("launch"),
    tap: async (_serial: string, point: ScreenPoint) => {
      taps.push(point);
      return result("tap");
    },
    captureScreenshot: async () => result("screenshot"),
  } as unknown as DeviceDriver;

  try {
    const resultValue = await new FlowRunner(
      driver,
      adapter,
      createContext(adapter),
      { evidenceDir: scratch, sleep: async () => {} },
    ).run(route);

    assert.equal(resultValue.status, "PASS");
    assert.deepEqual(taps, [{ x: 0.765278 * 720, y: 0.475686 * 1604 }]);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("does not tap again when a screenshot-driven route starts at second-upgrade-owned", async () => {
  const scratch = await mkdtemp(
    join(tmpdir(), "game-auto-idle-terrain-second-idempotent-"),
  );
  const screenshotPath = join(scratch, "current.png");
  const adapter = await createIdleOutpostScreenshotAdapter(
    join(root, "adapter.yaml"),
    join(root, "config", "idle-outpost-config.snapshot.json"),
    { screenshotPath },
  );
  const route = await loadRouteFile(routePath);
  const taps: ScreenPoint[] = [];
  const driver = {
    launch: async () => result("launch"),
    tap: async (_serial: string, point: ScreenPoint) => {
      taps.push(point);
      return result("tap");
    },
    captureScreenshot: async (_serial: string, path: string) => {
      await copyFile(join(evidenceRoot, "after-second-upgrade.png"), path);
      return { ...result("screenshot"), stdout: path };
    },
  } as unknown as DeviceDriver;

  try {
    const resultValue = await new FlowRunner(
      driver,
      adapter,
      createContext(adapter),
      { evidenceDir: scratch, sleep: async () => {} },
    ).run(route);

    assert.equal(resultValue.status, "PASS");
    assert.deepEqual(taps, []);
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
    runId: "idle-outpost-second-terrain-upgrade",
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
