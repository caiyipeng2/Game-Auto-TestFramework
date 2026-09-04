import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type {
  CommandResult,
  DeviceDriver,
  DeviceInfo,
  InstallableArtifact,
  ScreenPoint,
} from "../packages/core/src/contracts/device-driver.js";
import type {
  AdapterContext,
  GameAdapter,
  GameIdentity,
  GameProfile,
  Locator,
  StateAssertion,
} from "../packages/core/src/contracts/game-adapter.js";
import type { StateSnapshot } from "../packages/core/src/contracts/evidence.js";
import type { RouteDefinition } from "../packages/core/src/contracts/flow.js";
import { loadRouteFile } from "../packages/core/src/flow/route-loader.js";
import { FlowRunner } from "../packages/core/src/flow/flow-runner.js";

const routePath = join(
  process.cwd(),
  "tests",
  "fixtures",
  "routes",
  "first-upgrade.yaml",
);

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
};

test("loads a YAML route and normalizes operation keys into typed steps", async () => {
  const route = await loadRouteFile(routePath);

  assert.equal(route.id, "first-upgrade");
  assert.equal(route.adapter, "fake-game");
  assert.deepEqual(
    route.steps.map((step) => step.type),
    ["wait", "tap", "assert", "screenshot"],
  );
});

test("loads lifecycle, input, repeat, and branch operations from a route file", async () => {
  const route = await loadRouteFile(
    join(process.cwd(), "tests", "fixtures", "routes", "control-flow.yaml"),
  );

  assert.deepEqual(
    route.steps.map((step) => step.type),
    ["launch", "swipe", "input", "repeat", "branch"],
  );
});

test("executes generic lifecycle, input, repeat, branch, and evidence steps", async () => {
  const root = await mkdtemp(join(tmpdir(), "game-auto-flow-"));
  const adapter = new FakeAdapter();
  const driver = new FakeDeviceDriver(adapter);
  const context: AdapterContext = {
    runId: "run-controls",
    device,
    artifact,
    profile: adapter.profiles()[0],
    variables: {},
  };

  try {
    const route = await loadRouteFile(
      join(process.cwd(), "tests", "fixtures", "routes", "control-flow.yaml"),
    );
    const result = await new FlowRunner(driver, adapter, context, {
      evidenceDir: root,
    }).run(route);

    assert.equal(result.status, "PASS");
    assert.deepEqual(driver.swipes, [
      { start: { x: 100, y: 200 }, end: { x: 100, y: 600 }, durationMs: 300 },
    ]);
    assert.deepEqual(driver.inputs, ["test-name"]);
    assert.equal(driver.taps.length, 2);
    assert.equal(driver.swipes[0].durationMs, 300);
    assert.equal(result.steps.length, 5);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("passes a route account policy to adapter preparation", async () => {
  const root = await mkdtemp(join(tmpdir(), "game-auto-flow-policy-"));
  const adapter = new FakeAdapter();
  const driver = new FakeDeviceDriver(adapter);
  const context: AdapterContext = {
    runId: "run-policy",
    device,
    artifact,
    profile: adapter.profiles()[0],
    variables: {},
  };
  const route = {
    schemaVersion: 1,
    id: "preserve-account",
    adapter: "fake-game",
    accountPolicy: "preserve",
    steps: [{ id: "capture", type: "screenshot", name: "policy" }],
  } as unknown as RouteDefinition;

  try {
    await new FlowRunner(driver, adapter, context, {
      evidenceDir: root,
    }).run(route);
    assert.deepEqual(adapter.preparationPolicy, { accountPolicy: "preserve" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects a route without required metadata", async () => {
  await assert.rejects(
    () => loadRouteFile(join(tmpdir(), "missing-route.yaml")),
    (error: unknown) => error instanceof Error && /route/i.test(error.message),
  );
});

test("waits for state, resolves a logical target, taps through the driver, and records evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "game-auto-flow-"));
  const adapter = new FakeAdapter();
  const driver = new FakeDeviceDriver(adapter);
  const context: AdapterContext = {
    runId: "run-1",
    device,
    artifact,
    profile: adapter.profiles()[0],
    variables: {},
  };

  try {
    const route = await loadRouteFile(routePath);
    const result = await new FlowRunner(driver, adapter, context, {
      evidenceDir: root,
    }).run(route);

    assert.equal(result.status, "PASS");
    assert.deepEqual(adapter.preparationPolicy, {
      accountPolicy: "reset-existing",
    });
    assert.equal(result.steps.length, 4);
    assert.deepEqual(driver.taps, [{ x: 110, y: 220 }]);
    assert.equal(
      result.steps.every((step) => step.status === "PASS"),
      true,
    );
    assert.equal(
      result.steps.every((step) => step.startedAt && step.finishedAt),
      true,
    );
    assert.equal(result.steps[2].stateAfter?.upgradeOwned, true);
    assert.match(
      await readFile(join(root, "after-first-upgrade.png"), "utf8"),
      /fixture screenshot/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("fails a route with an unsupported native selector before sending an ADB tap", async () => {
  const root = await mkdtemp(join(tmpdir(), "game-auto-flow-"));
  const adapter = new NativeSelectorAdapter();
  const driver = new FakeDeviceDriver(adapter);
  const context: AdapterContext = {
    runId: "run-native",
    device,
    artifact,
    profile: adapter.profiles()[0],
    variables: {},
  };

  try {
    const route = await loadRouteFile(routePath);
    const result = await new FlowRunner(driver, adapter, context, {
      evidenceDir: root,
    }).run({
      ...route,
      steps: [route.steps[1]],
    });

    assert.equal(result.status, "FAIL");
    assert.equal(result.steps[0].failure?.category, "NATIVE_UI_LOCATOR");
    assert.deepEqual(driver.taps, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

class FakeAdapter implements GameAdapter {
  readonly id = "fake-game";
  readonly contractVersion = "1.0";
  upgraded = false;
  preparationPolicy: unknown;

  identity(): GameIdentity {
    return {
      id: this.id,
      displayName: "Fake Game",
      packageId: "com.example.fake",
      launchActivity: "MainActivity",
    };
  }

  profiles(): readonly GameProfile[] {
    return [{ id: "test", environment: "fixture", settings: {} }];
  }

  async prepareContext(
    _context?: AdapterContext,
    _driver?: DeviceDriver,
    options?: unknown,
  ): Promise<void> {
    this.preparationPolicy = options;
  }

  async waitReady(): Promise<StateSnapshot> {
    return this.readState();
  }

  async resolveTarget(): Promise<Locator> {
    return {
      kind: "screen-rect",
      x: 100,
      y: 200,
      width: 20,
      height: 40,
      coordinateSpace: "physical-pixels",
    };
  }

  async readState(): Promise<StateSnapshot> {
    return {
      state: this.upgraded ? "gameplay" : "main-screen",
      upgradeOwned: this.upgraded,
    };
  }

  async assertState(assertion: StateAssertion): Promise<void> {
    const state = await this.readState();
    if (assertion.state !== state.state && assertion.state !== "gameplay") {
      throw new Error(`Unexpected state: ${assertion.state}`);
    }
    if (assertion.field && state[assertion.field] !== assertion.expected) {
      throw new Error(`Assertion failed: ${assertion.field}`);
    }
  }

  async cleanupContext(): Promise<void> {}
}

class NativeSelectorAdapter extends FakeAdapter {
  async resolveTarget(): Promise<Locator> {
    return { kind: "native-selector", strategy: "text", value: "Upgrade" };
  }
}

class FakeDeviceDriver implements DeviceDriver {
  readonly taps: ScreenPoint[] = [];
  readonly swipes: Array<{
    start: ScreenPoint;
    end: ScreenPoint;
    durationMs: number;
  }> = [];
  readonly inputs: string[] = [];

  constructor(private readonly adapter: FakeAdapter) {}

  async listDevices(): Promise<readonly DeviceInfo[]> {
    return [device];
  }

  async inspectDevice(): Promise<DeviceInfo> {
    return device;
  }

  async installArtifact(): Promise<CommandResult> {
    return this.result("install");
  }

  async clearData(): Promise<CommandResult> {
    return this.result("clearData");
  }

  async launch(): Promise<CommandResult> {
    return this.result("launch");
  }

  async tap(_serial: string, point: ScreenPoint): Promise<CommandResult> {
    this.taps.push(point);
    this.adapter.upgraded = true;
    return this.result("tap");
  }

  async swipe(
    _serial: string,
    start: ScreenPoint,
    end: ScreenPoint,
    durationMs: number,
  ): Promise<CommandResult> {
    this.swipes.push({ start, end, durationMs });
    return this.result("swipe");
  }

  async inputText(_serial: string, text: string): Promise<CommandResult> {
    this.inputs.push(text);
    return this.result("inputText");
  }

  async captureScreenshot(
    _serial: string,
    outputPath: string,
  ): Promise<CommandResult> {
    await writeFile(outputPath, "fixture screenshot", "utf8");
    return { ...this.result("screenshot"), stdout: outputPath };
  }

  async captureLogcat(): Promise<CommandResult> {
    return this.result("logcat");
  }

  async collectPerformance(): Promise<CommandResult> {
    return this.result("performance");
  }

  supports(
    capability:
      | "installArtifact"
      | "clearData"
      | "launch"
      | "input"
      | "screenshot"
      | "logcat"
      | "performance"
      | "uiHierarchy",
  ): boolean {
    return capability !== "uiHierarchy";
  }

  private result(name: string): CommandResult {
    return {
      command: name,
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 1,
    };
  }
}
