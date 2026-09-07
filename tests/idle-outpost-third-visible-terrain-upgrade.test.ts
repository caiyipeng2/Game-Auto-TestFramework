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
const routePath = join(
  root,
  "routes",
  "buy-third-visible-terrain-upgrade.yaml",
);
const evidenceRoot = join(
  process.cwd(),
  "reports",
  "t8-real-device-live",
  "third-visible-terrain-upgrade-5037",
);

test("classifies the Motorola screenshot after the third visible upgrade", async () => {
  const scratch = await mkdtemp(
    join(tmpdir(), "game-auto-idle-terrain-third-owned-"),
  );
  const screenshotPath = join(scratch, "current.png");
  const adapter = await createIdleOutpostScreenshotAdapter(
    join(root, "adapter.yaml"),
    join(root, "config", "idle-outpost-config.snapshot.json"),
    { screenshotPath },
  );
  const driver = {
    captureScreenshot: async (_serial: string, path: string) => {
      await copyFile(
        join(evidenceRoot, "after-third-visible-upgrade.png"),
        path,
      );
      return result("screenshot");
    },
  } as unknown as DeviceDriver;

  try {
    const state = await adapter.readState(createContext(adapter), driver);
    assert.equal(state.state, "terrain-upgrade-third-owned");
    assert.equal(state.accountMode, "new");
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("loads the third visible terrain upgrade route with preserve policy", async () => {
  const route = await loadRouteFile(routePath);

  assert.equal(route.id, "buy-third-visible-terrain-upgrade");
  assert.equal(route.accountPolicy, "preserve");
  assert.deepEqual(
    route.steps.map((step) => step.type),
    ["branch", "screenshot"],
  );
  const outerBranch = route.steps[0];
  assert.equal(outerBranch?.type, "branch");
  if (outerBranch?.type !== "branch") throw new Error("expected branch step");
  assert.deepEqual(outerBranch.condition, { state: "new-account" });
  const newAccountSteps = outerBranch.then as RouteStep[];
  assert.equal(newAccountSteps[0]?.type, "tap");
  assert.equal(newAccountSteps[1]?.type, "wait");
  if (newAccountSteps[1]?.type !== "wait")
    throw new Error("expected second-owned wait");
  assert.equal(newAccountSteps[1].state, "terrain-upgrade-second-owned");
  assert.equal(newAccountSteps[2]?.type, "tap");
  if (newAccountSteps[2]?.type !== "tap")
    throw new Error("expected next-upgrade tap");
  assert.equal(newAccountSteps[2].target, "terrain.upgrade.next");
  assert.equal(newAccountSteps[3]?.type, "wait");
  if (newAccountSteps[3]?.type !== "wait")
    throw new Error("expected third-owned wait");
  assert.equal(newAccountSteps[3].state, "terrain-upgrade-third-owned");
});

test("uses UpgradeId 4 as the next visible 57-coin terrain upgrade", async () => {
  const adapter = await createIdleOutpostAdapter(
    join(root, "adapter.yaml"),
    join(root, "config", "idle-outpost-config.snapshot.json"),
  );
  const next = adapter.config
    .getTerrainUpgrades(1)
    .find((upgrade) => upgrade.upgradeId === 4);

  assert.equal(next?.needCoin, 57);
  assert.deepEqual(
    await adapter.resolveTarget("terrain.upgrade.next", createContext(adapter)),
    {
      kind: "normalized-point",
      x: 0.765278,
      y: 0.475686,
    },
  );
});

test("taps the third visible upgrade once from the second-owned state", async () => {
  const scratch = await mkdtemp(
    join(tmpdir(), "game-auto-idle-terrain-third-visible-"),
  );
  const states = [
    "terrain-upgrade-second-owned",
    "terrain-upgrade-second-owned",
    "terrain-upgrade-second-owned",
    "terrain-upgrade-second-owned",
    "terrain-upgrade-third-owned",
    "terrain-upgrade-third-owned",
    "terrain-upgrade-third-owned",
  ];
  const taps: ScreenPoint[] = [];
  const adapter = await createIdleOutpostAdapter(
    join(root, "adapter.yaml"),
    join(root, "config", "idle-outpost-config.snapshot.json"),
    {
      stateReader: {
        read: async () => ({
          state: states.shift() ?? "terrain-upgrade-third-owned",
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

test("does not tap again when the third visible upgrade is already owned", async () => {
  const scratch = await mkdtemp(
    join(tmpdir(), "game-auto-idle-terrain-third-idempotent-"),
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
      await copyFile(
        join(evidenceRoot, "after-third-visible-upgrade.png"),
        path,
      );
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
    runId: "idle-outpost-third-visible-terrain-upgrade",
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
