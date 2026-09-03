import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";

import type {
  AdapterContext,
  GameAdapter,
} from "../packages/core/src/contracts/game-adapter.js";
import type {
  DeviceDriver,
  DeviceInfo,
  InstallableArtifact,
} from "../packages/core/src/contracts/device-driver.js";
import { FrameworkError } from "../packages/core/src/contracts/evidence.js";
import {
  createIdleOutpostAdapter,
  IdleOutpostStartupOverlayHandler,
  ScreenshotAccountStateReader,
  IdleOutpostUiAccountResetter,
  runIdleOutpostAccountResetFlow,
  SnapshotAccountStateReader,
  type IdleOutpostAccountMode,
} from "../adapters/idle-outpost/src/idle-outpost-adapter.js";

const adapterRoot = join(process.cwd(), "adapters", "idle-outpost");
const manifestPath = join(adapterRoot, "adapter.yaml");
const configPath = join(
  adapterRoot,
  "config",
  "idle-outpost-config.snapshot.json",
);

test("skips the destructive reset flow when the account detector reports a new account", async () => {
  let resetCalls = 0;
  let launchCalls = 0;
  const adapter = await createIdleOutpostAdapter(manifestPath, configPath, {
    accountStateReader: {
      async readAccountMode(): Promise<IdleOutpostAccountMode> {
        return "new";
      },
    },
    accountResetter: {
      async reset(): Promise<void> {
        resetCalls += 1;
      },
    },
  });

  await adapter.prepareContext(
    createContext(adapter),
    createLaunchDriver(() => {
      launchCalls += 1;
    }),
  );

  assert.equal(resetCalls, 0);
  assert.equal(launchCalls, 1);
});

test("blocks preparation when no account detector is configured", async () => {
  const adapter = await createIdleOutpostAdapter(manifestPath, configPath);

  await assert.rejects(
    () =>
      adapter.prepareContext(
        createContext(adapter),
        createLaunchDriver(() => {}),
      ),
    (error: unknown) =>
      error instanceof FrameworkError &&
      error.category === "HOST_TOOL" &&
      /account detector/i.test(error.message),
  );
});

test("runs the reset flow for an existing account and verifies the post-restart new account state", async () => {
  let resetCalls = 0;
  let launchCalls = 0;
  const detectedModes: IdleOutpostAccountMode[] = ["existing", "new"];
  const adapter = await createIdleOutpostAdapter(manifestPath, configPath, {
    accountStateReader: {
      async readAccountMode(): Promise<IdleOutpostAccountMode> {
        return detectedModes.shift() ?? "existing";
      },
    },
    accountResetter: {
      async reset(): Promise<void> {
        resetCalls += 1;
      },
    },
  });

  await adapter.prepareContext(
    createContext(adapter),
    createLaunchDriver(() => {
      launchCalls += 1;
    }),
  );

  assert.equal(resetCalls, 1);
  assert.equal(launchCalls, 1);
  assert.deepEqual(detectedModes, []);
});

test("executes the account reset actions in the user-confirmed order", async () => {
  const events: string[] = [];
  const actions = {
    async tapTarget(targetId: string): Promise<void> {
      events.push(`tap:${targetId}`);
    },
    async waitForState(state: string): Promise<void> {
      events.push(`wait:${state}`);
    },
    async launch(): Promise<void> {
      events.push("launch");
    },
  };

  await runIdleOutpostAccountResetFlow(actions);

  assert.deepEqual(events, [
    "tap:main.settings.entry",
    "wait:settings-menu",
    "tap:settings.account",
    "wait:account-detail-existing",
    "tap:account.delete-archive",
    "wait:delete-account-confirm",
    "tap:account.delete-confirm",
    "wait:delete-account-success",
    "tap:account.restart-game",
    "launch",
    "wait:new-account",
  ]);
});

test("dismisses known startup overlays before account classification", async () => {
  const states = [
    "startup-vip-offer",
    "startup-offline-income",
    "startup-free-coins",
    "startup-network-error",
    "main-screen",
  ];
  const events: string[] = [];
  const reader = {
    async read(): Promise<{ state: string }> {
      return { state: states.shift() ?? "main-screen" };
    },
  };
  const adapter = await createIdleOutpostAdapter(manifestPath, configPath);
  const driver = {
    tap: async (_serial: string, point: { x: number; y: number }) => {
      events.push(`tap:${point.x.toFixed(2)},${point.y.toFixed(2)}`);
      return {
        command: "tap",
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 1,
      };
    },
  } as unknown as DeviceDriver;

  await new IdleOutpostStartupOverlayHandler(reader).dismiss(
    createContext(adapter),
    driver,
    adapter,
  );

  assert.equal(events.length, 4);
});

test("derives account mode from normalized state snapshots", async () => {
  const reader = new SnapshotAccountStateReader();
  const context = {} as AdapterContext;
  const driver = {} as DeviceDriver;
  const config = {} as never;

  assert.equal(
    await reader.readAccountMode(context, driver, config, async () => ({
      state: "new-account",
    })),
    "new",
  );
  assert.equal(
    await reader.readAccountMode(context, driver, config, async () => ({
      state: "main-screen",
    })),
    "existing",
  );
});

test("classifies an ADB screenshot into a normalized account state", async () => {
  const calls: string[] = [];
  const adapter = await createIdleOutpostAdapter(manifestPath, configPath);
  const reader = new ScreenshotAccountStateReader({
    screenshotPath: "reports/account-state.png",
    templateRoot: process.cwd(),
    matcher: {
      async match(
        _screenshotPath: string,
        templatePath: string,
      ): Promise<{
        matched: boolean;
        score: number;
        threshold: number;
        region: { x: number; y: number; width: number; height: number };
      }> {
        calls.push(templatePath);
        const isNewAccount = templatePath.endsWith("new-account.png");
        return {
          matched: isNewAccount,
          score: isNewAccount ? 0.98 : 0.42,
          threshold: 0.9,
          region: { x: 0, y: 0, width: 0.2, height: 0.2 },
        };
      },
    },
    templates: [
      {
        state: "existing-account",
        accountMode: "existing",
        path: "existing-account.png",
        region: { x: 0, y: 0, width: 0.2, height: 0.2 },
        threshold: 0.9,
      },
      {
        state: "new-account",
        accountMode: "new",
        path: "new-account.png",
        region: { x: 0, y: 0, width: 0.2, height: 0.2 },
        threshold: 0.9,
      },
    ],
  });
  const driver = {
    captureScreenshot: async (_serial: string, path: string) => {
      assert.equal(path, "reports/account-state.png");
      return {
        command: "screenshot",
        exitCode: 0,
        stdout: path,
        stderr: "",
        durationMs: 1,
      };
    },
  } as unknown as DeviceDriver;

  const snapshot = await reader.read(
    createContext(adapter),
    driver,
    adapter.config,
  );

  assert.equal(snapshot.state, "new-account");
  assert.equal(snapshot.accountMode, "new");
  assert.deepEqual(
    calls.map((path) => path.split(/[\\/]/).pop()),
    ["existing-account.png", "new-account.png"],
  );
});

test("resolves configured normalized reset targets into device coordinates", async () => {
  const states = [
    "settings-menu",
    "account-detail-existing",
    "delete-account-confirm",
    "delete-account-success",
    "new-account",
  ];
  const taps: Array<{ x: number; y: number }> = [];
  const adapter = await createIdleOutpostAdapter(manifestPath, configPath, {
    stateReader: {
      async read(): Promise<{ state: string }> {
        return { state: states.shift() ?? "new-account" };
      },
    },
  });
  const driver = {
    tap: async (_serial: string, point: { x: number; y: number }) => {
      taps.push(point);
      return {
        command: "tap",
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 1,
      };
    },
    launch: async () => ({
      command: "launch",
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 1,
    }),
  } as unknown as DeviceDriver;

  await new IdleOutpostUiAccountResetter({ sleep: async () => {} }).reset(
    createContext(adapter),
    driver,
    adapter,
  );

  assert.deepEqual(taps, [
    { x: 0.95 * 720, y: 0.05 * 1604 },
    { x: 0.833333 * 720, y: 0.112219 * 1604 },
    { x: 0.5 * 720, y: 0.729426 * 1604 },
    { x: 0.291667 * 720, y: 0.532419 * 1604 },
    { x: 0.5 * 720, y: 0.532419 * 1604 },
  ]);
});

test("exposes the next-scene dialog close action as a normalized target", async () => {
  const adapter = await createIdleOutpostAdapter(manifestPath, configPath);

  assert.deepEqual(
    await adapter.resolveTarget(
      "tutorial.next-scene.close",
      createContext(adapter),
    ),
    {
      kind: "normalized-point",
      x: 0.888889,
      y: 0.261845,
    },
  );
});

test("exposes the chapter1 entry as a normalized target", async () => {
  const adapter = await createIdleOutpostAdapter(manifestPath, configPath);

  assert.deepEqual(
    await adapter.resolveTarget(
      "tutorial.chapter1.entry",
      createContext(adapter),
    ),
    {
      kind: "normalized-point",
      x: 0.888889,
      y: 0.13217,
    },
  );
});

test("exposes the equipment upgrade action as a normalized target", async () => {
  const adapter = await createIdleOutpostAdapter(manifestPath, configPath);

  assert.deepEqual(
    await adapter.resolveTarget(
      "tutorial.equipment.upgrade",
      createContext(adapter),
    ),
    {
      kind: "normalized-point",
      x: 0.319444,
      y: 0.664589,
    },
  );
});

function createContext(adapter: GameAdapter): AdapterContext {
  const device: DeviceInfo = {
    serial: "fixture-device",
    model: "Fixture Phone",
    apiLevel: 36,
    supportedAbis: ["arm64-v8a"],
    display: { width: 720, height: 1604, density: 320 },
  };
  const artifact: InstallableArtifact = {
    path: "fixture.apks",
    kind: "apks",
    packageId: adapter.identity().packageId,
  };
  return {
    runId: "account-reset-fixture",
    device,
    artifact,
    profile: adapter.profiles()[0]!,
    variables: {},
  };
}

function createLaunchDriver(onLaunch: () => void): DeviceDriver {
  return {
    launch: async () => {
      onLaunch();
      return {
        command: "launch",
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 1,
      };
    },
  } as unknown as DeviceDriver;
}
