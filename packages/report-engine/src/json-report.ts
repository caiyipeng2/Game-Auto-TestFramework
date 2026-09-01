import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type {
  DeviceInfo,
  InstallableArtifact,
} from "../../core/src/contracts/device-driver.js";
import type {
  EvidenceArtifactRef,
  StateSnapshot,
  StepEvidence,
  StepFailure,
} from "../../core/src/contracts/evidence.js";
import type { ArtifactInspection } from "../../artifact-engine/src/artifact-inspector.js";

export type ReportKind = "doctor" | "artifact" | "device" | "run";
export type ReportStatus = "PASS" | "FAIL" | "BLOCKED" | "SKIPPED";

export interface DoctorCheck {
  readonly name: string;
  readonly status: "PASS" | "FAIL" | "SKIPPED";
  readonly message?: string;
}

export interface JsonReport {
  readonly schemaVersion: 1;
  readonly kind: ReportKind;
  readonly runId: string;
  readonly status: ReportStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly serial?: string;
  readonly adapterId?: string;
  readonly routeId?: string;
  readonly device?: DeviceInfo;
  readonly artifact?: InstallableArtifact;
  readonly artifactInspection?: ArtifactInspection;
  readonly steps?: readonly StepEvidence[];
  readonly checks?: readonly DoctorCheck[];
  readonly failure?: StepFailure;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export async function writeJsonReport(
  report: JsonReport,
  outputPath: string,
): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(redactSensitive(report), null, 2)}\n`,
    "utf8",
  );
  return outputPath;
}

export function redactSensitive<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown, key?: string): unknown {
  if (key && isSensitiveKey(key)) return "[REDACTED]";

  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item));
  if (typeof value !== "object" || value === null) return value;

  return Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      redactValue(entryValue, entryKey),
    ]),
  );
}

function isSensitiveKey(key: string): boolean {
  return /(access.?token|refresh.?token|token|secret|password|passwd|private.?key|signing.?key|authorization|credential)/i.test(
    key,
  );
}

function redactString(value: string): string {
  return value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, "$1[REDACTED]")
    .replace(
      /((?:token|secret|password|passwd|private[_ -]?key|signing[_ -]?key)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[REDACTED]",
    );
}

export type ReportEvidence = Readonly<{
  stateBefore?: StateSnapshot;
  stateAfter?: StateSnapshot;
  artifacts?: readonly EvidenceArtifactRef[];
}>;
