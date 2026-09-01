export const DEVICE_CAPABILITIES = [
  "installArtifact",
  "clearData",
  "launch",
  "input",
  "screenshot",
  "logcat",
  "performance",
  "uiHierarchy",
] as const;

export type DeviceCapability = (typeof DEVICE_CAPABILITIES)[number];

export interface CommandResult {
  readonly command: string;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

export interface DeviceDisplay {
  readonly width: number;
  readonly height: number;
  readonly density: number;
}

export interface DeviceInfo {
  readonly serial: string;
  readonly manufacturer?: string;
  readonly model: string;
  readonly androidVersion?: string;
  readonly apiLevel: number;
  readonly supportedAbis: readonly string[];
  readonly display: DeviceDisplay;
  readonly batteryPercent?: number;
  readonly storageAvailableBytes?: number;
  readonly networkValidated?: boolean;
}

export type ArtifactKind = "apk" | "aab" | "apks";

export interface InstallableArtifact {
  readonly path: string;
  readonly kind: ArtifactKind;
  readonly packageId?: string;
  readonly versionName?: string;
  readonly versionCode?: number;
  readonly sha256?: string;
  readonly sizeBytes?: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface DeviceDriver {
  listDevices(): Promise<readonly DeviceInfo[]>;
  inspectDevice(serial: string): Promise<DeviceInfo>;
  installArtifact(
    serial: string,
    artifact: InstallableArtifact,
  ): Promise<CommandResult>;
  clearData(serial: string, packageId: string): Promise<CommandResult>;
  launch(
    serial: string,
    packageId: string,
    activity: string,
  ): Promise<CommandResult>;
  tap(serial: string, point: ScreenPoint): Promise<CommandResult>;
  swipe(
    serial: string,
    start: ScreenPoint,
    end: ScreenPoint,
    durationMs: number,
  ): Promise<CommandResult>;
  inputText(serial: string, text: string): Promise<CommandResult>;
  captureScreenshot(serial: string, outputPath: string): Promise<CommandResult>;
  captureLogcat(serial: string, outputPath: string): Promise<CommandResult>;
  collectPerformance(
    serial: string,
    packageId: string,
    outputPath: string,
  ): Promise<CommandResult>;
  supports(capability: DeviceCapability): boolean;
}

export class UnsupportedCapabilityError extends Error {
  readonly code = "UNSUPPORTED_CAPABILITY";
  readonly category = "DEVICE_STATE" as const;

  constructor(readonly capability: DeviceCapability) {
    super(`Device driver does not support capability: ${capability}`);
    this.name = "UnsupportedCapabilityError";
  }
}

export function unsupportedCapability(
  capability: DeviceCapability,
): UnsupportedCapabilityError {
  return new UnsupportedCapabilityError(capability);
}
