import { readFile } from "node:fs/promises";
import { extname } from "node:path";

import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import { parse as parseYaml } from "yaml";

import type {
  AssertStep,
  GenericRouteStep,
  RouteDefinition,
  RoutePrecondition,
  RouteStep,
  TapStep,
  WaitStep,
} from "../contracts/flow.js";
import { FrameworkError } from "../contracts/evidence.js";

import routeSchema from "../../../../schemas/route.schema.json" with { type: "json" };

export type LoadedRoute = RouteDefinition;

let validator: ValidateFunction | undefined;

export async function loadRouteFile(path: string): Promise<LoadedRoute> {
  let source: string;
  try {
    source = await readFile(path, "utf8");
  } catch {
    throw new FrameworkError(
      `Route file does not exist or cannot be read: ${path}`,
      "HOST_TOOL",
    );
  }

  let parsed: unknown;
  try {
    parsed =
      extname(path).toLowerCase() === ".json"
        ? JSON.parse(source)
        : parseYaml(source);
  } catch (error) {
    throw new FrameworkError(
      `Route file is not valid YAML or JSON: ${formatError(error)}`,
      "HOST_TOOL",
    );
  }

  const validate = getValidator();
  if (!validate(parsed)) {
    const details = (validate.errors ?? [])
      .map(
        (error) =>
          `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
      )
      .join("; ");
    throw new FrameworkError(
      `Route schema validation failed: ${details}`,
      "HOST_TOOL",
    );
  }

  return normalizeRoute(parsed as RawRoute);
}

function getValidator(): ValidateFunction {
  if (validator) return validator;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const compiled = ajv.compile(routeSchema);
  validator = compiled;
  return compiled;
}

interface RawRoute {
  schemaVersion: number;
  id: string;
  adapter: string;
  profile?: string;
  accountPolicy?: "reset-existing" | "preserve";
  preconditions?: RawPrecondition[];
  steps: RawStep[];
}

interface RawPrecondition {
  context: RoutePrecondition["context"];
  value?: unknown;
}

type RawStep = Record<string, unknown> & { id: string };

function normalizeRoute(route: RawRoute): LoadedRoute {
  return {
    schemaVersion: route.schemaVersion,
    id: route.id,
    adapter: route.adapter,
    profile: route.profile,
    accountPolicy: route.accountPolicy,
    preconditions: route.preconditions?.map((precondition) => ({
      context: precondition.context,
      value: precondition.value,
    })),
    steps: route.steps.map(normalizeStep),
  };
}

function normalizeStep(raw: RawStep): RouteStep {
  if ("tap" in raw) {
    const tap = raw.tap as { target: string };
    const step: TapStep = { id: raw.id, type: "tap", target: tap.target };
    return step;
  }

  if ("wait" in raw) {
    const wait = raw.wait as {
      state: string;
      timeoutMs?: number;
      pollIntervalMs?: number;
    };
    const step: WaitStep = {
      id: raw.id,
      type: "wait",
      state: wait.state,
      timeoutMs: wait.timeoutMs ?? 30_000,
      pollIntervalMs: wait.pollIntervalMs ?? 250,
    };
    return step;
  }

  if ("assert" in raw) {
    const assertion = raw.assert as Record<string, unknown> & {
      state: string;
      field?: string;
    };
    const operatorKey = ["equals", "notEquals", "exists", "contains"].find(
      (key) => key in assertion,
    );
    if (!operatorKey) {
      throw new FrameworkError(
        `Route assert step has no operator: ${raw.id}`,
        "HOST_TOOL",
      );
    }
    const step: AssertStep = {
      id: raw.id,
      type: "assert",
      state: assertion.state,
      field: assertion.field,
      operator: operatorKey as AssertStep["operator"],
      expected: assertion[operatorKey],
    };
    return step;
  }

  if ("screenshot" in raw) {
    const screenshot = raw.screenshot as { name: string };
    const step: GenericRouteStep = {
      id: raw.id,
      type: "screenshot",
      name: screenshot.name,
    };
    return step;
  }

  const genericOperation = [
    "install",
    "clearData",
    "launch",
    "swipe",
    "input",
    "collectLogcat",
    "collectPerformance",
    "repeat",
    "branch",
  ].find((operation) => operation in raw);
  if (genericOperation) {
    const payload = raw[genericOperation];
    if (genericOperation === "repeat") {
      const repeat = payload as { times: number; steps: RawStep[] };
      return {
        id: raw.id,
        type: "repeat",
        times: repeat.times,
        steps: repeat.steps.map(normalizeStep),
      } as GenericRouteStep;
    }
    if (genericOperation === "branch") {
      const branch = payload as {
        condition: { state: string };
        then: RawStep[];
        else?: RawStep[];
      };
      return {
        id: raw.id,
        type: "branch",
        condition: branch.condition,
        then: branch.then.map(normalizeStep),
        else: branch.else?.map(normalizeStep) ?? [],
      } as GenericRouteStep;
    }
    return {
      id: raw.id,
      type: genericOperation as GenericRouteStep["type"],
      ...(typeof payload === "object" && payload !== null ? payload : {}),
    } as GenericRouteStep;
  }

  throw new FrameworkError(
    `Route step has no supported operation: ${raw.id}`,
    "HOST_TOOL",
  );
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
