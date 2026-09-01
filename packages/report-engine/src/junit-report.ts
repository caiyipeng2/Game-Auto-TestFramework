import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { StepEvidence } from "../../core/src/contracts/evidence.js";
import { redactSensitive, type JsonReport } from "./json-report.js";

export async function writeJunitReport(
  report: JsonReport,
  outputPath: string,
): Promise<string> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderJunitXml(report), "utf8");
  return outputPath;
}

export function renderJunitXml(
  report: JsonReport,
  suiteName = `game-auto-test:${report.routeId ?? report.kind}`,
): string {
  const steps = report.steps?.length
    ? [...report.steps]
    : [createSyntheticStep(report)];
  const failures = steps.filter((step) => step.status === "FAIL").length;
  const skipped = steps.filter((step) => step.status === "SKIPPED").length;
  const duration = steps.reduce(
    (total, step) => total + durationSeconds(step.startedAt, step.finishedAt),
    0,
  );

  const testCases = steps.map((step) => renderTestCase(step)).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="${escapeXml(suiteName)}" tests="${steps.length}" failures="${failures}" errors="0" skipped="${skipped}" time="${duration.toFixed(3)}">`,
    testCases,
    "</testsuite>",
    "",
  ].join("\n");
}

function renderTestCase(step: StepEvidence): string {
  const duration = durationSeconds(step.startedAt, step.finishedAt);
  const attributes = `classname="game-auto-test" name="${escapeXml(step.stepId)}" time="${duration.toFixed(3)}"`;

  if (step.status === "FAIL") {
    const category = step.failure?.category ?? "UNKNOWN";
    const message = step.failure?.message ?? "Step failed";
    const safeMessage = String(redactSensitive(message));
    return `  <testcase ${attributes}><failure type="${escapeXml(category)}" message="${escapeXml(safeMessage)}">${escapeXml(`${category}: ${safeMessage}`)}</failure></testcase>`;
  }

  if (step.status === "BLOCKED" || step.status === "SKIPPED") {
    const message =
      step.failure?.message ?? `Step ${step.status.toLowerCase()}`;
    return `  <testcase ${attributes}><skipped message="${escapeXml(String(redactSensitive(message)))}" /></testcase>`;
  }

  return `  <testcase ${attributes} />`;
}

function createSyntheticStep(report: JsonReport): StepEvidence {
  return {
    stepId: `${report.kind}-summary`,
    status: report.status === "PASS" ? "PASS" : report.status,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    artifacts: [],
    failure: report.failure,
  };
}

function durationSeconds(startedAt: string, finishedAt: string): number {
  const durationMs = Date.parse(finishedAt) - Date.parse(startedAt);
  return Number.isFinite(durationMs) && durationMs >= 0 ? durationMs / 1000 : 0;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
