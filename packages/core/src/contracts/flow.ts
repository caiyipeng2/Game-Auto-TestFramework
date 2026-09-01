export type RouteStepType =
  | "install"
  | "clearData"
  | "launch"
  | "tap"
  | "swipe"
  | "input"
  | "wait"
  | "assert"
  | "screenshot"
  | "collectLogcat"
  | "collectPerformance"
  | "repeat"
  | "branch";

export interface RouteStepBase {
  readonly id: string;
  readonly type: RouteStepType;
}

export interface TapStep extends RouteStepBase {
  readonly type: "tap";
  readonly target: string;
}

export interface WaitStep extends RouteStepBase {
  readonly type: "wait";
  readonly state: string;
  readonly timeoutMs: number;
  readonly pollIntervalMs?: number;
}

export interface AssertStep extends RouteStepBase {
  readonly type: "assert";
  readonly state: string;
  readonly field?: string;
  readonly operator: "equals" | "notEquals" | "exists" | "contains";
  readonly expected?: unknown;
}

export interface GenericRouteStep extends RouteStepBase {
  readonly type: Exclude<RouteStepType, "tap" | "wait" | "assert">;
  readonly [key: string]: unknown;
}

export type RouteStep = TapStep | WaitStep | AssertStep | GenericRouteStep;

export interface RoutePrecondition {
  readonly context: "clean-data" | "existing-data" | "logged-in";
  readonly value?: unknown;
}

export interface RouteDefinition {
  readonly schemaVersion: number;
  readonly id: string;
  readonly adapter: string;
  readonly profile?: string;
  readonly preconditions?: readonly RoutePrecondition[];
  readonly steps: readonly RouteStep[];
}
