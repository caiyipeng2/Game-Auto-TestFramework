import type { DeviceDriver } from "../../../packages/core/src/contracts/device-driver.js";
import type {
  AdapterContext,
  GameAdapter,
  GameIdentity,
  GameProfile,
  Locator,
  StateAssertion,
} from "../../../packages/core/src/contracts/game-adapter.js";
import {
  FrameworkError,
  type StateSnapshot,
} from "../../../packages/core/src/contracts/evidence.js";
import {
  IdleOutpostConfigReader,
  readIdleOutpostConfig,
  readIdleOutpostManifest,
  type IdleOutpostConfigSnapshot,
  type IdleOutpostManifest,
} from "./config-reader.js";

export interface IdleOutpostStateReader {
  read(
    context: AdapterContext,
    driver: DeviceDriver,
    config: IdleOutpostConfigReader,
  ): Promise<StateSnapshot>;
}

export interface IdleOutpostAdapterOptions {
  readonly stateReader?: IdleOutpostStateReader;
}

export class IdleOutpostAdapter implements GameAdapter {
  readonly id: string;
  readonly contractVersion: string;
  readonly config: IdleOutpostConfigReader;

  constructor(
    private readonly manifest: IdleOutpostManifest,
    configSnapshot: IdleOutpostConfigSnapshot,
    private readonly options: IdleOutpostAdapterOptions = {},
  ) {
    this.id = manifest.id;
    this.contractVersion = manifest.contractVersion;
    this.config = new IdleOutpostConfigReader(configSnapshot);
  }

  identity(): GameIdentity {
    return this.manifest.identity;
  }

  profiles(): readonly GameProfile[] {
    return this.manifest.profiles;
  }

  async prepareContext(context: AdapterContext): Promise<void> {
    if (
      context.artifact.packageId &&
      context.artifact.packageId !== this.identity().packageId
    ) {
      throw new FrameworkError(
        `Idle_Outpost artifact package mismatch: expected ${this.identity().packageId}, got ${context.artifact.packageId}`,
        "ARTIFACT_METADATA",
      );
    }
  }

  async waitReady(
    context: AdapterContext,
    driver: DeviceDriver,
  ): Promise<StateSnapshot> {
    return this.readState(context, driver);
  }

  async resolveTarget(
    targetId: string,
    _context: AdapterContext,
  ): Promise<Locator> {
    const template = this.manifest.locatorTemplates[targetId];
    if (!template) {
      throw new FrameworkError(
        `Idle_Outpost logical target is not configured: ${targetId}`,
        "GAME_LOCATOR",
      );
    }
    return {
      kind: "image-template",
      path: template.path,
      threshold: template.threshold,
    };
  }

  async readState(
    context: AdapterContext,
    driver: DeviceDriver,
  ): Promise<StateSnapshot> {
    if (this.options.stateReader) {
      return this.options.stateReader.read(context, driver, this.config);
    }
    return { state: "unknown", adapter: this.id };
  }

  async assertState(
    assertion: StateAssertion,
    context: AdapterContext,
    driver: DeviceDriver,
  ): Promise<void> {
    const snapshot = await this.readState(context, driver);
    const actual = assertion.field ? snapshot[assertion.field] : snapshot.state;
    const matches = matchAssertion(actual, assertion);
    if (!matches) {
      throw new FrameworkError(
        `Idle_Outpost state assertion failed: ${assertion.state}.${assertion.field ?? "state"} ${assertion.operator} ${String(assertion.expected)}, actual ${String(actual)}`,
        "BUSINESS_ASSERTION",
      );
    }
  }

  async cleanupContext(): Promise<void> {}
}

export async function createIdleOutpostAdapter(
  manifestPath: string,
  configPath: string,
  options: IdleOutpostAdapterOptions = {},
): Promise<IdleOutpostAdapter> {
  const [manifest, config] = await Promise.all([
    readIdleOutpostManifest(manifestPath),
    readIdleOutpostConfig(configPath),
  ]);
  return new IdleOutpostAdapter(manifest, config, options);
}

function matchAssertion(actual: unknown, assertion: StateAssertion): boolean {
  switch (assertion.operator) {
    case "equals":
      return Object.is(actual, assertion.expected);
    case "notEquals":
      return !Object.is(actual, assertion.expected);
    case "exists":
      return actual !== undefined && actual !== null;
    case "contains":
      return Array.isArray(actual)
        ? actual.some((item) => Object.is(item, assertion.expected))
        : typeof actual === "string" &&
            typeof assertion.expected === "string" &&
            actual.includes(assertion.expected);
  }
}
