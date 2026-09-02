import { readFile } from "node:fs/promises";

import { PNG } from "pngjs";

export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

export interface PngImageDecoder {
  decode(path: string): Promise<RgbaImage>;
}

export interface NormalizedRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TemplateMatchOptions {
  readonly region: NormalizedRegion;
  readonly threshold?: number;
}

export interface TemplateMatch {
  readonly matched: boolean;
  readonly score: number;
  readonly threshold: number;
  readonly region: NormalizedRegion;
}

export interface TemplateMatcher {
  match(
    screenshotPath: string,
    templatePath: string,
    options: TemplateMatchOptions,
  ): Promise<TemplateMatch>;
}

export class PngTemplateMatcher implements TemplateMatcher {
  constructor(
    private readonly decoder: PngImageDecoder = new PngFileDecoder(),
  ) {}

  async match(
    screenshotPath: string,
    templatePath: string,
    options: TemplateMatchOptions,
  ): Promise<TemplateMatch> {
    validateRegion(options.region);
    const [screenshot, template] = await Promise.all([
      this.decoder.decode(screenshotPath),
      this.decoder.decode(templatePath),
    ]);
    const score = compareRegion(screenshot, template, options.region);
    const threshold = options.threshold ?? 0.9;
    return {
      matched: score >= threshold,
      score,
      threshold,
      region: options.region,
    };
  }
}

class PngFileDecoder implements PngImageDecoder {
  async decode(path: string): Promise<RgbaImage> {
    const source = await readFile(path);
    const png = PNG.sync.read(source);
    return {
      width: png.width,
      height: png.height,
      data: png.data,
    };
  }
}

function compareRegion(
  screenshot: RgbaImage,
  template: RgbaImage,
  region: NormalizedRegion,
): number {
  const left = Math.max(0, Math.floor(region.x * screenshot.width));
  const top = Math.max(0, Math.floor(region.y * screenshot.height));
  const width = Math.max(
    1,
    Math.min(
      screenshot.width - left,
      Math.round(region.width * screenshot.width),
    ),
  );
  const height = Math.max(
    1,
    Math.min(
      screenshot.height - top,
      Math.round(region.height * screenshot.height),
    ),
  );
  let difference = 0;
  const pixelCount = template.width * template.height;

  for (let y = 0; y < template.height; y += 1) {
    const sourceY = Math.min(
      height - 1,
      Math.floor((y * height) / template.height),
    );
    for (let x = 0; x < template.width; x += 1) {
      const sourceX = Math.min(
        width - 1,
        Math.floor((x * width) / template.width),
      );
      const sourceOffset =
        ((top + sourceY) * screenshot.width + left + sourceX) << 2;
      const templateOffset = (y * template.width + x) << 2;
      for (let channel = 0; channel < 4; channel += 1) {
        difference += Math.abs(
          screenshot.data[sourceOffset + channel] -
            template.data[templateOffset + channel],
        );
      }
    }
  }

  return 1 - difference / (pixelCount * 4 * 255);
}

function validateRegion(region: NormalizedRegion): void {
  if (
    !Number.isFinite(region.x) ||
    !Number.isFinite(region.y) ||
    !Number.isFinite(region.width) ||
    !Number.isFinite(region.height) ||
    region.x < 0 ||
    region.y < 0 ||
    region.width <= 0 ||
    region.height <= 0 ||
    region.x + region.width > 1 ||
    region.y + region.height > 1
  ) {
    throw new Error(
      "Screenshot template region must be inside normalized screen bounds",
    );
  }
}
