import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import type {
  DeviceDriver,
  DeviceInfo,
  InstallableArtifact,
} from "../packages/core/src/contracts/device-driver.js";
import type {
  AdapterContext,
  GameAdapter,
} from "../packages/core/src/contracts/game-adapter.js";
import { loadRouteFile } from "../packages/core/src/flow/route-loader.js";
import {
  IdleOutpostConfigReader,
  readIdleOutpostConfig,
  readIdleOutpostManifest,
} from "../adapters/idle-outpost/src/config-reader.js";
import { createIdleOutpostAdapter } from "../adapters/idle-outpost/src/idle-outpost-adapter.js";

const adapterRoot = join(process.cwd(), "adapters", "idle-outpost");
const manifestPath = join(adapterRoot, "adapter.yaml");
const configPath = join(
  adapterRoot,
  "config",
  "idle-outpost-config.snapshot.json",
);
const routePath = join(adapterRoot, "routes", "first-upgrade.yaml");

test("reads the Idle_Outpost manifest and verified config snapshot", async () => {
  const manifest = await readIdleOutpostManifest(manifestPath);
  const config = await readIdleOutpostConfig(configPath);
  const reader = new IdleOutpostConfigReader(config);
  const facts = reader.getFirstUpgradeFacts();

  assert.equal(manifest.id, "idle-outpost");
  assert.equal(
    manifest.identity.packageId,
    "com.hg.idleweaponshoptycoon.android",
  );
  assert.equal(
    manifest.identity.launchActivity,
    "com.unity3d.player.UnityPlayerActivity",
  );
  assert.equal(manifest.profiles[0]?.id, "test-server-v63");
  assert.equal(facts.system.id, 2);
  assert.equal(facts.terrain.id, 1);
  assert.equal(facts.firstUpgrade.upgradeId, 1);
  assert.equal(facts.firstUpgrade.needCoin, 13);
  assert.equal(facts.guides.entry.id, "TerrainUpgeade1");
  assert.equal(facts.guides.firstUpgrade.id, "TerrainUpgeade3");
});

test("exposes logical targets and state assertions without leaking Unity details into core", async () => {
  const adapter = await createIdleOutpostAdapter(manifestPath, configPath, {
    stateReader: {
      read: async () => ({
        state: "terrain-upgrade-owned",
        upgradeOwned: true,
        currentTerrainId: 1,
        coin: 42,
      }),
    },
  });
  const context = createContext(adapter);

  const entryLocator = await adapter.resolveTarget(
    "main.terrain.upgrade.entry",
    context,
  );
  const firstUpgradeLocator = await adapter.resolveTarget(
    "terrain.upgrade.first",
    context,
  );

  assert.deepEqual(entryLocator, {
    kind: "image-template",
    path: "locators/main-terrain-upgrade-entry.png",
    threshold: 0.86,
  });
  assert.deepEqual(firstUpgradeLocator, {
    kind: "image-template",
    path: "locators/terrain-upgrade-first.png",
    threshold: 0.86,
  });

  await adapter.assertState(
    {
      state: "terrain-upgrade-owned",
      field: "upgradeOwned",
      operator: "equals",
      expected: true,
    },
    context,
    new NoopDeviceDriver(),
  );
});

test("keeps the first route in logical player actions and verified preconditions", async () => {
  const route = await loadRouteFile(routePath);

  assert.equal(route.adapter, "idle-outpost");
  assert.deepEqual(
    route.steps.map((step) => step.type),
    ["wait", "wait", "tap", "wait", "wait", "tap", "assert", "screenshot"],
  );
  assert.deepEqual(
    route.preconditions?.map((precondition) => precondition.context),
    ["account-ready", "logged-in"],
  );
  const entryStep = route.steps[2];
  if (entryStep?.type !== "tap") throw new Error("entry step must be a tap");
  assert.equal(entryStep.target, "main.terrain.upgrade.entry");
  const firstUpgradeStep = route.steps[5];
  if (firstUpgradeStep?.type !== "tap") {
    throw new Error("first upgrade step must be a tap");
  }
  assert.equal(firstUpgradeStep.target, "terrain.upgrade.first");
});

function createContext(adapter: GameAdapter): AdapterContext {
  const device: DeviceInfo = {
    serial: "fixture-device",
    model: "Fixture Phone",
    apiLevel: 36,
    supportedAbis: ["arm64-v8a"],
    display: { width: 1080, height: 2340, density: 450 },
  };
  const artifact: InstallableArtifact = {
    path: "fixture.apks",
    kind: "apks",
    packageId: "com.hg.idleweaponshoptycoon.android",
  };
  return {
    runId: "fixture-run",
    device,
    artifact,
    profile: adapter.profiles()[0]!,
    variables: {},
  };
}

class NoopDeviceDriver implements DeviceDriver {
  async listDevices(): Promise<readonly DeviceInfo[]> {
    return [];
  }

  async inspectDevice(): Promise<DeviceInfo> {
    throw new Error("not used");
  }

  async installArtifact(): Promise<never> {
    throw new Error("not used");
  }

  async clearData(): Promise<never> {
    throw new Error("not used");
  }

  async launch(): Promise<never> {
    throw new Error("not used");
  }

  async tap(): Promise<never> {
    throw new Error("not used");
  }

  async swipe(): Promise<never> {
    throw new Error("not used");
  }

  async inputText(): Promise<never> {
    throw new Error("not used");
  }

  async captureScreenshot(): Promise<never> {
    throw new Error("not used");
  }

  async captureLogcat(): Promise<never> {
    throw new Error("not used");
  }

  async collectPerformance(): Promise<never> {
    throw new Error("not used");
  }

  supports(): boolean {
    return false;
  }
}
