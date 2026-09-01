import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";

import type {
  ArtifactKind,
  DeviceInfo,
  InstallableArtifact,
} from "../../core/src/contracts/device-driver.js";
import { FrameworkError } from "../../core/src/contracts/evidence.js";

export interface ArtifactMetadata {
  readonly packageId: string;
  readonly versionName: string;
  readonly versionCode: number;
  readonly minSdk: number;
  readonly targetSdk: number;
  readonly supportedAbis: readonly string[];
  readonly splitNames: readonly string[];
}

export interface ArtifactMetadataReader {
  read(path: string, kind: ArtifactKind): Promise<ArtifactMetadata>;
}

export interface ArtifactClassificationContext {
  readonly path: string;
  readonly kind: ArtifactKind;
  readonly metadata: ArtifactMetadata;
  readonly modifiedAt: Date;
}

export type ArtifactClassifier = (
  context: ArtifactClassificationContext,
) => string | Promise<string>;

export interface ArtifactInspection {
  readonly artifact: InstallableArtifact;
  readonly metadata: ArtifactMetadata;
  readonly classification?: string;
  readonly modifiedAt: string;
}

export interface ArtifactCompatibilityRequirements {
  readonly packageId?: string;
  readonly device?: Pick<DeviceInfo, "apiLevel" | "supportedAbis">;
}

export function detectArtifactKind(path: string): ArtifactKind {
  switch (extname(path).toLowerCase()) {
    case ".apk":
      return "apk";
    case ".aab":
      return "aab";
    case ".apks":
      return "apks";
    default:
      throw new FrameworkError(
        `Unsupported Android artifact type: ${basename(path)}`,
        "ARTIFACT_METADATA",
      );
  }
}

export class ArtifactInspector {
  constructor(
    private readonly metadataReader: ArtifactMetadataReader,
    private readonly classifier?: ArtifactClassifier,
  ) {}

  async inspect(path: string): Promise<ArtifactInspection> {
    const kind = detectArtifactKind(path);
    let fileInfo;
    try {
      fileInfo = await stat(path);
    } catch {
      throw new FrameworkError(
        `Artifact does not exist: ${path}`,
        "ARTIFACT_METADATA",
      );
    }

    if (!fileInfo.isFile()) {
      throw new FrameworkError(
        `Artifact path is not a file: ${path}`,
        "ARTIFACT_METADATA",
      );
    }

    const metadata = await this.metadataReader.read(path, kind);
    const sha256 = await hashFile(path);
    const artifact: InstallableArtifact = {
      path,
      kind,
      packageId: metadata.packageId,
      versionName: metadata.versionName,
      versionCode: metadata.versionCode,
      sha256,
      sizeBytes: fileInfo.size,
    };
    const classification = this.classifier
      ? await this.classifier({
          path,
          kind,
          metadata,
          modifiedAt: fileInfo.mtime,
        })
      : undefined;

    return {
      artifact,
      metadata,
      classification,
      modifiedAt: fileInfo.mtime.toISOString(),
    };
  }
}

export function assertArtifactCompatible(
  inspection: ArtifactInspection,
  requirements: ArtifactCompatibilityRequirements,
): void {
  if (
    requirements.packageId &&
    inspection.metadata.packageId !== requirements.packageId
  ) {
    throw new FrameworkError(
      `Artifact package mismatch: expected ${requirements.packageId}, got ${inspection.metadata.packageId}`,
      "ARTIFACT_METADATA",
    );
  }

  const device = requirements.device;
  if (!device) return;

  if (device.apiLevel < inspection.metadata.minSdk) {
    throw new FrameworkError(
      `Artifact requires API ${inspection.metadata.minSdk}, device has API ${device.apiLevel}`,
      "ARTIFACT_METADATA",
    );
  }

  if (
    inspection.metadata.supportedAbis.length > 0 &&
    !inspection.metadata.supportedAbis.some((abi) =>
      device.supportedAbis.includes(abi),
    )
  ) {
    throw new FrameworkError(
      `Artifact ABIs [${inspection.metadata.supportedAbis.join(", ")}] do not match device ABIs [${device.supportedAbis.join(", ")}]`,
      "ARTIFACT_METADATA",
    );
  }
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  const stream = createReadStream(path);

  return new Promise((resolve, reject) => {
    stream.on("data", (chunk: string | Buffer) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex").toUpperCase()));
  });
}
