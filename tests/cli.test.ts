import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type {
  CommandResult,
  DeviceDriver,
  DeviceInfo,
  InstallableArtifact,
  ScreenPoint,
} from "../packages/core/src/contracts/device-driver.js";
import {
  FrameworkError,
  type StateSnapshot,
} from "../packages/core/src/contracts/evidence.js";
import type {
  AdapterContext,
  GameAdapter,
  GameIdentity,
  GameProfile,
  Locator,
  StateAssertion,
} from "../packages/core/src/contracts/game-adapter.js";
import {
  writeJsonReport,
  type JsonReport,
} from "../packages/report-engine/src/json-report.js";
import { renderJunitXml } from "../packages/report-engine/src/junit-report.js";
import { CLI_EXIT_CODES, runCli } from "../cli/src/main.js";

const fixtureRoute = join(
  process.cwd(),
  "tests",
  "fixtures",
  "routes",
  "first-upgrade.yaml",
);

const fixtureDevice: DeviceInfo = {
  serial: "fixture-device",
  model: "Fixture Phone",
  apiLevel: 36,
  supportedAbis: ["arm64-v8a"],
  display: { width: 1080, height: 2340, density: 450 },
};

test("writes a redacted JSON report to the requested run directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "game-auto-report-"));
  const outputPath = join(root, "run-1", "device_1", "run.json");
  const report: JsonReport = {
    schemaVersion: 1,
    kind: "run",
    runId: "run-1",
    serial: "device:1",
    status: "PASS",
    startedAt: "2026-09-01T00:00:00.000Z",
    finishedAt: "2026-09-01T00:00:01.000Z",
    metadata: {
      accessToken: "token-value",
      nested: { signingKey: "private-value" },
    },
    steps: [],
  };

  try {
    await writeJsonReport(report, outputPath);

    const serialized = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(serialized) as JsonReport;
    assert.equal(parsed.status, "PASS");
    assert.equal(
      (parsed.metadata as { accessToken: string }).accessToken,
      "[REDACTED]",
    );
    assert.doesNotMatch(serialized, /token-value|private-value/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("maps a failed step to a JUnit failure and escapes XML content", () => {
  const report: JsonReport = {
    schemaVersion: 1,
    kind: "run",
    runId: "run-2",
    serial: "fixture-device",
    status: "FAIL",
    startedAt: "2026-09-01T00:00:00.000Z",
    finishedAt: "2026-09-01T00:00:02.000Z",
    steps: [
      {
        stepId: "assert-result",
        status: "FAIL",
        startedAt: "2026-09-01T00:00:01.000Z",
        finishedAt: "2026-09-01T00:00:02.000Z",
        artifacts: [],
        failure: {
          category: "BUSINESS_ASSERTION",
          message: "value <expected> & actual",
        },
      },
    ],
  };

  const xml = renderJunitXml(report);

  assert.match(xml, /tests="1"/);
  assert.match(xml, /failures="1"/);
  assert.match(xml, /type="BUSINESS_ASSERTION"/);
  assert.match(xml, /value &lt;expected&gt; &amp; actual/);
});

test("runs a fake route, writes JSON and JUnit reports, and returns test-failure exit code", async () => {
  const root = await mkdtemp(join(tmpdir(), "game-auto-cli-"));
  const artifactPath = join(root, "fixture.apk");
  const outputDir = join(root, "reports");
  await writeFile(artifactPath, "fixture apk");
  const adapter = new FailingAdapter();
  const driver = new FakeDeviceDriver();
  const messages: string[] = [];

  try {
    const exitCode = await runCli(
      [
        "run",
        "--adapter",
        "fake-game",
        "--route",
        fixtureRoute,
        "--serial",
        fixtureDevice.serial,
        "--artifact",
        artifactPath,
        "--output-dir",
        outputDir,
        "--run-id",
        "controlled-failure",
      ],
      {
        driver,
        adapters: [adapter],
        write: (message) => messages.push(message),
      },
    );

    assert.equal(exitCode, CLI_EXIT_CODES.TEST_FAILURE);
    const reportDir = join(outputDir, "controlled-failure", "fixture-device");
    const report = JSON.parse(
      await readFile(join(reportDir, "run.json"), "utf8"),
    ) as JsonReport;
    assert.equal(report.status, "FAIL");
    assert.equal(report.steps?.[2]?.failure?.category, "BUSINESS_ASSERTION");
    await stat(join(reportDir, "junit.xml"));
    assert.ok(messages.some((message) => message.includes("run.json")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("returns an argument error when a run omits its route", async () => {
  const messages: string[] = [];

  const exitCode = await runCli(["run", "--adapter", "fake-game"], {
    writeError: (message) => messages.push(message),
  });

  assert.equal(exitCode, CLI_EXIT_CODES.INVALID_ARGUMENTS);
  assert.ok(messages.some((message) => message.includes("--route")));
});

class FailingAdapter implements GameAdapter {
  readonly id = "fake-game";
  readonly contractVersion = "1.0";

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

  async prepareContext(): Promise<void> {}

  async waitReady(): Promise<StateSnapshot> {
    return this.readState();
  }

  async resolveTarget(): Promise<Locator> {
    return { kind: "normalized-point", x: 0.5, y: 0.5 };
  }

  async readState(): Promise<StateSnapshot> {
    return { state: "main-screen" };
  }

  async assertState(assertion: StateAssertion): Promise<void> {
    throw new FrameworkError(
      `controlled failure for ${assertion.state}`,
      "BUSINESS_ASSERTION",
    );
  }

  async cleanupContext(): Promise<void> {}
}

class FakeDeviceDriver implements DeviceDriver {
  async listDevices(): Promise<readonly DeviceInfo[]> {
    return [fixtureDevice];
  }

  async inspectDevice(): Promise<DeviceInfo> {
    return fixtureDevice;
  }

  async installArtifact(): Promise<CommandResult> {
    return this.result("install");
  }

  async clearData(): Promise<CommandResult> {
    return this.result("clear-data");
  }

  async launch(): Promise<CommandResult> {
    return this.result("launch");
  }

  async tap(): Promise<CommandResult> {
    return this.result("tap");
  }

  async swipe(): Promise<CommandResult> {
    return this.result("swipe");
  }

  async inputText(): Promise<CommandResult> {
    return this.result("input");
  }

  async captureScreenshot(): Promise<CommandResult> {
    return this.result("screenshot");
  }

  async captureLogcat(): Promise<CommandResult> {
    return this.result("logcat");
  }

  async collectPerformance(): Promise<CommandResult> {
    return this.result("performance");
  }

  supports(): boolean {
    return true;
  }

  private result(command: string): CommandResult {
    return {
      command,
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 1,
    };
  }
}

void (undefined as unknown as InstallableArtifact);
void (undefined as unknown as ScreenPoint);
void (undefined as unknown as AdapterContext);
