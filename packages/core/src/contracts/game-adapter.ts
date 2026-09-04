import type {
  DeviceDriver,
  DeviceInfo,
  InstallableArtifact,
} from "./device-driver.js";
import type { StateSnapshot } from "./evidence.js";

export interface GameIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly packageId: string;
  readonly launchActivity: string;
}

export interface GameProfile {
  readonly id: string;
  readonly environment: string;
  readonly settings: Readonly<Record<string, string | number | boolean>>;
}

export interface AdapterContext {
  readonly runId: string;
  readonly device: DeviceInfo;
  readonly artifact: InstallableArtifact;
  readonly profile: GameProfile;
  readonly variables: Record<string, unknown>;
}

export type AccountPolicy = "reset-existing" | "preserve";

export interface AdapterPreparationOptions {
  readonly accountPolicy?: AccountPolicy;
}

export type NativeSelectorStrategy =
  "id" | "text" | "accessibility-id" | "xpath";

export type Locator =
  | {
      readonly kind: "native-selector";
      readonly strategy: NativeSelectorStrategy;
      readonly value: string;
    }
  | {
      readonly kind: "screen-rect";
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
      readonly coordinateSpace: "physical-pixels";
    }
  | {
      readonly kind: "normalized-point";
      readonly x: number;
      readonly y: number;
    }
  | {
      readonly kind: "image-template";
      readonly path: string;
      readonly threshold?: number;
    };

export interface StateAssertion {
  readonly state: string;
  readonly field?: string;
  readonly operator: "equals" | "notEquals" | "exists" | "contains";
  readonly expected?: unknown;
}

export interface GameAdapter {
  readonly id: string;
  readonly contractVersion: string;
  identity(): GameIdentity;
  profiles(): readonly GameProfile[];
  prepareContext(
    context: AdapterContext,
    driver: DeviceDriver,
    options?: AdapterPreparationOptions,
  ): Promise<void>;
  waitReady(
    context: AdapterContext,
    driver: DeviceDriver,
  ): Promise<StateSnapshot>;
  resolveTarget(targetId: string, context: AdapterContext): Promise<Locator>;
  readState(
    context: AdapterContext,
    driver: DeviceDriver,
  ): Promise<StateSnapshot>;
  assertState(
    assertion: StateAssertion,
    context: AdapterContext,
    driver: DeviceDriver,
  ): Promise<void>;
  cleanupContext(context: AdapterContext, driver: DeviceDriver): Promise<void>;
}
