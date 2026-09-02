import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { PNG } from "pngjs";

import {
  PngTemplateMatcher,
  type NormalizedRegion,
} from "../packages/screen-recognition/src/png-template-matcher.js";

test("matches a PNG template inside a normalized region after screen scaling", async () => {
  const root = await mkdtemp(join(tmpdir(), "game-auto-vision-"));
  const screenshotPath = join(root, "screen.png");
  const templatePath = join(root, "template.png");
  const region: NormalizedRegion = {
    x: 0.25,
    y: 0.25,
    width: 0.5,
    height: 0.5,
  };

  try {
    await writePng(screenshotPath, 40, 40, (x, y) =>
      x >= 10 && x < 30 && y >= 10 && y < 30
        ? [255, 50, 20, 255]
        : [20, 20, 20, 255],
    );
    await writePng(templatePath, 10, 10, () => [255, 50, 20, 255]);

    const result = await new PngTemplateMatcher().match(
      screenshotPath,
      templatePath,
      { region, threshold: 0.99 },
    );

    assert.equal(result.matched, true);
    assert.ok(result.score >= 0.99);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("does not match a different template below the configured threshold", async () => {
  const root = await mkdtemp(join(tmpdir(), "game-auto-vision-"));
  const screenshotPath = join(root, "screen.png");
  const templatePath = join(root, "template.png");
  const region: NormalizedRegion = { x: 0, y: 0, width: 1, height: 1 };

  try {
    await writePng(screenshotPath, 8, 8, () => [0, 0, 0, 255]);
    await writePng(templatePath, 4, 4, () => [255, 255, 255, 255]);

    const result = await new PngTemplateMatcher().match(
      screenshotPath,
      templatePath,
      { region, threshold: 0.9 },
    );

    assert.equal(result.matched, false);
    assert.ok(result.score < 0.9);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writePng(
  path: string,
  width: number,
  height: number,
  colorAt: (x: number, y: number) => [number, number, number, number],
): Promise<void> {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (width * y + x) << 2;
      const [red, green, blue, alpha] = colorAt(x, y);
      png.data[offset] = red;
      png.data[offset + 1] = green;
      png.data[offset + 2] = blue;
      png.data[offset + 3] = alpha;
    }
  }
  await writeFile(path, PNG.sync.write(png));
}
