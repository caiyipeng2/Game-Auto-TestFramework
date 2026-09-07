# Third Visible Terrain Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guarded continuation route that purchases and verifies the next terrain upgrade actually shown by the game UI after the first two upgrades.

**Architecture:** The game source sorts remaining terrain upgrades by `NeedCoin`, so the next visible item after `UpgradeId=2` is `UpgradeId=4` (`利润加成`, 57 coins), not `UpgradeId=3` (`加工加速`, 320 coins). Keep the generic runner unchanged except for the existing route-level `accountPolicy: preserve`; the Idle_Outpost adapter reuses the current first-row target, adds a distinct post-purchase screenshot state, and fails closed when the prerequisite state is absent.

**Tech Stack:** TypeScript, Node test runner, YAML route DSL, adapter-owned PNG templates, ADB screenshot/tap backend, original `.xls` configuration evidence, CodeGraph.

---

### Task 1: Confirm source configuration and Motorola baseline

**Files:**

- Read: `D:/Project/Idle_Outpost/Excel/S沙盘升级表.xls`
- Read: `D:/Project/Idle_Outpost/Assets/Scripts_Hotfix/Game/UI/UITerrainUpgradesWindow/UITerrainUpgradesWindow.cs`
- Read: `adapters/idle-outpost/config/idle-outpost-config.snapshot.json`
- Read: `reports/t8-real-device-live/second-terrain-upgrade-5038/after-second-upgrade.png`

- [x] **Step 1: Confirm the UI ordering rule**

The original sheet contains `UpgradeId=4`, `TerrainId=1`, type `5`, and `NeedCoin=57` at row 37. The UI code sorts the remaining list by `NeedCoin`; after ID 1 and ID 2 are owned, ID 4 is the next visible row.

- [x] **Step 2: Confirm the Motorola baseline**

Use only `adb -P 5038 -s ZT4229J5ZR`. The current screenshot is classified as `terrain-upgrade-second-owned`; no action is sent during baseline collection.

### Task 2: Add failing route and target tests

**Files:**

- Create: `tests/idle-outpost-third-visible-terrain-upgrade.test.ts`
- Create: `adapters/idle-outpost/routes/buy-third-visible-terrain-upgrade.yaml`

- [x] **Step 1: Write the failing tests**

Require `accountPolicy: preserve`, a `new-account` branch that opens the window and waits for `terrain-upgrade-second-owned`, an already-open `terrain-upgrade-second-owned` branch, exactly one `terrain.upgrade.next` tap, and a terminal `terrain-upgrade-third-owned` wait/assert.

- [x] **Step 2: Run focused tests and verify the expected red**

```powershell
node --import=tsx --test tests/idle-outpost-third-visible-terrain-upgrade.test.ts
```

Expected: route file missing; the UpgradeId=4 fact test already passes.

### Task 3: Implement the adapter route

**Files:**

- Modify: `adapters/idle-outpost/routes/buy-third-visible-terrain-upgrade.yaml`
- Modify: `adapters/idle-outpost/adapter.yaml`
- Modify: `adapters/idle-outpost/src/idle-outpost-adapter.ts`

- [x] **Step 1: Register configuration-backed target/state**

Expose `terrain.upgrade.next` at the calibrated first-row normalized point and register `terrain-upgrade-third-owned` with the post-purchase row template after live evidence exists. Treat that terminal state as `accountMode: new`.

- [x] **Step 2: Implement the guarded route**

The route uses `profile: test-server-v63`, `accountPolicy: preserve`, `account-ready`, and `logged-in`. It accepts either a new-account flow that opens the upgrade window or an already-open second-owned window. It sends one tap only from `terrain-upgrade-second-owned`, waits for `terrain-upgrade-third-owned`, and does not click `UpgradeId=3`.

- [x] **Step 3: Run focused tests and verify green**

Run the new route tests plus existing FlowRunner, Idle_Outpost account, and screenshot-state tests before live input.

### Task 4: Execute one guarded Motorola action

**Files:**

- Create: `reports/t8-real-device-live/third-visible-terrain-upgrade-5038/` (ignored runtime evidence)
- Create: `adapters/idle-outpost/locators/state-terrain-upgrade-third-owned.png`

- [x] **Step 1: Verify pre-action state**

Read the Motorola screenshot and require `terrain-upgrade-second-owned`, configuration `UpgradeId=4 / 57`.

- [x] **Step 2: Tap once and capture post-action evidence**

Resolve `terrain.upgrade.next`, send one ADB tap, then capture the screenshot. Stop on any precondition mismatch and never tap the 320-coin row.

- [x] **Step 3: Calibrate and verify terminal state**

  Crop the actual post-action `加工加速 320` row, set a threshold that separates it from the pre-action `利润加成 57` row, and require `terrain-upgrade-third-owned` through the screenshot adapter.

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

- [x] **Step 1: Document Excel/UI ordering and live evidence boundary**

Record that ID 4 / 57 is selected by UI cost ordering, the route uses `preserve`, and the live Motorola action is one guarded tap with no later ID 3 purchase.

- [x] **Step 2: Run release gates**

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
git add README.md adapters docs packages schemas tests
git commit -m "feat(idle-outpost): verify third visible terrain upgrade"
```

- [ ] **Step 4: Stop for user confirmation before pushing**

Verify the worktree is clean and report the commit. Push the development branch only after explicit confirmation; merge it to `main` as a separate confirmed operation.
