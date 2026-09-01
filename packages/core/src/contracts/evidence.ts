export const FAILURE_CATEGORIES = [
  "HOST_TOOL",
  "DEVICE_CONNECTION",
  "DEVICE_STATE",
  "ARTIFACT_METADATA",
  "INSTALLATION",
  "APPLICATION_STARTUP",
  "NATIVE_UI_LOCATOR",
  "GAME_LOCATOR",
  "WAIT_TIMEOUT",
  "NETWORK",
  "CRASH",
  "ANR",
  "BUSINESS_ASSERTION",
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];
export type StepStatus = "PASS" | "FAIL" | "BLOCKED" | "SKIPPED";
export type StateSnapshot = Readonly<Record<string, unknown>>;

export interface EvidenceArtifactRef {
  readonly kind:
    | "screenshot"
    | "logcat"
    | "performance"
    | "ui-hierarchy"
    | "command"
    | "other";
  readonly path: string;
  readonly sha256?: string;
}

export interface StepFailure {
  readonly category: FailureCategory;
  readonly message: string;
  readonly code?: string;
}

export interface StepEvidence {
  readonly stepId: string;
  readonly status: StepStatus;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly stateBefore?: StateSnapshot;
  readonly stateAfter?: StateSnapshot;
  readonly artifacts: readonly EvidenceArtifactRef[];
  readonly failure?: StepFailure;
}

export class FrameworkError extends Error {
  readonly code = "FRAMEWORK_ERROR";

  constructor(
    message: string,
    readonly category: FailureCategory,
  ) {
    super(message);
    this.name = "FrameworkError";
  }
}

export function isFailureCategory(value: string): value is FailureCategory {
  return (FAILURE_CATEGORIES as readonly string[]).includes(value);
}

export function getFailureCategory(error: unknown): FailureCategory {
  if (error instanceof FrameworkError) return error.category;

  if (typeof error === "object" && error !== null && "category" in error) {
    const category = error.category;
    if (typeof category === "string" && isFailureCategory(category))
      return category;
  }

  return "HOST_TOOL";
}
