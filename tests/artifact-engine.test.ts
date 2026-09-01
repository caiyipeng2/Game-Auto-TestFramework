import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type {
  CommandResult,
  DeviceInfo,
} from "../packages/core/src/contracts/device-driver.js";
import { FrameworkError } from "../packages/core/src/contracts/evidence.js";
import {
  ArtifactInspector,
  assertArtifactCompatible,
  type ArtifactMetadata,
  type ArtifactMetadataReader,
} from "../packages/artifact-engine/src/artifact-inspector.js";
import {
  BundletoolRunner,
  type BundletoolCommandRunner,
} from "../packages/artifact-engine/src/bundletool-runner.js";

const device: DeviceInfo = {
  serial: "fixture-device",
  model: "Fixture Phone",
  apiLevel: 36,
  supportedAbis: ["arm64-v8a"],
  display: { width: 1080, height: 2340, density: 450 },
};

const metadata: ArtifactMetadata = {
  packageId: "com.example.game",
  versionName: "1.2.3",
  versionCode: 123,
  minSdk: 24,
  targetSdk: 36,
  supportedAbis: ["arm64-v8a", "armeabi-v7a"],
  splitNames: ["base", "config.arm64_v8a"],
};

class FixedMetadataReader implements ArtifactMetadataReader {
  async read(): Promise<ArtifactMetadata> {
    return metadata;
  }
}

test("rejects a missing artifact with ARTIFACT_METADATA", async () => {
  const inspector = new ArtifactInspector(new FixedMetadataReader());

  await assert.rejects(
    () => inspector.inspect(join(tmpdir(), "missing-game.apks")),
    (error: unknown) =>
      error instanceof FrameworkError && error.category === "ARTIFACT_METADATA",
  );
});

test("rejects an artifact with a mismatched package ID", async () => {
  const root = await mkdtemp(join(tmpdir(), "game-auto-artifact-"));
  const path = join(root, "game.apks");

  try {
    await writeFile(path, "fixture-apks");
    const inspection = await new ArtifactInspector(
      new FixedMetadataReader(),
    ).inspect(path);

    await assert.rejects(
      async () =>
        assertArtifactCompatible(inspection, {
          packageId: "com.other.game",
          device,
        }),
      (error: unknown) =>
        error instanceof FrameworkError &&
        error.category === "ARTIFACT_METADATA",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects an artifact with no ABI compatible with the target device", async () => {
  const root = await mkdtemp(join(tmpdir(), "game-auto-artifact-"));
  const path = join(root, "game.apk");
  const incompatibleReader: ArtifactMetadataReader = {
    async read(): Promise<ArtifactMetadata> {
      return { ...metadata, supportedAbis: ["armeabi-v7a"] };
    },
  };

  try {
    await writeFile(path, "fixture-apk");
    const inspection = await new ArtifactInspector(incompatibleReader).inspect(
      path,
    );

    await assert.rejects(
      async () => assertArtifactCompatible(inspection, { device }),
      (error: unknown) =>
        error instanceof FrameworkError &&
        error.category === "ARTIFACT_METADATA",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("accepts a valid APKS for the target device and uses an adapter classifier", async () => {
  const root = await mkdtemp(join(tmpdir(), "game-auto-artifact-"));
  const path = join(root, "game.apks");

  try {
    await writeFile(path, "fixture-apks");
    const inspector = new ArtifactInspector(
      new FixedMetadataReader(),
      ({ kind }) => (kind === "apks" ? "test-server" : "unknown"),
    );
    const inspection = await inspector.inspect(path);

    assert.equal(inspection.artifact.kind, "apks");
    assert.equal(inspection.classification, "test-server");
    assert.equal(inspection.metadata.packageId, "com.example.game");
    await assertArtifactCompatible(inspection, {
      packageId: "com.example.game",
      device,
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("records configurable bundletool command paths and arguments", async () => {
  const runner = new RecordingBundletoolRunner();
  const bundletool = new BundletoolRunner({
    javaPath: "java-fixture",
    jarPath: "bundletool-fixture.jar",
    runner,
  });

  await bundletool.version();

  assert.equal(runner.executablePath, "java-fixture");
  assert.deepEqual(runner.args, ["-jar", "bundletool-fixture.jar", "version"]);
});

class RecordingBundletoolRunner implements BundletoolCommandRunner {
  executablePath = "";
  args: string[] = [];

  async run(
    executablePath: string,
    args: readonly string[],
  ): Promise<CommandResult> {
    this.executablePath = executablePath;
    this.args = [...args];
    return {
      command: [executablePath, ...args].join(" "),
      exitCode: 0,
      stdout: "1.17.2",
      stderr: "",
      durationMs: 1,
    };
  }
}
