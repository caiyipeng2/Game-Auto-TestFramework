import assert from "node:assert/strict";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import type {
  DeviceDriver,
  DeviceInfo,
} from "../packages/core/src/contracts/device-driver.js";
import type {
  AdapterContext,
  GameAdapter,
} from "../packages/core/src/contracts/game-adapter.js";
import { FrameworkError } from "../packages/core/src/contracts/evidence.js";
import { PngTemplateMatcher } from "../packages/screen-recognition/src/png-template-matcher.js";
import {
  ScreenshotAccountStateReader,
  createIdleOutpostScreenshotAdapter,
} from "../adapters/idle-outpost/src/idle-outpost-adapter.js";
import { readIdleOutpostManifest } from "../adapters/idle-outpost/src/config-reader.js";

const root = join(process.cwd(), "adapters", "idle-outpost");
const manifestPath = join(root, "adapter.yaml");
const evidenceRoot = join(
  process.cwd(),
  "reports",
  "t8-real-device",
  "ZT4229J5ZR",
);

test("classifies real existing-account and new-account screenshots", async () => {
  const manifest = await readIdleOutpostManifest(manifestPath);
  const scratch = await mkdtemp(join(tmpdir(), "game-auto-idle-vision-"));
  const screenshotPath = join(scratch, "current.png");
  const adapter = {
    identity: () => ({
      id: "idle-outpost",
      displayName: "Idle Outpost",
      packageId: "com.hg.idleweaponshoptycoon.android",
      launchActivity: "com.unity3d.player.UnityPlayerActivity",
    }),
    profiles: () => manifest.profiles,
  } as unknown as GameAdapter;
  const context = createContext(adapter);

  try {
    const reader = new ScreenshotAccountStateReader({
      screenshotPath,
      templateRoot: root,
      matcher: new PngTemplateMatcher(),
      templates: manifest.stateTemplates,
    });

    const existing = await reader.read(
      context,
      createScreenshotDriver(
        join(evidenceRoot, "after-free-coins-dismiss.png"),
        screenshotPath,
      ),
      {} as never,
    );
    assert.equal(existing.state, "main-screen");
    assert.equal(existing.accountMode, "existing");

    const fresh = await reader.read(
      context,
      createScreenshotDriver(
        join(evidenceRoot, "new-account-startup-20s.png"),
        screenshotPath,
      ),
      {} as never,
    );
    assert.equal(fresh.state, "new-account");
    assert.equal(fresh.accountMode, "new");

    const existingTemplate = manifest.stateTemplates.find(
      (template) => template.state === "main-screen",
    )!;
    const newTemplate = manifest.stateTemplates.find(
      (template) => template.state === "new-account",
    )!;
    const existingVsNew = await new PngTemplateMatcher().match(
      join(evidenceRoot, "after-free-coins-dismiss.png"),
      join(root, newTemplate.path),
      { region: newTemplate.region, threshold: newTemplate.threshold },
    );
    const newVsExisting = await new PngTemplateMatcher().match(
      join(evidenceRoot, "new-account-startup-20s.png"),
      join(root, existingTemplate.path),
      {
        region: existingTemplate.region,
        threshold: existingTemplate.threshold,
      },
    );
    assert.equal(existingVsNew.matched, false);
    assert.equal(newVsExisting.matched, false);

    const intermediateStates = [
      ["current-unlocked.png", "startup-vip-offer"],
      ["after-vip-close.png", "startup-offline-income"],
      ["after-offline-income.png", "startup-free-coins"],
      ["before-account-reset.png", "settings-menu"],
      ["account-window-before-delete.png", "account-detail-existing"],
      ["delete-archive-confirm.png", "delete-account-confirm"],
      ["after-delete-confirm-5s.png", "delete-account-success"],
    ] as const;
    for (const [fileName, expectedState] of intermediateStates) {
      const state = await reader.read(
        context,
        createScreenshotDriver(join(evidenceRoot, fileName), screenshotPath),
        {} as never,
      );
      assert.equal(state.state, expectedState);
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("builds a screenshot-backed adapter that skips reset for a real new-account screen", async () => {
  const scratch = await mkdtemp(join(tmpdir(), "game-auto-idle-adapter-"));
  const screenshotPath = join(scratch, "current.png");
  const adapter = await createIdleOutpostScreenshotAdapter(
    manifestPath,
    join(root, "config", "idle-outpost-config.snapshot.json"),
    { screenshotPath },
  );
  const context = createContext(adapter);
  let resetTaps = 0;
  const driver = {
    launch: async () => ({
      command: "launch",
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 1,
    }),
    captureScreenshot: async () => {
      await copyFile(
        join(evidenceRoot, "new-account-startup-20s.png"),
        screenshotPath,
      );
      return {
        command: "screenshot",
        exitCode: 0,
        stdout: screenshotPath,
        stderr: "",
        durationMs: 1,
      };
    },
    tap: async () => {
      resetTaps += 1;
      return {
        command: "tap",
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 1,
      };
    },
  } as unknown as DeviceDriver;

  try {
    await adapter.prepareContext(context, driver);
    assert.equal(resetTaps, 0);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test("blocks an unknown screenshot instead of defaulting to a new account", async () => {
  const reader = new ScreenshotAccountStateReader({
    screenshotPath: "reports/unknown.png",
    templateRoot: process.cwd(),
    matcher: {
      async match() {
        return {
          matched: false,
          score: 0.2,
          threshold: 0.84,
          region: { x: 0, y: 0, width: 1, height: 1 },
        };
      },
    },
    templates: [
      {
        state: "new-account",
        accountMode: "new",
        path: "unknown.png",
        region: { x: 0, y: 0, width: 1, height: 1 },
        threshold: 0.84,
      },
    ],
  });
  const adapter = await readIdleOutpostManifest(manifestPath);
  const context = createContext({
    identity: () => ({
      id: adapter.id,
      displayName: adapter.displayName,
      packageId: adapter.identity.packageId,
      launchActivity: adapter.identity.launchActivity,
    }),
    profiles: () => adapter.profiles,
  } as unknown as GameAdapter);
  const driver = {
    captureScreenshot: async () => ({
      command: "screenshot",
      exitCode: 0,
      stdout: "reports/unknown.png",
      stderr: "",
      durationMs: 1,
    }),
  } as unknown as DeviceDriver;

  await assert.rejects(
    () => reader.read(context, driver, {} as never),
    (error: unknown) =>
      error instanceof FrameworkError && error.category === "DEVICE_STATE",
  );
});

test("retries transient unknown screenshot frames within a bounded budget", async () => {
  let screenshotCount = 0;
  const reader = new ScreenshotAccountStateReader({
    screenshotPath: "reports/transient.png",
    templateRoot: process.cwd(),
    matcher: {
      async match() {
        return {
          matched: screenshotCount > 1,
          score: screenshotCount > 1 ? 0.95 : 0.1,
          threshold: 0.84,
          region: { x: 0, y: 0, width: 1, height: 1 },
        };
      },
    },
    templates: [
      {
        state: "new-account",
        accountMode: "new",
        path: "new-account.png",
        region: { x: 0, y: 0, width: 1, height: 1 },
        threshold: 0.84,
      },
    ],
    retryCount: 1,
    retryDelayMs: 0,
    sleep: async () => {},
  });
  const driver = {
    captureScreenshot: async () => {
      screenshotCount += 1;
      return {
        command: "screenshot",
        exitCode: 0,
        stdout: "reports/transient.png",
        stderr: "",
        durationMs: 1,
      };
    },
  } as unknown as DeviceDriver;
  const manifest = await readIdleOutpostManifest(manifestPath);
  const context = createContext({
    identity: () => manifest.identity,
    profiles: () => manifest.profiles,
  } as unknown as GameAdapter);

  const state = await reader.read(context, driver, {} as never);

  assert.equal(state.state, "new-account");
  assert.equal(screenshotCount, 2);
});

function createScreenshotDriver(
  sourcePath: string,
  targetPath: string,
): DeviceDriver {
  return {
    captureScreenshot: async () => {
      await copyFile(sourcePath, targetPath);
      return {
        command: "screenshot",
        exitCode: 0,
        stdout: targetPath,
        stderr: "",
        durationMs: 1,
      };
    },
  } as unknown as DeviceDriver;
}

function createContext(adapter: GameAdapter): AdapterContext {
  const device: DeviceInfo = {
    serial: "fixture-device",
    model: "Fixture Phone",
    apiLevel: 36,
    supportedAbis: ["arm64-v8a"],
    display: { width: 720, height: 1604, density: 280 },
  };
  return {
    runId: "screenshot-state-fixture",
    device,
    artifact: {
      path: "fixture.apks",
      kind: "apks",
      packageId: adapter.identity().packageId,
    },
    profile: adapter.profiles()[0]!,
    variables: {},
  };
}
