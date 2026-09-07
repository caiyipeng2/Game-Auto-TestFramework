import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
import { createIdleOutpostAdapter } from "../adapters/idle-outpost/src/idle-outpost-adapter.js";

const root = join(process.cwd(), "adapters", "idle-outpost");
const routePath = join(
  root,
  "routes",
  "buy-fourth-visible-terrain-upgrade.yaml",
);

test("loads the fourth visible terrain upgrade route with preserve policy", async () => {
  const route = await loadRouteFile(routePath);

  assert.equal(route.id, "buy-fourth-visible-terrain-upgrade");
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
  assert.equal(newAccountSteps[1]?.type, "wait");
  if (newAccountSteps[1]?.type !== "wait")
    throw new Error("expected third-owned wait");
  assert.equal(newAccountSteps[1].state, "terrain-upgrade-third-owned");
  assert.equal(newAccountSteps[2]?.type, "tap");
  if (newAccountSteps[2]?.type !== "tap")
    throw new Error("expected next-upgrade tap");
  assert.equal(newAccountSteps[2].target, "terrain.upgrade.next");
  assert.equal(newAccountSteps[3]?.type, "wait");
  if (newAccountSteps[3]?.type !== "wait")
    throw new Error("expected fourth-owned wait");
  assert.equal(newAccountSteps[3].state, "terrain-upgrade-fourth-owned");
});

test("uses UpgradeId 3 as the next visible 320-coin terrain upgrade", async () => {
  const adapter = await createIdleOutpostAdapter(
    join(root, "adapter.yaml"),
    join(root, "config", "idle-outpost-config.snapshot.json"),
  );
  const next = adapter.config
    .getTerrainUpgrades(1)
    .find((upgrade) => upgrade.upgradeId === 3);

  assert.equal(next?.needCoin, 320);
  assert.deepEqual(
    await adapter.resolveTarget("terrain.upgrade.next", createContext(adapter)),
    {
      kind: "normalized-point",
      x: 0.765278,
      y: 0.475686,
    },
  );
});

test("taps the fourth visible upgrade once from the third-owned state", async () => {
  const scratch = await mkdtemp(
    join(tmpdir(), "game-auto-idle-terrain-fourth-visible-"),
  );
  const states = [
    "terrain-upgrade-third-owned",
    "terrain-upgrade-third-owned",
    "terrain-upgrade-third-owned",
    "terrain-upgrade-third-owned",
    "terrain-upgrade-fourth-owned",
    "terrain-upgrade-fourth-owned",
  ];
  const taps: ScreenPoint[] = [];
  const adapter = await createIdleOutpostAdapter(
    join(root, "adapter.yaml"),
    join(root, "config", "idle-outpost-config.snapshot.json"),
    {
      stateReader: {
        read: async () => ({
          state: states.shift() ?? "terrain-upgrade-fourth-owned",
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
    runId: "idle-outpost-fourth-visible-terrain-upgrade",
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
