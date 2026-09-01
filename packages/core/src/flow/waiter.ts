import { FrameworkError, type StateSnapshot } from "../contracts/evidence.js";

export interface WaitForStateOptions {
  readonly timeoutMs: number;
  readonly pollIntervalMs?: number;
  readonly sleep?: (durationMs: number) => Promise<void>;
}

export async function waitForState(
  readState: () => Promise<StateSnapshot>,
  expectedState: string,
  options: WaitForStateOptions,
): Promise<StateSnapshot> {
  const startedAt = Date.now();
  const pollIntervalMs = options.pollIntervalMs ?? 250;
  const sleep = options.sleep ?? defaultSleep;

  while (true) {
    const snapshot = await readState();
    if (matchesState(snapshot, expectedState)) return snapshot;

    if (Date.now() - startedAt >= options.timeoutMs) {
      throw new FrameworkError(
        `Timed out waiting for state ${expectedState}; last state was ${String(snapshot.state ?? snapshot.currentState ?? "unknown")}`,
        "WAIT_TIMEOUT",
      );
    }

    await sleep(pollIntervalMs);
  }
}

function matchesState(snapshot: StateSnapshot, expectedState: string): boolean {
  return (
    snapshot.state === expectedState || snapshot.currentState === expectedState
  );
}

function defaultSleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}
