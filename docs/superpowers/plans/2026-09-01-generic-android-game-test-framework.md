# Generic Android Game Test Framework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable Android real-device automation framework whose generic core remains independent of any individual game.

**Architecture:** A TypeScript CLI owns flow execution, artifact verification, evidence, and reports. ADB is the required device backend; Appium is an optional native-UI backend. Each game is an independently versioned adapter containing identity, profiles, configuration mapping, locators, state readers, assertions, and route definitions.

**Tech Stack:** Node.js, TypeScript, PowerShell launcher, ADB CLI, optional Appium UiAutomator2, YAML/JSON route files, JSON Schema, JUnit XML, Mermaid documentation, standalone HTML architecture browser.

---

## Repository Map

- Create: `packages/core/` generic contracts and flow engine.
- Create: `packages/adb-driver/` ADB process and device implementation.
- Create: `packages/appium-driver/` optional UiAutomator2 implementation.
- Create: `packages/artifact-engine/` APK/AAB/APKS validation.
- Create: `packages/report-engine/` JSON/JUnit/evidence output.
- Create: `adapters/idle-outpost/` first game adapter.
- Create: `schemas/` route, adapter, and report schemas.
- Create: `tests/` host-side unit and integration tests.
- Create: `docs/architecture/` visual documentation surface.
- Modify: `README.md` after each public command or architecture change.

## Task 1: Host and Repository Bootstrap

**Files:**
- Create: `package.json`, `tsconfig.json`, `pnpm-workspace.yaml`, `.gitignore`
- Create: `packages/core/src/index.ts`
- Test: `tests/bootstrap.test.ts`

- [ ] Add scripts `build`, `test`, `lint`, `format:check`, and `typecheck`.
- [ ] Add a test that imports the core package and verifies the CLI contract version.
- [ ] Run `npm install`, `npm test`, and `npm run typecheck` from the repository root.
- [ ] Commit as `chore: bootstrap framework workspace`.

Acceptance: a clean checkout installs dependencies and runs one host-side test without Unity or an Android device.

## Task 2: Generic Domain Contracts

**Files:**
- Create: `packages/core/src/contracts/device-driver.ts`
- Create: `packages/core/src/contracts/game-adapter.ts`
- Create: `packages/core/src/contracts/flow.ts`
- Create: `packages/core/src/contracts/evidence.ts`
- Test: `tests/contracts.test.ts`

- [ ] Define typed contracts for device operations, game adapters, route steps, state snapshots, assertions, and evidence records.
- [ ] Add tests for unsupported capability reporting and deterministic failure categories.
- [ ] Run `npm test -- contracts` and `npm run typecheck`.
- [ ] Commit as `feat: define generic automation contracts`.

Acceptance: the core contracts contain no Idle_Outpost package name, UI path, Excel field, Unity type, or server enum.

## Task 3: ADB Device Backend

**Files:**
- Create: `packages/adb-driver/src/adb-client.ts`
- Create: `packages/adb-driver/src/adb-device-driver.ts`
- Create: `packages/adb-driver/src/device-parser.ts`
- Test: `tests/adb-driver.test.ts`, `tests/fixtures/adb/`

- [ ] Implement command execution with explicit serial, timeout, stdout, stderr, and exit-code capture.
- [ ] Implement parsing for model, API, ABI, display, battery, storage, and network state.
- [ ] Implement package clear, install, launch, tap, swipe, text input, screenshot, logcat, and performance collection.
- [ ] Test parsing with recorded ADB outputs without requiring a device.
- [ ] Run `npm test -- adb-driver`.
- [ ] Commit as `feat: add adb device backend`.

Acceptance: the driver can run `adb devices -l` and return a typed device record; failed commands retain exact evidence.

## Task 4: Artifact Engine

**Files:**
- Create: `packages/artifact-engine/src/artifact-inspector.ts`
- Create: `packages/artifact-engine/src/bundletool-runner.ts`
- Create: `packages/artifact-engine/src/artifact-policy.ts`
- Test: `tests/artifact-engine.test.ts`

- [ ] Inspect APK, AAB, and APKS existence, size, hash, package ID, version, SDK, ABI, and split metadata.
- [ ] Use a configurable bundletool path and record its version.
- [ ] Add an adapter-owned artifact classification hook so timestamp rules stay outside core.
- [ ] Test missing artifacts, package mismatch, unsupported ABI, and valid device matching.
- [ ] Run `npm test -- artifact-engine`.
- [ ] Commit as `feat: add android artifact verification`.

Acceptance: a supplied APKS can be verified against a device specification without installing it.

## Task 5: Flow Engine and Route Schema

**Files:**
- Create: `schemas/route.schema.json`
- Create: `packages/core/src/flow/route-loader.ts`
- Create: `packages/core/src/flow/flow-runner.ts`
- Create: `packages/core/src/flow/waiter.ts`
- Test: `tests/flow-engine.test.ts`

- [ ] Validate route files before execution.
- [ ] Implement install, clearData, launch, tap, swipe, input, wait, assert, screenshot, logcat, performance, repeat, and branch steps.
- [ ] Use condition polling with bounded timeout diagnostics instead of arbitrary sleeps.
- [ ] Record before/after state and evidence for every step.
- [ ] Run `npm test -- flow-engine`.
- [ ] Commit as `feat: add generic route execution`.

Acceptance: a fake adapter and fake device can execute a route and produce deterministic PASS/FAIL output.

## Task 6: Reports and CLI

**Files:**
- Create: `packages/report-engine/src/json-report.ts`
- Create: `packages/report-engine/src/junit-report.ts`
- Create: `cli/src/main.ts`
- Create: `Tools/Invoke-GameAutoTest.ps1`
- Test: `tests/cli.test.ts`

- [ ] Implement `doctor`, `artifact verify`, `device inspect`, and `run` commands.
- [ ] Map exits to health, test failure, blocked prerequisite, and argument/configuration error.
- [ ] Write reports under a run ID and serial without leaking tokens or signing secrets.
- [ ] Add PowerShell forwarding for Windows and CI.
- [ ] Run host tests and a fake-adapter end-to-end command.
- [ ] Commit as `feat: add framework cli and reports`.

Acceptance: a host-only fake route returns a JUnit report and a stable nonzero exit code for a controlled failure.

## Task 7: Idle_Outpost Adapter

**Files:**
- Create: `adapters/idle-outpost/adapter.yaml`
- Create: `adapters/idle-outpost/src/idle-outpost-adapter.ts`
- Create: `adapters/idle-outpost/src/config-reader.ts`
- Create: `adapters/idle-outpost/routes/first-upgrade.yaml`
- Create: `adapters/idle-outpost/docs/first-upgrade.md`
- Test: `tests/adapters/idle-outpost.test.ts`

- [ ] Map package ID, Unity activity, TestServer profile, resource version, and artifact classification.
- [ ] Read guide, system status, terrain, device, product, order, and battle tables outside core.
- [ ] Convert the confirmed first route into logical target IDs and preconditions.
- [ ] Add optional Unity QA Bridge support without making it a framework requirement.
- [ ] Run host-side adapter tests before device execution.
- [ ] Commit as `feat: add idle-outpost game adapter`.

Acceptance: core loads the adapter without importing Idle_Outpost code into `packages/core`.

## Task 8: First Real-Device Route

**Files:**
- Modify: `adapters/idle-outpost/routes/first-upgrade.yaml`
- Create: `tests/device/idle-outpost-first-upgrade.device.yaml`
- Modify: `docs/architecture/real-device-run.md`

- [ ] Run the route on one approved TestServer APKS and one serial-selected device.
- [ ] Handle first-run consent as an explicit human-approved precondition.
- [ ] Use adapter target resolution and ADB for real input.
- [ ] Capture screenshots, logcat, state, and performance at checkpoints.
- [ ] Repeat only after the first run is manually accepted.
- [ ] Commit the route and evidence format without private device data.

Acceptance: one real player route reaches its intended result and produces a machine-readable result.

## Task 9: Optional Appium Backend

**Files:**
- Create: `packages/appium-driver/src/appium-device-driver.ts`
- Create: `packages/appium-driver/src/capability-probe.ts`
- Test: `tests/appium-driver.test.ts`
- Create: `docs/architecture/appium.md`

- [ ] Probe Appium availability and UiAutomator2 support without making it a prerequisite.
- [ ] Implement native Android selectors, permission dialogs, system alerts, and lifecycle operations.
- [ ] Fall back to ADB when Appium is unavailable or the target is a Unity Canvas surface.
- [ ] Run the device proof only after the ADB route is stable.
- [ ] Commit as `feat: add optional appium native-ui backend`.

Acceptance: Appium improves native-dialog handling without changing the route format or blocking ADB-only runs.

## Task 10: Interactive Architecture Browser

**Files:**
- Create: `docs/architecture/index.html`
- Create: `docs/architecture/architecture-data.json`
- Create: `docs/architecture/README.md`

- [ ] Render core packages, adapter boundaries, route steps, locator backends, and report flow as an interactive diagram.
- [ ] Keep the page static and dependency-light so it can be opened locally.
- [ ] Use UI design guidance for hierarchy, keyboard navigation, responsive layout, and accessible labels.
- [ ] Verify desktop and narrow widths before publishing.
- [ ] Commit as `docs: add interactive architecture browser`.

Acceptance: a reader can select a core module or adapter and see its responsibility, dependencies, and evidence path without reading source code.

## Task 11: Second-Game Generality Proof

**Files:**
- Create: `adapters/sample-native-game/`
- Create: `tests/adapters/sample-native-game.test.ts`
- Modify: `README.md`

- [ ] Implement a small native-UI sample adapter using the same route engine.
- [ ] Run the same install/launch/assert/report flow against a fixture or test app.
- [ ] Record which files are adapter-specific and which remain untouched in core.
- [ ] Commit as `test: prove cross-game adapter boundary`.

Acceptance: a second adapter can be added without changing generic device, flow, artifact, or report packages.

## Task 12: Multi-Device and Release Readiness

**Files:**
- Create: `devices/device-matrix.yaml`
- Create: `docs/runbooks/device-matrix.md`
- Create: `.github/workflows/host-tests.yml`
- Modify: `README.md`

- [ ] Add serial-specific, sequential execution for the approved device matrix.
- [ ] Keep API 23/ARMv7 compatibility devices separate from the primary API 36/ARM64 smoke device.
- [ ] Run host tests in CI and schedule device tests separately.
- [ ] Verify docs, version metadata, changelog, remotes, and push readiness.
- [ ] Commit as `ci: add host checks and device matrix runbook`.

Acceptance: host checks are repeatable in CI, device runs are explicit and serial-scoped, and reports contain artifact/device/tool provenance.
