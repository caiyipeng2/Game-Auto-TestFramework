import { dirname } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import { AdbClient, type AdbCommandRunner } from "./adb-client.js";
import { parseAdbDevices, parseDeviceInfo } from "./device-parser.js";
import type {
  CommandResult,
  DeviceCapability,
  DeviceDriver,
  DeviceInfo,
  InstallableArtifact,
  ScreenPoint,
} from "../../core/src/contracts/device-driver.js";
import { FrameworkError } from "../../core/src/contracts/evidence.js";

const CAPABILITIES = new Set<DeviceCapability>([
  "installArtifact",
  "clearData",
  "launch",
  "input",
  "screenshot",
  "logcat",
  "performance",
]);

const REMOTE_SCREENSHOT_PATH =
  "/sdcard/game-auto-test-framework-screenshot.png";

export class AdbDeviceDriver implements DeviceDriver {
  constructor(private readonly runner: AdbCommandRunner = new AdbClient()) {}

  async listDevices(): Promise<readonly DeviceInfo[]> {
    const result = await this.runner.run(["devices", "-l"]);
    if (result.exitCode !== 0) return [];

    const onlineDevices = parseAdbDevices(result.stdout).filter(
      (device) => device.state === "device",
    );
    return Promise.all(
      onlineDevices.map((device) => this.inspectDevice(device.serial)),
    );
  }

  async inspectDevice(serial: string): Promise<DeviceInfo> {
    const outputs = await Promise.all([
      this.run(serial, ["shell", "getprop"]),
      this.run(serial, ["shell", "wm", "size"]),
      this.run(serial, ["shell", "wm", "density"]),
      this.run(serial, ["shell", "dumpsys", "battery"]),
      this.run(serial, ["shell", "df", "-k", "/data/user/0"]),
      this.run(serial, ["shell", "dumpsys", "connectivity"]),
    ]);

    return parseDeviceInfo(serial, {
      props: outputs[0].stdout,
      size: outputs[1].stdout,
      density: outputs[2].stdout,
      battery: outputs[3].stdout,
      storage: outputs[4].stdout,
      connectivity: outputs[5].stdout,
    });
  }

  async installArtifact(
    serial: string,
    artifact: InstallableArtifact,
  ): Promise<CommandResult> {
    if (artifact.kind !== "apk") {
      throw new FrameworkError(
        "ADB backend installs APK files only",
        "INSTALLATION",
      );
    }

    return this.run(serial, ["install", "-r", artifact.path]);
  }

  clearData(serial: string, packageId: string): Promise<CommandResult> {
    return this.run(serial, ["shell", "pm", "clear", packageId]);
  }

  launch(
    serial: string,
    packageId: string,
    activity: string,
  ): Promise<CommandResult> {
    return this.run(serial, [
      "shell",
      "am",
      "start",
      "-W",
      "-n",
      `${packageId}/${activity}`,
    ]);
  }

  tap(serial: string, point: ScreenPoint): Promise<CommandResult> {
    return this.run(serial, [
      "shell",
      "input",
      "tap",
      String(Math.round(point.x)),
      String(Math.round(point.y)),
    ]);
  }

  swipe(
    serial: string,
    start: ScreenPoint,
    end: ScreenPoint,
    durationMs: number,
  ): Promise<CommandResult> {
    return this.run(serial, [
      "shell",
      "input",
      "swipe",
      String(Math.round(start.x)),
      String(Math.round(start.y)),
      String(Math.round(end.x)),
      String(Math.round(end.y)),
      String(Math.max(0, Math.round(durationMs))),
    ]);
  }

  inputText(serial: string, text: string): Promise<CommandResult> {
    return this.run(serial, [
      "shell",
      "input",
      "text",
      text.replace(/\s/g, "%s"),
    ]);
  }

  async captureScreenshot(
    serial: string,
    outputPath: string,
  ): Promise<CommandResult> {
    const capture = await this.run(serial, [
      "shell",
      "screencap",
      "-p",
      REMOTE_SCREENSHOT_PATH,
    ]);
    if (capture.exitCode !== 0) return capture;
    await mkdir(dirname(outputPath), { recursive: true });
    return this.run(serial, ["pull", REMOTE_SCREENSHOT_PATH, outputPath]);
  }

  async captureLogcat(
    serial: string,
    outputPath: string,
  ): Promise<CommandResult> {
    const result = await this.run(serial, [
      "shell",
      "logcat",
      "-d",
      "-v",
      "threadtime",
    ]);
    await this.writeOutput(outputPath, result.stdout || result.stderr);
    return result;
  }

  async collectPerformance(
    serial: string,
    packageId: string,
    outputPath: string,
  ): Promise<CommandResult> {
    const memory = await this.run(serial, [
      "shell",
      "dumpsys",
      "meminfo",
      packageId,
    ]);
    const graphics = await this.run(serial, [
      "shell",
      "dumpsys",
      "gfxinfo",
      packageId,
    ]);
    await this.writeOutput(
      outputPath,
      [
        `=== dumpsys meminfo ${packageId} ===`,
        memory.stdout || memory.stderr,
        `=== dumpsys gfxinfo ${packageId} ===`,
        graphics.stdout || graphics.stderr,
      ].join("\n"),
    );
    return graphics;
  }

  supports(capability: DeviceCapability): boolean {
    return CAPABILITIES.has(capability);
  }

  private run(serial: string, args: readonly string[]): Promise<CommandResult> {
    return this.runner.run(["-s", serial, ...args]);
  }

  private async writeOutput(
    outputPath: string,
    content: string,
  ): Promise<void> {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content, "utf8");
  }
}
