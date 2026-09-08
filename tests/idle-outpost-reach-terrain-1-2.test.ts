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
const routePath = join(root, "routes", "reach-terrain-1-2.yaml");
const evidenceRoot = join(process.cwd(), "reports", "t8-real-device-live");

test("classifies the observed 1-2 route checkpoint screenshots", async () => {
  const cases = [
    [
      "terrain-upgrade-all-owned",
      "fourth-visible-terrain-upgrade-5037",
      "after-fourth-visible-upgrade.png",
    ],
    [
      "device-upgrade-level-25",
      "through-1-2-5038",
      "device-upgrade-1-level25.png",
    ],
    ["next-terrain-window", "through-1-2-5038", "after-map-entry-ready.png"],
    ["terrain-transition-loading", "through-1-2-5038", "after-unlock-1-2.png"],
    [
      "terrain-1-2-new-position",
      "through-1-2-5037",
      "after-skip-1-2-story.png",
    ],
    ["terrain-1-2-reward", "through-1-2-5037", "after-confirm-1-2.png"],
    ["terrain-1-2-main", "through-1-2-5037", "final-1-2.png"],
  ] as const;

  for (const [expectedState, directory, fileName] of cases) {
    const scratch = await mkdtemp(
      join(tmpdir(), `game-auto-${expectedState}-`),
    );
    const screenshotPath = join(scratch, "current.png");
    const adapter = await createIdleOutpostScreenshotAdapter(
      join(root, "adapter.yaml"),
      join(root, "config", "idle-outpost-config.snapshot.json"),
      { screenshotPath },
    );
    const driver = {
      captureScreenshot: async (_serial: string, path: string) => {
        await copyFile(join(evidenceRoot, directory, fileName), path);
        return result("screenshot");
      },
    } as unknown as DeviceDriver;

    try {
      const state = await adapter.readState(createContext(adapter), driver);
      assert.equal(state.state, expectedState);
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
});

test("loads the consolidated 1-2 route with preserve policy", async () => {
  const route = await loadRouteFile(routePath);

  assert.equal(route.id, "reach-terrain-1-2");
  assert.equal(route.accountPolicy, "preserve");
  assert.deepEqual(
    route.preconditions?.map((item) => item.context),
    ["account-ready", "logged-in"],
  );
  assert.deepEqual(
    route.steps.map((step) => step.type),
    ["branch", "screenshot"],
  );
  const checkpointBranch = route.steps[0];
  assert.equal(checkpointBranch?.type, "branch");
  if (checkpointBranch?.type !== "branch")
    throw new Error("expected checkpoint branch");
  assert.deepEqual(checkpointBranch.condition, { state: "terrain-1-2-main" });
  const checkpointThen = checkpointBranch.then as RouteStep[];
  const continuationSteps = checkpointBranch.else as RouteStep[];
  assert.equal(checkpointThen[0]?.type, "assert");
  if (checkpointThen[0]?.type !== "assert")
    throw new Error("expected final terrain assertion");
  assert.equal(checkpointThen[0].state, "terrain-1-2-main");
  assert.equal(continuationSteps[0]?.type, "wait");
  const deviceUpgradeRepeat = continuationSteps[3];
  assert.equal(deviceUpgradeRepeat?.type, "repeat");
  if (deviceUpgradeRepeat?.type !== "repeat")
    throw new Error("expected device upgrade repeat");
  assert.equal(deviceUpgradeRepeat.times, 10);
  const deviceUpgradeSteps = deviceUpgradeRepeat.steps as RouteStep[];
  assert.equal(deviceUpgradeSteps[0]?.type, "wait");
  if (deviceUpgradeSteps[0]?.type !== "wait")
    throw new Error("expected device upgrade wait");
  assert.equal(deviceUpgradeSteps[0].state, "equipment-upgrade-window");
  assert.equal(deviceUpgradeSteps[1]?.type, "tap");
  if (deviceUpgradeSteps[1]?.type !== "tap")
    throw new Error("expected device upgrade tap");
  assert.equal(deviceUpgradeSteps[1].target, "device.upgrade.purchase");
  const targetSteps = continuationSteps.filter((step) => step.type === "tap");
  assert.deepEqual(
    targetSteps.map((step) => (step.type === "tap" ? step.target : "")),
    [
      "terrain.upgrade.close",
      "device.workshop.entry",
      "device.upgrade.close",
      "main.terrain.next.entry",
      "terrain.next.unlock",
      "terrain.transition.skip",
      "terrain.next.confirm",
      "terrain.reward.dismiss",
    ],
  );
});

test("accepts an already reached 1-2 checkpoint without tapping", async () => {
  const scratch = await mkdtemp(
    join(tmpdir(), "game-auto-reach-1-2-idempotent-"),
  );
  const screenshotPath = join(scratch, "current.png");
  const adapter = await createIdleOutpostScreenshotAdapter(
    join(root, "adapter.yaml"),
    join(root, "config", "idle-outpost-config.snapshot.json"),
    { screenshotPath },
  );
  const taps: ScreenPoint[] = [];
  const driver = {
    launch: async () => result("launch"),
    tap: async (_serial: string, point: ScreenPoint) => {
      taps.push(point);
      return result("tap");
    },
    captureScreenshot: async (_serial: string, path: string) => {
      await copyFile(
        join(evidenceRoot, "through-1-2-5037", "final-1-2.png"),
        path,
      );
      return result("screenshot");
    },
  } as unknown as DeviceDriver;

  try {
    const resultValue = await new FlowRunner(
      driver,
      adapter,
      createContext(adapter),
      { evidenceDir: scratch, sleep: async () => {} },
    ).run(await loadRouteFile(routePath));

    assert.equal(resultValue.status, "PASS");
    assert.equal(taps.length, 0);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("reaches 1-2 with ten device upgrades and no later gameplay tap", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "game-auto-reach-1-2-"));
  const stateMachine = createStateMachine();
  const adapter = await createIdleOutpostAdapter(
    join(root, "adapter.yaml"),
    join(root, "config", "idle-outpost-config.snapshot.json"),
    { stateReader: stateMachine },
  );
  const route = await loadRouteFile(routePath);
  const taps: ScreenPoint[] = [];
  const driver = {
    launch: async () => result("launch"),
    tap: async (_serial: string, point: ScreenPoint) => {
      taps.push(point);
      stateMachine.onTap();
      return result("tap");
    },
    captureScreenshot: async (_serial: string, path: string) =>
      ({ ...result("screenshot"), stdout: path }) as never,
  } as unknown as DeviceDriver;

  try {
    const resultValue = await new FlowRunner(
      driver,
      adapter,
      createContext(adapter),
      { evidenceDir: scratch, sleep: async () => {} },
    ).run(route);

    assert.equal(
      resultValue.status,
      "PASS",
      JSON.stringify(
        resultValue.steps.map((step) => ({
          id: step.stepId,
          status: step.status,
          before: step.stateBefore?.state,
          after: step.stateAfter?.state,
          failure: step.failure?.message,
        })),
      ),
    );
    assert.equal(taps.length, 18);
    assert.deepEqual(taps.slice(0, 2), [
      { x: 0.925 * 720, y: 0.394015 * 1604 },
      { x: 0.347222 * 720, y: 0.70823 * 1604 },
    ]);
    assert.equal(
      taps.filter(
        (point) => point.x === 0.319444 * 720 && point.y === 0.662718 * 1604,
      ).length,
      10,
    );
    assert.deepEqual(taps.slice(-5), [
      { x: 0.888889 * 720, y: 0.13217 * 1604 },
      { x: 0.5 * 720, y: 0.723192 * 1604 },
      { x: 0.861111 * 720, y: 0.018704 * 1604 },
      { x: 0.5 * 720, y: 0.627182 * 1604 },
      { x: 0.5 * 720, y: 0.798005 * 1604 },
    ]);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

interface StateMachine {
  read: (
    context: AdapterContext,
    driver: DeviceDriver,
    config: unknown,
  ) => Promise<{ state: string }>;
  onTap: () => void;
}

function createStateMachine(): StateMachine {
  let phase = "terrain-upgrade-all-owned";
  let deviceUpgrades = 0;
  let taps = 0;
  return {
    read: async () => {
      if (phase === "equipment-upgrade-window" && deviceUpgrades >= 10) {
        return { state: "device-upgrade-level-25" };
      }
      return { state: phase };
    },
    onTap: () => {
      taps += 1;
      if (taps === 1) phase = "new-account";
      else if (taps === 2) phase = "equipment-upgrade-window";
      else if (taps >= 3 && taps <= 12) {
        deviceUpgrades += 1;
        if (deviceUpgrades >= 10) phase = "device-upgrade-level-25";
      } else if (taps === 13) phase = "new-account";
      else if (taps === 14) phase = "next-terrain-window";
      else if (taps === 15) phase = "terrain-transition-loading";
      else if (taps === 16) phase = "terrain-1-2-new-position";
      else if (taps === 17) phase = "terrain-1-2-reward";
      else if (taps === 18) phase = "terrain-1-2-main";
    },
  };
}

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
    runId: "idle-outpost-reach-terrain-1-2",
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
