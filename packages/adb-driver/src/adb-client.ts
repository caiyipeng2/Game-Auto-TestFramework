import { execFile } from "node:child_process";

import type { CommandResult } from "../../core/src/contracts/device-driver.js";

export interface AdbCommandRunner {
  run(args: readonly string[]): Promise<CommandResult>;
}

export interface AdbClientOptions {
  readonly executablePath?: string;
  readonly serverPort?: number;
  readonly defaultTimeoutMs?: number;
  readonly maxBufferBytes?: number;
}

export interface DeviceCommandOutputs {
  readonly props: string;
  readonly size: string;
  readonly density: string;
  readonly battery: string;
  readonly storage: string;
  readonly connectivity: string;
}

export class AdbClient implements AdbCommandRunner {
  private readonly executablePath: string;
  private readonly serverPort: number | undefined;
  private readonly defaultTimeoutMs: number;
  private readonly maxBufferBytes: number;

  constructor(options: AdbClientOptions = {}) {
    this.executablePath = options.executablePath ?? "adb";
    this.serverPort = options.serverPort;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 60_000;
    this.maxBufferBytes = options.maxBufferBytes ?? 16 * 1024 * 1024;
  }

  run(
    args: readonly string[],
    timeoutMs = this.defaultTimeoutMs,
  ): Promise<CommandResult> {
    const commandArgs = buildAdbCommandArgs(args, this.serverPort);
    const command = [this.executablePath, ...commandArgs].join(" ");
    const startedAt = Date.now();

    return new Promise((resolve) => {
      execFile(
        this.executablePath,
        commandArgs,
        {
          timeout: timeoutMs,
          maxBuffer: this.maxBufferBytes,
          windowsHide: true,
        },
        (error, stdout, stderr) => {
          const errorCode = error?.code;
          const exitCode =
            typeof errorCode === "number" ? errorCode : error ? -1 : 0;

          resolve({
            command,
            exitCode,
            stdout,
            stderr: stderr || (error?.message ?? ""),
            durationMs: Date.now() - startedAt,
          });
        },
      );
    });
  }
}

export function buildAdbCommandArgs(
  args: readonly string[],
  serverPort: number | undefined,
): string[] {
  return serverPort === undefined
    ? [...args]
    : ["-P", String(serverPort), ...args];
}
