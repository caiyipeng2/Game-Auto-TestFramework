import { execFile } from "node:child_process";

import type { CommandResult } from "../../core/src/contracts/device-driver.js";

export interface BundletoolCommandRunner {
  run(executablePath: string, args: readonly string[]): Promise<CommandResult>;
}

export interface BundletoolRunnerOptions {
  readonly javaPath: string;
  readonly jarPath: string;
  readonly runner?: BundletoolCommandRunner;
  readonly timeoutMs?: number;
}

export class BundletoolRunner {
  private readonly runner: BundletoolCommandRunner;
  private readonly timeoutMs: number;

  constructor(private readonly options: BundletoolRunnerOptions) {
    this.runner =
      options.runner ?? new NodeBundletoolCommandRunner(options.timeoutMs);
    this.timeoutMs = options.timeoutMs ?? 600_000;
  }

  version(): Promise<CommandResult> {
    return this.run(["version"]);
  }

  validateBundle(bundlePath: string): Promise<CommandResult> {
    return this.run(["validate", `--bundle=${bundlePath}`]);
  }

  getDeviceSpec(adbPath: string, outputPath: string): Promise<CommandResult> {
    return this.run([
      "get-device-spec",
      `--adb=${adbPath}`,
      `--output=${outputPath}`,
    ]);
  }

  extractApks(
    apksPath: string,
    deviceSpecPath: string,
    outputDir: string,
  ): Promise<CommandResult> {
    return this.run([
      "extract-apks",
      `--apks=${apksPath}`,
      `--device-spec=${deviceSpecPath}`,
      "--include-metadata",
      `--output-dir=${outputDir}`,
    ]);
  }

  dumpManifest(bundlePath: string): Promise<CommandResult> {
    return this.run(["dump", "manifest", `--bundle=${bundlePath}`]);
  }

  private run(args: readonly string[]): Promise<CommandResult> {
    return this.runner.run(this.options.javaPath, [
      "-jar",
      this.options.jarPath,
      ...args,
    ]);
  }
}

class NodeBundletoolCommandRunner implements BundletoolCommandRunner {
  constructor(private readonly timeoutMs = 600_000) {}

  run(executablePath: string, args: readonly string[]): Promise<CommandResult> {
    const commandArgs = [...args];
    const command = [executablePath, ...commandArgs].join(" ");
    const startedAt = Date.now();

    return new Promise((resolve) => {
      execFile(
        executablePath,
        commandArgs,
        {
          timeout: this.timeoutMs,
          maxBuffer: 64 * 1024 * 1024,
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
