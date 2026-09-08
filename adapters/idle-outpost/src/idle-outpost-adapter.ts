import { dirname, isAbsolute, resolve } from "node:path";

import type {
  DeviceDriver,
  DeviceInfo,
} from "../../../packages/core/src/contracts/device-driver.js";
import type {
  AdapterContext,
  AdapterPreparationOptions,
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
import { waitForState } from "../../../packages/core/src/flow/waiter.js";
import type {
  NormalizedRegion,
  TemplateMatcher,
} from "../../../packages/screen-recognition/src/png-template-matcher.js";
import { PngTemplateMatcher } from "../../../packages/screen-recognition/src/png-template-matcher.js";
import {
  IdleOutpostConfigReader,
  readIdleOutpostConfig,
  readIdleOutpostManifest,
  type IdleOutpostConfigSnapshot,
  type IdleOutpostManifest,
  type IdleOutpostStateTemplate,
} from "./config-reader.js";

export type IdleOutpostAccountMode = "new" | "existing";

export interface IdleOutpostAccountStateReader {
  readAccountMode(
    context: AdapterContext,
    driver: DeviceDriver,
    config: IdleOutpostConfigReader,
  ): Promise<IdleOutpostAccountMode>;
}

export interface IdleOutpostStartupOverlayHandler {
  dismiss(
    context: AdapterContext,
    driver: DeviceDriver,
    adapter: IdleOutpostAdapter,
    options?: AdapterPreparationOptions,
  ): Promise<void>;
}

export type IdleOutpostScreenshotStateTemplate = IdleOutpostStateTemplate;

export interface IdleOutpostScreenshotStateReaderOptions {
  readonly screenshotPath: string;
  readonly templateRoot: string;
  readonly matcher: TemplateMatcher;
  readonly templates: readonly IdleOutpostScreenshotStateTemplate[];
  readonly retryCount?: number;
  readonly retryDelayMs?: number;
  readonly sleep?: (durationMs: number) => Promise<void>;
}

export interface IdleOutpostScreenshotAdapterOptions {
  readonly screenshotPath: string;
  readonly matcher?: TemplateMatcher;
  readonly resetTimeoutMs?: number;
  readonly resetPollIntervalMs?: number;
}

export class IdleOutpostStartupOverlayHandler implements IdleOutpostStartupOverlayHandler {
  constructor(
    private readonly stateReader: Pick<IdleOutpostStateReader, "read">,
    private readonly maxTransitions = 20,
    private readonly sleep: (
      durationMs: number,
    ) => Promise<void> = defaultSleep,
    private readonly pollIntervalMs = 500,
  ) {}

  async dismiss(
    context: AdapterContext,
    driver: DeviceDriver,
    adapter: IdleOutpostAdapter,
    options: AdapterPreparationOptions = {},
  ): Promise<void> {
    for (
      let transition = 0;
      transition < this.maxTransitions;
      transition += 1
    ) {
      const snapshot = await this.stateReader.read(
        context,
        driver,
        adapter.config,
      );
      if (snapshot.state === "startup-cloud-sync") {
        await this.sleep(this.pollIntervalMs);
        continue;
      }
      const targetId = getStartupDismissTarget(snapshot.state);
      if (
        targetId &&
        options.accountPolicy === "preserve" &&
        isTerrainUpgradeWindowState(snapshot.state)
      ) {
        return;
      }
      if (!targetId) {
        if (
          snapshot.state === "new-account" ||
          snapshot.state === "main-screen" ||
          snapshot.state === "next-scene-unlock" ||
          snapshot.state === "startup-intro-story" ||
          snapshot.state === "first-equipment-entry" ||
          snapshot.state === "equipment-build-window" ||
          snapshot.state === "equipment-build-complete" ||
          snapshot.state === "terrain-upgrade-second-owned" ||
          snapshot.state === "terrain-upgrade-third-owned" ||
          snapshot.state === "terrain-upgrade-fourth-owned" ||
          snapshot.state === "terrain-upgrade-all-owned" ||
          snapshot.state === "device-upgrade-level-25" ||
          snapshot.state === "next-terrain-window" ||
          snapshot.state === "terrain-transition-loading" ||
          snapshot.state === "terrain-1-2-new-position" ||
          snapshot.state === "terrain-1-2-reward" ||
          snapshot.state === "terrain-1-2-main"
        ) {
          return;
        }
        throw new FrameworkError(
          `Idle_Outpost startup state is not safe to auto-dismiss: ${String(snapshot.state ?? "unknown")}`,
          "DEVICE_STATE",
        );
      }

      const locator = await adapter.resolveTarget(targetId, context);
      const point = toScreenPoint(locator, context.device.display);
      const result = await driver.tap(context.device.serial, point);
      requireSuccess(result);
    }

    throw new FrameworkError(
      `Idle_Outpost startup overlay transitions exceeded ${this.maxTransitions}`,
      "DEVICE_STATE",
    );
  }
}

export class ScreenshotAccountStateReader
  implements IdleOutpostStateReader, IdleOutpostAccountStateReader
{
  constructor(
    private readonly options: IdleOutpostScreenshotStateReaderOptions,
  ) {}

  async read(
    context: AdapterContext,
    driver: DeviceDriver,
    _config: IdleOutpostConfigReader,
  ): Promise<StateSnapshot> {
    const retryCount = this.options.retryCount ?? 2;
    const sleep = this.options.sleep ?? defaultSleep;
    let lastError: UnknownScreenshotStateError | undefined;

    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        return await this.readOnce(context, driver);
      } catch (error) {
        if (
          !(error instanceof UnknownScreenshotStateError) ||
          attempt === retryCount
        ) {
          throw error;
        }
        lastError = error;
        await sleep(this.options.retryDelayMs ?? 300);
      }
    }

    throw lastError ?? new UnknownScreenshotStateError();
  }

  private async readOnce(
    context: AdapterContext,
    driver: DeviceDriver,
  ): Promise<StateSnapshot> {
    const capture = await driver.captureScreenshot(
      context.device.serial,
      this.options.screenshotPath,
    );
    requireSuccess(capture);

    const candidates = await Promise.all(
      this.options.templates.map(async (template) => ({
        template,
        match: await this.options.matcher.match(
          this.options.screenshotPath,
          isAbsolute(template.path)
            ? template.path
            : resolve(this.options.templateRoot, template.path),
          {
            region: template.region,
            threshold: template.threshold,
          },
        ),
      })),
    );
    const winner = candidates
      .filter(({ match }) => match.matched)
      .sort(
        (left, right) =>
          (right.template.priority ?? 0) - (left.template.priority ?? 0) ||
          right.match.score - left.match.score,
      )[0];
    if (!winner) throw new UnknownScreenshotStateError();

    return {
      state: winner.template.state,
      ...(winner.template.accountMode
        ? { accountMode: winner.template.accountMode }
        : {}),
      locatorScore: winner.match.score,
    };
  }

  async readAccountMode(
    context: AdapterContext,
    driver: DeviceDriver,
    config: IdleOutpostConfigReader,
  ): Promise<IdleOutpostAccountMode> {
    const snapshot = await this.read(context, driver, config);
    return new SnapshotAccountStateReader().readAccountMode(
      context,
      driver,
      config,
      async () => snapshot,
    );
  }
}

export class SnapshotAccountStateReader implements IdleOutpostAccountStateReader {
  constructor(private readonly stateReader?: IdleOutpostStateReader) {}

  async readAccountMode(
    context: AdapterContext,
    driver: DeviceDriver,
    config: IdleOutpostConfigReader,
    readOverride?: IdleOutpostStateReader["read"],
  ): Promise<IdleOutpostAccountMode> {
    const reader =
      readOverride ??
      (this.stateReader
        ? this.stateReader.read.bind(this.stateReader)
        : undefined);
    if (!reader) {
      throw new FrameworkError(
        "Idle_Outpost state reader is required to detect the account mode",
        "HOST_TOOL",
      );
    }
    const snapshot = await reader(context, driver, config);
    const mode = snapshot.accountMode;
    if (mode === "new" || mode === "existing") return mode;
    if (
      snapshot.state === "new-account" ||
      snapshot.state === "next-scene-unlock"
    ) {
      return "new";
    }
    if (
      snapshot.state === "main-screen" ||
      snapshot.state === "settings-menu" ||
      snapshot.state === "account-detail-existing" ||
      snapshot.state === "terrain-upgrade-window"
    ) {
      return "existing";
    }
    if (
      snapshot.state === "terrain-upgrade-first-available" ||
      snapshot.state === "terrain-upgrade-owned" ||
      snapshot.state === "terrain-upgrade-second-owned" ||
      snapshot.state === "terrain-upgrade-third-owned" ||
      snapshot.state === "terrain-upgrade-fourth-owned" ||
      snapshot.state === "terrain-upgrade-all-owned" ||
      snapshot.state === "device-upgrade-level-25" ||
      snapshot.state === "next-terrain-window" ||
      snapshot.state === "terrain-transition-loading" ||
      snapshot.state === "terrain-1-2-new-position" ||
      snapshot.state === "terrain-1-2-reward" ||
      snapshot.state === "terrain-1-2-main"
    ) {
      return "new";
    }
    throw new FrameworkError(
      `Idle_Outpost account mode is indeterminate from state: ${String(snapshot.state ?? "unknown")}`,
      "DEVICE_STATE",
    );
  }
}

export interface IdleOutpostAccountResetter {
  reset(
    context: AdapterContext,
    driver: DeviceDriver,
    adapter: IdleOutpostAdapter,
  ): Promise<void>;
}

export interface IdleOutpostUiAccountResetterOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
  readonly sleep?: (durationMs: number) => Promise<void>;
}

export interface IdleOutpostAccountResetActions {
  tapTarget(targetId: string): Promise<void>;
  waitForState(state: string): Promise<void>;
  launch(): Promise<void>;
}

export async function runIdleOutpostAccountResetFlow(
  actions: IdleOutpostAccountResetActions,
): Promise<void> {
  await actions.tapTarget("main.settings.entry");
  await actions.waitForState("settings-menu");
  await actions.tapTarget("settings.account");
  await actions.waitForState("account-detail-existing");
  await actions.tapTarget("account.delete-archive");
  await actions.waitForState("delete-account-confirm");
  await actions.tapTarget("account.delete-confirm");
  await actions.waitForState("delete-account-success");
  await actions.tapTarget("account.restart-game");
  await actions.launch();
  await actions.waitForState("new-account");
}

export class IdleOutpostUiAccountResetter implements IdleOutpostAccountResetter {
  constructor(
    private readonly options: IdleOutpostUiAccountResetterOptions = {},
  ) {}

  async reset(
    context: AdapterContext,
    driver: DeviceDriver,
    adapter: IdleOutpostAdapter,
  ): Promise<void> {
    await runIdleOutpostAccountResetFlow({
      tapTarget: async (targetId) => {
        const locator = await adapter.resolveTarget(targetId, context);
        const point = toScreenPoint(locator, context.device.display);
        const result = await driver.tap(context.device.serial, point);
        requireSuccess(result);
      },
      waitForState: async (state) => {
        await waitForState(() => adapter.readState(context, driver), state, {
          timeoutMs: this.options.timeoutMs ?? 30_000,
          pollIntervalMs: this.options.pollIntervalMs ?? 250,
          sleep: this.options.sleep,
        });
      },
      launch: async () => {
        const identity = adapter.identity();
        const result = await driver.launch(
          context.device.serial,
          identity.packageId,
          identity.launchActivity,
        );
        requireSuccess(result);
      },
    });
  }
}

export interface IdleOutpostStateReader {
  read(
    context: AdapterContext,
    driver: DeviceDriver,
    config: IdleOutpostConfigReader,
  ): Promise<StateSnapshot>;
}

export interface IdleOutpostAdapterOptions {
  readonly stateReader?: IdleOutpostStateReader;
  readonly accountStateReader?: IdleOutpostAccountStateReader;
  readonly accountResetter?: IdleOutpostAccountResetter;
  readonly startupOverlayHandler?: IdleOutpostStartupOverlayHandler;
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

  async prepareContext(
    context: AdapterContext,
    driver: DeviceDriver,
    options: AdapterPreparationOptions = {},
  ): Promise<void> {
    if (
      context.artifact.packageId &&
      context.artifact.packageId !== this.identity().packageId
    ) {
      throw new FrameworkError(
        `Idle_Outpost artifact package mismatch: expected ${this.identity().packageId}, got ${context.artifact.packageId}`,
        "ARTIFACT_METADATA",
      );
    }

    const accountStateReader =
      this.options.accountStateReader ??
      (this.options.stateReader
        ? new SnapshotAccountStateReader(this.options.stateReader)
        : undefined);
    if (!accountStateReader) {
      throw new FrameworkError(
        "Idle_Outpost account detector is required before a real-device route can run",
        "HOST_TOOL",
      );
    }

    const identity = this.identity();
    requireSuccess(
      await driver.launch(
        context.device.serial,
        identity.packageId,
        identity.launchActivity,
      ),
    );
    await this.options.startupOverlayHandler?.dismiss(
      context,
      driver,
      this,
      options,
    );

    const mode = await accountStateReader.readAccountMode(
      context,
      driver,
      this.config,
    );
    if (mode === "new") return;
    if (options.accountPolicy === "preserve") return;
    if (!this.options.accountResetter) {
      throw new FrameworkError(
        "Idle_Outpost detected an existing account but no account resetter is configured",
        "HOST_TOOL",
      );
    }

    await this.options.accountResetter.reset(context, driver, this);
    const finalMode = await accountStateReader.readAccountMode(
      context,
      driver,
      this.config,
    );
    if (finalMode !== "new") {
      throw new FrameworkError(
        `Idle_Outpost account reset did not reach a new account state: ${finalMode}`,
        "BUSINESS_ASSERTION",
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
    if (template.kind === "normalized-point") return template;
    return template;
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

export async function createIdleOutpostScreenshotAdapter(
  manifestPath: string,
  configPath: string,
  options: IdleOutpostScreenshotAdapterOptions,
): Promise<IdleOutpostAdapter> {
  const [manifest, config] = await Promise.all([
    readIdleOutpostManifest(manifestPath),
    readIdleOutpostConfig(configPath),
  ]);
  const stateReader = new ScreenshotAccountStateReader({
    screenshotPath: options.screenshotPath,
    templateRoot: dirname(manifestPath),
    matcher: options.matcher ?? new PngTemplateMatcher(),
    templates: manifest.stateTemplates,
    retryCount: 3,
    retryDelayMs: 500,
  });
  return new IdleOutpostAdapter(manifest, config, {
    stateReader,
    accountStateReader: stateReader,
    accountResetter: new IdleOutpostUiAccountResetter({
      timeoutMs: options.resetTimeoutMs,
      pollIntervalMs: options.resetPollIntervalMs,
    }),
    startupOverlayHandler: new IdleOutpostStartupOverlayHandler(stateReader),
  });
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

function toScreenPoint(
  locator: Locator,
  display: DeviceInfo["display"],
): { x: number; y: number } {
  if (locator.kind === "normalized-point") {
    return {
      x: locator.x * display.width,
      y: locator.y * display.height,
    };
  }
  if (locator.kind === "screen-rect") {
    return {
      x: locator.x + locator.width / 2,
      y: locator.y + locator.height / 2,
    };
  }
  throw new FrameworkError(
    `Idle_Outpost reset target requires a coordinate locator: ${locator.kind}`,
    "GAME_LOCATOR",
  );
}

function requireSuccess(result: { exitCode: number; command: string }): void {
  if (result.exitCode !== 0) {
    throw new FrameworkError(
      `Idle_Outpost account reset command failed with exit ${result.exitCode}: ${result.command}`,
      "DEVICE_STATE",
    );
  }
}

class UnknownScreenshotStateError extends FrameworkError {
  constructor() {
    super(
      "Idle_Outpost screenshot state could not be classified above configured thresholds",
      "DEVICE_STATE",
    );
  }
}

function defaultSleep(durationMs: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, durationMs));
}

function getStartupDismissTarget(state: unknown): string | undefined {
  switch (state) {
    case "terrain-upgrade-window":
    case "terrain-upgrade-first-available":
    case "terrain-upgrade-owned":
    case "terrain-upgrade-all-owned":
      return "terrain.upgrade.close";
    case "startup-network-error":
      return "startup.network-error.retry";
    case "startup-vip-offer":
      return "startup.vip.close";
    case "startup-offline-income":
      return "startup.offline-income.close";
    case "startup-free-coins":
      return "startup.free-coins.dismiss";
    default:
      return undefined;
  }
}

function isTerrainUpgradeWindowState(state: unknown): boolean {
  return (
    state === "terrain-upgrade-window" ||
    state === "terrain-upgrade-first-available" ||
    state === "terrain-upgrade-owned" ||
    state === "terrain-upgrade-all-owned"
  );
}
