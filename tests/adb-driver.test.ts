import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import type { CommandResult } from "../packages/core/src/contracts/device-driver.js";
import { AdbDeviceDriver } from "../packages/adb-driver/src/adb-device-driver.js";
import {
  parseAdbDevices,
  parseDeviceInfo,
  parseGetprop,
} from "../packages/adb-driver/src/device-parser.js";
import type {
  AdbCommandRunner,
  DeviceCommandOutputs,
} from "../packages/adb-driver/src/adb-client.js";

const fixtureRoot = join(process.cwd(), "tests", "fixtures", "adb");

async function fixture(name: string): Promise<string> {
  return readFile(join(fixtureRoot, name), "utf8");
}

async function commandOutputs(): Promise<DeviceCommandOutputs> {
  return {
    props: await fixture("getprop.txt"),
    size: await fixture("wm-size.txt"),
    density: await fixture("wm-density.txt"),
    battery: await fixture("battery.txt"),
    storage: await fixture("df.txt"),
    connectivity: await fixture("connectivity.txt"),
  };
}

test("parses an online adb device record and ignores the header", async () => {
  const records = parseAdbDevices(await fixture("devices.txt"));

  assert.deepEqual(records, [
    {
      serial: "R5CX211TXNT",
      state: "device",
      product: "e3qzcx",
      model: "SM-S9280",
      device: "e3q",
      transportId: "1",
    },
  ]);
});

test("parses device properties into the generic device contract", async () => {
  const outputs = await commandOutputs();
  const info = parseDeviceInfo("R5CX211TXNT", outputs);

  assert.deepEqual(info, {
    serial: "R5CX211TXNT",
    manufacturer: "samsung",
    model: "SM-S9280",
    androidVersion: "16",
    apiLevel: 36,
    supportedAbis: ["arm64-v8a"],
    display: { width: 1080, height: 2340, density: 450 },
    batteryPercent: 100,
    storageAvailableBytes: 441450496 * 1024,
    networkValidated: true,
  });

  assert.equal(parseGetprop(outputs.props)["ro.product.model"], "SM-S9280");
});

test("uses the adb runner for inspected devices and real input commands", async () => {
  const outputs = await commandOutputs();
  const runner = new RecordingRunner(outputs);
  const driver = new AdbDeviceDriver(runner);

  const info = await driver.inspectDevice("R5CX211TXNT");
  assert.equal(info.apiLevel, 36);

  await driver.tap("R5CX211TXNT", { x: 120, y: 240 });
  assert.deepEqual(runner.commands.at(-1), [
    "-s",
    "R5CX211TXNT",
    "shell",
    "input",
    "tap",
    "120",
    "240",
  ]);
});

test("reports adb-supported capabilities without claiming a UI hierarchy backend", async () => {
  const driver = new AdbDeviceDriver(
    new RecordingRunner(await commandOutputs()),
  );

  assert.equal(driver.supports("input"), true);
  assert.equal(driver.supports("screenshot"), true);
  assert.equal(driver.supports("uiHierarchy"), false);
});

class RecordingRunner implements AdbCommandRunner {
  readonly commands: string[][] = [];

  constructor(private readonly outputs: DeviceCommandOutputs) {}

  async run(args: readonly string[]): Promise<CommandResult> {
    const command = [...args];
    this.commands.push(command);
    const text = command.join(" ");
    let stdout = "";
    if (text.endsWith("shell getprop")) stdout = this.outputs.props;
    if (text.endsWith("shell wm size")) stdout = this.outputs.size;
    if (text.endsWith("shell wm density")) stdout = this.outputs.density;
    if (text.endsWith("shell dumpsys battery")) stdout = this.outputs.battery;
    if (text.endsWith("shell df -k /data/user/0"))
      stdout = this.outputs.storage;
    if (text.endsWith("shell dumpsys connectivity"))
      stdout = this.outputs.connectivity;

    return {
      command: command.join(" "),
      exitCode: 0,
      stdout,
      stderr: "",
      durationMs: 1,
    };
  }
}
