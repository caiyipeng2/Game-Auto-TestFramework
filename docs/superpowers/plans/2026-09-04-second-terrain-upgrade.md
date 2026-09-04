# Second Terrain Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Idle_Outpost adapter with a guarded, configuration-backed route that purchases and verifies the second terrain upgrade on the Motorola real-device flow.

**Architecture:** Add a generic route-level `accountPolicy` with the default `reset-existing` and an explicit `preserve` mode for continuation routes. Keep the generic flow engine free of game logic; the Idle_Outpost adapter owns the logical target, screenshot state templates, and route. The existing `terrain-upgrade-owned` state means the first upgrade is already owned and the next configured row is now the current first row, so it is reused as the second-purchase guard. A distinct post-purchase row is added for the second upgrade. The live check uses only Motorola `ZT4229J5ZR`; the already purchased first upgrade is not repeated.

**Tech Stack:** TypeScript, Node test runner, YAML route DSL, adapter-owned PNG templates, ADB screenshot/tap backend, CodeGraph, JSON/JUnit evidence.

---

### Task 1: Confirm the second-upgrade facts and live baseline

**Files:**

- Read: `adapters/idle-outpost/config/idle-outpost-config.snapshot.json`
- Read: `reports/t8-real-device-live/terrain-upgrade-5038/after-first-upgrade.png`
- Read: `adapters/idle-outpost/adapter.yaml`

- [x] **Step 1: Confirm configuration facts**

Verify `terrainUpgrades` contains `upgradeId: 2`, `terrainId: 1`, and `needCoin: 30`; verify the existing normalized first-row target is reusable for the next visible upgrade.

- [x] **Step 2: Confirm the Motorola baseline**

Use only `adb -P 5038 -s ZT4229J5ZR` for a read-only device check and screenshot/state read. The baseline must be `terrain-upgrade-owned` from the previous milestone, with no tap sent.

### Task 2: Add failing tests for the guarded second-upgrade route

**Files:**

- Create: `tests/idle-outpost-second-terrain-upgrade.test.ts`
- Modify: `tests/idle-outpost-account-reset.test.ts`
- Modify: `tests/flow-engine.test.ts`

- [x] **Step 1: Write the failing tests**

The tests must require:

```yaml
branch:
  condition: { state: new-account }
  then:
    - wait: { state: terrain-upgrade-owned }
    - tap: { target: terrain.upgrade.next }
    - wait: { state: terrain-upgrade-second-owned }
```

The screenshot test must classify the Motorola post-second-purchase screenshot as `terrain-upgrade-second-owned`; the route fixture must record exactly one next-row tap. A continuation-policy test must also prove that a completed second-upgrade screenshot produces zero taps on a repeated route run.

- [x] **Step 2: Run the focused tests and verify the expected red**

Run:

```powershell
node --import=tsx --test tests/idle-outpost-second-terrain-upgrade.test.ts tests/idle-outpost-screenshot-state.test.ts
```

Expected: failure because the new route and logical target do not exist yet.

### Task 3: Implement generic continuation policy and adapter-owned route/state recognition

**Files:**

- Modify: `adapters/idle-outpost/adapter.yaml`
- Modify: `adapters/idle-outpost/src/idle-outpost-adapter.ts`
- Modify: `packages/core/src/contracts/game-adapter.ts`
- Modify: `packages/core/src/contracts/flow.ts`
- Modify: `packages/core/src/flow/flow-runner.ts`
- Modify: `packages/core/src/flow/route-loader.ts`
- Modify: `schemas/route.schema.json`
- Create: `adapters/idle-outpost/routes/buy-second-terrain-upgrade.yaml`
- Create: `adapters/idle-outpost/locators/state-terrain-upgrade-second-owned.png`

- [x] **Step 1: Add the logical target and state mappings**

Map `terrain.upgrade.next` to the same normalized first-row point used after list reflow. Reuse the existing `terrain-upgrade-owned` template as the second-available guard and register a second-owned template using the next row after purchase. Add generic route-level `accountPolicy` support with `reset-existing` as the default and `preserve` for continuation routes.

- [x] **Step 2: Add the route**

The route must use `profile: test-server-v63`, set `accountPolicy: preserve`, require `account-ready` and `logged-in`, branch from `new-account` or an already open `terrain-upgrade-owned` state, wait for `terrain-upgrade-owned`, tap `terrain.upgrade.next` once, wait for `terrain-upgrade-second-owned`, and capture a screenshot. The terminal else branch must assert `terrain-upgrade-second-owned` rather than spend another upgrade.

- [x] **Step 3: Run focused tests and verify green**

Run the new route/state tests and the existing Idle_Outpost adapter tests. All must pass before any live purchase action.

### Task 4: Execute one guarded Motorola second-upgrade action

**Files:**

- Create: `reports/t8-real-device-live/second-terrain-upgrade-5038/` (ignored runtime evidence)

- [x] **Step 1: Preflight the device**

Confirm only `ZT4229J5ZR` is selected, inspect `720x1604`, and read the current state as `terrain-upgrade-owned`. Do not use Samsung `R5CX211TXNT`.

- [x] **Step 2: Send the configured tap once**

Resolve `terrain.upgrade.next` through the adapter and send exactly one ADB tap. Stop immediately if the pre-action state is not `terrain-upgrade-owned`.

- [x] **Step 3: Verify the post-action state**

Capture the Motorola screenshot and require `terrain-upgrade-second-owned`; record the ADB result, coordinates, state scores, and screenshot path. A repeated screenshot-driven route run must return `PASS` with zero taps. Do not click the third upgrade.

### Task 5: Document, verify, commit, and await push confirmation

**Files:**

- Modify: `docs/architecture/idle-outpost-first-route.md`
- Modify: `docs/architecture/real-device-run.md`
- Modify: `docs/diagrams/idle-outpost-first-route.mmd`
- Modify: `docs/architecture/README.md`
- Modify: `README.md`
- Modify: `docs/design/architecture.md`
- Modify: `docs/design/flow-dsl.md`
- Modify: `docs/architecture/account-state-reset.md`
- Modify: `docs/architecture/game-adapter.md`
- Modify: `docs/architecture/overall.md`
- Modify: this plan file

- [x] **Step 1: Document the second-upgrade flow and evidence boundary**

State that `UpgradeId=2` costs 30 coins, the route is offline-fixture tested, and live verification uses one guarded Motorola action without a later upgrade click.

- [x] **Step 2: Run release gates**

Run:

```powershell
codegraph sync
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
git diff --check
```

- [x] **Step 3: Commit locally**

```powershell
git add adapters docs tests
git commit -m "feat(idle-outpost): verify second terrain upgrade"
```

- [ ] **Step 4: Stop for user confirmation before pushing**

Verify the worktree is clean and report the commit. Push to `codex/framework-bootstrap` only after explicit confirmation, then merge/push `main` only after the user confirms that release step.
