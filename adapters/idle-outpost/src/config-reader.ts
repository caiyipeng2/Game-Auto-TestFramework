import { readFile } from "node:fs/promises";

import { parse as parseYaml } from "yaml";

import type {
  GameIdentity,
  GameProfile,
} from "../../../packages/core/src/contracts/game-adapter.js";
import { FrameworkError } from "../../../packages/core/src/contracts/evidence.js";

export interface LocatorTemplate {
  readonly path: string;
  readonly threshold?: number;
}

export interface ConfigSource {
  readonly path: string;
  readonly sheet: string;
  readonly purpose: string;
}

export interface IdleOutpostManifest {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly displayName: string;
  readonly adapterVersion: string;
  readonly contractVersion: string;
  readonly identity: GameIdentity;
  readonly profiles: readonly GameProfile[];
  readonly locatorTemplates: Readonly<Record<string, LocatorTemplate>>;
  readonly configSources: readonly ConfigSource[];
}

export interface IdleOutpostSystemStatus {
  readonly id: number;
  readonly name: string;
  readonly autoEventCheck: boolean;
  readonly configString: string;
  readonly parameters: readonly string[];
  readonly onlyUnlockInActivityTerrain: boolean;
}

export interface IdleOutpostTerrain {
  readonly id: number;
  readonly sceneName: string;
  readonly defaultCoins: number;
  readonly unlockNeedCoin: number;
}

export interface IdleOutpostTerrainUpgrade {
  readonly upgradeId: number;
  readonly terrainId: number;
  readonly type: number;
  readonly name: string;
  readonly params: readonly number[];
  readonly needCoin: number;
}

export interface IdleOutpostGuide {
  readonly id: string;
  readonly group: number;
  readonly startConditions: readonly number[];
  readonly startParams: readonly number[];
  readonly endConditions: readonly number[];
  readonly endParams: readonly number[];
  readonly beforeActions: readonly number[];
  readonly afterActions: readonly number[];
  readonly objectGuide?: string;
}

export interface IdleOutpostConfigSnapshot {
  readonly schemaVersion: 1;
  readonly capturedAt: string;
  readonly sourceFiles: readonly string[];
  readonly systemStatus: readonly IdleOutpostSystemStatus[];
  readonly terrain: readonly IdleOutpostTerrain[];
  readonly terrainUpgrades: readonly IdleOutpostTerrainUpgrade[];
  readonly guides: readonly IdleOutpostGuide[];
}

export interface FirstUpgradeFacts {
  readonly system: IdleOutpostSystemStatus;
  readonly terrain: IdleOutpostTerrain;
  readonly firstUpgrade: IdleOutpostTerrainUpgrade;
  readonly guides: {
    readonly entry: IdleOutpostGuide;
    readonly firstUpgrade: IdleOutpostGuide;
  };
}

export class IdleOutpostConfigReader {
  constructor(readonly snapshot: IdleOutpostConfigSnapshot) {}

  getSystemStatus(id: number): IdleOutpostSystemStatus {
    return findOrThrow(
      this.snapshot.systemStatus,
      (item) => item.id === id,
      `system status ${id}`,
    );
  }

  getTerrain(id: number): IdleOutpostTerrain {
    return findOrThrow(
      this.snapshot.terrain,
      (item) => item.id === id,
      `terrain ${id}`,
    );
  }

  getTerrainUpgrades(terrainId: number): readonly IdleOutpostTerrainUpgrade[] {
    return this.snapshot.terrainUpgrades
      .filter((item) => item.terrainId === terrainId)
      .sort((left, right) => left.upgradeId - right.upgradeId);
  }

  getGuide(id: string): IdleOutpostGuide {
    return findOrThrow(
      this.snapshot.guides,
      (item) => item.id === id,
      `guide ${id}`,
    );
  }

  getFirstUpgradeFacts(): FirstUpgradeFacts {
    const terrain = this.getTerrain(1);
    const firstUpgrade = this.getTerrainUpgrades(terrain.id)[0];
    if (!firstUpgrade) {
      throw new FrameworkError(
        `No terrain upgrade configured for terrain ${terrain.id}`,
        "HOST_TOOL",
      );
    }
    return {
      system: this.getSystemStatus(2),
      terrain,
      firstUpgrade,
      guides: {
        entry: this.getGuide("TerrainUpgeade1"),
        firstUpgrade: this.getGuide("TerrainUpgeade3"),
      },
    };
  }
}

export async function readIdleOutpostManifest(
  path: string,
): Promise<IdleOutpostManifest> {
  const raw = await readStructuredFile(path, "YAML");
  return parseManifest(raw, path);
}

export async function readIdleOutpostConfig(
  path: string,
): Promise<IdleOutpostConfigSnapshot> {
  const raw = await readStructuredFile(path, "JSON");
  return parseSnapshot(raw, path);
}

async function readStructuredFile(
  path: string,
  format: "YAML" | "JSON",
): Promise<unknown> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch {
    throw new FrameworkError(
      `Cannot read Idle_Outpost ${format} file: ${path}`,
      "HOST_TOOL",
    );
  }

  try {
    return format === "JSON" ? JSON.parse(source) : parseYaml(source);
  } catch (error) {
    throw new FrameworkError(
      `Invalid Idle_Outpost ${format} file ${path}: ${formatError(error)}`,
      "HOST_TOOL",
    );
  }
}

function parseManifest(value: unknown, path: string): IdleOutpostManifest {
  const raw = asRecord(value, path);
  const identity = asRecord(raw.identity, `${path}.identity`);
  const profiles = asArray(raw.profiles, `${path}.profiles`).map(
    (profile, index) => {
      const item = asRecord(profile, `${path}.profiles[${index}]`);
      return {
        id: asString(item.id, `${path}.profiles[${index}].id`),
        environment: asString(
          item.environment,
          `${path}.profiles[${index}].environment`,
        ),
        settings: asSettings(
          item.settings,
          `${path}.profiles[${index}].settings`,
        ),
      } satisfies GameProfile;
    },
  );
  const locatorTemplates = Object.fromEntries(
    Object.entries(
      asRecord(raw.locatorTemplates, `${path}.locatorTemplates`),
    ).map(([key, value]) => {
      const item = asRecord(value, `${path}.locatorTemplates.${key}`);
      return [
        key,
        {
          path: asString(item.path, `${path}.locatorTemplates.${key}.path`),
          ...(item.threshold === undefined
            ? {}
            : {
                threshold: asNumber(
                  item.threshold,
                  `${path}.locatorTemplates.${key}.threshold`,
                ),
              }),
        },
      ];
    }),
  );

  return {
    schemaVersion: asLiteralOne(raw.schemaVersion, `${path}.schemaVersion`),
    id: asString(raw.id, `${path}.id`),
    displayName: asString(raw.displayName, `${path}.displayName`),
    adapterVersion: asString(raw.adapterVersion, `${path}.adapterVersion`),
    contractVersion: asString(raw.contractVersion, `${path}.contractVersion`),
    identity: {
      id: asString(identity.id, `${path}.identity.id`),
      displayName: asString(
        identity.displayName,
        `${path}.identity.displayName`,
      ),
      packageId: asString(identity.packageId, `${path}.identity.packageId`),
      launchActivity: asString(
        identity.launchActivity,
        `${path}.identity.launchActivity`,
      ),
    },
    profiles,
    locatorTemplates,
    configSources: asArray(raw.configSources, `${path}.configSources`).map(
      (source, index) => {
        const item = asRecord(source, `${path}.configSources[${index}]`);
        return {
          path: asString(item.path, `${path}.configSources[${index}].path`),
          sheet: asString(item.sheet, `${path}.configSources[${index}].sheet`),
          purpose: asString(
            item.purpose,
            `${path}.configSources[${index}].purpose`,
          ),
        };
      },
    ),
  };
}

function parseSnapshot(
  value: unknown,
  path: string,
): IdleOutpostConfigSnapshot {
  const raw = asRecord(value, path);
  return {
    schemaVersion: asLiteralOne(raw.schemaVersion, `${path}.schemaVersion`),
    capturedAt: asString(raw.capturedAt, `${path}.capturedAt`),
    sourceFiles: asArray(raw.sourceFiles, `${path}.sourceFiles`).map(
      (item, index) => asString(item, `${path}.sourceFiles[${index}]`),
    ),
    systemStatus: asArray(raw.systemStatus, `${path}.systemStatus`).map(
      (item, index) => {
        const value = asRecord(item, `${path}.systemStatus[${index}]`);
        return {
          id: asNumber(value.id, `${path}.systemStatus[${index}].id`),
          name: asString(value.name, `${path}.systemStatus[${index}].name`),
          autoEventCheck: asBoolean(
            value.autoEventCheck,
            `${path}.systemStatus[${index}].autoEventCheck`,
          ),
          configString: asString(
            value.configString,
            `${path}.systemStatus[${index}].configString`,
          ),
          parameters: asArray(
            value.parameters,
            `${path}.systemStatus[${index}].parameters`,
          ).map((parameter, parameterIndex) =>
            asString(
              parameter,
              `${path}.systemStatus[${index}].parameters[${parameterIndex}]`,
            ),
          ),
          onlyUnlockInActivityTerrain: asBoolean(
            value.onlyUnlockInActivityTerrain,
            `${path}.systemStatus[${index}].onlyUnlockInActivityTerrain`,
          ),
        };
      },
    ),
    terrain: asArray(raw.terrain, `${path}.terrain`).map((item, index) => {
      const value = asRecord(item, `${path}.terrain[${index}]`);
      return {
        id: asNumber(value.id, `${path}.terrain[${index}].id`),
        sceneName: asString(
          value.sceneName,
          `${path}.terrain[${index}].sceneName`,
        ),
        defaultCoins: asNumber(
          value.defaultCoins,
          `${path}.terrain[${index}].defaultCoins`,
        ),
        unlockNeedCoin: asNumber(
          value.unlockNeedCoin,
          `${path}.terrain[${index}].unlockNeedCoin`,
        ),
      };
    }),
    terrainUpgrades: asArray(
      raw.terrainUpgrades,
      `${path}.terrainUpgrades`,
    ).map((item, index) => {
      const value = asRecord(item, `${path}.terrainUpgrades[${index}]`);
      return {
        upgradeId: asNumber(
          value.upgradeId,
          `${path}.terrainUpgrades[${index}].upgradeId`,
        ),
        terrainId: asNumber(
          value.terrainId,
          `${path}.terrainUpgrades[${index}].terrainId`,
        ),
        type: asNumber(value.type, `${path}.terrainUpgrades[${index}].type`),
        name: asString(value.name, `${path}.terrainUpgrades[${index}].name`),
        params: asArray(
          value.params,
          `${path}.terrainUpgrades[${index}].params`,
        ).map((parameter, parameterIndex) =>
          asNumber(
            parameter,
            `${path}.terrainUpgrades[${index}].params[${parameterIndex}]`,
          ),
        ),
        needCoin: asNumber(
          value.needCoin,
          `${path}.terrainUpgrades[${index}].needCoin`,
        ),
      };
    }),
    guides: asArray(raw.guides, `${path}.guides`).map((item, index) => {
      const value = asRecord(item, `${path}.guides[${index}]`);
      return {
        id: asString(value.id, `${path}.guides[${index}].id`),
        group: asNumber(value.group, `${path}.guides[${index}].group`),
        startConditions: asNumbers(
          value.startConditions,
          `${path}.guides[${index}].startConditions`,
        ),
        startParams: asNumbers(
          value.startParams,
          `${path}.guides[${index}].startParams`,
        ),
        endConditions: asNumbers(
          value.endConditions,
          `${path}.guides[${index}].endConditions`,
        ),
        endParams: asNumbers(
          value.endParams,
          `${path}.guides[${index}].endParams`,
        ),
        beforeActions: asNumbers(
          value.beforeActions,
          `${path}.guides[${index}].beforeActions`,
        ),
        afterActions: asNumbers(
          value.afterActions,
          `${path}.guides[${index}].afterActions`,
        ),
        ...(value.objectGuide === undefined
          ? {}
          : {
              objectGuide: asString(
                value.objectGuide,
                `${path}.guides[${index}].objectGuide`,
              ),
            }),
      };
    }),
  };
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new FrameworkError(`Expected an object at ${path}`, "HOST_TOOL");
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new FrameworkError(`Expected an array at ${path}`, "HOST_TOOL");
  }
  return value;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new FrameworkError(
      `Expected a non-empty string at ${path}`,
      "HOST_TOOL",
    );
  }
  return value;
}

function asNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new FrameworkError(
      `Expected a finite number at ${path}`,
      "HOST_TOOL",
    );
  }
  return value;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    throw new FrameworkError(`Expected a boolean at ${path}`, "HOST_TOOL");
  }
  return value;
}

function asLiteralOne(value: unknown, path: string): 1 {
  if (value !== 1)
    throw new FrameworkError(
      `Expected schemaVersion 1 at ${path}`,
      "HOST_TOOL",
    );
  return 1;
}

function asNumbers(value: unknown, path: string): readonly number[] {
  return asArray(value, path).map((item, index) =>
    asNumber(item, `${path}[${index}]`),
  );
}

function asSettings(
  value: unknown,
  path: string,
): Readonly<Record<string, string | number | boolean>> {
  const record = asRecord(value ?? {}, path);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => {
      if (
        typeof item !== "string" &&
        typeof item !== "number" &&
        typeof item !== "boolean"
      ) {
        throw new FrameworkError(
          `Invalid profile setting at ${path}.${key}`,
          "HOST_TOOL",
        );
      }
      return [key, item];
    }),
  );
}

function findOrThrow<T>(
  values: readonly T[],
  predicate: (value: T) => boolean,
  description: string,
): T {
  const match = values.find(predicate);
  if (!match)
    throw new FrameworkError(
      `Missing Idle_Outpost ${description}`,
      "HOST_TOOL",
    );
  return match;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
