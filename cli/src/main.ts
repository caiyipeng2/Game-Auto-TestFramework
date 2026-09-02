import { randomBytes } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { AdbClient } from "../../packages/adb-driver/src/adb-client.js";
import { AdbDeviceDriver } from "../../packages/adb-driver/src/adb-device-driver.js";
import {
  assertArtifactCompatible,
  detectArtifactKind,
  type ArtifactInspection,
} from "../../packages/artifact-engine/src/artifact-inspector.js";
import type {
  DeviceDriver,
  DeviceInfo,
  InstallableArtifact,
} from "../../packages/core/src/contracts/device-driver.js";
import {
  FrameworkError,
  getFailureCategory,
  type FailureCategory,
  type StepFailure,
} from "../../packages/core/src/contracts/evidence.js";
import type {
  AdapterContext,
  GameAdapter,
} from "../../packages/core/src/contracts/game-adapter.js";
import { FlowRunner } from "../../packages/core/src/flow/flow-runner.js";
import { loadRouteFile } from "../../packages/core/src/flow/route-loader.js";
import {
  writeJsonReport,
  type DoctorCheck,
  type JsonReport,
} from "../../packages/report-engine/src/json-report.js";
import { writeJunitReport } from "../../packages/report-engine/src/junit-report.js";

export const CLI_EXIT_CODES = {
  HEALTHY: 0,
  TEST_FAILURE: 1,
  BLOCKED_PREREQUISITE: 2,
  INVALID_ARGUMENTS: 3,
  HOST_TOOL_FAILURE: 10,
} as const;

export interface ArtifactInspectorLike {
  inspect(path: string): Promise<ArtifactInspection>;
}

export interface CliDependencies {
  readonly driver?: DeviceDriver;
  readonly driverFactory?: (serverPort?: number) => DeviceDriver;
  readonly adapters?: readonly GameAdapter[];
  readonly artifactInspector?: ArtifactInspectorLike;
  readonly doctor?: () => Promise<readonly DoctorCheck[]>;
  readonly outputDir?: string;
  readonly runId?: () => string;
  readonly now?: () => Date;
  readonly write?: (message: string) => void;
  readonly writeError?: (message: string) => void;
}

interface ParsedCommand {
  readonly name: "doctor" | "artifact verify" | "device inspect" | "run";
  readonly options: Readonly<Record<string, string>>;
}

class CliUsageError extends Error {}

class CliBlockedError extends Error {}

export async function runCli(
  argv: readonly string[],
  dependencies: CliDependencies = {},
): Promise<number> {
  const write = dependencies.write ?? console.log;
  const writeError = dependencies.writeError ?? console.error;

  try {
    const command = parseCommand(argv);
    switch (command.name) {
      case "doctor":
        return await runDoctor(command.options, dependencies, write);
      case "artifact verify":
        return await runArtifactVerify(command.options, dependencies, write);
      case "device inspect":
        return await runDeviceInspect(command.options, dependencies, write);
      case "run":
        return await runRoute(command.options, dependencies, write);
    }
  } catch (error) {
    const exitCode = classifyCliError(error);
    writeError(`ERROR: ${safeErrorMessage(error)}`);
    return exitCode;
  }
}

function parseCommand(argv: readonly string[]): ParsedCommand {
  const [first, second, ...rest] = argv;
  if (first === "doctor") {
    return {
      name: "doctor",
      options: parseOptions([second, ...rest].filter(isArgument)),
    };
  }
  if (first === "artifact" && second === "verify") {
    return { name: "artifact verify", options: parseOptions(rest) };
  }
  if (first === "device" && second === "inspect") {
    return { name: "device inspect", options: parseOptions(rest) };
  }
  if (first === "run") {
    return {
      name: "run",
      options: parseOptions([second, ...rest].filter(isArgument)),
    };
  }
  throw new CliUsageError(
    "Usage: doctor | artifact verify | device inspect | run",
  );
}

function isArgument(value: string | undefined): value is string {
  return value !== undefined;
}

function parseOptions(
  args: readonly string[],
): Readonly<Record<string, string>> {
  const options: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument?.startsWith("--")) {
      throw new CliUsageError(`Unexpected argument: ${argument ?? ""}`);
    }

    const equalsIndex = argument.indexOf("=");
    const key = argument.slice(2, equalsIndex === -1 ? undefined : equalsIndex);
    const inlineValue =
      equalsIndex === -1 ? undefined : argument.slice(equalsIndex + 1);
    if (!key) throw new CliUsageError("Option name cannot be empty");

    const value = inlineValue ?? args[++index];
    if (!value || value.startsWith("--")) {
      throw new CliUsageError(`Option --${key} requires a value`);
    }
    options[key] = value;
  }
  return options;
}

async function runDoctor(
  options: Readonly<Record<string, string>>,
  dependencies: CliDependencies,
  write: (message: string) => void,
): Promise<number> {
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const checks = dependencies.doctor
    ? await dependencies.doctor()
    : await defaultDoctor();
  const status = checks.some((check) => check.status === "FAIL")
    ? "BLOCKED"
    : "PASS";
  const report: JsonReport = {
    schemaVersion: 1,
    kind: "doctor",
    runId: getRunId(options, dependencies),
    status,
    startedAt,
    finishedAt: now().toISOString(),
    checks,
  };
  const outputPath = reportPath(
    getOutputDir(options, dependencies),
    report.runId,
    "host",
    "doctor.json",
  );
  await writeJsonReport(report, outputPath);
  write(`JSON report: ${outputPath}`);
  return status === "PASS"
    ? CLI_EXIT_CODES.HEALTHY
    : CLI_EXIT_CODES.BLOCKED_PREREQUISITE;
}

async function defaultDoctor(): Promise<readonly DoctorCheck[]> {
  const adb = await new AdbClient().run(["version"]);
  return [
    { name: "node", status: "PASS", message: process.version },
    {
      name: "adb",
      status: adb.exitCode === 0 ? "PASS" : "FAIL",
      message: adb.exitCode === 0 ? adb.stdout.trim() : adb.stderr.trim(),
    },
  ];
}

async function runArtifactVerify(
  options: Readonly<Record<string, string>>,
  dependencies: CliDependencies,
  write: (message: string) => void,
): Promise<number> {
  const artifactPath = requiredOption(options, "artifact");
  const inspector = dependencies.artifactInspector;
  if (!inspector) {
    throw new CliBlockedError(
      "Artifact metadata reader is not configured; provide an adapter-owned inspector",
    );
  }

  const now = dependencies.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const inspection = await inspector.inspect(artifactPath);
  const serial = options.serial;
  const device = serial
    ? await getDriver(dependencies, options).inspectDevice(serial)
    : undefined;
  assertArtifactCompatible(inspection, {
    packageId: options["package-id"],
    device,
  });
  const report: JsonReport = {
    schemaVersion: 1,
    kind: "artifact",
    runId: getRunId(options, dependencies),
    status: "PASS",
    startedAt,
    finishedAt: now().toISOString(),
    serial,
    device,
    artifact: inspection.artifact,
    artifactInspection: inspection,
  };
  const outputPath = reportPath(
    getOutputDir(options, dependencies),
    report.runId,
    serial ?? "host",
    "artifact.json",
  );
  await writeJsonReport(report, outputPath);
  write(`JSON report: ${outputPath}`);
  return CLI_EXIT_CODES.HEALTHY;
}

async function runDeviceInspect(
  options: Readonly<Record<string, string>>,
  dependencies: CliDependencies,
  write: (message: string) => void,
): Promise<number> {
  const device = await selectDevice(
    getDriver(dependencies, options),
    options.serial,
  );
  const now = dependencies.now ?? (() => new Date());
  const report: JsonReport = {
    schemaVersion: 1,
    kind: "device",
    runId: getRunId(options, dependencies),
    status: "PASS",
    startedAt: now().toISOString(),
    finishedAt: now().toISOString(),
    serial: device.serial,
    device,
  };
  const outputPath = reportPath(
    getOutputDir(options, dependencies),
    report.runId,
    device.serial,
    "device.json",
  );
  await writeJsonReport(report, outputPath);
  write(`JSON report: ${outputPath}`);
  return CLI_EXIT_CODES.HEALTHY;
}

async function runRoute(
  options: Readonly<Record<string, string>>,
  dependencies: CliDependencies,
  write: (message: string) => void,
): Promise<number> {
  const adapterId = requiredOption(options, "adapter");
  const routePath = requiredOption(options, "route");
  const artifactPath = requiredOption(options, "artifact");
  const adapter = (dependencies.adapters ?? []).find(
    (candidate) => candidate.id === adapterId,
  );
  if (!adapter) {
    throw new CliBlockedError(`Adapter is not registered: ${adapterId}`);
  }

  const route = await loadRouteFile(routePath);
  const driver = getDriver(dependencies, options);
  const device = await selectDevice(driver, options.serial);
  const resolvedArtifact = await resolveArtifact(artifactPath, dependencies);
  const profiles = adapter.profiles();
  const requestedProfile = route.profile ?? options.profile;
  const profile =
    profiles.find((candidate) => candidate.id === requestedProfile) ??
    profiles[0];
  if (!profile)
    throw new CliBlockedError(`Adapter has no profiles: ${adapterId}`);

  const runId = getRunId(options, dependencies);
  const now = dependencies.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const baseDir = reportDirectory(
    getOutputDir(options, dependencies),
    runId,
    device.serial,
  );
  const context: AdapterContext = {
    runId,
    device,
    artifact: resolvedArtifact.artifact,
    profile,
    variables: {},
  };

  let result;
  try {
    result = await new FlowRunner(driver, adapter, context, {
      evidenceDir: join(baseDir, "evidence"),
      now: () => now().toISOString(),
    }).run(route);
  } catch (error) {
    const failure = toStepFailure(error);
    const report: JsonReport = {
      schemaVersion: 1,
      kind: "run",
      runId,
      serial: device.serial,
      adapterId,
      routeId: route.id,
      status: statusForFailure(failure),
      startedAt,
      finishedAt: now().toISOString(),
      device,
      artifact: resolvedArtifact.artifact,
      artifactInspection: resolvedArtifact.inspection,
      failure,
      steps: [],
    };
    await writeRunReports(report, baseDir, write);
    return exitCodeForStatus(report.status);
  }

  const report: JsonReport = {
    schemaVersion: 1,
    kind: "run",
    runId,
    serial: device.serial,
    adapterId,
    routeId: result.routeId,
    status: result.status,
    startedAt,
    finishedAt: now().toISOString(),
    device,
    artifact: resolvedArtifact.artifact,
    artifactInspection: resolvedArtifact.inspection,
    steps: result.steps,
    metadata: {
      profile: profile.id,
      environment: profile.environment,
    },
  };
  await writeRunReports(report, baseDir, write);
  return exitCodeForStatus(report.status);
}

async function writeRunReports(
  report: JsonReport,
  baseDir: string,
  write: (message: string) => void,
): Promise<void> {
  const jsonPath = join(baseDir, "run.json");
  const junitPath = join(baseDir, "junit.xml");
  await writeJsonReport(report, jsonPath);
  await writeJunitReport(report, junitPath);
  write(`JSON report: ${jsonPath}`);
  write(`JUnit report: ${junitPath}`);
}

async function resolveArtifact(
  path: string,
  dependencies: CliDependencies,
): Promise<{ artifact: InstallableArtifact; inspection?: ArtifactInspection }> {
  if (dependencies.artifactInspector) {
    const inspection = await dependencies.artifactInspector.inspect(path);
    return { artifact: inspection.artifact, inspection };
  }
  return { artifact: { path, kind: detectArtifactKind(path) } };
}

async function selectDevice(
  driver: DeviceDriver,
  serial: string | undefined,
): Promise<DeviceInfo> {
  if (serial) return driver.inspectDevice(serial);

  const devices = await driver.listDevices();
  if (devices.length === 1) return devices[0];
  if (devices.length === 0) {
    throw new CliBlockedError(
      "No online Android device found; connect a device or pass --serial",
    );
  }
  throw new CliBlockedError(
    "Multiple Android devices found; pass --serial explicitly",
  );
}

function getDriver(
  dependencies: CliDependencies,
  options: Readonly<Record<string, string>> = {},
): DeviceDriver {
  if (dependencies.driver) return dependencies.driver;
  const serverPort = options["adb-port"]
    ? parsePort(options["adb-port"])
    : undefined;
  return (
    dependencies.driverFactory?.(serverPort) ??
    new AdbDeviceDriver(new AdbClient({ serverPort }))
  );
}

function parsePort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new CliUsageError(`Invalid --adb-port value: ${value}`);
  }
  return port;
}

function requiredOption(
  options: Readonly<Record<string, string>>,
  name: string,
): string {
  const value = options[name];
  if (!value) throw new CliUsageError(`Missing required option --${name}`);
  return value;
}

function getRunId(
  options: Readonly<Record<string, string>>,
  dependencies: CliDependencies,
): string {
  return options["run-id"] ?? dependencies.runId?.() ?? createRunId();
}

function createRunId(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `run-${timestamp}-${randomBytes(3).toString("hex")}`;
}

function getOutputDir(
  options: Readonly<Record<string, string>>,
  dependencies: CliDependencies,
): string {
  return options["output-dir"] ?? dependencies.outputDir ?? "reports";
}

function reportPath(
  outputDir: string,
  runId: string,
  serial: string,
  fileName: string,
): string {
  return join(reportDirectory(outputDir, runId, serial), fileName);
}

function reportDirectory(
  outputDir: string,
  runId: string,
  serial: string,
): string {
  return join(outputDir, safeSegment(runId), safeSegment(serial));
}

function safeSegment(value: string): string {
  const sanitized = value.replace(/[^A-Za-z0-9._-]+/g, "_");
  return sanitized && sanitized !== "." && sanitized !== ".." ? sanitized : "_";
}

function toStepFailure(error: unknown): StepFailure {
  return {
    category: getFailureCategory(error),
    message: safeErrorMessage(error),
    ...(error instanceof FrameworkError ? { code: error.code } : {}),
  };
}

function statusForFailure(failure: StepFailure): "FAIL" | "BLOCKED" {
  return isTestFailureCategory(failure.category) ? "FAIL" : "BLOCKED";
}

function isTestFailureCategory(category: FailureCategory): boolean {
  return [
    "BUSINESS_ASSERTION",
    "GAME_LOCATOR",
    "NATIVE_UI_LOCATOR",
    "WAIT_TIMEOUT",
    "CRASH",
    "ANR",
  ].includes(category);
}

function exitCodeForStatus(status: JsonReport["status"]): number {
  if (status === "PASS") return CLI_EXIT_CODES.HEALTHY;
  if (status === "FAIL") return CLI_EXIT_CODES.TEST_FAILURE;
  return CLI_EXIT_CODES.BLOCKED_PREREQUISITE;
}

function classifyCliError(error: unknown): number {
  if (error instanceof CliUsageError) return CLI_EXIT_CODES.INVALID_ARGUMENTS;
  if (error instanceof CliBlockedError)
    return CLI_EXIT_CODES.BLOCKED_PREREQUISITE;
  if (error instanceof FrameworkError) {
    return isTestFailureCategory(error.category)
      ? CLI_EXIT_CODES.TEST_FAILURE
      : [
            "DEVICE_CONNECTION",
            "DEVICE_STATE",
            "ARTIFACT_METADATA",
            "INSTALLATION",
            "APPLICATION_STARTUP",
          ].includes(error.category)
        ? CLI_EXIT_CODES.BLOCKED_PREREQUISITE
        : CLI_EXIT_CODES.HOST_TOOL_FAILURE;
  }
  return CLI_EXIT_CODES.HOST_TOOL_FAILURE;
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isMainModule(): boolean {
  const entry = process.argv[1];
  return (
    Boolean(entry) && import.meta.url === pathToFileURL(resolve(entry)).href
  );
}

if (isMainModule()) {
  runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
