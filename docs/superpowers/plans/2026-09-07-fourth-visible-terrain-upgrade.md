# Fourth Visible Terrain Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guarded continuation route for the next visible terrain upgrade, `UpgradeId=3` at 320 coins, without spending those coins until explicit real-device authorization.

**Architecture:** Reuse the generic `accountPolicy: preserve` continuation contract and the calibrated first-row normalized target. The Idle_Outpost adapter will add a distinct post-purchase screenshot state after the 320-coin row is removed. Host-side tests and fixture-driven recognition must pass before a real Motorola purchase is considered; the live side effect remains a separate approval gate.

**Tech Stack:** TypeScript, Node test runner, YAML route DSL, adapter-owned PNG templates, ADB screenshot/tap backend, CodeGraph, JSON/JUnit evidence.

---

### Task 1: Confirm the fourth visible upgrade and live baseline

**Files:**

- Read: `D:/Project/Idle_Outpost/Excel/S沙盘升级表.xls`
- Read: `D:/Project/Idle_Outpost/Assets/Scripts_Hotfix/Game/UI/UITerrainUpgradesWindow/UITerrainUpgradesWindow.cs`
- Read: `adapters/idle-outpost/config/idle-outpost-config.snapshot.json`
- Read: `reports/t8-real-device-live/third-visible-terrain-upgrade-5037/after-third-visible-upgrade.png`

- [x] **Step 1: Confirm source facts**

Verify UI cost ordering and `UpgradeId=3`, `TerrainId=1`, type `4`, `NeedCoin=320`; confirm it is the remaining row after ID 4 is owned.

- [ ] **Step 2: Read the Motorola baseline without input**

Use only `adb -P 5037 -s ZT4229J5ZR` and require either `terrain-upgrade-third-owned` or an explicit safe main-screen state. Do not spend coins during baseline collection.

### Task 2: Add failing route and contract tests

**Files:**

- Create: `tests/idle-outpost-fourth-visible-terrain-upgrade.test.ts`
- Create: `adapters/idle-outpost/routes/buy-fourth-visible-terrain-upgrade.yaml`

- [x] **Step 1: Write the failing tests**

Require `accountPolicy: preserve`, a `new-account` branch that waits for `terrain-upgrade-third-owned`, an already-open third-owned branch, exactly one `terrain.upgrade.next` tap, and terminal `terrain-upgrade-fourth-owned` state.

- [x] **Step 2: Run focused tests and verify red**

```powershell
node --import=tsx --test tests/idle-outpost-fourth-visible-terrain-upgrade.test.ts
```

Expected: route file missing while the configuration fact test passes.

### Task 3: Implement adapter route and terminal state

**Files:**

- Modify: `adapters/idle-outpost/adapter.yaml`
- Modify: `adapters/idle-outpost/src/idle-outpost-adapter.ts`
- Create: `adapters/idle-outpost/routes/buy-fourth-visible-terrain-upgrade.yaml`
- Create: `adapters/idle-outpost/locators/state-terrain-upgrade-fourth-owned.png` after live evidence exists

- [x] **Step 1: Add state/account mappings and route**

Register `terrain-upgrade-fourth-owned` as a new-account gameplay state. The route must preserve the account, require `terrain-upgrade-third-owned` before the one tap, wait for the terminal state, and assert the terminal state on repeat runs.

- [x] **Step 2: Run host-side focused tests**

Run the new tests plus existing screenshot, account, FlowRunner, and third-visible-upgrade tests. No live tap is allowed until this is green.

### Task 4: Request authorization before the 320-coin action

**Files:**

- Create: `reports/t8-real-device-live/fourth-visible-terrain-upgrade-5037/` (ignored runtime evidence)
- Create: `adapters/idle-outpost/locators/state-terrain-upgrade-fourth-owned.png`

- [x] **Step 1: Stop at the authorization boundary**

Report the source fact, unavailable Motorola baseline due ADB disconnect, host-test result, and exact side effect: one ADB tap that consumes 320 coins. Do not click from this phase without explicit user authorization.

- [ ] **Step 2: After authorization, verify and tap once**

Require `terrain-upgrade-third-owned`, `UpgradeId=3`, and `NeedCoin=320`; send one tap at the configured normalized first-row target; never click another row.

- [ ] **Step 3: Calibrate and verify terminal state**

Generate the terminal template from the actual screenshot, require the post-purchase state, and verify repeated route execution produces zero taps.

### Task 5: Document, gate, commit, and await push confirmation

**Files:**

- Modify: `README.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/idle-outpost-first-route.md`
- Modify: `docs/architecture/real-device-run.md`
- Modify: `docs/architecture/account-state-reset.md`
- Modify: `docs/architecture/game-adapter.md`
- Modify: `docs/architecture/overall.md`
- Modify: `docs/design/architecture.md`
- Modify: `docs/design/flow-dsl.md`
- Modify: `docs/diagrams/idle-outpost-first-route.mmd`
- Modify: this plan file

- [x] **Step 1: Document cost ordering and authorization boundary**
- [x] **Step 2: Run `codegraph sync`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run build`, and `git diff --check`**
- [ ] **Step 3: Commit locally**
- [ ] **Step 4: Stop for user confirmation before pushing**
