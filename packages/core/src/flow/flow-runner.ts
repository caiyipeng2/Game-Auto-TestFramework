import { join } from "node:path";

import type { DeviceDriver, ScreenPoint } from "../contracts/device-driver.js";
import type {
  AdapterContext,
  GameAdapter,
  Locator,
  StateAssertion,
} from "../contracts/game-adapter.js";
import {
  FrameworkError,
  getFailureCategory,
  type EvidenceArtifactRef,
  type StateSnapshot,
  type StepEvidence,
  type StepFailure,
} from "../contracts/evidence.js";
import type {
  AssertStep,
  GenericRouteStep,
  RouteDefinition,
  RouteStep,
  TapStep,
  WaitStep,
} from "../contracts/flow.js";
import { waitForState } from "./waiter.js";

export interface FlowRunnerOptions {
  readonly evidenceDir: string;
  readonly now?: () => string;
  readonly sleep?: (durationMs: number) => Promise<void>;
}

export interface FlowRunResult {
  readonly routeId: string;
  readonly status: "PASS" | "FAIL";
  readonly steps: readonly StepEvidence[];
}

export class FlowRunner {
  private readonly now: () => string;

  constructor(
    private readonly driver: DeviceDriver,
    private readonly adapter: GameAdapter,
    private readonly context: AdapterContext,
    private readonly options: FlowRunnerOptions,
  ) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async run(route: RouteDefinition): Promise<FlowRunResult> {
    if (route.adapter !== this.adapter.id) {
      throw new FrameworkError(
        `Route adapter mismatch: expected ${this.adapter.id}, got ${route.adapter}`,
        "HOST_TOOL",
      );
    }

    await this.adapter.prepareContext(this.context, this.driver);
    const evidence: StepEvidence[] = [];

    try {
      for (const step of route.steps) {
        const result = await this.runStep(step);
        evidence.push(result);
        if (result.status === "FAIL") {
          return { routeId: route.id, status: "FAIL", steps: evidence };
        }
      }
      return { routeId: route.id, status: "PASS", steps: evidence };
    } finally {
      await this.adapter.cleanupContext(this.context, this.driver);
    }
  }

  private async runStep(step: RouteStep): Promise<StepEvidence> {
    const startedAt = this.now();
    let stateBefore: StateSnapshot | undefined;
    let stateAfter: StateSnapshot | undefined;
    const artifacts: EvidenceArtifactRef[] = [];

    try {
      stateBefore = await this.adapter.readState(this.context, this.driver);
      await this.executeStep(step, artifacts);
      stateAfter = await this.adapter.readState(this.context, this.driver);
      return {
        stepId: step.id,
        status: "PASS",
        startedAt,
        finishedAt: this.now(),
        stateBefore,
        stateAfter,
        artifacts,
      };
    } catch (error) {
      const failure: StepFailure = {
        category: getFailureCategory(error),
        message: error instanceof Error ? error.message : String(error),
        code: error instanceof FrameworkError ? error.code : undefined,
      };
      return {
        stepId: step.id,
        status: "FAIL",
        startedAt,
        finishedAt: this.now(),
        stateBefore,
        stateAfter,
        artifacts,
        failure,
      };
    }
  }

  private async executeStep(
    step: RouteStep,
    artifacts: EvidenceArtifactRef[],
  ): Promise<void> {
    switch (step.type) {
      case "wait":
        await this.executeWait(step, artifacts);
        return;
      case "tap":
        await this.executeTap(step);
        return;
      case "swipe":
        await this.executeSwipe(step);
        return;
      case "assert":
        await this.executeAssert(step);
        return;
      case "screenshot":
        await this.executeScreenshot(step, artifacts);
        return;
      case "input":
        await this.requireSuccess(
          await this.driver.inputText(
            this.context.device.serial,
            String(step.text ?? ""),
          ),
        );
        return;
      case "clearData":
        await this.requireSuccess(
          await this.driver.clearData(
            this.context.device.serial,
            String(step.packageId ?? this.adapter.identity().packageId),
          ),
        );
        return;
      case "launch":
        await this.requireSuccess(
          await this.driver.launch(
            this.context.device.serial,
            String(step.packageId ?? this.adapter.identity().packageId),
            String(step.activity ?? this.adapter.identity().launchActivity),
          ),
        );
        return;
      case "install":
        await this.requireSuccess(
          await this.driver.installArtifact(
            this.context.device.serial,
            this.context.artifact,
          ),
        );
        return;
      case "collectLogcat": {
        const path = join(
          this.options.evidenceDir,
          String(step.name ?? `${step.id}.logcat.txt`),
        );
        await this.requireSuccess(
          await this.driver.captureLogcat(this.context.device.serial, path),
        );
        artifacts.push({ kind: "logcat", path });
        return;
      }
      case "collectPerformance": {
        const path = join(
          this.options.evidenceDir,
          String(step.name ?? `${step.id}.performance.txt`),
        );
        await this.requireSuccess(
          await this.driver.collectPerformance(
            this.context.device.serial,
            this.adapter.identity().packageId,
            path,
          ),
        );
        artifacts.push({ kind: "performance", path });
        return;
      }
      case "repeat": {
        const times = Number(step.times);
        const children = this.getChildSteps(step.steps);
        for (let index = 0; index < times; index += 1) {
          for (const child of children) {
            await this.executeStep(child, artifacts);
          }
        }
        return;
      }
      case "branch": {
        const condition = step.condition as { state?: unknown };
        const currentState = await this.adapter.readState(
          this.context,
          this.driver,
        );
        const children =
          currentState.state === condition.state
            ? this.getChildSteps(step.then)
            : this.getChildSteps(step.else);
        for (const child of children) {
          await this.executeStep(child, artifacts);
        }
        return;
      }
      default:
        throw new FrameworkError("Unsupported route step", "HOST_TOOL");
    }
  }

  private async executeWait(
    step: WaitStep,
    _artifacts: EvidenceArtifactRef[],
  ): Promise<void> {
    await waitForState(
      () => this.adapter.readState(this.context, this.driver),
      step.state,
      {
        timeoutMs: step.timeoutMs,
        pollIntervalMs: step.pollIntervalMs,
        sleep: this.options.sleep,
      },
    );
  }

  private async executeTap(step: TapStep): Promise<void> {
    const locator = await this.adapter.resolveTarget(step.target, this.context);
    const point = this.toScreenPoint(locator);
    await this.requireSuccess(
      await this.driver.tap(this.context.device.serial, point),
    );
  }

  private async executeSwipe(step: GenericRouteStep): Promise<void> {
    const start = this.readPoint(step.start);
    const end = this.readPoint(step.end);
    const durationMs = Number(step.durationMs ?? 250);
    await this.requireSuccess(
      await this.driver.swipe(
        this.context.device.serial,
        start,
        end,
        durationMs,
      ),
    );
  }

  private async executeAssert(step: AssertStep): Promise<void> {
    const assertion: StateAssertion = {
      state: step.state,
      field: step.field,
      operator: step.operator,
      expected: step.expected,
    };
    await this.adapter.assertState(assertion, this.context, this.driver);
  }

  private async executeScreenshot(
    step: GenericRouteStep,
    artifacts: EvidenceArtifactRef[],
  ): Promise<void> {
    const path = join(this.options.evidenceDir, `${String(step.name)}.png`);
    await this.requireSuccess(
      await this.driver.captureScreenshot(this.context.device.serial, path),
    );
    artifacts.push({ kind: "screenshot", path });
  }

  private toScreenPoint(locator: Locator): ScreenPoint {
    if (locator.kind === "screen-rect") {
      return {
        x: locator.x + locator.width / 2,
        y: locator.y + locator.height / 2,
      };
    }

    if (locator.kind === "normalized-point") {
      return {
        x: locator.x * this.context.device.display.width,
        y: locator.y * this.context.device.display.height,
      };
    }

    if (locator.kind === "native-selector") {
      throw new FrameworkError(
        `Native locator requires an active UI backend: ${locator.strategy}=${locator.value}`,
        "NATIVE_UI_LOCATOR",
      );
    }

    throw new FrameworkError(
      `Image locator requires an image backend: ${locator.path}`,
      "GAME_LOCATOR",
    );
  }

  private readPoint(value: unknown): ScreenPoint {
    if (
      typeof value !== "object" ||
      value === null ||
      typeof (value as { x?: unknown }).x !== "number" ||
      typeof (value as { y?: unknown }).y !== "number"
    ) {
      throw new FrameworkError("Route swipe point is invalid", "HOST_TOOL");
    }
    return {
      x: (value as { x: number }).x,
      y: (value as { y: number }).y,
    };
  }

  private getChildSteps(value: unknown): RouteStep[] {
    if (!Array.isArray(value)) return [];
    return value as RouteStep[];
  }

  private async requireSuccess(result: {
    exitCode: number;
    command: string;
  }): Promise<void> {
    if (result.exitCode !== 0) {
      throw new FrameworkError(
        `Device command failed with exit ${result.exitCode}: ${result.command}`,
        "DEVICE_STATE",
      );
    }
  }
}
