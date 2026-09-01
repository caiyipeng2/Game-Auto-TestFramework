import type { DeviceInfo } from "../../core/src/contracts/device-driver.js";

export interface AdbDeviceRecord {
  readonly serial: string;
  readonly state: string;
  readonly product?: string;
  readonly model?: string;
  readonly device?: string;
  readonly transportId?: string;
}

export interface DeviceCommandOutputs {
  readonly props: string;
  readonly size: string;
  readonly density: string;
  readonly battery: string;
  readonly storage: string;
  readonly connectivity: string;
}

export function parseAdbDevices(output: string): AdbDeviceRecord[] {
  const records: AdbDeviceRecord[] = [];

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("List of devices attached")) continue;

    const fields = trimmed.split(/\s+/);
    if (fields.length < 2) continue;

    const metadata: Record<string, string> = {};
    for (const field of fields.slice(2)) {
      const separator = field.indexOf(":");
      if (separator <= 0) continue;
      metadata[field.slice(0, separator)] = field.slice(separator + 1);
    }

    records.push({
      serial: fields[0],
      state: fields[1],
      product: metadata.product,
      model: metadata.model,
      device: metadata.device,
      transportId: metadata.transport_id,
    });
  }

  return records;
}

export function parseGetprop(output: string): Record<string, string> {
  const properties: Record<string, string> = {};

  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\[([^\]]+)\]: \[([^\]]*)\]$/);
    if (match) properties[match[1]] = match[2];
  }

  return properties;
}

function parseDisplaySize(output: string): { width: number; height: number } {
  const matches = [
    ...output.matchAll(/(?:Override|Physical) size:\s*(\d+)x(\d+)/g),
  ];
  const match =
    matches.find((candidate) => candidate[0].startsWith("Override")) ??
    matches[0];
  return {
    width: match ? Number(match[1]) : 0,
    height: match ? Number(match[2]) : 0,
  };
}

function parseDensity(output: string): number {
  const matches = [
    ...output.matchAll(/(?:Override|Physical) density:\s*(\d+)/g),
  ];
  const match =
    matches.find((candidate) => candidate[0].startsWith("Override")) ??
    matches[0];
  return match ? Number(match[1]) : 0;
}

function parseBatteryPercent(output: string): number | undefined {
  const match = output.match(/^\s*level:\s*(\d+)\s*$/m);
  return match ? Number(match[1]) : undefined;
}

function parseStorageAvailableBytes(output: string): number | undefined {
  const match = output.match(/^\S+\s+(\d+)\s+(\d+)\s+(\d+)\s+\d+%\s+\S+\s*$/m);
  return match ? Number(match[3]) * 1024 : undefined;
}

export function parseDeviceInfo(
  serial: string,
  outputs: DeviceCommandOutputs,
): DeviceInfo {
  const properties = parseGetprop(outputs.props);
  const display = parseDisplaySize(outputs.size);

  return {
    serial,
    manufacturer: properties["ro.product.manufacturer"],
    model: properties["ro.product.model"] ?? serial,
    androidVersion: properties["ro.build.version.release"],
    apiLevel: Number(properties["ro.build.version.sdk"] ?? 0),
    supportedAbis: (properties["ro.product.cpu.abilist"] ?? "")
      .split(",")
      .map((abi) => abi.trim())
      .filter(Boolean),
    display: {
      ...display,
      density: parseDensity(outputs.density),
    },
    batteryPercent: parseBatteryPercent(outputs.battery),
    storageAvailableBytes: parseStorageAvailableBytes(outputs.storage),
    networkValidated: /VALIDATED/i.test(outputs.connectivity),
  };
}
